// Round 625 — "#" tags in the group. Typing  #nắng ấm xa dần  makes Friday search the app's releases (every typed word must be a
// WHOLE word of the title or artist — no half-words), offers the matches as buttons, and the chosen song becomes a link to the
// internal release page. Tagged messages are collected into the recap ("Theo bài hát"). Nothing is written to releases/tickets.
import { norm } from "./chatParse";

const SITE_URL = "https://internal.vieent.com";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cut = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
export const releaseUrl = (id) => `${SITE_URL}/releases/${id}`;

// "#a b c #d" -> ["a b c", "d"]. Pure numbers / one-letter tags are ignored (topic numbers, "#1").
export function extractTags(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/(?:^|\s)#([^\n#,.;!?]{2,60})/gu)) {
    const q = m[1].trim().replace(/[.,;:!?]+$/, "").trim();
    const toks = norm(q).split(" ").filter(Boolean);
    if (!toks.length || !toks.some((t) => /[a-z]/.test(t) && t.length >= 2)) continue;
    if (!out.includes(q)) out.push(q);
  }
  return out.slice(0, 3);
}

// All releases (id, title, artist, date), cached 5 min. Filtering happens here with norm() so accents never matter ("gio" = "giờ").
let relCache = { at: 0, rows: [] };
async function allReleases(db) {
  if (Date.now() - relCache.at < 5 * 60000 && relCache.rows.length) return relCache.rows;
  const rows = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from("releases").select("id, title, main_artist, release_date").order("release_date", { ascending: false }).range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...data.map((r) => ({ ...r, hay: ` ${norm(r.title)} ${norm(r.main_artist)} ` })));
    if (data.length < 1000) break;
  }
  relCache = { at: Date.now(), rows };
  return rows;
}

// Whole-word, accent-insensitive search on title + main artist. Newest release dates first.
export async function searchReleases(db, query) {
  const toks = norm(query).split(" ").filter(Boolean);
  if (!toks.length) return [];
  return (await allReleases(db)).filter((r) => toks.every((t) => r.hay.includes(` ${t} `))).slice(0, 6);
}

export const pickButtons = (id, cands) => ({ inline_keyboard: [
  ...cands.map((c, i) => [{ text: cut(`${c.title}${c.main_artist ? " — " + c.main_artist : ""}`, 60), callback_data: `tp:${id}:${i}` }]),
  [{ text: "🗑 Không phải", callback_data: `tx:${id}` }],
] });

// Called by the webhook for each non-command group message. Returns [{ text, markup }] replies to post (none when there is no # tag).
export async function captureTags(db, m, text) {
  const out = [];
  const sender = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || m.from?.username || "?";
  for (const q of extractTags(text)) {
    // the tag may run into the rest of the sentence ("#nắng ấm xa dần đã up") → try the full text, then drop trailing words until whole-word matches appear
    let cands = [], used = q;
    const words = q.split(/\s+/);
    for (let n = words.length; n >= 1 && !cands.length; n--) { used = words.slice(0, n).join(" "); cands = (await searchReleases(db, used)).map((r) => ({ id: r.id, title: r.title, main_artist: r.main_artist })); }
    if (!cands.length) { out.push({ text: `🔎 #${esc(q)}: chưa thấy bài nào khớp (phải gõ đúng cả từ, không gõ nửa từ).` }); continue; }
    const { data, error } = await db.from("tg_tags").upsert({
      chat_id: String(m.chat.id), thread_id: m.is_topic_message ? m.message_thread_id || null : null, msg_id: m.message_id,
      tg_user_id: m.from?.id || null, sender, query: used, text: String(text).slice(0, 600), candidates: cands, status: "pick",
    }, { onConflict: "chat_id,msg_id,query", ignoreDuplicates: true }).select("id").maybeSingle();
    if (error || !data) continue;
    out.push({ text: `🔎 <b>#${esc(used)}</b> — chọn bài để gắn vào tin nhắn:`, markup: pickButtons(data.id, cands) });
  }
  return out;
}

// callback_query "tp:<id>:<idx>" (pick) / "tx:<id>" (not this). Returns { answer, edit }.
export async function handleTagPick(db, cb, linkedProfile) {
  const [act, idRaw, idxRaw] = String(cb.data || "").split(":");
  const id = parseInt(idRaw, 10);
  if (!id) return { answer: "?" };
  const { data: t } = await db.from("tg_tags").select("*").eq("id", id).maybeSingle();
  if (!t) return { answer: "Không tìm thấy." };
  if (t.status !== "pick") return { answer: "Đã chọn rồi." };
  const lk = cb.from?.id === t.tg_user_id ? true : await linkedProfile(cb.from.id).catch(() => null);
  if (!lk) return { answer: "Chỉ người gõ tag hoặc thành viên đã /link mới chọn được." };
  const who = [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(" ") || cb.from?.username || "?";
  if (act === "tx") { await db.from("tg_tags").update({ status: "dismissed", picked_by: who }).eq("id", id); return { answer: "Đã bỏ", edit: `🗑 #${esc(t.query)} — đã bỏ bởi ${esc(who)}` }; }
  const c = (t.candidates || [])[parseInt(idxRaw, 10)];
  if (!c) return { answer: "Lựa chọn không hợp lệ." };
  await db.from("tg_tags").update({ status: "linked", release_id: c.id, release_title: c.title, picked_by: who }).eq("id", id);
  return { answer: "Đã gắn ✅", edit: `🔗 <a href="${releaseUrl(c.id)}">${esc(c.title)}</a>${c.main_artist ? " — " + esc(c.main_artist) : ""}\n<i>${esc(t.sender)}: ${esc(cut(t.text, 120))}</i>` };
}

// ---- recap ----
export async function loadTags(db, fromIso, toIso) {
  const { data } = await db.from("tg_tags").select("release_id, release_title, sender, text, query, created_at").eq("status", "linked").gte("created_at", fromIso).lt("created_at", toIso).order("created_at");
  const by = new Map();
  for (const r of data || []) { const g = by.get(r.release_id) || { id: r.release_id, title: r.release_title, items: [] }; g.items.push(r); by.set(r.release_id, g); }
  return [...by.values()].sort((a, b) => b.items.length - a.items.length);
}
export function renderTagBlock(groups) {
  if (!groups.length) return "";
  const L = ["<b>🔗 Theo bài hát (tag #)</b>"];
  groups.slice(0, 10).forEach((g) => {
    L.push(`• <a href="${releaseUrl(g.id)}">${esc(g.title)}</a> — ${g.items.length} tin`);
    g.items.slice(-2).forEach((i) => L.push(`   ${esc(i.sender)}: ${esc(cut(i.text.replace("#" + i.query, "").trim() || i.text, 90))}`));
  });
  if (groups.length > 10) L.push(`… và ${groups.length - 10} bài nữa`);
  return L.join("\n");
}
export function renderTagHtml(groups) {
  if (!groups.length) return "";
  const li = groups.map((g) => `<li><a href="${releaseUrl(g.id)}">${esc(g.title)}</a> — ${g.items.length} tin<ul>${g.items.slice(-3).map((i) => `<li>${esc(i.sender)}: ${esc(cut(i.text, 140))}</li>`).join("")}</ul></li>`).join("");
  return `<h3 style="margin-top:24px">Theo bài hát (tag #)</h3><ul>${li}</ul>`;
}
