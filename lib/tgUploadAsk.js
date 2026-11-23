// Round 685 — when an upload request in the group tags the Upload PICs (Hiếu / Tâm), Friday asks
// "gửi Upload trên web luôn không?". Có = same as SEND UPLOAD on the release detail page (checks
// the same gates first and says exactly what is missing). Không = nothing happens.
// Names come from FRIDAY_UPLOAD_ASK_NAMES (comma list, default "hiếu,tâm").
import { norm } from "./chatParse";
import { COPYRIGHT_ITEMS, normalizeCopyrightChecklist, copyrightEntryMissingFields } from "./copyrightChecklist";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const REQUIRED = [["meta_audio", "Audio"], ["meta_artwork", "Artwork"], ["meta_lyric", "Lyric"], ["meta_doc", "Metadata"]];

const askNames = () => String(process.env.FRIDAY_UPLOAD_ASK_NAMES || "hiếu,tâm").split(",").map((s) => norm(s)).filter(Boolean);

// does this stored intake (kind upload) address one of the Upload PICs?
export function wantsUploadAsk(it) {
  if (!it || it.kind !== "upload") return false;
  const hay = " " + norm(`${it.pic_name || ""} ${it.pic_text || ""} ${it.raw ? String(it.raw).split(/\r?\n/)[0] : ""}`) + " ";
  return askNames().some((n) => hay.includes(" " + n + " "));
}
export const uploadAskText = (it) => `📤 Mình thấy yêu cầu Upload <b>${esc(it.title)}</b>${it.artists?.length ? " — " + esc(it.artists.join(", ")) : ""}.\nBạn có muốn gửi Upload trên web luôn không?`;
export const uploadAskButtons = (id) => ({ inline_keyboard: [[{ text: "✅ Có, gửi Upload", callback_data: `ua:y:${id}` }, { text: "❌ Không", callback_data: `ua:n:${id}` }]] });

async function findRelease(db, it) {
  const safe = String(it.title || "").replace(/[%,()]/g, " ").trim();
  if (safe.length < 3) return { error: "Tên bài quá ngắn để tìm trong app." };
  const { data } = await db.from("releases")
    .select("id, did, title, main_artist, release_date, label, requested, single_album_ep, copyright_checklist, project_type, created_by_profile_id, meta_audio, meta_artwork, meta_lyric, meta_doc")
    .ilike("title", `%${safe}%`).order("created_at", { ascending: false }).limit(10);
  let rows = data || [];
  if (!rows.length) return { error: "Chưa thấy bài này trong app — hãy tạo release trước (có thể dùng nút “Create and send upload” ở form tạo mới)." };
  const exact = rows.filter((r) => norm(r.title) === norm(it.title));
  if (exact.length) rows = exact;
  if (rows.length > 1 && it.artists?.length) {
    const a = norm(it.artists[0]);
    const byArtist = rows.filter((r) => norm(r.main_artist).includes(a));
    if (byArtist.length) rows = byArtist;
  }
  if (rows.length > 1) return { error: `Có ${rows.length} release trùng tên (${rows.slice(0, 3).map((r) => r.did).join(", ")}…) nên mình không chắc là bài nào — bạn gửi Upload trên web giúp nhé.` };
  return { release: rows[0] };
}

async function missingList(db, r) {
  const miss = [];
  if (!r.title || !r.main_artist || !r.release_date || !r.label) miss.push("Thông tin chính (tên / artist / ngày phát hành / hãng đĩa) chưa đủ");
  REQUIRED.forEach(([k, l]) => { if (r[k] !== "true") miss.push(`Metadata checklist: ${l} chưa tick`); });
  const missCopy = (cc, prefix) => {
    const data = normalizeCopyrightChecklist(cc);
    COPYRIGHT_ITEMS.forEach((item) => { const m = copyrightEntryMissingFields(data[item.key]); if (m.length) miss.push(`${prefix}Copyright ${item.shortLabel || ""}: thiếu ${m.join(", ")}`); });
  };
  if (!r.single_album_ep || r.single_album_ep === "Single") missCopy(r.copyright_checklist, "");
  else {
    const { data: tr } = await db.from("release_tracks").select("track_name, copyright_checklist").eq("release_id", r.id).order("sort_order");
    if (!tr?.length) miss.push("EP/Album chưa có track nào");
    (tr || []).forEach((t) => missCopy(t.copyright_checklist, `Track “${t.track_name}” — `));
  }
  return miss;
}

async function audit(db, actor, ticketId) {
  try { await db.from("audit_log").insert({ actor: actor || null, action: "create", entity: "ticket", entity_id: String(ticketId) }); } catch (e) { /* best-effort */ }
}

export async function handleUploadAsk(db, cb, linkedProfile) {
  const [, act, idRaw] = String(cb.data || "").split(":");
  const id = parseInt(idRaw, 10);
  if (!["y", "n"].includes(act) || !id) return { answer: "?" };
  const { data: it } = await db.from("tg_intakes").select("*").eq("id", id).maybeSingle();
  if (!it) return { answer: "Không tìm thấy yêu cầu." };
  const lk = await linkedProfile(cb.from.id).catch(() => null);
  const uname = String(cb.from?.username || "").toLowerCase();
  const allowed = cb.from?.id === it.poster_tg_id || !!lk || (uname && (it.allowed_usernames || []).includes(uname));
  if (!allowed) return { answer: "Chỉ người gửi hoặc thành viên đã /link mới bấm được." };
  const who = [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(" ") || uname || "?";
  if (act === "n") return { answer: "Ok, không gửi.", edit: `📤 Upload <b>${esc(it.title)}</b> — ${esc(who)} chọn không gửi trên web. Không có gì thay đổi.` };

  const found = await findRelease(db, it);
  if (found.error) return { answer: "Chưa gửi được.", send: esc(found.error) };
  const r = found.release;
  if (r.requested) return { answer: "Đã gửi rồi.", edit: `📤 Upload <b>${esc(r.title)}</b> (${esc(r.did)}) đã được gửi trên web trước đó.` };
  const miss = await missingList(db, r);
  if (miss.length) return { answer: "Chưa đủ dữ liệu.", send: `⚠️ Chưa gửi Upload <b>${esc(r.title)}</b> (${esc(r.did)}) vì còn thiếu:\n` + miss.slice(0, 12).map((m) => "• " + esc(m)).join("\n") + "\nBổ sung trong app rồi bấm lại nút ở trên nhé." };

  const requester = lk?.profile_id || r.created_by_profile_id || null;
  const { data: upTab } = await db.from("ticket_tabs").select("id").eq("key", "newrelease_upload").single();
  if (upTab) {
    const { data: up } = await db.from("tickets").insert({ tab_id: upTab.id, data: { releaseId: r.did, project: r.title, artist: r.main_artist, label: r.label }, requester_profile_id: requester }).select("id").single();
    if (up) await audit(db, lk?.profile_id, up.id);
  }
  await db.from("releases").update({ requested: true }).eq("id", r.id);
  // package (Media Booking) ticket — same first-time branch as the detail page, skipped if one exists
  const { data: mbTab } = await db.from("ticket_tabs").select("id, default_status").eq("key", "media_booking").single();
  if (mbTab) {
    const { data: mb, error: mbErr } = await db.from("tickets").insert({ tab_id: mbTab.id, data: { releaseId: r.did, proposedPackage: null }, status: mbTab.default_status, status_log: { [mbTab.default_status]: new Date().toISOString() }, requester_segment: "AR", requester_profile_id: requester }).select("id").single();
    if (!mbErr) {
      if (mb) await audit(db, lk?.profile_id, mb.id);
      await db.from("releases").update({ package_ticket_sent: true, ...(r.project_type === "BRIEF & DATA" ? { project_type: "SENT TO MARKETING" } : {}) }).eq("id", r.id);
    }
  }
  return { answer: "Đã gửi Upload ✅", edit: `✅ Đã gửi Upload <b>${esc(r.title)}</b> (${esc(r.did)}) trên web — bởi ${esc(who)}.` };
}
