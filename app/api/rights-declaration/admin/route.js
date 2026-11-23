// Round 633 — AR side of the rights declarations (signed-in AR / admin / dev only).
//   GET  ?link=<releaseId>        -> the public form link for that release
//   GET  ?list=pending|confirmed|all
//   GET  ?search=<text>           -> releases to attach a declaration to
//   POST { action: "confirm", id, release_id } -> writes the declaration on the release (detail page + Copyright checklist, empty fields only)
//   POST { action: "reject" | "reopen", id }
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../../lib/supabaseAdmin";
import { makeRightsToken } from "../../../../lib/rightsToken";
import { RIGHTS } from "../../../../lib/rightsForm";
import { rightsMailer } from "../../../../lib/mailer";
import { makeHolderLink, sendHolderMail, siteOrigin } from "../../../../lib/rightsHolder";
import { textKey, artistKeyOf, maskEmail } from "../../../../lib/rightsKey";
import { logRights, setRightsTicketStatus } from "../../../../lib/rightsLog";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

async function caller(request) {
  const p = await getCallerProfile(request);
  if (!p) return null;
  return p.role === "dev" || p.role === "admin" || p.role === "superadmin" || p.segment === "AR" ? p : null;
}

export async function GET(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500, headers: noStore });
  const me = await caller(request);
  if (!me) return NextResponse.json({ error: "Not authorized." }, { status: 403, headers: noStore });
  const q = new URL(request.url).searchParams;
  if (q.get("link")) {
    const t = makeRightsToken(q.get("link"));
    if (!t) return NextResponse.json({ error: "Could not make a link (bad release id or no secret configured)." }, { status: 400, headers: noStore });
    return NextResponse.json({ url: `${new URL(request.url).origin}/khai-bao/${t}` }, { headers: noStore });
  }
  if (q.get("search") != null) {
    const s = q.get("search").trim().replace(/[%,()]/g, " ").slice(0, 60);
    if (s.length < 2) return NextResponse.json({ releases: [] }, { headers: noStore });
    const { data } = await supabaseAdmin.from("releases").select("id, did, title, main_artist").or(`title.ilike.%${s}%,did.ilike.%${s}%,main_artist.ilike.%${s}%`).limit(15);
    return NextResponse.json({ releases: data || [] }, { headers: noStore });
  }
  if (q.get("history")) {   // Round 645 — everything that ever happened to one song (log + every declaration version)
    const sk = q.get("history");
    const [lg, ds] = await Promise.all([
      supabaseAdmin.from("rights_declaration_log").select("*").eq("song_key", sk).order("created_at", { ascending: false }).limit(200),
      supabaseAdmin.from("rights_declarations").select("id, status, created_at, signer_name, contact_email, change_reason, replace_reason, replaced_by, pdf_url").eq("title_key", sk.split("|")[0]).eq("artist_key", sk.split("|")[1] ?? "").order("created_at", { ascending: false }),
    ]);
    return NextResponse.json({ log: lg.data || [], versions: (ds.data || []).map((r) => ({ ...r, contact_email: r.contact_email ? maskEmail(r.contact_email) : null })) }, { headers: noStore });
  }
  const list = q.get("list") || "pending";
  const text = (q.get("q") || "").trim().replace(/[%,()]/g, " ").slice(0, 80);
  let query = supabaseAdmin.from("rights_declarations").select("*").order("created_at", { ascending: false }).limit(200);
  if (list !== "all") query = query.eq("status", list);
  if (text) {
    const tk = textKey(text);
    query = query.or(`song_title.ilike.%${text}%,performer.ilike.%${text}%${tk ? `,title_key.ilike.%${tk}%,artist_key.ilike.%${tk}%` : ""}`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
  const ids = [...new Set((data || []).map((r) => r.release_id).filter(Boolean))];
  const { data: rels } = ids.length ? await supabaseAdmin.from("releases").select("id, did, title, main_artist, label").in("id", ids) : { data: [] };
  const byId = Object.fromEntries((rels || []).map((r) => [r.id, r]));
  return NextResponse.json({ rows: (data || []).map((r) => ({ ...r, release: byId[r.release_id] || null })) }, { headers: noStore });
}

const emptyEntry = () => ({ owner: "", validFrom: "", validTo: "", noTimeLimit: false, contract: "", note: "", fullyHeld: "" });

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500, headers: noStore });
  const me = await caller(request);
  if (!me) return NextResponse.json({ error: "Not authorized." }, { status: 403, headers: noStore });
  let body = {};
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Bad request." }, { status: 400, headers: noStore }); }
  if (body.action === "backfill_keys") {   // Round 645 — give declarations made before this round their match keys
    const { data: rs } = await supabaseAdmin.from("rights_declarations").select("id, song_title, performer").is("title_key", null).limit(1000);
    let n = 0;
    for (const r of rs || []) { await supabaseAdmin.from("rights_declarations").update({ title_key: textKey(r.song_title), artist_key: artistKeyOf(r.performer) }).eq("id", r.id); n++; }
    return NextResponse.json({ ok: true, updated: n }, { headers: noStore });
  }
  const { data: row } = await supabaseAdmin.from("rights_declarations").select("*").eq("id", body.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Declaration not found." }, { status: 404, headers: noStore });

  const song_key = `${row.title_key ?? textKey(row.song_title)}|${row.artist_key ?? artistKeyOf(row.performer)}`;
  const lg = (action, extra = {}) => logRights(supabaseAdmin, { song_key, declaration_id: row.id, ticket_id: row.ticket_id, action, actor: me.name || me.id, ...extra });
  if (body.action === "resend_link") {   // AR re-sends the public khai-bao page (per-release link when a product is attached) to an email
    const to = String(body.to || row.contact_email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: "Email không hợp lệ." }, { status: 400, headers: noStore });
    const m = rightsMailer();
    if (!m) return NextResponse.json({ error: "Email chưa được cấu hình." }, { status: 503, headers: noStore });
    const t = row.release_id ? makeRightsToken(row.release_id) : null;
    const url = `${siteOrigin(request)}/khai-bao${t ? "/" + t : ""}`;
    try { await m.transport.sendMail({ from: m.from, replyTo: m.replyTo, to, subject: `VIEENT — Vui lòng khai báo bản quyền: ${row.song_title}`.slice(0, 150), html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>VIEENT đề nghị bạn khai báo (hoặc cập nhật) thông tin bản quyền cho ca khúc <b>${String(row.song_title).replace(/</g, "&lt;")}</b>.</p><p><a href="${url}">Mở trang khai báo</a></p></div>` }); }
    catch (e) { return NextResponse.json({ error: "Không gửi được email: " + e.message }, { status: 502, headers: noStore }); }
    await lg("link_resent", { detail: { to: maskEmail(to) } });
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  if (body.action === "reject" || body.action === "reopen") {
    if (row.status === "superseded") return NextResponse.json({ error: "Khai báo này đã bị thay thế bởi bản mới." }, { status: 400, headers: noStore });
    if (row.ticket_id) await setRightsTicketStatus(supabaseAdmin, row.ticket_id, body.action === "reject" ? "CANCELED" : "PENDING");
    await lg(body.action === "reject" ? "rejected" : "reopened");
    const { error } = await supabaseAdmin.from("rights_declarations").update(body.action === "reject" ? { status: "rejected", confirmed_by: me.id, confirmed_at: new Date().toISOString() } : { status: "pending", confirmed_by: null, confirmed_at: null }).eq("id", row.id);
    return error ? NextResponse.json({ error: error.message }, { status: 500, headers: noStore }) : NextResponse.json({ ok: true }, { headers: noStore });
  }
  if (body.action === "fix_holder_email") {   // Round 648 — the right holder's email was typed wrong: AR corrects it and re-sends the confirmation link
    const to = String(body.to || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: "Email không hợp lệ." }, { status: 400, headers: noStore });
    if (row.sign_status === "signed") return NextResponse.json({ error: "Chủ sở hữu đã xác nhận rồi — không thể đổi email." }, { status: 400, headers: noStore });
    if (!row.holder_name && !row.holder_email) return NextResponse.json({ error: "Khai báo này không có chủ sở hữu quyền để xác nhận." }, { status: 400, headers: noStore });
    if (row.sign_provider === "dropbox") return NextResponse.json({ error: "Yêu cầu đang ở Dropbox Sign — cần huỷ và tạo lại bên đó, không sửa email tại đây." }, { status: 400, headers: noStore });
    const m = rightsMailer();
    if (!m) return NextResponse.json({ error: "Email chưa được cấu hình." }, { status: 503, headers: noStore });
    const upd = { holder_email: to, sign_status: "sent" };
    if (body.name && String(body.name).trim()) upd.holder_name = String(body.name).trim().slice(0, 120);
    const { error: ue } = await supabaseAdmin.from("rights_declarations").update(upd).eq("id", row.id);
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500, headers: noStore });
    await lg("holder_email_changed", { detail: { from: row.holder_email ? maskEmail(row.holder_email) : null, to: maskEmail(to) } });
    try { await sendHolderMail(m, { ...row, ...upd }, makeHolderLink(siteOrigin(request), row.id)); } catch (e) { return NextResponse.json({ error: "Đã đổi email nhưng không gửi được: " + e.message }, { status: 502, headers: noStore }); }
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  if (body.action === "resend_holder") {   // AR re-sends the right holder's confirmation link
    if (row.sign_status !== "sent" || !row.holder_email || row.sign_provider === "dropbox") return NextResponse.json({ error: "Không có yêu cầu xác nhận đang chờ." }, { status: 400, headers: noStore });
    const m = rightsMailer();
    if (!m) return NextResponse.json({ error: "Email chưa được cấu hình." }, { status: 503, headers: noStore });
    try { await sendHolderMail(m, row, makeHolderLink(siteOrigin(request), row.id)); } catch (e) { return NextResponse.json({ error: "Không gửi được email: " + e.message }, { status: 502, headers: noStore }); }
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  if (body.action !== "confirm") return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore });
  if (row.status === "superseded") return NextResponse.json({ error: "Khai báo này đã bị thay thế bởi bản mới — hãy xác nhận bản mới." }, { status: 400, headers: noStore });

  // the right holder's e-signature is compulsory for licensed rights once a request was sent
  if (["sent", "declined"].includes(row.sign_status)) return NextResponse.json({ error: row.sign_status === "declined" ? "Chủ sở hữu quyền đã từ chối — không thể xác nhận." : "Chủ sở hữu quyền chưa xác nhận. Chờ họ xác nhận (hoặc bấm Gửi lại link) rồi xác nhận." }, { status: 400, headers: noStore });
  const releaseId = body.release_id || row.release_id;
  if (!releaseId) return NextResponse.json({ error: "Pick the product first." }, { status: 400, headers: noStore });
  const { data: rel } = await supabaseAdmin.from("releases").select("id, copyright_checklist").eq("id", releaseId).maybeSingle();
  if (!rel) return NextResponse.json({ error: "Product not found." }, { status: 404, headers: noStore });

  const now = new Date().toISOString();
  const day = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const decl = {
    declaration_id: row.id, confirmed_at: now, confirmed_by_name: me.name || null,
    song_title: row.song_title, composer: row.composer, performer: row.performer, producer: row.producer, mixer: row.mixer,
    owned: row.owned, licensed: row.licensed, licensed_until: row.licensed_until || {}, proof: row.proof, platforms: row.platforms, platforms_note: row.platforms_note,
    term: row.term, term_note: row.term_note, signer_name: row.signer_name, holder_name: row.holder_name || null, signed_pdf_url: row.signed_pdf_url || null, signed_at: row.signed_at || null, holder_confirmed: row.sign_status === "signed" && row.holder_audit ? { name: row.holder_audit.typed_name || row.holder_name, at: row.signed_at, ip: row.holder_audit.ip || null } : null, submitted_at: row.created_at, pdf_url: row.pdf_url,
  };
  // Copyright checklist (Q1 master / Q2 vocal / Q3 author): fill EMPTY fields only — never overwrite what AR already entered.
  const cl = rel.copyright_checklist && typeof rel.copyright_checklist === "object" ? { ...rel.copyright_checklist } : {};
  for (const r of RIGHTS) {
    const e = { ...emptyEntry(), ...(cl[r.checklist] || {}) };
    if (row.owned?.[r.key] && !e.fullyHeld) e.fullyHeld = "yes";
    if (row.licensed?.[r.key]) {
      const until = row.licensed_until?.[r.key];
      if (until && !e.validTo && !e.noTimeLimit) e.validTo = until;   // Thời hạn from the form -> checklist "valid to" (empty only)
      if (!e.note) e.note = `Được cấp phép bởi chủ sở hữu (khai báo form ${day})`;
      if (!e.contract && /^https?:\/\//i.test(row.proof || "")) e.contract = row.proof;
    }
    if (row.term === "perpetual" && !e.validFrom && !e.validTo) e.noTimeLimit = true;
    cl[r.checklist] = e;
  }
  const { error } = await supabaseAdmin.from("releases").update({ rights_declaration: decl, copyright_checklist: cl }).eq("id", rel.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
  await supabaseAdmin.from("rights_declarations").update({ status: "confirmed", release_id: rel.id, confirmed_by: me.id, confirmed_at: now }).eq("id", row.id);
  if (row.ticket_id) await setRightsTicketStatus(supabaseAdmin, row.ticket_id, "COMPLETE");
  await lg("confirmed", { detail: { release_id: rel.id } });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
