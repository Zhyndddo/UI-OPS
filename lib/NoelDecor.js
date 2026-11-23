"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { vnToday } from "./teachersDay";
import { supabase } from "./supabaseClient";
import styles from "./NoelDecor.module.css";

// Round 672 — shared Noel tree (bottom-left of the content area): the star folds the tree into a gift box (= switch off, remembered per browser); the box opens it again. Bulbs = people who opened the app this December, all on 24/12.
// Round 670 — Noel decoration: a string of twinkling light bulbs along the top, soft snowfall, a small greeting on 24–26/12 and a 🎄 switch to turn it all off (remembered per browser).
// Live for every signed-in account 1–31 Dec (Vietnam date); add ?noel=preview to any URL to see it on another day (cosmetic only).
// Everything is click-through except the switch; honours "reduce motion". To remove for good: delete NoelDecor.js + .module.css and the mount in AppShell.js.
export const NOEL_ENABLED = true;   // Round 672 — back on (set false to put the Noel decoration on hold)
const FROM = 1201, TO = 1231;
const COLORS = ["#ff4d5e", "#ffd166", "#3ddc84", "#4cc9f0"];
const SWAGS = 9, PER_SWAG = 7, SAG = 16;   // 9 swags x 7 bulbs, wire sags 16px

// bulbs along parabolic swags: left %, top px, colour, twinkle delay
const BULBS = Array.from({ length: SWAGS * PER_SWAG }, (_, n) => {
  const swag = Math.floor(n / PER_SWAG), k = n % PER_SWAG, t = (k + 0.5) / PER_SWAG;
  return { left: ((swag + t) / SWAGS) * 100, top: 4 * SAG * t * (1 - t) + 2, color: COLORS[n % COLORS.length], delay: ((n * 0.37) % 2.4).toFixed(2) };
});
// snowflakes: left %, size px, fall seconds, delay seconds, sway px
const FLAKES = Array.from({ length: 26 }, (_, i) => [(i * 37) % 100, 4 + ((i * 7) % 6), 12 + ((i * 5) % 11), -((i * 3.3) % 20), ((i % 2 ? 1 : -1) * (14 + (i % 4) * 6))]);

// ---- Round 672 — shared tree geometry (viewBox 100 x 130) ----
const SLOTS = (() => {
  const out = [];
  for (let y = 30; y <= 102; y += 7) {
    const half = ((y - 14) / 94) * 38 * 0.84, n = Math.max(1, Math.round((half * 2) / 9)), step = (half * 2) / n;
    for (let i = 0; i < n; i += 1) out.push([50 + (i - (n - 1) / 2) * step, y]);
  }
  return out;
})();
const BULB_COLORS = ["#ff4d5e", "#ffd166", "#3ddc84", "#4cc9f0", "#ff9ff3"];
const MAX_BULBS = SLOTS.length;

function useTreeState(active, day) {
  const [st, setSt] = useState({ total: 0, lit: 0, today: 0 });
  useEffect(() => {
    if (!active) return;
    let gone = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("noel_tree_light");
        const r = Array.isArray(data) ? data[0] : data;
        if (!error && r && !gone) setSt({ total: r.total || 0, lit: r.lit || 0, today: r.today || 0 });
      } catch { /* SQL not run yet: the tree just shows unlit bulbs */ }
    })();
    return () => { gone = true; };
  }, [active, day]);
  return st;
}

export default function NoelDecor() {
  const { realProfile } = useAuth();
  const [day, setDay] = useState({ year: 0, key: 0 });
  const [preview, setPreview] = useState(false);
  const [finaleForced, setFinaleForced] = useState(false);
  const [mode, setMode] = useState("on");   // on | folding | off | opening
  const [replay, setReplay] = useState(0);
  const [hint, setHint] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    setDay(vnToday());
    try {
      const q = new URLSearchParams(window.location.search).get("noel");
      setPreview(q === "preview" || q === "finale"); setFinaleForced(q === "finale");
      if (window.localStorage.getItem("noelDecorOff") === "1") setMode("off");
      const n = Number(window.localStorage.getItem("noelHintN") || 0);
      if (n < 4) { setHint(true); window.localStorage.setItem("noelHintN", String(n + 1)); }
    } catch { /* storage may be blocked */ }
    return () => clearTimeout(timer.current);
  }, []);
  const inWindow = day.key >= FROM && day.key <= TO;
  const active = NOEL_ENABLED && !!realProfile && day.year > 0 && (inWindow || preview);
  const decorOn = mode === "on" || mode === "opening";
  const tree = useTreeState(active, day.key);

  useEffect(() => {
    if (!active || !decorOn) return undefined;
    document.documentElement.setAttribute("data-decor", "noel");
    return () => { if (document.documentElement.getAttribute("data-decor") === "noel") document.documentElement.removeAttribute("data-decor"); };
  }, [active, decorOn]);

  if (!active) return null;
  const save = (off) => { try { window.localStorage.setItem("noelDecorOff", off ? "1" : "0"); } catch { /* ignore */ } };
  const fold = () => { if (mode !== "on") return; setHint(false); setMode("folding"); save(true); timer.current = setTimeout(() => setMode("off"), 1100); };
  const unfold = () => { if (mode !== "off") return; setHint(false); setMode("opening"); save(false); setReplay((r) => r + 1); timer.current = setTimeout(() => setMode("on"), 1500); };
  const christmas = day.key >= 1224 && day.key <= 1226;
  const finale = finaleForced || day.key >= 1224;
  const n = Math.min(MAX_BULBS, Math.max(10, tree.total || 0));
  const litN = finale ? n : Math.min(n, tree.lit);
  const picked = Array.from({ length: n }, (_, k) => Math.floor((k * MAX_BULBS) / n));
  const order = picked.map((_, k) => k).sort((a, b) => ((a * 2654435761) >>> 0) % 997 - ((b * 2654435761) >>> 0) % 997);
  const rank = new Array(n); order.forEach((k, r) => { rank[k] = r; });
  const treeTitle = finale ? "Bấm vào cây để xem lại hiệu ứng ✨" : `Cây Noel của cả nhà — ${tree.lit}/${tree.total || "?"} bạn đã thắp đèn. Bấm vào cây để xem lại hiệu ứng`;

  return (
    <>
      {decorOn && (
        <>
          <div className={styles.stripe} aria-hidden="true" />
          <div className={styles.garland} aria-hidden="true">
            <svg className={styles.wire} viewBox={`0 0 ${SWAGS * 100} ${SAG + 6}`} preserveAspectRatio="none">
              {Array.from({ length: SWAGS }, (_, s) => <path key={s} d={`M${s * 100} 1 Q${s * 100 + 50} ${SAG * 2 + 1} ${s * 100 + 100} 1`} fill="none" stroke="#2c3a33" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />)}
            </svg>
            {BULBS.map((b, i) => (
              <span key={i} className={styles.bulb} style={{ left: `${b.left}%`, top: b.top, "--c": b.color, animationDelay: `${b.delay}s` }} />
            ))}
          </div>
          <div className={styles.snow} aria-hidden="true">
            {FLAKES.map(([x, size, dur, delay, sway], i) => (
              <span key={i} className={styles.flake} style={{ left: `${x}%`, width: size * 2, height: size * 2, animationDuration: `${dur}s`, animationDelay: `${delay}s`, "--sway": `${sway}px` }} />
            ))}
          </div>
          {christmas && <div className={styles.greet} role="status">🎄 Merry Christmas — chúc cả nhà một mùa Giáng sinh ấm áp ✨</div>}
        </>
      )}
      <div className={styles.treeWrap} data-mode={mode} data-finale={finale ? "1" : "0"}>
        {hint && (
          <div className={styles.hint} role="note">
            {mode === "off" ? "🎁 Bấm vào hộp quà để mở cây Noel ra lại nhé!" : "⭐ Bấm vào ngôi sao trên cây để cất cây vào hộp quà (tắt trang trí Noel). Muốn bật lại: bấm vào hộp quà."}
          </div>
        )}
        <svg className={styles.tree} viewBox="0 0 100 130" role="img" aria-label="Cây Noel">
          <g className={styles.scene}>
            <rect x="44" y="106" width="12" height="14" rx="2" fill="#7a4a24" />
            <g className={`${styles.tier} ${styles.t3}`} onClick={() => setReplay((r) => r + 1)}><polygon points="50,52 12,110 88,110" fill="#1f7a4a"><title>{treeTitle}</title></polygon><polygon points="50,52 12,110 28,110" fill="#2a9560" opacity="0.55" /></g>
            <g className={`${styles.tier} ${styles.t2}`} onClick={() => setReplay((r) => r + 1)}><polygon points="50,32 20,80 80,80" fill="#23895a"><title>{treeTitle}</title></polygon></g>
            <g className={`${styles.tier} ${styles.t1}`} onClick={() => setReplay((r) => r + 1)}><polygon points="50,15 28,54 72,54" fill="#2a9560"><title>{treeTitle}</title></polygon></g>
            <g key={replay} className={styles.bulbs}>
              {picked.map((si, k) => {
                const [x, y] = SLOTS[si];
                const lit = rank[k] < litN;
                const hot = lit && rank[k] >= litN - Math.max(1, tree.today);
                return <circle key={k} cx={x} cy={y} r="2.3" className={lit ? `${styles.lamp} ${hot ? styles.hot : ""}` : styles.lampOff} style={{ "--c": BULB_COLORS[k % BULB_COLORS.length], "--d": `${(rank[k] * 0.05).toFixed(2)}s` }} />;
              })}
            </g>
            <g className={styles.star} onClick={fold} role="button" aria-label="Tắt trang trí Noel">
              <title>Bấm vào ngôi sao để cất cây vào hộp quà (tắt trang trí Noel)</title>
              <circle cx="50" cy="12" r="11" fill="transparent" />
              <polygon points="50,3 52.9,9.4 59.8,10 54.6,14.6 56.2,21.4 50,17.8 43.8,21.4 45.4,14.6 40.2,10 47.1,9.4" fill="#ffd166" stroke="#ffb703" strokeWidth="0.8" />
            </g>
          </g>
        </svg>
        <svg className={styles.gift} viewBox="0 0 40 40" onClick={unfold} role="button" aria-label="Bật trang trí Noel">
          <title>{mode === "off" ? "Bấm vào hộp quà để mở cây Noel ra lại" : "Hộp quà dưới gốc cây"}</title>
          <rect x="6" y="18" width="28" height="20" rx="2" fill="#c0283a" />
          <rect x="18" y="18" width="4" height="20" fill="#3ddc84" />
          <g className={styles.lid}>
            <rect x="3" y="12" width="34" height="8" rx="2" fill="#d6384b" />
            <rect x="18" y="12" width="4" height="8" fill="#3ddc84" />
            <path d="M20 12 C12 2 6 8 14 12 Z M20 12 C28 2 34 8 26 12 Z" fill="#3ddc84" stroke="#1f7a4a" strokeWidth="0.8" />
          </g>
        </svg>
      </div>
    </>
  );
}
