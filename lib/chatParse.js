// Round 616 — turns the team's habitual request messages into structured data (rules only, no AI).
// v1 understands: new upload ("upload"), derivative ("phai_sinh") and pre-save links ("presave").
// Everything is a GUESS until a person confirms the card, so a wrong parse is harmless.
export const norm = (s) => String(s ?? "").toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const KEYS = ["phat hanh", "link", "landing page", "spotify", "apple music", "zing mp3", "zing", "nct", "tiktok", "note", "ghi chu", "fb", "youtube", "facebook"];
const isKeyLine = (l) => { const n = norm(l); return KEYS.some((k) => n === k || n.startsWith(k + " ")) && /[:：]/.test(l); };
const isUrlLine = (l) => /^\s*https?:\/\/\S+\s*$/.test(l);
const NOTE_START = /^(xong|upload|đã có|da co|note|lưu ý|luu y|nhớ|nho)\b/i;
const TAIL = "(?:nhé|nhen|nha|nhe|nhỉ|giúp|tuần này|rồi|ạ)";

function splitArtists(s) {
  return String(s).split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i).map((x) => x.trim()).filter(Boolean);
}
function splitDash(l) {
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(l.trim());
  return m ? { title: m[1].trim(), artists: splitArtists(m[2]) } : null;
}

export function parseRelease(raw, nowYear = new Date().getFullYear()) {
  const out = { text: String(raw).trim(), date: null, time: null };
  const t1 = /(\d{1,2}):(\d{2})/.exec(raw) || /(\d{1,2})\s*[hg](\d{2})?(?!\w)/i.exec(raw);
  if (t1) out.time = `${String(t1[1]).padStart(2, "0")}:${t1[2] || "00"}`;
  const rest = t1 ? raw.replace(t1[0], " ") : raw;
  const d = /(\d{1,2})\s*[./]\s*(\d{1,2})(?:\s*[./]\s*(\d{2,4}))?/.exec(rest);
  if (d) {
    const day = +d[1], mon = +d[2]; let y = d[3] ? +d[3] : nowYear; if (y < 100) y += 2000;
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) out.date = `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return out;
}

// people = [{ id, name }]. Finds who the message is addressed to ("Hiếu ơi…", "Tam Hiếu ơi…", "Thuỷ H gửi…").
function findPic(line0, people) {
  const n0 = norm(line0);
  const m = /^((?:[a-z]+ ){0,1}[a-z]+) (?:oi+|oii+|oi)\b/.exec(n0);
  const tokens = m ? m[1].split(" ") : [n0.split(" ")[0]];
  const words = (p) => norm(p.name).split(" ");
  let c = people.filter((p) => tokens.every((t) => words(p).includes(t)));
  if (c.length === 0 && tokens.length > 1) c = people.filter((p) => tokens.some((t) => words(p).includes(t)));
  if (!m && c.length !== 1) c = [];   // no "ơi" and not a clear single match → don't guess
  return { text: m ? m[1] : tokens[0], profile: c.length === 1 ? c[0] : null, candidates: c.length > 1 ? c : [] };
}

export function parseIntake(text, people = [], nowYear) {
  const t = String(text || "").trim();
  if (t.length < 15) return null;
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const n = norm(t);
  const mentions = [...t.matchAll(/@(\w{3,})/g)].map((x) => x[1]);
  const urls = [...t.matchAll(/https?:\/\/[^\s)]+/g)].map((x) => x[0]);
  const pic = findPic(lines[0].replace(/^@\w+\s*/, ""), people);
  const picTag = mentions.length ? "@" + mentions[0] : null;

  const hasRel = lines.find((l) => /^\s*ph[aáàảãạ]t\s*h[aàảãạ]nh\s*[:：]/i.test(l));
  const release = hasRel ? parseRelease(hasRel.replace(/^[^:：]+[:：]/, ""), nowYear) : null;
  const note = [];
  const cands = lines.slice(1).filter((l) => !isKeyLine(l) && !isUrlLine(l) && !NOTE_START.test(l) && !/^[-•]/.test(l) || false);
  lines.slice(1).forEach((l) => { if (NOTE_START.test(l) || /^note\s*:/i.test(l)) note.push(l.replace(/^note\s*:\s*/i, "")); });

  let label = null;
  const l0 = lines[0];
  const lm = new RegExp(`(?:label|của)\\s+(.+?)(?:\\s+${TAIL}\\b|$)`, "i").exec(l0) || new RegExp(`dự án\\s+(.+?)(?:\\s+${TAIL}\\b|$)`, "i").exec(l0);
  if (lm) label = lm[1].replace(/[.,]+$/, "").trim();

  // ---- pre-save ----
  if (/pre ?save|presave|landing page|link audio/.test(n)) {
    let title = null, artists = [];
    const la = lines.find((l) => /^link audio\s*[:：]/i.test(l));
    if (la) { const body = la.replace(/^[^:：]+[:：]\s*/, ""); const d = splitDash(body); title = d ? d.title : body; artists = d ? d.artists : []; }
    else { const m = /pre-?save\s+(.+?)(?:\s+${TAIL})?$/i.exec(l0.replace(new RegExp(`\\s+${TAIL}\\s*$`, "i"), "")); if (m) title = m[1].trim(); }
    if (!title) return null;
    const links = {};
    for (const l of lines) {
      const um = /https?:\/\/\S+/.exec(l); if (!um) continue;
      const k = norm(l.split(/[:：]/)[0]);
      links[k.includes("landing") ? "landing" : k.includes("spotify") ? "spotify" : k.includes("apple") ? "apple" : k.includes("zing") ? "zing" : k.includes("nct") ? "nct" : k.includes("tiktok") ? "tiktok" : "other"] = um[0];
    }
    return { kind: "presave", pic_text: picTag || pic.text, pic_profile: pic.profile, pic_candidates: pic.candidates, mentions, label: null, title, artists, release: null, link: links.landing || urls[0] || null, links, notes: note.join(" · ") || null };
  }

  // ---- upload / phái sinh ----
  let title = null, artists = [];
  const i0 = cands.findIndex((l) => splitDash(l));
  if (i0 >= 0) { const d = splitDash(cands[i0]); title = d.title; artists = d.artists; if (i0 > 0 && !label) label = cands[i0 - 1]; }
  else if (cands.length >= 2) { label = label || cands[0]; title = cands[1]; }
  else if (cands.length === 1) title = cands[0];
  if (!title) return null;
  if (!release && !urls.length) return null;   // need at least a date or a link, otherwise it is just chat
  cands.filter((l, i) => i !== i0 && l !== title && l !== label && (i0 < 0 ? false : i > i0)).forEach((l) => note.push(l));
  const kind = /phai sinh/.test(n) ? "phai_sinh" : "upload";
  return { kind, pic_text: picTag || pic.text, pic_profile: pic.profile, pic_candidates: pic.candidates, mentions, label, title, artists, release, link: urls.find((u) => /drive\.google|dropbox|mega|we\.tl/.test(u)) || urls[0] || null, links: {}, notes: note.join(" · ") || null };
}
