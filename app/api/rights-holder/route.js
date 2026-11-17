// Round 641 — PUBLIC right-holder confirmation (private link from the email; no login).
//   GET  ?t=<token>                                   -> what the holder is asked to confirm
//   POST { t, action:"send_code", consent }           -> 6-digit code to the holder's email
//   POST { t, action:"confirm", consent, typed_name, challenge, code, client } -> records name + time + IP/device/place + hash, status "signed"
//   POST { t, action:"decline" }                      -> status "declined"
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { rightsMailer } from "../../../lib/mailer";
import { RIGHTS } from "../../../lib/rightsForm";
import { readHolderToken } from "../../../lib/rightsHolder";
import { countHits, addHit, clientIp } from "../../../lib/eventRateLimit";
import { newChallenge, readChallenge, codeMatches, stableJson, sha256Hex, requestEvidence } from "../../../lib/rightsOtp";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const fail = (error, status) => NextResponse.json({ error }, { status, headers: noStore });
const ATT = new Map();
const COLS = "id, song_title, signer_name, performer, composer, owned, licensed, licensed_until, term, term_note, platforms, platforms_note, proof, holder_name, holder_email, sign_status, signed_at, created_at, verify_audit";
const mask = (e) => String(e || "").replace(/^(.).*(@.*)$/, "$1***$2");

async function load(t) {
  const id = readHolderToken(t);
  if (!id) return null;
  const { data } = await supabaseAdmin.from("rights_declarations").select(COLS).eq("id", id).maybeSingle();
  return data && data.holder_email ? data : null;
}

export async function GET(request) {
  if (!supabaseAdmin) return fail("Server not configured.", 500);
  const ip = clientIp(request);
  if (countHits("rh-get:" + ip) >= 60) return fail("Quá nhiều lượt truy cập. Thử lại sau ít phút.", 429);
  addHit("rh-get:" + ip);
  const row = await load(new URL(request.url).searchParams.get("t"));
  if (!row) return fail("Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng nhờ người khai báo / VIEENT gửi lại.", 404);
  return NextResponse.json({
    status: row.sign_status, signed_at: row.signed_at, holder_name: row.holder_name, holder_email: mask(row.holder_email),
    decl: {
      song_title: row.song_title, signer_name: row.signer_name, performer: row.performer, composer: row.composer,
      licensed: RIGHTS.filter((r) => row.licensed?.[r.key]).map((r) => r.vi), platforms: row.platforms, platforms_note: row.platforms_note,
      term: row.term, term_note: row.term_note, submitted_at: row.created_at,
    },
  }, { headers: noStore });
}

export async function POST(request) {
  if (!supabaseAdmin) return fail("Server not configured.", 500);
  const ip = clientIp(request);
  if (countHits("rh-post:" + ip) >= 30) return fail("Quá nhiều lượt gửi. Vui lòng thử lại sau 10 phút.", 429);
  addHit("rh-post:" + ip);
  let body = {};
  try { body = await request.json(); } catch (e) { return fail("Dữ liệu không hợp lệ.", 400); }
  const row = await load(body.t);
  if (!row) return fail("Liên kết không hợp lệ hoặc đã hết hạn.", 404);
  if (row.sign_status !== "sent") return fail(row.sign_status === "signed" ? "Bạn đã xác nhận rồi. Cảm ơn bạn." : row.sign_status === "declined" ? "Bạn đã từ chối khai báo này." : "Khai báo này không cần xác nhận.", 400);
  const email = String(row.holder_email).toLowerCase();
  const key = `${email}|h:${row.id}`;

  if (body.action === "decline") {
    const { error } = await supabaseAdmin.from("rights_declarations").update({ sign_status: "declined", holder_audit: { declined: true, at: new Date().toISOString(), ...requestEvidence(request, ip, body.client) } }).eq("id", row.id).eq("sign_status", "sent");
    return error ? fail("Không lưu được. Vui lòng thử lại.", 500) : NextResponse.json({ ok: true, declined: true }, { headers: noStore });
  }
  if (body.consent !== true) return fail("Vui lòng tích đồng ý cho VIEENT ghi nhận thông tin xác minh.", 400);

  if (body.action === "send_code") {
    if (countHits("rh-otp:" + ip) >= 5 || countHits("rh-otp-e:" + email) >= 3) return fail("Đã gửi mã quá nhiều lần. Vui lòng thử lại sau 10 phút.", 429);
    const mail = rightsMailer();
    if (!mail) return fail("Hệ thống email chưa được cấu hình. Vui lòng báo VIEENT.", 503);
    addHit("rh-otp:" + ip); addHit("rh-otp-e:" + email);
    const { challenge, code } = newChallenge(key);
    try {
      await mail.transport.sendMail({ from: mail.from, replyTo: mail.replyTo, to: row.holder_email, subject: `VIEENT — Mã xác nhận quyền ca khúc: ${code}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Mã xác nhận của bạn:</p><p style="font-size:30px;font-weight:800;letter-spacing:6px">${code}</p><p>Mã có hiệu lực 10 phút. Nếu bạn không thực hiện, hãy bỏ qua email.</p></div>` });
    } catch (e) { console.error("[rights-holder] code mail failed:", e.message); return fail("Không gửi được email mã xác nhận. Vui lòng thử lại.", 502); }
    return NextResponse.json({ ok: true, challenge }, { headers: noStore });
  }

  if (body.action === "confirm") {
    const typed = String(body.typed_name || "").trim().slice(0, 120);
    if (typed.length < 2) return fail("Vui lòng gõ họ tên đầy đủ của bạn để xác nhận.", 400);
    const c = readChallenge(body.challenge);
    if (!c) return fail("Mã đã hết hạn. Vui lòng bấm gửi lại mã.", 400);
    if (ATT.size > 500) ATT.clear();
    const tries = (ATT.get(c.n) || 0) + 1; ATT.set(c.n, tries);
    if (tries > 5) return fail("Nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.", 429);
    if (!codeMatches(c, key, body.code)) return fail("Mã không đúng.", 400);
    ATT.delete(c.n);
    const now = new Date().toISOString();
    const audit = { typed_name: typed, email, at: now, consent_at: now, declaration_hash: row.verify_audit?.form_hash || null, ...requestEvidence(request, ip, body.client) };
    audit.confirm_hash = sha256Hex(stableJson({ id: row.id, name: typed, email, at: now, ip, declaration_hash: audit.declaration_hash }));
    const { error } = await supabaseAdmin.from("rights_declarations").update({ sign_status: "signed", signed_at: now, sign_provider: "inhouse", holder_audit: audit }).eq("id", row.id).eq("sign_status", "sent");
    if (error) { console.error("[rights-holder] save failed:", error.message); return fail("Không lưu được. Vui lòng thử lại.", 500); }
    return NextResponse.json({ ok: true, at: now }, { headers: noStore });
  }
  return fail("Yêu cầu không hợp lệ.", 400);
}
