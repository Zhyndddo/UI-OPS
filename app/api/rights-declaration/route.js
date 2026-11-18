// Round 633 — PUBLIC rights-declaration form (per-release signed link, no login).
//   GET  ?token=...                    -> { release: { title, performer, composer } } to pre-fill the form
//   POST { token, form, pdfBase64 }    -> saves the declaration (database row, status "pending") and the signed PDF (Google Drive, link only in the row)
// Protected by: HMAC token per release, per-visitor + global rate limits, strict field cleaning, PDF magic-byte + size check.
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { newChallenge, readChallenge, codeMatches, sign, unsign, formHash, sha256Hex, describeUa } from "../../../lib/rightsOtp";
import { rightsMailer } from "../../../lib/mailer";
import { makeHolderLink, sendHolderMail, siteOrigin } from "../../../lib/rightsHolder";
import { dropboxConfigured, sendForSignature } from "../../../lib/dropboxSign";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { readRightsToken, makeRightsToken } from "../../../lib/rightsToken";
import { cleanDeclaration, RIGHTS, PDF_MW, PDF_MH_HOLDER, HOLDER_BOX } from "../../../lib/rightsForm";
import { textKey, artistKeyOf, maskEmail } from "../../../lib/rightsKey";
import { logRights, ensureRightsTicket } from "../../../lib/rightsLog";
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
    rows.push(...data.filter((r) => r.title).map((r) => ({ id: r.id, title: r.title, artist: r.main_artist || "", composer: r.publishing_composer || "", n: norm(`${r.title} ${r.main_artist || ""}`), tk: textKey(r.title), ak: artistKeyOf(r.main_artist) })));
    if (data.length < 1000) break;
  }
  CACHE = { at: Date.now(), rows };
  return rows;
}

// Round 645 — as the declarer types title + performer: is that song already declared (same title + performer ignoring accents, case, symbols, look-alike letters)?
// Returns only a MASKED email and a signed claim; the product match lets the declaration attach to the app's release automatically.
async function checkDup(request, ip, sp) {
  if (countHits("rd-chk:" + ip) >= 40) return NextResponse.json({ error: "Quá nhiều lượt kiểm tra. Thử lại sau ít phút." }, { status: 429, headers: noStore });
  addHit("rd-chk:" + ip);
  const tk = textKey(String(sp.get("title") || "").slice(0, 200)), ak = artistKeyOf(String(sp.get("artist") || "").slice(0, 200));
  const out = { declared: false, masked: null, claim: null, release: null };
  if (tk.length < 2) return NextResponse.json(out, { headers: noStore });
  try {
    const { data } = await supabaseAdmin.from("rights_declarations").select("id, contact_email").eq("title_key", tk).eq("artist_key", ak).in("status", ["pending", "confirmed"]).order("created_at", { ascending: false }).limit(1);
    if (data?.[0]) { out.declared = true; out.masked = data[0].contact_email ? maskEmail(data[0].contact_email) : null; out.claim = sign({ id: data[0].id, x: Date.now() + 30 * 60 * 1000 }, "claim"); }
  } catch (e) { /* SQL not run yet: no duplicate check */ }
  if (ak) {
    const hits = (await titleCache()).filter((r) => r.tk === tk && r.ak === ak);
    if (hits.length === 1) out.release = { title: hits[0].title, token: makeRightsToken(hits[0].id) };
  }
  return NextResponse.json(out, { headers: noStore });
}

export async function GET(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500, headers: noStore });
  const ip = clientIp(request);
  if (new URL(request.url).searchParams.get("view") != null) return NextResponse.json({ vt: sign({ t: new Date().toISOString(), ip, x: Date.now() + 3 * 3600 * 1000 }, "view") }, { headers: noStore });   // Round 649: "form opened" evidence, signed by the server
  if (new URL(request.url).searchParams.get("check") != null) return checkDup(request, ip, new URL(request.url).searchParams);   // Round 645
  const q = new URL(request.url).searchParams.get("q");
  if (q != null) {
    if (countHits("rd-search:" + ip) >= 60) return NextResponse.json({ error: "Quá nhiều lượt tìm. Thử lại sau ít phút." }, { status: 429, headers: noStore });
    addHit("rd-search:" + ip);
    if (q === "_warm") { await titleCache(); return NextResponse.json({ results: [] }, { headers: noStore }); }   // page-load warm-up: first real search is instant
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
// Round 645 — the song is already declared: send a copy to the old email, or (type old email + code sent to it) unlock a replacement.
const ok = (o) => NextResponse.json({ ok: true, ...o }, { headers: noStore });
const rightsText = (row) => {
  const L = (o) => RIGHTS.filter((r) => o?.[r.key]).map((r) => r.vi).join(", ") || "—";
  return `<table style="border-collapse:collapse;font-size:13px">${[["Bài hát", row.song_title], ["Sáng tác", row.composer], ["Trình bày", row.performer], ["Producer", row.producer], ["Mixer", row.mixer], ["Quyền sở hữu", L(row.owned)], ["Quyền được cấp phép", L(row.licensed)], ["Nền tảng", row.platforms === "all" ? "Tất cả" : row.platforms_note || "Một số"], ["Thời hạn đăng tải", row.term === "perpetual" ? "Vĩnh viễn" : `Có thời hạn ${row.term_note || ""}`], ["Người ký", row.signer_name], ["Ngày khai báo", new Date(row.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })]].map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#666">${k}</td><td style="padding:3px 0"><b>${esc(v || "—")}</b></td></tr>`).join("")}</table>${row.pdf_url ? `<p><a href="${esc(row.pdf_url)}">Mở bản PDF đã khai báo</a></p>` : ""}`;
};
async function dupStep(request, body, ip) {
  const c = unsign(body.claim, "claim");
  if (!c || c.x < Date.now()) return fail("Phiên đã hết hạn. Vui lòng nhập lại tên bài hát để kiểm tra.", 400);
  const { data: row } = await supabaseAdmin.from("rights_declarations").select("*").eq("id", c.id).maybeSingle();
  if (!row || !["pending", "confirmed"].includes(row.status)) return fail("Khai báo cũ không còn hiệu lực. Vui lòng tải lại trang.", 404);
  const song_key = `${row.title_key}|${row.artist_key}`;
  const log = (action, extra = {}) => logRights(supabaseAdmin, { song_key, declaration_id: row.id, ticket_id: row.ticket_id, action, ip, ...extra });
  if (!row.contact_email) { await log("old_no_email"); return fail("Khai báo cũ không có email để xác nhận. Vui lòng liên hệ VIEENT (AR) để được hỗ trợ.", 400); }
  const to = row.contact_email, key = `${to.toLowerCase()}|old:${row.id}`, mail = rightsMailer();
  if (!mail) return fail("Hệ thống email chưa được cấu hình. Vui lòng báo VIEENT.", 503);

  if (body.action === "copy") {
    if (countHits("rd-copy:" + row.id) >= 3 || countHits("rd-copy-ip:" + ip) >= 6) return fail("Đã gửi quá nhiều lần. Vui lòng thử lại sau 10 phút.", 429);
    addHit("rd-copy:" + row.id); addHit("rd-copy-ip:" + ip);
    try { await mail.transport.sendMail({ from: mail.from, replyTo: mail.replyTo, to, subject: `VIEENT — Bản sao khai báo bản quyền: ${row.song_title}`.slice(0, 150), html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Có người vừa yêu cầu xem lại khai báo bản quyền đã gửi bằng email này:</p>${rightsText(row)}<p style="font-size:12px;color:#666">Nếu không phải bạn yêu cầu, bạn có thể bỏ qua email này.</p></div>` }); }
    catch (e) { console.error("[rights-declaration] copy mail failed:", e.message); return fail("Không gửi được email. Vui lòng thử lại.", 502); }
    await log("copy_sent", { detail: { to: maskEmail(to) } });
    return ok({ masked: maskEmail(to) });
  }
  const reason = String(body.reason || "").trim().slice(0, 500);
  if (reason.length < 5) return fail("Vui lòng nhập lý do xoá khai báo cũ (ít nhất 5 ký tự).", 400);

  if (body.action === "old_code") {
    if (countHits("rd-old:" + row.id + ip) >= 5) return fail("Nhập sai quá nhiều lần. Vui lòng thử lại sau 10 phút.", 429);
    const typed = String(body.typed_email || "").trim().toLowerCase();
    if (typed !== to.toLowerCase()) { addHit("rd-old:" + row.id + ip); await log("old_email_mismatch", { reason, detail: { typed: maskEmail(typed) } }); return fail("Email không khớp với email đã dùng để khai báo.", 400); }
    if (countHits("rd-oldotp:" + row.id) >= 3) return fail("Đã gửi mã quá nhiều lần. Vui lòng thử lại sau 10 phút.", 429);
    addHit("rd-oldotp:" + row.id);
    const { challenge, code } = newChallenge(key);
    try { await mail.transport.sendMail({ from: mail.from, replyTo: mail.replyTo, to, subject: `VIEENT — Mã xác nhận xoá khai báo bản quyền: ${code}`, html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Có người yêu cầu xoá khai báo bản quyền ca khúc <b>${esc(row.song_title)}</b> để khai báo lại. Mã xác nhận:</p><p style="font-size:30px;font-weight:800;letter-spacing:6px">${code}</p><p>Lý do được ghi: ${esc(reason)}</p><p>Mã có hiệu lực 10 phút. Nếu không phải bạn, hãy bỏ qua email này — khai báo cũ vẫn được giữ.</p></div>` }); }
    catch (e) { console.error("[rights-declaration] old code mail failed:", e.message); return fail("Không gửi được email mã xác nhận. Vui lòng thử lại.", 502); }
    await log("delete_requested", { reason, detail: { to: maskEmail(to) } });
    return ok({ challenge });
  }
  // old_verify
  const cc = readChallenge(body.challenge);
  if (!cc) return fail("Mã đã hết hạn. Vui lòng bấm gửi lại mã.", 400);
  if (ATT.size > 500) ATT.clear();
  const tries = (ATT.get(cc.n) || 0) + 1; ATT.set(cc.n, tries);
  if (tries > 5) return fail("Nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.", 429);
  if (!codeMatches(cc, key, body.code)) return fail("Mã không đúng.", 400);
  ATT.delete(cc.n);
  await log("delete_verified", { reason });
  return ok({ replaceToken: sign({ id: row.id, tk: row.title_key, ak: row.artist_key, reason, x: Date.now() + 60 * 60 * 1000 }, "replace") });
}

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
    return NextResponse.json({ ok: true, challenge, sentToken: sign({ t: new Date().toISOString(), ip, x: Date.now() + 30 * 60 * 1000 }, "sent") }, { headers: noStore });
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
  const vw = unsign(body.viewToken, "view"), st = unsign(body.sentToken, "sent");   // Round 649: when the form was opened / the code was sent (server-signed, so they cannot be faked)
  const audit = {
    ...(vw ? { viewed_at: vw.t, viewed_ip: vw.ip } : {}), ...(st ? { sent_at: st.t, sent_ip: st.ip } : {}),
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
  if (["copy", "old_code", "old_verify"].includes(body.action)) return dupStep(request, body, ip);   // Round 645
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

  // Round 645 — same song (title + performer ignoring accents / case / symbols / look-alike letters)
  const tk = textKey(d.song_title), ak = artistKeyOf(d.performer), song_key = `${tk}|${ak}`;
  const reason = String(body.change_reason || "").trim().slice(0, 500);
  let replaced = null;
  if (body.replaceToken) {
    const rt = unsign(body.replaceToken, "replace");
    if (!rt || rt.x < Date.now()) return fail("Phiên xác nhận xoá khai báo cũ đã hết hạn. Vui lòng làm lại bước xác nhận.", 400);
    if (rt.tk !== tk || rt.ak !== ak) return fail("Khai báo mới phải cùng tên bài hát và nghệ sĩ với khai báo cũ.", 400);
    const { data: o } = await supabaseAdmin.from("rights_declarations").select("*").eq("id", rt.id).maybeSingle();
    if (o && ["pending", "confirmed"].includes(o.status)) replaced = { ...o, replace_reason: rt.reason };
    if (replaced && reason.length < 5) return fail("Vui lòng nhập lý do thay đổi (ít nhất 5 ký tự).", 400);
  }
  if (!replaced && tk.length >= 2) {   // the form hides the rest when a duplicate is found; this stops anyone skipping that
    let dup = null;
    try { const { data } = await supabaseAdmin.from("rights_declarations").select("id").eq("title_key", tk).eq("artist_key", ak).in("status", ["pending", "confirmed"]).limit(1); dup = data?.[0] || null; } catch (e) { /* SQL not run yet */ }
    if (dup) return NextResponse.json({ error: "Bài hát này đã được khai báo. Vui lòng tải lại trang và chọn xoá khai báo cũ hoặc xem lại bản đã khai báo.", declared: true }, { status: 409, headers: noStore });
  }

  const b64 = String(body.pdfBase64 || "");
  const id = randomUUID();

  // 0) right holder must sign (licensed rights): Dropbox Sign request FIRST, so if it fails nothing is stored and the form keeps its data
  const needsHolder = !!(d.holder_name && d.holder_email);
  let sign = { status: "none", id: null, test: false, provider: null };
  // Round 641: default = in-house confirmation (email link + email code). RIGHTS_SIGN_PROVIDER=dropbox switches back to Dropbox Sign.
  const provider = process.env.RIGHTS_SIGN_PROVIDER === "dropbox" ? "dropbox" : "inhouse";
  if (needsHolder) {
    if (provider === "inhouse") sign = { status: "sent", id: null, test: false, provider: "inhouse" };
    else if (!dropboxConfigured()) sign = { status: "not_configured", id: null, test: false, provider: "dropbox" };
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
        sign = { status: "sent", id: r.id, test: r.test, provider: "dropbox" };
      } catch (e) {
        console.error("[rights-declaration] Dropbox Sign failed:", e.message);
        return NextResponse.json({ error: "Không gửi được yêu cầu ký tới chủ sở hữu quyền. Vui lòng kiểm tra email của họ và thử lại." }, { status: 502, headers: noStore });
      }
    }
  }

  // 1) the filled PDF -> Google Drive (never the database)
  const uploadDrive = async () => {
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
  return pdfUrl;
  };

  // 2) the answers -> a small database row
  const row = {
    id, holder_name: d.holder_name || null, holder_email: d.holder_email || null, sign_request_id: sign.id, sign_status: sign.status, sign_test: sign.test, sign_provider: sign.provider,
    release_id: rel?.id || null, song_title: d.song_title, composer: d.composer, performer: d.performer, producer: d.producer, mixer: d.mixer,
    owned: d.owned, licensed: d.licensed, licensed_until: d.licensed_until, contact_email: d.contact_email || null, proof: d.proof || null, platforms: d.platforms || null, platforms_note: d.platforms_note || null,
    term: d.term, term_note: d.term_note || null, signer_name: d.signer_name, pdf_url: null,
    title_key: tk, artist_key: ak, change_reason: replaced ? reason : null,
    verify_audit: (({ x, ...rest }) => ({ ...rest, submit_ip: ip, submit_at: new Date().toISOString() }))(au),
    pdf_sha256: b64 ? sha256Hex(Buffer.from(b64, "base64")) : null, consent_at: au.consent_at,
  };
  let { error } = await supabaseAdmin.from("rights_declarations").insert(row);
  // Round 637 hotfix: if the Round 637 SQL has not been run yet (unknown column), save without the two new fields instead of failing.
  if (error && /licensed_until|contact_email|schema cache|column/i.test(error.message || "")) {
    const old = { ...row };
    for (const k of ["licensed_until", "contact_email", "holder_name", "holder_email", "sign_request_id", "sign_status", "sign_test", "sign_provider", "verify_audit", "pdf_sha256", "consent_at", "title_key", "artist_key", "change_reason"]) delete old[k];
    ({ error } = await supabaseAdmin.from("rights_declarations").insert(old));
  }
  if (error) {
    console.error("[rights-declaration] insert failed:", error.message);
    const missing = /relation .* does not exist|schema cache/i.test(error.message || "");
    return NextResponse.json({ error: missing ? "Hệ thống chưa sẵn sàng (thiếu bảng dữ liệu). Vui lòng báo VIEENT." : "Không lưu được. Vui lòng thử lại." }, { status: 500, headers: noStore });
  }
  // Round 645 — the old declaration is kept (status "superseded", never deleted); the song's ticket is created or REOPENED; everything is logged
  if (replaced) await supabaseAdmin.from("rights_declarations").update({ status: "superseded", replaced_by: id, replace_reason: replaced.replace_reason || null }).eq("id", replaced.id);
  const tkt = await ensureRightsTicket(supabaseAdmin, { id, song_key, song_title: d.song_title, performer: d.performer, signer_name: d.signer_name, release_id: rel?.id || null });
  await logRights(supabaseAdmin, { song_key, declaration_id: id, ticket_id: tkt?.id, action: replaced ? "replaced" : "declared", reason: replaced ? reason : null, ip, detail: { old_id: replaced?.id || null, old_email: replaced?.contact_email ? maskEmail(replaced.contact_email) : null, new_email: maskEmail(d.contact_email), ticket_reopened: !!tkt?.reopened } });
  // optional: email the SAME pdf to the address the submitter typed (one recipient, fixed template). No email / failure -> the page downloads it.
  // Round 640: Drive upload and email now run AT THE SAME TIME (was one after the other) -> the submit waits for the slower one only.
  const sendMail = async () => {
  let emailed = false;
  const mail = d.contact_email && b64 ? rightsMailer() : null;
  if (mail) {
    try {
      await mail.transport.sendMail({
        from: mail.from, replyTo: mail.replyTo, to: d.contact_email,
        subject: `VIEENT — Bản khai báo bản quyền: ${d.song_title}`.slice(0, 150),
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>VIEENT đã nhận khai báo bản quyền cho ca khúc <b>${esc(d.song_title)}</b>. Bản PDF đính kèm email này.</p>${replaced ? `<p>Khai báo này <b>thay thế</b> khai báo trước đó của bài hát. Lý do: ${esc(reason)}</p>` : ""}${needsHolder ? `<p>Chủ sở hữu quyền (${esc(d.holder_name)}) sẽ nhận email yêu cầu ký xác nhận.</p>` : ""}<p style="font-size:12px;color:#666">Email đã xác minh bằng mã lúc ${esc(au.verified_at)} · IP ${esc(au.ip)} · SHA-256 nội dung: ${esc(au.form_hash)}</p><p>Bộ phận AR sẽ kiểm tra và xác nhận. Lưu ý: thiếu xác nhận nào, bài hát sẽ chưa được phát hành.</p></div>`,
        attachments: [{ filename: "Khai-bao-ban-quyen.pdf", content: Buffer.from(b64, "base64"), contentType: "application/pdf" }],
      });
      emailed = true;
    } catch (e) { /* page falls back to downloading */ }
  }
  return emailed;
  };
  // Round 647 — internal tracking copy: every declaration is also emailed (with the PDF) to VIEENT's tracking inbox(es).
  // Default suong.tuyet@vieent.com; override / add more with env RIGHTS_NOTIFY_EMAILS (comma separated). Never blocks the artist's submit.
  const sendNotify = async () => {
    const to = (process.env.RIGHTS_NOTIFY_EMAILS || "suong.tuyet@vieent.com").split(",").map((x) => x.trim()).filter(Boolean);
    const m = to.length ? rightsMailer() : null;
    if (!m) return null;
    try {
      await m.transport.sendMail({
        from: m.from, replyTo: d.contact_email || m.replyTo, to,
        subject: `[Khai báo bản quyền] ${replaced ? "THAY THẾ — " : ""}${d.song_title} — ${d.performer || ""}`.slice(0, 170),
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Có khai báo bản quyền ${replaced ? "<b>thay thế khai báo cũ</b> " : "mới "}cho ca khúc <b>${esc(d.song_title)}</b>${d.performer ? ` — ${esc(d.performer)}` : ""}.</p>${rightsText({ ...row, id, created_at: new Date().toISOString() })}<p>Người ký: <b>${esc(d.signer_name)}</b> · Email: ${esc(d.contact_email || "—")}${replaced ? `<br>Lý do thay đổi: ${esc(reason)}` : ""}</p><p><a href="${esc(siteOrigin(request))}/tickets/khai-bao-ban-quyen">Mở ticket Khai báo bản quyền</a></p><p style="font-size:12px;color:#666">Email xác minh bằng mã lúc ${esc(au.verified_at)} · IP ${esc(au.ip)}</p></div>`,
        attachments: b64 ? [{ filename: "Khai-bao-ban-quyen.pdf", content: Buffer.from(b64, "base64"), contentType: "application/pdf" }] : [],
      });
      return true;
    } catch (e) { console.error("[rights-declaration] notify mail failed:", e.message); return false; }
  };
  const sendHolder = async () => {   // the right holder gets their private confirmation link
    if (!(needsHolder && sign.provider === "inhouse")) return null;
    const m = rightsMailer();
    if (!m) return false;
    try { await sendHolderMail(m, { ...row, id }, makeHolderLink(siteOrigin(request), id)); return true; } catch (e) { console.error("[rights-declaration] holder mail failed:", e.message); return false; }
  };
  const sendOld = async () => {   // the OLD email is told when its declaration was replaced (same inbox: the mail above already says so)
    if (!replaced?.contact_email || replaced.contact_email.toLowerCase() === d.contact_email.toLowerCase()) return null;
    const m = rightsMailer();
    if (!m) return false;
    try {
      await m.transport.sendMail({ from: m.from, replyTo: m.replyTo, to: replaced.contact_email, subject: `VIEENT — Khai báo bản quyền "${d.song_title}" đã được thay bằng khai báo mới`.slice(0, 150),
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Khai báo bản quyền của bạn cho ca khúc <b>${esc(d.song_title)}</b> đã được thay bằng một khai báo mới (gửi từ email ${esc(maskEmail(d.contact_email))}).</p><p>Lý do được ghi: ${esc(reason)}</p><p>Nếu không phải bạn thực hiện, vui lòng liên hệ VIEENT (AR) ngay.</p></div>` });
      return true;
    } catch (e) { console.error("[rights-declaration] old-email notice failed:", e.message); return false; }
  };
  const [pdfUrl, emailed, holderMailed] = await Promise.all([uploadDrive(), sendMail(), sendHolder(), sendOld(), sendNotify()]);
  const upd = { ...(pdfUrl ? { pdf_url: pdfUrl } : {}), ...(tkt?.id ? { ticket_id: tkt.id } : {}) };
  if (Object.keys(upd).length) await supabaseAdmin.from("rights_declarations").update(upd).eq("id", id);
  return NextResponse.json({ ok: true, pdfSaved: !!pdfUrl, emailed, signRequested: sign.status === "sent", signTest: sign.test, holderMailed, replaced: !!replaced }, { headers: noStore });
}
