// Round 644 — /link in a group: Friday cannot edit other people's messages, so she answers UNDER the message with the linked version.
//   reply to a message with /link        -> "#song" tags in it become links; a message naming a known song (whole words) gets that song's links
//   /link <tên bài>                      -> the song's links (up to 3 matches)
// Links shown: internal release page + Link Drive / Link Share / Link LBM / Smartlink (only those that exist in the app).
import { norm } from "./chatParse";
import { extractTags, searchReleases, songCards, releaseUrl, allReleases } from "./tgTags";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const LINK_HELP = "Trả lời một tin nhắn bằng <b>/link</b> để mình gắn link cho bài hát trong tin đó, hoặc gõ <b>/link tên bài</b>. Gõ <b>#tên bài</b> cũng được.";

// songs whose full title appears in the text as whole words (titles of one short word are skipped: too many false hits)
async function titlesIn(db, text) {
  const hay = ` ${norm(text)} `;
  const hits = [];
  for (const r of await allReleases(db)) {
    const t = norm(r.title);
    if (!t || (t.split(" ").length < 2 && t.length < 6)) continue;
    if (hay.includes(` ${t} `)) hits.push({ id: r.id, len: t.length });
  }
  return hits.sort((a, b) => b.len - a.len).slice(0, 3).map((h) => h.id);
}

export async function runLink(db, m, arg) {
  if (arg) {
    const found = await searchReleases(db, arg);
    if (!found.length) return { html: `🔎 Chưa thấy bài nào khớp "${esc(arg)}" (phải gõ đúng cả từ, không gõ nửa từ).` };
    const cards = await songCards(db, found.slice(0, 3).map((r) => r.id));
    return { html: "🔗 <b>Link bài hát</b>\n" + cards.join("\n") + (found.length > 3 ? `\n\n… còn ${found.length - 3} bài khớp nữa, gõ rõ tên hơn nhé.` : "") };
  }
  const src = m.reply_to_message;
  const text = String(src?.text || src?.caption || "").trim().slice(0, 500);
  if (!text) return { html: LINK_HELP };
  const target = { ...m, message_id: src.message_id };   // the answer sits under the ORIGINAL message
  const ids = [], notes = [], inline = [];   // inline = [tag text, release] when the tag matches exactly one song
  const tags = extractTags(text);
  for (const q of tags) {
    let cands = [], used = q;
    const words = q.split(/\s+/);
    for (let n = words.length; n >= 1 && !cands.length; n--) { used = words.slice(0, n).join(" "); cands = await searchReleases(db, used); }
    if (!cands.length) { notes.push(`🔎 #${esc(q)}: chưa thấy bài nào khớp.`); continue; }
    const exact = cands.filter((c) => norm(c.title) === norm(used));
    const pool = exact.length ? exact : cands;
    if (pool.length === 1) { ids.push(pool[0].id); inline.push([used, pool[0]]); }
    else { ids.push(...pool.slice(0, 3).map((c) => c.id)); notes.push(`#${esc(used)}: có ${pool.length} bài khớp, mình liệt kê bên dưới.`); }
  }
  if (!tags.length) {
    ids.push(...await titlesIn(db, text));
    if (!ids.length) return { html: "Mình chưa thấy tên bài hát nào trong tin này. " + LINK_HELP, target };
  }
  // the "#tag" text becomes the song title as a link (positions come from the raw text, so accents are safe); the rest stays as typed
  const low = text.toLowerCase();
  const spans = inline.map(([q, c]) => ({ i: low.indexOf("#" + q.toLowerCase()), len: q.length + 1, c })).filter((s) => s.i >= 0).sort((a, b) => a.i - b.i);
  let body = "", pos = 0;
  for (const s of spans) { if (s.i < pos) continue; body += esc(text.slice(pos, s.i)) + `<a href="${releaseUrl(s.c.id)}">${esc(s.c.title)}</a>`; pos = s.i + s.len; }
  body += esc(text.slice(pos));
  const cards = ids.length ? await songCards(db, [...new Set(ids)]) : [];
  return { target, html: ["🔗 <b>Bản có link</b>", body, ...(notes.length ? ["", ...notes] : []), ...(cards.length ? ["", ...cards] : [])].join("\n") };
}
