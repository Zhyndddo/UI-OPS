// Round 675 — Noel jingle (same idea as lib/maSoiHowl.js): on/off + volume live in this browser; browsers block sound until the person has touched the page, so a refused play is silently skipped.
// Put the audio file at public/noel/jingle.mp3.
export const JINGLE_SRC = "/noel/jingle.mp3";
const KEY = "noel_sound";
let current = null;
const clamp = (v) => Math.max(0, Math.min(1, v));
export function getNoelSound() {
  try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); return { on: !j || j.on !== false, vol: j && typeof j.vol === "number" ? clamp(j.vol) : 0.5 }; } catch (e) { return { on: true, vol: 0.5 }; }
}
export function setNoelSound(patch) {
  const next = { ...getNoelSound(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  if (current) { try { current.volume = clamp(next.vol); if (!next.on) current.pause(); } catch (e) { /* ignore */ } }
  return next;
}
export function playJingle() {
  const s = getNoelSound();
  if (!s.on) return Promise.resolve(false);
  try {
    if (current) current.pause();
    const a = new Audio(JINGLE_SRC); a.volume = clamp(s.vol); current = a;
    const p = a.play();
    return p && p.then ? p.then(() => true).catch(() => false) : Promise.resolve(true);
  } catch (e) { return Promise.resolve(false); }
}
