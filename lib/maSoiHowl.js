// Round 582 — Ma Sói howl. Browsers block sound until the person has touched the page, so if the first try is refused we
// wait for the next tap/click and play then. Each game's howl plays once per browser (remembered in localStorage).
export const HOWL_SRC = "/ma-soi/howl.mp3";

export function playHowl() {
  try {
    const a = new Audio(HOWL_SRC);
    a.volume = 0.7;
    const p = a.play();
    return p && p.then ? p.then(() => true).catch(() => false) : Promise.resolve(true);
  } catch (e) { return Promise.resolve(false); }
}

export function howlOnce(key) {
  try { if (localStorage.getItem(key)) return; } catch (e) { /* storage blocked: still play, just may repeat */ }
  const done = () => { try { localStorage.setItem(key, "1"); } catch (e) { /* ignore */ } };
  playHowl().then((ok) => {
    if (ok) { done(); return; }
    const once = () => { document.removeEventListener("pointerdown", once); playHowl().then((ok2) => { if (ok2) done(); }); };
    document.addEventListener("pointerdown", once);
  });
}
