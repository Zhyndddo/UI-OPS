// Round 633 — PUBLIC rights-declaration form (per-release signed link, no login).
//   GET  ?token=...                    -> { release: { title, performer, composer } } to pre-fill the form
//   POST { token, form, pdfBase64 }    -> saves the declaration (database row, status "pending") and the signed PDF (Google Drive, link only in the row)
// Protected by: HMAC token per release, per-visitor + global rate limits, strict field cleaning, PDF magic-byte + size check.
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { newChallenge, readChallenge, codeMatches, sign, unsign, formHash, sha256Hex, describeUa } from "../../../lib/rightsOtp";
import { rightsMailer } from "../../../lib/mailer";
import { dropboxConfigured, sendForSignature } from "../../../lib/dropboxSign";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { readRightsToken, makeRightsToken } from "../../../lib/rightsToken";
import { cleanDeclaration, PDF_MW, PDF_MH_HOLDER, HOLDER_BOX } from "../../../lib/rightsForm";
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

const ATT = new Map();   // challenge nonce -> wrong-code attempts (best effort, per server instance)
const fail = (error, status) => NextResponse.json({ error }, { status, headers: noStore });
const esc = (x) => String(x || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

// Round 639 — step A "send_code": email a 6-digit code. step B "verify": check code + consent, return the signed evidence record.
async function otpStep(request, body, ip) {
  const v = cleanDeclaration(body.form);
  if (!v.ok) return fail(v.error, 400);
  const d = v.data;
  if (body.consent !== true) return fail("Vui lòng tích đồng ý cho VIEENT ghi nhận thông tin xác minh.", 400);
  const email = d.contact_email.toLowerCase();
  if (body.action === "send_code") {
    if (countHits("rd-otp:" + ip) >= 5 || countHits("rd-otp-e:" + email) >= 3) return fail("Đã gửi mã quá nhiều lần. Vui lòng thử lại sau 10 phút.", 429);
    const mail = rightsMailer();
    if (!mail) return fail("Hệ thống email chưa được cấu hình. Vui lòng báo VIEENT.", 503);
    addHit("rd-otp:" + ip); addHit("rd-otp-e:" + email);
    const { challenge, code } = newChallenge(email);
    try {
      await mail.transport.sendMail({
        from: mail.from, replyTo: mail.replyTo, to: d.contact_email, subject: `VIEENT — Mã xác nhận khai báo bản quyền: ${code}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Mã xác nhận của bạn để gửi khai báo bản quyền ca khúc <b>${esc(d.song_title)}</b>:</p><p style="font-size:30px;font-weight:800;letter-spacing:6px">${code}</p><p>Mã có hiệu lực trong 10 phút. Nếu bạn không thực hiện khai báo này, hãy bỏ qua email.</p></div>`,
      });
    } catch (e) { console.error("[rights-declaration] code mail failed:", e.message); return fail("Không gửi được email mã xác nhận. Vui lòng kiểm tra địa chỉ email và thử lại.", 502); }
    return NextResponse.json({ ok: true, challenge }, { headers: noStore });
  }
  const c = readChallenge(body.challenge);
  if (!c) return fail("Mã đã hết hạn. Vui lòng bấm gửi lại mã.", 400);
  if (ATT.size > 500) ATT.clear();
  const tries = (ATT.get(c.n) || 0) + 1; ATT.set(c.n, tries);
  if (tries > 5) return fail("Nhập sai quá nhiều lần. Vui lòng bấm gửi lại mã mới.", 429);
  if (!codeMatches(c, email, body.code)) return fail(c.e !== email ? "Email đã thay đổi sau khi gửi mã. Vui lòng gửi lại mã." : "Mã không đúng.", 400);
  ATT.delete(c.n);
  const h = (k) => request.headers.get(k) || "";
  const dec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  const cl = body.client && typeof body.client === "object" ? body.client : {};
  const t = (x, n) => String(x == null ? "" : x).slice(0, n);
  const ua = h("user-agent").slice(0, 300);
  const now = new Date().toISOString();
  const audit = {
    email, verified_at: now, consent_at: now, form_hash: formHash(d), ip, ua, ...describeUa(ua),
    country: t(h("x-vercel-ip-country"), 8), region: t(h("x-vercel-ip-country-region"), 20), city: t(dec(h("x-vercel-ip-city")), 60),
    lat: t(h("x-vercel-ip-latitude"), 12), lon: t(h("x-vercel-ip-longitude"), 12),
    client: { tz: t(cl.tz, 60), lang: t(cl.lang, 20), screen: t(cl.screen, 20), platform: t(cl.platform, 40) },
  };
  return NextResponse.json({ ok: true, audit, auditToken: sign({ ...audit, x: Date.now() + 30 * 60 * 1000 }, "audit") }, { headers: noStore });
}

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500, headers: noStore });
  const ip = clientIp(request);
  if (countHits("rd-post:" + ip) >= 8 || countHits("rd-post:all") >= 300) return NextResponse.json({ error: "Quá nhiều lượt gửi. Vui lòng thử lại sau 10 phút." }, { status: 429, headers: noStore });
  let body = {};
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400, headers: noStore }); }
  if (body.website) return NextResponse.json({ ok: true, fake: true }, { headers: noStore });   // honeypot
  if (body.action === "send_code" || body.action === "verify") return otpStep(request, body, ip);
  // No token = the one public link: the declaration is saved unlinked and AR picks the product when confirming.
  let rel = null;
  if (body.token) {
    const id = readRightsToken(body.token);
    rel = id ? await loadRelease(id) : null;
    if (!rel) return NextResponse.json({ error: "Link không hợp lệ." }, { status: 404, headers: noStore });
  }
  const v = cleanDeclaration(body.form);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400, headers: noStore });
  const d = v.data;
  // Round 639: the submit must carry the signed evidence record from the email-code step, for exactly this form content + email
  const au = unsign(body.auditToken, "audit");
  if (!au || au.x < Date.now() || au.form_hash !== formHash(d) || au.email !== d.contact_email.toLowerCase()) return fail("Chưa xác minh email, hoặc nội dung đã thay đổi sau khi xác minh. Vui lòng bấm gửi lại để nhận mã mới.", 400);
  addHit("rd-post:" + ip); addHit("rd-post:all");

  const b64 = String(body.pdfBase64 || "");
  const id = randomUUID();

  // 0) right holder must sign (licensed rights): Dropbox Sign request FIRST, so if it fails nothing is stored and the form keeps its data
  const needsHolder = !!(d.holder_name && d.holder_email);
  let sign = { status: "none", id: null, test: false };
  if (needsHolder) {
    if (!dropboxConfigured()) sign = { status: "not_configured", id: null, test: false };
    else {
      const pdf = Buffer.from(b64, "base64");
      if (!(pdf.length > 100 && pdf.length <= MAX_PDF && pdf[0] === 0x25 && pdf[1] === 0x50)) return NextResponse.json({ error: "Không tạo được file PDF để gửi ký. Vui lòng thử lại." }, { status: 400, headers: noStore });
      const k = 595 / PDF_MW;   // mock-up units -> PDF points
      try {
        const r = await sendForSignature({
          pdf, declarationId: id, name: d.holder_name, email: d.holder_email,
          title: `Khai báo bản quyền: ${d.song_title}`, subject: `VIEENT — xác nhận quyền ca khúc "${d.song_title}"`.slice(0, 250),
          message: `${d.signer_name || "Người khai báo"} đã khai báo bản quyền ca khúc "${d.song_title}" với VIEENT và ghi nhận bạn là chủ sở hữu quyền được cấp phép. Vui lòng mở văn bản và ký xác nhận.`,
          field: { x: Math.round(HOLDER_BOX.x * k), y: Math.round(HOLDER_BOX.y * k), width: Math.round(HOLDER_BOX.w * k), height: Math.round(HOLDER_BOX.h * k) },
        });
        sign = { status: "sent", id: r.id, test: r.test };
      } catch (e) {
        console.error("[rights-declaration] Dropbox Sign failed:", e.message);
        return NextResponse.json({ error: "Không gửi được yêu cầu ký tới chủ sở hữu quyền. Vui lòng kiểm tra email của họ và thử lại." }, { status: 502, headers: noStore });
      }
    }
  }

  // 1) the filled PDF -> Google Drive (never the database)
  let pdfUrl = null;
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
  const row = {
    id, holder_name: d.holder_name || null, holder_email: d.holder_email || null, sign_request_id: sign.id, sign_status: sign.status, sign_test: sign.test,
    release_id: rel?.id || null, song_title: d.song_title, composer: d.composer, performer: d.performer, producer: d.producer, mixer: d.mixer,
    owned: d.owned, licensed: d.licensed, licensed_until: d.licensed_until, contact_email: d.contact_email || null, proof: d.proof || null, platforms: d.platforms || null, platforms_note: d.platforms_note || null,
    term: d.term, term_note: d.term_note || null, signer_name: d.signer_name, pdf_url: pdfUrl,
    verify_audit: (({ x, ...rest }) => ({ ...rest, submit_ip: ip, submit_at: new Date().toISOString() }))(au),
    pdf_sha256: b64 ? sha256Hex(Buffer.from(b64, "base64")) : null, consent_at: au.consent_at,
  };
  let { error } = await supabaseAdmin.from("rights_declarations").insert(row);
  // Round 637 hotfix: if the Round 637 SQL has not been run yet (unknown column), save without the two new fields instead of failing.
  if (error && /licensed_until|contact_email|schema cache|column/i.test(error.message || "")) {
    const old = { ...row };
    for (const k of ["licensed_until", "contact_email", "holder_name", "holder_email", "sign_request_id", "sign_status", "sign_test", "verify_audit", "pdf_sha256", "consent_at"]) delete old[k];
    ({ error } = await supabaseAdmin.from("rights_declarations").insert(old));
  }
  if (error) {
    console.error("[rights-declaration] insert failed:", error.message);
    const missing = /relation .* does not exist|schema cache/i.test(error.message || "");
    return NextResponse.json({ error: missing ? "Hệ thống chưa sẵn sàng (thiếu bảng dữ liệu). Vui lòng báo VIEENT." : "Không lưu được. Vui lòng thử lại." }, { status: 500, headers: noStore });
  }
  // optional: email the SAME pdf to the address the submitter typed (one recipient, fixed template). No email / failure -> the page downloads it.
  let emailed = false;
  const mail = d.contact_email && b64 ? rightsMailer() : null;
  if (mail) {
    try {
      await mail.transport.sendMail({
        from: mail.from, replyTo: mail.replyTo, to: d.contact_email,
        subject: `VIEENT — Bản khai báo bản quyền: ${d.song_title}`.slice(0, 150),
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>VIEENT đã nhận khai báo bản quyền cho ca khúc <b>${esc(d.song_title)}</b>. Bản PDF đính kèm email này.</p>${needsHolder ? `<p>Chủ sở hữu quyền (${esc(d.holder_name)}) sẽ nhận email yêu cầu ký xác nhận.</p>` : ""}<p style="font-size:12px;color:#666">Email đã xác minh bằng mã lúc ${esc(au.verified_at)} · IP ${esc(au.ip)} · SHA-256 nội dung: ${esc(au.form_hash)}</p><p>Bộ phận AR sẽ kiểm tra và xác nhận. Lưu ý: thiếu xác nhận nào, bài hát sẽ chưa được phát hành.</p></div>`,
        attachments: [{ filename: "Khai-bao-ban-quyen.pdf", content: Buffer.from(b64, "base64"), contentType: "application/pdf" }],
      });
      emailed = true;
    } catch (e) { /* page falls back to downloading */ }
  }
  return NextResponse.json({ ok: true, pdfSaved: !!pdfUrl, emailed, signRequested: sign.status === "sent", signTest: sign.test }, { headers: noStore });
}
