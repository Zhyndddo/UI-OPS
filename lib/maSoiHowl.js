// Round 585 — Ma Sói howl "player". Settings (on/off + volume) live in this browser (localStorage) and apply everywhere the howl can play:
// the /ma-soi page (new game opened, game start / role reveal) and the bottom-right wolf invite. Browsers block sound until the person has
// touched the page, so if a first try is refused we wait for the next tap/click and play then. Each event plays once per browser.
export const HOWL_SRC = "/ma-soi/howl.mp3";
const KEY = "ms_sound";
let current = null;
let lastAt = 0;

const clamp = (v) => Math.max(0, Math.min(1, v));

export function getSound() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || "null");
    return { on: !j || j.on !== false, vol: j && typeof j.vol === "number" ? clamp(j.vol) : 0.7 };
  } catch (e) { return { on: true, vol: 0.7 }; }
}

export function setSound(patch) {
  const next = { ...getSound(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* storage blocked: setting lasts until reload */ }
  if (current) { try { current.volume = clamp(next.vol); if (!next.on) current.pause(); } catch (e) { /* ignore */ } }
  return next;
}

export function stopHowl() { try { if (current) current.pause(); } catch (e) { /* ignore */ } current = null; }

// force = play even when the switch is off (used by the "Thử" test button)
export function playHowl({ force = false } = {}) {
  const s = getSound();
  if (!s.on && !force) return Promise.resolve(false);
  try {
    stopHowl();
    const a = new Audio(HOWL_SRC);
    a.volume = clamp(s.vol);
    current = a;
    lastAt = Date.now();
    const p = a.play();
    return p && p.then ? p.then(() => true).catch(() => false) : Promise.resolve(true);
  } catch (e) { return Promise.resolve(false); }
}

export function howlOnce(key) {
  try { if (localStorage.getItem(key)) return; } catch (e) { /* storage blocked: still play, just may repeat */ }
  const done = () => { try { localStorage.setItem(key, "1"); } catch (e) { /* ignore */ } };
  if (!getSound().on) { done(); return; }            // switched off: skip this event for good
  if (Date.now() - lastAt < 8000) { done(); return; } // two events at the same moment = one howl
  playHowl().then((ok) => {
    if (ok) { done(); return; }
    const once = () => { document.removeEventListener("pointerdown", once); if (getSound().on) playHowl().then((ok2) => { if (ok2) done(); }); else done(); };
    document.addEventListener("pointerdown", once);
  });
}
