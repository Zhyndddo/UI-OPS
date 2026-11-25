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
const SITE = "https://internal.vieent.com";
const RELCOLS = "id, did, title, main_artist, release_date, label, requested, single_album_ep, copyright_checklist, project_type, created_by_profile_id, meta_audio, meta_artwork, meta_lyric, meta_doc";
const relLink = (r) => `<a href="${SITE}/releases/${r.id}">${esc(r.title)}${r.main_artist ? " — " + esc(String(r.main_artist).split(",")[0]) : ""}</a> (${esc(r.did)}${r.release_date ? ", " + esc(r.release_date) : ""})`;

// Google Drive file / folder ids found in the request message ("/folders/ID", "/file/d/ID", "?id=ID")
export function driveIds(text) {
  const ids = new Set();
  for (const m of String(text || "").matchAll(/https?:\/\/(?:drive|docs)\.google\.com\/[^\s)]+/gi)) {
    const u = m[0];
    const a = /\/(?:folders|d)\/([A-Za-z0-9_-]{15,})/.exec(u) || /[?&]id=([A-Za-z0-9_-]{15,})/.exec(u);
    if (a) ids.add(a[1]);
  }
  return [...ids];
}

// Candidate releases for a request: first by the Drive link (the team always sends it), else by title (+ artist).
async function findCandidates(db, it) {
  const ids = driveIds(it.raw || [it.link, ...(Array.isArray(it.links) ? it.links : Object.values(it.links || {}))].join(" "));
  if (ids.length) {
    const { data } = await db.from("releases").select(RELCOLS).or(ids.map((i) => `drive_link.ilike.%${i}%`).join(",")).order("created_at", { ascending: false }).limit(5);
    if (data?.length) return { rows: data, by: "drive" };
  }
  const safe = String(it.title || "").replace(/[%,()]/g, " ").trim();
  if (safe.length < 3) return { rows: [], by: null };
  const { data } = await db.from("releases").select(RELCOLS).ilike("title", `%${safe}%`).order("created_at", { ascending: false }).limit(10);
  let rows = data || [];
  const exact = rows.filter((r) => norm(r.title) === norm(it.title));
  if (exact.length) rows = exact;
  if (rows.length > 1 && it.artists?.length) {
    const a = norm(it.artists[0]);
    const byArtist = rows.filter((r) => norm(r.main_artist).includes(a));
    if (byArtist.length) rows = byArtist;
  }
  return { rows: rows.slice(0, 5), by: "title" };
}

// The question posted under the request: names the matched release as a link so people can check it is the right song.
export async function buildUploadAsk(db, it) {
  const { rows, by } = await findCandidates(db, it);
  const head = `📤 Yêu cầu Upload <b>${esc(it.title)}</b>${it.artists?.length ? " — " + esc(it.artists.join(", ")) : ""}.`;
  if (!rows.length) return { text: head + "\nMình chưa thấy bài này trong app — cần tạo release trước (form tạo mới có nút “Create and send upload”).", markup: null };
  const via = by === "drive" ? "khớp theo link Drive" : "khớp theo tên";
  if (rows.length === 1) {
    const r = rows[0];
    if (r.requested) return { text: head + `\n${relLink(r)} đã được gửi Upload trên web rồi.`, markup: null };
    return { text: head + `\nTrong app: ${relLink(r)} — ${via}. Bấm vào tên để kiểm tra đúng bài chưa.\nBạn có muốn gửi Upload trên web luôn không?`, markup: { inline_keyboard: [[{ text: "✅ Có, gửi Upload", callback_data: `ua:y:${it.id}:${r.id}` }, { text: "❌ Không", callback_data: `ua:n:${it.id}` }]] } };
  }
  const open = rows.filter((r) => !r.requested);
  const lines = rows.map((r) => `• ${relLink(r)}${r.requested ? " — đã gửi Upload" : ""}`);
  return {
    text: head + `\nCó ${rows.length} release có thể là bài này (${via}) — bấm vào tên để kiểm tra:\n${lines.join("\n")}\nChọn đúng bài để gửi Upload trên web, hoặc bấm Không.`,
    markup: { inline_keyboard: [...open.map((r) => [{ text: `✅ Gửi: ${String(r.title).slice(0, 28)} (${r.did})`, callback_data: `ua:y:${it.id}:${r.id}` }]), [{ text: "❌ Không", callback_data: `ua:n:${it.id}` }]] },
  };
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

// Round 692 — every write made from Telegram says so in the audit log (who pressed, via Friday), not just the actor id
async function audit(db, actor, ticketId, note, action = "create") {
  try { await db.from("audit_log").insert({ actor: actor || null, action, entity: "ticket", entity_id: String(ticketId), field: "via", after_val: note || null }); } catch (e) { /* best-effort */ }
}
const UNDO_MINUTES = 15;
const undoButton = (intakeId, relId) => ({ inline_keyboard: [[{ text: `↩ Hoàn tác (trong ${UNDO_MINUTES} phút)`, callback_data: `ua:u:${intakeId}:${relId}` }]] });

// Undo a Friday upload send: only while nobody has started the two tickets it created, and only within UNDO_MINUTES.
async function undoSend(db, r, lk, who, note) {
  const { data: tabs } = await db.from("ticket_tabs").select("id, key, default_status").in("key", ["newrelease_upload", "media_booking"]);
  const byId = Object.fromEntries((tabs || []).map((t) => [t.id, t]));
  const since = new Date(Date.now() - UNDO_MINUTES * 60000).toISOString();
  const { data: tk } = await db.from("tickets").select("id, tab_id, status, created_at").eq("data->>releaseId", r.did).in("tab_id", Object.keys(byId)).is("deleted_at", null).gte("created_at", since);
  if (!tk?.length) return { ok: false, text: `Không hoàn tác được: không còn ticket nào vừa tạo trong ${UNDO_MINUTES} phút (đã quá hạn hoặc đã xử lý). Nếu cần, hãy chỉnh trong app.` };
  const touched = tk.filter((t) => t.status && byId[t.tab_id]?.default_status && t.status !== byId[t.tab_id].default_status);
  if (touched.length) return { ok: false, text: "Không hoàn tác được: đã có người bắt đầu xử lý ticket. Hãy chỉnh trong app." };
  const now = new Date().toISOString();
  await db.from("tickets").update({ deleted_at: now }).in("id", tk.map((t) => t.id));
  for (const t of tk) await audit(db, lk?.profile_id, t.id, note, "delete");
  const patch = { requested: false };
  if (tk.some((t) => byId[t.tab_id]?.key === "media_booking")) { patch.package_ticket_sent = false; if (r.project_type === "SENT TO MARKETING") patch.project_type = "BRIEF & DATA"; }
  await db.from("releases").update(patch).eq("id", r.id);
  return { ok: true };
}

export async function handleUploadAsk(db, cb, linkedProfile) {
  const [, act, idRaw, relId] = String(cb.data || "").split(":");
  const id = parseInt(idRaw, 10);
  if (!["y", "n", "u"].includes(act) || !id) return { answer: "?" };
  const { data: it } = await db.from("tg_intakes").select("*").eq("id", id).maybeSingle();
  if (!it) return { answer: "Không tìm thấy yêu cầu." };
  const lk = await linkedProfile(cb.from.id).catch(() => null);
  const uname = String(cb.from?.username || "").toLowerCase();
  // Round 686 — only the poster, a tagged @user, or a linked Upload PIC (Hiếu / Tâm) — not every linked account
  let allowed = cb.from?.id === it.poster_tg_id || (uname && (it.allowed_usernames || []).includes(uname));
  if (!allowed && lk) {
    const { data: me } = await db.from("profiles").select("name").eq("id", lk.profile_id).maybeSingle();
    const mine = " " + norm(me?.name || "") + " ";
    allowed = askNames().some((n) => mine.includes(" " + n + " "));
  }
  if (!allowed) return { answer: "Chỉ người gửi hoặc Upload PIC được tag mới bấm được." };
  const who = [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(" ") || uname || "?";
  if (act === "n") return { answer: "Ok, không gửi.", edit: `📤 Upload <b>${esc(it.title)}</b> — ${esc(who)} chọn không gửi trên web. Không có gì thay đổi.` };

  if (!relId) return { answer: "Nút cũ — hãy gửi Upload trên web nhé." };
  const { data: r } = await db.from("releases").select(RELCOLS).eq("id", relId).maybeSingle();
  if (!r) return { answer: "Không tìm thấy release.", send: "Không tìm thấy release này trong app nữa — bạn gửi Upload trên web giúp nhé." };
  const via = `Friday (Telegram) — ${who}`;
  if (act === "u") {   // Round 692 — undo
    if (!r.requested) return { answer: "Đã hoàn tác rồi.", edit: `↩ Upload ${relLink(r)} đã được hoàn tác trước đó.` };
    const u = await undoSend(db, r, lk, who, via + " — hoàn tác");
    if (!u.ok) return { answer: "Không hoàn tác được.", send: esc(u.text) };
    return { answer: "Đã hoàn tác ↩", edit: `↩ Đã hoàn tác Upload ${relLink(r)} — bởi ${esc(who)}. Ticket vừa tạo đã bị gỡ; thông báo đã gửi cho team trước đó thì không thu hồi được.` };
  }
  if (r.requested) return { answer: "Đã gửi rồi.", edit: `📤 Upload ${relLink(r)} đã được gửi trên web trước đó.` };
  const miss = await missingList(db, r);
  if (miss.length) return { answer: "Chưa đủ dữ liệu.", send: `⚠️ Chưa gửi Upload ${relLink(r)} vì còn thiếu:\n` + miss.slice(0, 12).map((m) => "• " + esc(m)).join("\n") + "\nBổ sung trong app rồi bấm lại nút ở trên nhé." };

  // Round 686 — claim the release atomically so two people pressing at once cannot create two upload tickets
  const { data: claimed } = await db.from("releases").update({ requested: true }).eq("id", r.id).or("requested.is.null,requested.eq.false").select("id");
  if (!claimed?.length) return { answer: "Đã gửi rồi.", edit: `📤 Upload ${relLink(r)} đã được gửi trên web trước đó.` };
  const requester = lk?.profile_id || r.created_by_profile_id || null;
  const { data: upTab } = await db.from("ticket_tabs").select("id").eq("key", "newrelease_upload").single();
  if (upTab) {
    const { data: up } = await db.from("tickets").insert({ tab_id: upTab.id, data: { releaseId: r.did, project: r.title, artist: r.main_artist, label: r.label }, requester_profile_id: requester }).select("id").single();
    if (up) await audit(db, lk?.profile_id, up.id, via);
  }
  // package (Media Booking) ticket — same first-time branch as the detail page, skipped if one exists
  const { data: mbTab } = await db.from("ticket_tabs").select("id, default_status").eq("key", "media_booking").single();
  if (mbTab) {
    const { data: mb, error: mbErr } = await db.from("tickets").insert({ tab_id: mbTab.id, data: { releaseId: r.did, proposedPackage: null }, status: mbTab.default_status, status_log: { [mbTab.default_status]: new Date().toISOString() }, requester_segment: "AR", requester_profile_id: requester }).select("id").single();
    if (!mbErr) {
      if (mb) await audit(db, lk?.profile_id, mb.id, via);
      await db.from("releases").update({ package_ticket_sent: true, ...(r.project_type === "BRIEF & DATA" ? { project_type: "SENT TO MARKETING" } : {}) }).eq("id", r.id);
    }
  }
  return { answer: "Đã gửi Upload ✅", edit: `✅ Đã gửi Upload ${relLink(r)} trên web — bởi ${esc(who)}.`, editMarkup: undoButton(id, r.id) };
}
