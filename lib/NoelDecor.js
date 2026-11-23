"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthContext";
import { vnToday } from "./teachersDay";
import { noelFetch, ORN, WishCard, WishModal, Confetti } from "./NoelExtras";
import { getNoelSound, setNoelSound, playJingle } from "./noelSound";
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
  const [st, setSt] = useState({ total: 0, lit: 0, today: 0, people: [], me: null });
  const load = useCallback(async () => {
    try {
      const r = await noelFetch("/api/noel-tree"); const j = await r.json();
      if (r.ok) setSt({ total: j.total || 0, lit: j.lit || 0, today: j.today || 0, people: j.people || [], me: j.me || null });
    } catch { /* SQL not run yet: the tree just shows unlit bulbs */ }
  }, []);
  useEffect(() => { if (active) load(); }, [active, day, load]);
  return [st, load];
}

export default function NoelDecor() {
  const { realProfile } = useAuth();
  const [day, setDay] = useState({ year: 0, key: 0 });
  const [preview, setPreview] = useState(false);
  const [finaleForced, setFinaleForced] = useState(false);
  const [mode, setMode] = useState("on");   // on | folding | off | opening
  const [replay, setReplay] = useState(0);
  const [hint, setHint] = useState(false);
  const [hatSlot, setHatSlot] = useState(null);   // the logo circle in the sidebar: the Santa hat sits on it
  const [slot, setSlot] = useState(null);   // sidebar slot above Reference for the gingerbread house (only when the nav leaves >= 70px free)
  const [themeOn, setThemeOn] = useState(false);   // Round 673 — special Noel colours (latte / navy), 2nd gift box
  const timer = useRef(null);
  useEffect(() => {
    setDay(vnToday());
    try {
      const q = new URLSearchParams(window.location.search).get("noel");
      setPreview(q === "preview" || q === "finale"); setFinaleForced(q === "finale");
      if (window.localStorage.getItem("noelDecorOff") === "1") setMode("off");
      if (window.localStorage.getItem("noelThemeOn") === "1") setThemeOn(true);
      const n = Number(window.localStorage.getItem("noelHintN") || 0);
      if (n < 4) { setHint(true); window.localStorage.setItem("noelHintN", String(n + 1)); }
    } catch { /* storage may be blocked */ }
    return () => clearTimeout(timer.current);
  }, []);
  const inWindow = day.key >= FROM && day.key <= TO;
  const active = NOEL_ENABLED && !!realProfile && day.year > 0 && (inWindow || preview);
  const decorOn = mode === "on" || mode === "opening";
  const [tree, refreshTree] = useTreeState(active, day.key);
  const [card, setCard] = useState(null);        // bulb index whose wish is open
  const [writing, setWriting] = useState(false);  // "my tree" editor
  const [ring, setRing] = useState(0);            // wreath / hat shake
  const [hoho, setHoho] = useState(0);            // gingerbread house chimney
  const [sleigh, setSleigh] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [snd, setSnd] = useState({ on: true, vol: 0.5 });
  useEffect(() => { setSnd(getNoelSound()); }, []);
  useEffect(() => {
    if (!active || !decorOn) return undefined;
    let off1;
    const fly = () => { setSleigh(true); off1 = setTimeout(() => setSleigh(false), 17000); };
    const first = setTimeout(fly, 20000); const every = setInterval(fly, 120000);
    return () => { clearTimeout(first); clearInterval(every); clearTimeout(off1); };
  }, [active, decorOn]);

  useEffect(() => {
    if (!active || !decorOn) { setSlot(null); setHatSlot(null); return undefined; }
    const check = () => {
      const el = document.getElementById("noel-house-slot"), nav = el?.previousElementSibling;
      const free = nav && nav.lastElementChild ? nav.clientHeight - (nav.lastElementChild.offsetTop + nav.lastElementChild.offsetHeight) : 0;
      setHatSlot(document.getElementById("noel-hat-slot"));
      setSlot(el && free >= 70 && el.offsetParent ? el : null);
    };
    check();
    const t = setInterval(check, 2000);
    window.addEventListener("resize", check);
    return () => { clearInterval(t); window.removeEventListener("resize", check); };
  }, [active, decorOn]);

  useEffect(() => {
    if (!active || !themeOn) return undefined;
    document.documentElement.setAttribute("data-noeltheme", "1");
    return () => document.documentElement.removeAttribute("data-noeltheme");
  }, [active, themeOn]);

  useEffect(() => {
    if (!active || !decorOn) return undefined;
    document.documentElement.setAttribute("data-decor", "noel");
    return () => { if (document.documentElement.getAttribute("data-decor") === "noel") document.documentElement.removeAttribute("data-decor"); };
  }, [active, decorOn]);

  if (!active) return null;
  const save = (off) => { try { window.localStorage.setItem("noelDecorOff", off ? "1" : "0"); } catch { /* ignore */ } };
  const fold = () => { if (mode !== "on") return; setHint(false); setMode("folding"); save(true); timer.current = setTimeout(() => setMode("off"), 1100); };
  const unfold = () => { if (mode !== "off") return; setHint(false); setMode("opening"); playJingle(); if (Math.random() < 0.3) setConfetti((c) => c + 1); save(false); setReplay((r) => r + 1); timer.current = setTimeout(() => setMode("on"), 1500); };
  const toggleTheme = () => { const next = !themeOn; setThemeOn(next); try { window.localStorage.setItem("noelThemeOn", next ? "1" : "0"); } catch { /* ignore */ } };
  const jingle = () => { setRing((r) => r + 1); playJingle(); };
  const toggleSound = () => setSnd(setNoelSound({ on: !snd.on }));
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
          {hatSlot && createPortal(<svg key={`h${ring}`} onClick={jingle} className={`${styles.hat} ${ring ? styles.shake : ""}`} viewBox="0 0 40 32" aria-hidden="true"><path d="M5 26 C6 10 18 4 30 8 C27 12 27 18 34 26 Z" fill="#d6384b" /><path d="M5 26 C6 10 18 4 30 8" fill="none" stroke="#f26b7a" strokeWidth="1.2" /><rect x="3" y="24" width="33" height="7" rx="3.5" fill="#fff" /><circle cx="31" cy="7" r="4.3" fill="#fff" /></svg>, hatSlot)}
          <svg key={`w${ring}`} onClick={jingle} className={`${styles.wreath} ${ring ? styles.shake : ""}`} viewBox="0 0 48 62" role="img" aria-label="Vòng nguyệt quế"><path d="M24 0 V8" stroke="#8a6a3a" strokeWidth="1.4" /><circle cx="24" cy="28" r="17" fill="none" stroke="#1f7a4a" strokeWidth="9" /><circle cx="24" cy="28" r="17" fill="none" stroke="#3ddc84" strokeWidth="4" strokeDasharray="3 3" opacity="0.8" />{[[11, 20], [36, 17], [38, 36], [14, 42], [25, 11]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill="#ff4d5e" />)}<path d="M24 46 C14 38 8 52 20 54 Z M24 46 C34 38 40 52 28 54 Z" fill="#d6384b" /><path d="M24 46 L18 60 M24 46 L30 60" stroke="#d6384b" strokeWidth="3" strokeLinecap="round" /><circle cx="24" cy="47" r="2.6" fill="#a3202f" /></svg>
          {christmas && <div className={styles.greet} role="status">🎄 Merry Christmas — chúc cả nhà một mùa Giáng sinh ấm áp ✨</div>}
        </>
      )}
      <div className={styles.treeWrap} data-mode={mode} data-finale={finale ? "1" : "0"}>
        {hint && (
          <div className={styles.hint} role="note">
            {mode === "off" ? "🎁 Bấm vào hộp quà để mở cây Noel ra lại nhé!" : "⭐ Bấm ngôi sao trên cây để cất cây vào hộp quà đỏ (tắt Noel), bấm hộp quà đỏ để mở lại. 🎁 Hộp quà xanh dương: bật/tắt giao diện màu Noel."}
          </div>
        )}
        {mode === "on" && (
          <div className={styles.tools}>
            <button type="button" title="Cây Noel của tôi: chọn đồ trang trí, viết lời chúc, thêm ảnh" onClick={() => setWriting(true)}>✍️</button>
            <button type="button" title={snd.on ? "Tắt tiếng chuông Noel" : "Bật tiếng chuông Noel"} onClick={toggleSound}>{snd.on ? "🔔" : "🔕"}</button>
          </div>
        )}
        {confetti > 0 && <Confetti key={confetti} />}
        <svg className={styles.tree} viewBox="0 0 100 130" role="img" aria-label="Cây Noel">
          <g className={styles.scene}>
            <rect x="44" y="106" width="12" height="14" rx="2" fill="#7a4a24" />
            <g fill="none" strokeLinecap="round">
              <path d="M26 124 V110 a4 4 0 0 1 8 0" stroke="#fff" strokeWidth="3.2" /><path d="M26 124 V110 a4 4 0 0 1 8 0" stroke="#d6384b" strokeWidth="3.2" strokeDasharray="2.2 3.4" />
              <path d="M74 124 V110 a4 4 0 0 0 -8 0" stroke="#fff" strokeWidth="3.2" /><path d="M74 124 V110 a4 4 0 0 0 -8 0" stroke="#d6384b" strokeWidth="3.2" strokeDasharray="2.2 3.4" />
            </g>
            <g className={`${styles.tier} ${styles.t3}`} onClick={() => setReplay((r) => r + 1)}><polygon points="50,52 12,110 88,110" fill="#1f7a4a"><title>{treeTitle}</title></polygon><polygon points="50,52 12,110 28,110" fill="#2a9560" opacity="0.55" /></g>
            <g className={`${styles.tier} ${styles.t2}`} onClick={() => setReplay((r) => r + 1)}><polygon points="50,32 20,80 80,80" fill="#23895a"><title>{treeTitle}</title></polygon></g>
            <g className={`${styles.tier} ${styles.t1}`} onClick={() => setReplay((r) => r + 1)}><polygon points="50,15 28,54 72,54" fill="#2a9560"><title>{treeTitle}</title></polygon></g>
            <g key={replay} className={styles.bulbs}>
              {picked.map((si, k) => {
                const [x, y] = SLOTS[si];
                const lit = rank[k] < litN;
                const hot = lit && rank[k] >= litN - Math.max(1, tree.today);
                const person = lit ? tree.people[rank[k]] : null;
                const glyph = person && ORN[person.o];
                const open = person?.w ? () => setCard(rank[k]) : undefined;
                const sty = { "--c": BULB_COLORS[k % BULB_COLORS.length], "--d": `${(rank[k] * 0.05).toFixed(2)}s` };
                if (glyph) return <text key={k} x={x} y={y + 2} textAnchor="middle" fontSize="6.5" className={`${styles.orn} ${open ? styles.click : ""}`} onClick={open} style={sty}>{glyph}{open && <title>Bấm để đọc lời chúc</title>}</text>;
                return <circle key={k} cx={x} cy={y} r={open ? 2.7 : 2.3} className={`${lit ? `${styles.lamp} ${hot ? styles.hot : ""}` : styles.lampOff} ${open ? styles.click : ""}`} onClick={open} style={sty}>{open && <title>Bấm để đọc lời chúc</title>}</circle>;
              })}
            </g>
            <g className={styles.star} onClick={fold} role="button" aria-label="Tắt trang trí Noel">
              <title>Bấm vào ngôi sao để cất cây vào hộp quà (tắt trang trí Noel)</title>
              <circle cx="50" cy="12" r="11" fill="transparent" />
              <polygon points="50,3 52.9,9.4 59.8,10 54.6,14.6 56.2,21.4 50,17.8 43.8,21.4 45.4,14.6 40.2,10 47.1,9.4" fill="#ffd166" stroke="#ffb703" strokeWidth="0.8" />
            </g>
          </g>
        </svg>
        {slot && createPortal(<div className={styles.houseBox} onClick={() => { setHoho(Date.now()); playJingle(); setTimeout(() => setHoho(0), 2600); }} title="Bấm thử xem 🎅"><svg className={styles.house} viewBox="0 0 60 56" aria-hidden="true">
          <rect x="8" y="24" width="44" height="30" rx="2" fill="#b5651d" />
          <polygon points="3,27 30,5 57,27" fill="#c98a45" /><path d="M3 27 L30 5 L57 27 Q52 31 47 27 Q42 32 37 27 Q32 32 27 27 Q22 32 17 27 Q12 32 8 27 Z" fill="#fff8ee" />
          <path d="M25 54 V42 a5 5 0 0 1 10 0 V54 Z" fill="#6b3410" /><rect x="12" y="34" width="9" height="9" rx="1.5" fill="#ffd166" /><rect x="39" y="34" width="9" height="9" rx="1.5" fill="#ffd166" />
          <path d="M8 31 H52" stroke="#fff8ee" strokeWidth="1.6" strokeDasharray="3 2.5" />
          <circle cx="30" cy="14" r="2.6" fill="#d6384b" /><circle cx="22" cy="21" r="2.2" fill="#3ddc84" /><circle cx="38" cy="21" r="2.2" fill="#ff9ff3" />
        </svg>{hoho > 0 && <><i className={styles.smoke} /><i className={`${styles.smoke} ${styles.smoke2}`} /><span className={styles.hohoBubble}>Ho ho ho! 🎅</span></>}</div>, slot)}
        <svg key={`th${themeOn}`} className={`${styles.gift} ${styles.giftB}`} viewBox="0 0 40 40" onClick={toggleTheme} role="button" aria-label="Đổi giao diện Noel">
          <title>{themeOn ? "Bấm để tắt giao diện màu Noel (về màu thường)" : "Bấm để bật giao diện màu Noel: sáng = latte + đỏ/xanh lá đậm, tối = xanh navy + đỏ tươi/xanh lá nhạt"}</title>
          <rect x="6" y="18" width="28" height="20" rx="2" fill={themeOn ? "#f3e9dc" : "#2a5bd7"} stroke={themeOn ? "#9b1c2e" : "none"} strokeWidth="1.4" />
          <rect x="18" y="18" width="4" height="20" fill="#ffd166" />
          <g><rect x="3" y="12" width="34" height="8" rx="2" fill={themeOn ? "#9b1c2e" : "#3f78f0"} /><rect x="18" y="12" width="4" height="8" fill="#ffd166" /><path d="M20 12 C12 2 6 8 14 12 Z M20 12 C28 2 34 8 26 12 Z" fill="#ffd166" stroke="#e0a800" strokeWidth="0.8" /></g>
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
      {sleigh && decorOn && (
        <svg className={styles.sleigh} viewBox="0 0 90 40" aria-hidden="true">
          <path d="M6 30 Q6 36 14 36 H62 Q70 36 70 28" fill="none" stroke="#ffd166" strokeWidth="2.2" strokeLinecap="round" /><path d="M16 14 H54 L60 28 H12 Z" fill="#d6384b" /><rect x="30" y="8" width="10" height="8" rx="2" fill="#fff" />
          <path d="M60 24 L84 20 M76 16 L84 20 L78 26" stroke="#a5683a" strokeWidth="1.6" fill="none" /><circle cx="84" cy="20" r="3.4" fill="#a5683a" /><circle cx="87" cy="20" r="1.1" fill="#ff4d5e" />
        </svg>
      )}
      {writing && <WishModal me={tree.me} onClose={(saved) => { setWriting(false); if (saved) refreshTree(); }} />}
      {card !== null && <WishCard index={card} onClose={(changed) => { setCard(null); if (changed) refreshTree(); }} />}
    </>
  );
}
