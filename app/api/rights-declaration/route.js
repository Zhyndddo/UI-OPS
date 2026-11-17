// Round 633 — PUBLIC rights-declaration form (per-release signed link, no login).
//   GET  ?token=...                    -> { release: { title, performer, composer } } to pre-fill the form
//   POST { token, form, pdfBase64 }    -> saves the declaration (database row, status "pending") and the signed PDF (Google Drive, link only in the row)
// Protected by: HMAC token per release, per-visitor + global rate limits, strict field cleaning, PDF magic-byte + size check.
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { readRightsToken, makeRightsToken } from "../../../lib/rightsToken";
import { cleanDeclaration } from "../../../lib/rightsForm";
import { countHits, addHit, clientIp } from "../../../lib/eventRateLimit";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();
const MAX_PDF = 4 * 1024 * 1024;

async function loadRelease(id) {
  const { data } = await supabaseAdmin.from("releases").select("id, did, title, main_artist, publishing_composer").eq("id", id).maybeSingle();
  return data || null;
}

// Song-title suggestions: the (id, title, artist, composer) list is kept in server memory for 5 minutes and filtered there,
// so typing in the form costs the database about ONE read per 5 minutes per server instance (nothing is written).
let CACHE = { at: 0, rows: [] };
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
async function titleCache() {
  if (Date.now() - CACHE.at < 5 * 60 * 1000 && CACHE.rows.length) return CACHE.rows;
  const rows = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabaseAdmin.from("releases").select("id, title, main_artist, publishing_composer").order("id").range(from, from + 999);
    if (error || !data) break;
    rows.push(...data.filter((r) => r.title).map((r) => ({ id: r.id, title: r.title, artist: r.main_artist || "", composer: r.publishing_composer || "", n: norm(`${r.title} ${r.main_artist || ""}`) })));
    if (data.length < 1000) break;
  }
  CACHE = { at: Date.now(), rows };
  return rows;
}

export async function GET(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500, headers: noStore });
  const ip = clientIp(request);
  const q = new URL(request.url).searchParams.get("q");
  if (q != null) {
    if (countHits("rd-search:" + ip) >= 60) return NextResponse.json({ error: "Quá nhiều lượt tìm. Thử lại sau ít phút." }, { status: 429, headers: noStore });
    addHit("rd-search:" + ip);
    const needle = norm(q.trim().slice(0, 60));
    if (needle.length < 3) return NextResponse.json({ results: [] }, { headers: noStore });
    const hits = (await titleCache()).filter((r) => r.n.includes(needle)).slice(0, 6);
    // only title / artist / composer are returned; the token links the submit to that product (AR still confirms)
    return NextResponse.json({ results: hits.map((r) => ({ title: r.title, performer: r.artist, composer: r.composer, token: makeRightsToken(r.id) })) }, { headers: noStore });
  }
  if (countHits("rd-get:" + ip) >= 60) return NextResponse.json({ error: "Quá nhiều lượt truy cập. Thử lại sau ít phút." }, { status: 429, headers: noStore });
  addHit("rd-get:" + ip);
  const id = readRightsToken(new URL(request.url).searchParams.get("token"));
  const rel = id ? await loadRelease(id) : null;
  if (!rel) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });
  return NextResponse.json({ release: { title: rel.title || "", performer: rel.main_artist || "", composer: rel.publishing_composer || "" } }, { headers: noStore });
}

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500, headers: noStore });
  const ip = clientIp(request);
  if (countHits("rd-post:" + ip) >= 8 || countHits("rd-post:all") >= 300) return NextResponse.json({ error: "Quá nhiều lượt gửi. Vui lòng thử lại sau 10 phút." }, { status: 429, headers: noStore });
  let body = {};
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400, headers: noStore }); }
  if (body.website) return NextResponse.json({ ok: true, fake: true }, { headers: noStore });   // honeypot
  // No token = the one public link: the declaration is saved unlinked and AR picks the product when confirming.
  let rel = null;
  if (body.token) {
    const id = readRightsToken(body.token);
    rel = id ? await loadRelease(id) : null;
    if (!rel) return NextResponse.json({ error: "Link không hợp lệ." }, { status: 404, headers: noStore });
  }
  const v = cleanDeclaration(body.form);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400, headers: noStore });
  addHit("rd-post:" + ip); addHit("rd-post:all");
  const d = v.data;

  // 1) the signed PDF -> Google Drive (never the database)
  let pdfUrl = null;
  const b64 = String(body.pdfBase64 || "");
  if (b64) {
    const buf = Buffer.from(b64, "base64");
    const isPdf = buf.length > 100 && buf.length <= MAX_PDF && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    const url = clean(process.env.DRIVE_WEBHOOK_URL || process.env.HALLOWEEN_DRIVE_WEBHOOK_URL);
    const secret = clean(process.env.DRIVE_SECRET || process.env.HALLOWEEN_DRIVE_SECRET);
    if (isPdf && url && secret) {
      const ascii = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
      const filename = `KhaiBao_${ascii(rel?.did) || "public"}_${ascii(d.song_title) || "song"}_${Date.now()}.pdf`;
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 22000);
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow", signal: ctrl.signal,
          body: JSON.stringify({ secret, filename, mimeType: "application/pdf", dataBase64: b64, subfolder: "rights-declarations" }) });
        const j = await res.json().catch(() => null);
        if (j?.ok && j.url) pdfUrl = j.url;
      } catch (e) { /* the declaration is still saved; AR sees "no PDF" */ } finally { clearTimeout(timer); }
    }
  }

  // 2) the answers -> a small database row
  const { error } = await supabaseAdmin.from("rights_declarations").insert({
    release_id: rel?.id || null, song_title: d.song_title, composer: d.composer, performer: d.performer, producer: d.producer, mixer: d.mixer,
    owned: d.owned, licensed: d.licensed, licensed_until: d.licensed_until, contact_email: d.contact_email || null, proof: d.proof || null, platforms: d.platforms || null, platforms_note: d.platforms_note || null,
    term: d.term, term_note: d.term_note || null, signer_name: d.signer_name, pdf_url: pdfUrl,
  });
  if (error) return NextResponse.json({ error: "Không lưu được. Vui lòng thử lại." }, { status: 500, headers: noStore });
  // optional: email the SAME pdf to the address the submitter typed (one recipient, fixed template). No email / failure -> the page downloads it.
  let emailed = false;
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (d.contact_email && b64 && SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      const tr = nodemailer.createTransport({ host: SMTP_HOST, port: parseInt(process.env.SMTP_PORT || "587", 10), secure: process.env.SMTP_SECURE === "true", auth: { user: SMTP_USER, pass: SMTP_PASS } });
      const esc = (s) => String(s || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
      await tr.sendMail({
        from: process.env.DIGEST_FROM_EMAIL || SMTP_USER, to: d.contact_email,
        subject: `VIEENT — Bản khai báo bản quyền: ${d.song_title}`.slice(0, 150),
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>VIEENT đã nhận khai báo bản quyền cho ca khúc <b>${esc(d.song_title)}</b>. Bản PDF đính kèm email này.</p><p>Bộ phận AR sẽ kiểm tra và xác nhận. Lưu ý: thiếu xác nhận nào, bài hát sẽ chưa được phát hành.</p></div>`,
        attachments: [{ filename: "Khai-bao-ban-quyen.pdf", content: Buffer.from(b64, "base64"), contentType: "application/pdf" }],
      });
      emailed = true;
    } catch (e) { /* page falls back to downloading */ }
  }
  return NextResponse.json({ ok: true, pdfSaved: !!pdfUrl, emailed }, { headers: noStore });
}
