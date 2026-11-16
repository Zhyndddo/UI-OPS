// Round 624 — Friday understands more kinds of group messages (rules only; a card always asks a person to confirm).
// A message counts ONLY when it names a release that exists in the app (strict, so ordinary chat never becomes a card).
import { norm } from "./chatParse";
import { parseRelease } from "./chatParse";

export const ACTION_LABELS = { time_change: "Đổi giờ / ngày phát hành", deliver: "Đã bàn giao / gửi", confirm: "Xác nhận", pitching: "Pitching", lyric_fix: "Sửa lyric", sound_cut: "Cắt / chỉnh nhạc" };
const RULES = [
  ["time_change", /\b(doi|chuyen|lui|day|keo|dich|doi lai)\b.*\b(gio|lich|ngay|phat hanh|release)\b|\b(gio|lich|ngay) (phat hanh|release)\b.*\b(doi|lui|day|sang|thanh)\b/],
  ["lyric_fix", /\b(sua|fix|chinh|cap nhat|update)\b.*\blyrics?\b|\blyrics?\b.*\b(sai|sua|loi|thieu)\b/],
  ["sound_cut", /\b(cat|cut|trim|chinh|edit)\b.*\b(nhac|audio|sound|am thanh|intro|outro|ban nhac)\b/],
  ["pitching", /\b(pitch|pitching|de xuat|len playlist|dua len playlist)\b/],
  ["deliver", /\b(da (gui|ban giao|giao)|gui (xong|roi)|ban giao)\b/],
  ["confirm", /\b(xac nhan|confirm|duyet roi|da duyet)\b/],
];
let cache = { at: 0, rows: [] };
export async function loadReleaseTitles(db) {
  if (Date.now() - cache.at < 5 * 60000 && cache.rows.length) return cache.rows;
  const since = new Date(Date.now() - 75 * 86400000).toISOString().slice(0, 10);
  const { data } = await db.from("releases").select("id, title, main_artist, release_date").gte("release_date", since).limit(1500);
  cache = { at: Date.now(), rows: (data || []).map((r) => ({ ...r, n: norm(r.title) })).filter((r) => r.n.length >= 6) };
  return cache.rows;
}
export function parseAction(text, releases, nowYear) {
  const t = String(text || "").trim();
  if (t.length < 15) return null;
  const n = ` ${norm(t)} `;
  const hit = RULES.find(([, re]) => re.test(n));
  if (!hit) return null;
  const found = releases.filter((r) => n.includes(` ${r.n} `)).sort((a, b) => b.n.length - a.n.length)[0];
  if (!found) return null;
  const kind = hit[0];
  const release = kind === "time_change" && /\d/.test(t) ? parseRelease(t, nowYear) : null;
  const mentions = [...t.matchAll(/@(\w{3,})/g)].map((x) => x[1]);
  return { kind, release_id: found.id, pic_text: mentions[0] ? "@" + mentions[0] : null, pic_profile: null, mentions, label: null, title: found.title, artists: found.main_artist ? [found.main_artist] : [],
    release: release && (release.date || release.time) ? release : null, link: (/https?:\/\/\S+/.exec(t) || [null])[0], links: {}, notes: t.replace(/\s+/g, " ").slice(0, 160) };
}
