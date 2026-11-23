"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { vnToday } from "./teachersDay";
import styles from "./NoelDecor.module.css";

// Round 670 — Noel decoration: a string of twinkling light bulbs along the top, soft snowfall, a small greeting on 24–26/12 and a 🎄 switch to turn it all off (remembered per browser).
// Live for every signed-in account 1–31 Dec (Vietnam date); add ?noel=preview to any URL to see it on another day (cosmetic only).
// Everything is click-through except the switch; honours "reduce motion". To remove for good: delete NoelDecor.js + .module.css and the mount in AppShell.js.
export const NOEL_ENABLED = false;   // Round 671 — on hold (set true to switch the Noel decoration on again)
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

export default function NoelDecor() {
  const { realProfile } = useAuth();
  const [day, setDay] = useState({ year: 0, key: 0 });
  const [preview, setPreview] = useState(false);
  const [off, setOff] = useState(false);
  useEffect(() => {
    setDay(vnToday());
    try { setPreview(new URLSearchParams(window.location.search).get("noel") === "preview"); setOff(window.localStorage.getItem("noelDecorOff") === "1"); } catch { /* storage may be blocked */ }
  }, []);
  const inWindow = day.key >= FROM && day.key <= TO;
  const active = NOEL_ENABLED && !!realProfile && day.year > 0 && (inWindow || preview);

  useEffect(() => {
    if (!active || off) return undefined;
    document.documentElement.setAttribute("data-decor", "noel");
    return () => { if (document.documentElement.getAttribute("data-decor") === "noel") document.documentElement.removeAttribute("data-decor"); };
  }, [active, off]);

  if (!active) return null;
  const toggle = () => { const next = !off; setOff(next); try { window.localStorage.setItem("noelDecorOff", next ? "1" : "0"); } catch { /* ignore */ } };
  const christmas = day.key >= 1224 && day.key <= 1226;

  return (
    <>
      {!off && (
        <>
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
              <span key={i} className={styles.flake} style={{ left: `${x}%`, width: size, height: size, animationDuration: `${dur}s`, animationDelay: `${delay}s`, "--sway": `${sway}px` }} />
            ))}
          </div>
          {christmas && <div className={styles.greet} role="status">🎄 Merry Christmas — chúc cả nhà một mùa Giáng sinh ấm áp ✨</div>}
        </>
      )}
      <button type="button" className={styles.switch} onClick={toggle} title={off ? "Bật trang trí Noel" : "Tắt trang trí Noel"} aria-label={off ? "Bật trang trí Noel" : "Tắt trang trí Noel"}>{off ? "🎄" : "🎄 ✕"}</button>
    </>
  );
}
