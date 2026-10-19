"use client";

import { useEffect, useState } from "react";
import styles from "./CosmicDecor.module.css";

// Round 527/528 — seasonal decoration for Vietnamese Women's Day (20/10).
// Round 528: now on ALL themes (dark, light, Cosmic) plus a one-time cheer
// popup per person per year. Pure decoration: falling petals, a soft rose glow,
// a lotus in the corner, a gradient line under the top bar and a dismissible
// greeting pill. Everything is pointer-events:none except the pill's close
// button, so it never blocks a click.
//
// Auto-expires: only shows 15–22 Oct (local date), every year. To remove
// for good, delete this file, CosmicDecor.module.css, its <CosmicDecor />
// line in AppShell.js and the [data-decor="womens-day"] block in globals.css.
const FROM = { month: 9, day: 15 }; // October = 9 (0-based)
const TO = { month: 9, day: 22 };

function inWindow(d) {
  const key = d.getMonth() * 100 + d.getDate();
  return key >= FROM.month * 100 + FROM.day && key <= TO.month * 100 + TO.day;
}

// Fixed table, not Math.random(): same scene every load, no hydration drift.
const PETALS = [
  [3, 20, 11, 0, 30], [8, 15, 14, 3, -20], [13, 22, 12, 6, 45], [18, 17, 16, 1, -35],
  [23, 24, 13, 8, 20], [28, 16, 15, 4, -50], [33, 21, 12, 9, 35], [38, 18, 17, 2, -25],
  [43, 23, 11, 7, 55], [48, 15, 14, 5, -40], [53, 20, 13, 10, 25], [58, 25, 16, 3, -30],
  [63, 17, 12, 8, 40], [68, 22, 15, 1, -45], [73, 16, 13, 6, 20], [78, 24, 11, 9, -15],
  [83, 18, 14, 4, 50], [88, 21, 12, 2, -55], [93, 16, 16, 7, 35], [97, 23, 13, 5, -20],
  [6, 19, 15, 11, 60], [31, 14, 12, 12, -10], [51, 26, 17, 13, 15], [76, 15, 14, 14, -60],
];
const STARS = [[8, 20, 0], [22, 62, 1.2], [38, 34, 2.1], [55, 78, 0.6], [71, 26, 1.7], [88, 55, 2.6], [95, 18, 0.9]];

function Lotus() {
  const petals = [-70, -35, 0, 35, 70];
  return (
    <svg className={styles.lotus} viewBox="-60 -70 120 100" aria-hidden="true">
      <defs>
        <linearGradient id="wdPetal" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#d946ef" />
          <stop offset="0.55" stopColor="#ff7eb6" />
          <stop offset="1" stopColor="#ffd6e8" />
        </linearGradient>
        <radialGradient id="wdCore" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="1" stopColor="#ffab5c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="0" cy="10" rx="52" ry="9" fill="#5eead4" opacity="0.18" />
      {petals.map((a) => (
        <path key={a} d="M0 4 C-15 -14 -12 -42 0 -62 C12 -42 15 -14 0 4 Z" fill="url(#wdPetal)" opacity="0.92" transform={`rotate(${a} 0 4)`} stroke="#ffe3f0" strokeOpacity="0.5" strokeWidth="0.8" />
      ))}
      <path d="M0 4 C-15 -14 -12 -42 0 -62 C12 -42 15 -14 0 4 Z" fill="url(#wdPetal)" stroke="#fff" strokeOpacity="0.6" strokeWidth="0.8" />
      <circle cx="0" cy="-6" r="16" fill="url(#wdCore)" />
    </svg>
  );
}

function Rose({ className }) {
  const outer = [0, 72, 144, 216, 288];
  const mid = [36, 108, 180, 252, 324];
  return (
    <svg className={className} viewBox="-60 -60 120 120" aria-hidden="true">
      <defs>
        <radialGradient id="wdRoseOut" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#ff5fa2" />
          <stop offset="1" stopColor="#c2185b" />
        </radialGradient>
        <radialGradient id="wdRoseMid" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#ff9ccb" />
          <stop offset="1" stopColor="#ff4f98" />
        </radialGradient>
      </defs>
      <ellipse cx="-34" cy="30" rx="22" ry="9" fill="#2dd4bf" opacity="0.55" transform="rotate(-25 -34 30)" />
      <ellipse cx="34" cy="32" rx="22" ry="9" fill="#14b8a6" opacity="0.5" transform="rotate(25 34 32)" />
      {outer.map((a) => (
        <circle key={`o${a}`} cx="0" cy="-26" r="22" fill="url(#wdRoseOut)" stroke="#ffd6e8" strokeOpacity="0.45" strokeWidth="0.9" transform={`rotate(${a})`} />
      ))}
      {mid.map((a) => (
        <circle key={`m${a}`} cx="0" cy="-15" r="15" fill="url(#wdRoseMid)" stroke="#fff" strokeOpacity="0.4" strokeWidth="0.8" transform={`rotate(${a})`} />
      ))}
      <circle r="12" fill="#ff7eb6" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.8" />
      <path d="M0 0 C4 -2 5 4 -1 6 C-8 7 -10 -3 -2 -8 C7 -12 14 -2 8 8" fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function CosmicDecor() {
  const [on, setOn] = useState(false);
  const [pillHidden, setPillHidden] = useState(true);
  const [cheer, setCheer] = useState(false);

  useEffect(() => {
    const now = new Date();
    const live = inWindow(now);
    setOn(live);
    // One-time cheer per person per year (falls back to once per page load
    // if storage is blocked).
    if (live) {
      const key = `womensDayCheer${now.getFullYear()}`;
      let seen = false;
      try {
        seen = window.localStorage.getItem(key) === "1";
        if (!seen) window.localStorage.setItem(key, "1");
      } catch {}
      if (!seen) {
        const t = setTimeout(() => setCheer(true), 700);
        return () => clearTimeout(t);
      }
    }
    return undefined;
  }, []);

  useEffect(() => {
    try {
      setPillHidden(window.sessionStorage.getItem("womensDayPillHidden") === "1");
    } catch {
      setPillHidden(false);
    }
  }, []);

  const active = on;

  // The attribute switches the rose accent in globals.css; removed again on
  // any other theme or after the window ends.
  useEffect(() => {
    if (!active) return undefined;
    document.documentElement.setAttribute("data-decor", "womens-day");
    return () => document.documentElement.removeAttribute("data-decor");
  }, [active]);

  if (!active) return null;

  function hidePill() {
    setPillHidden(true);
    try {
      window.sessionStorage.setItem("womensDayPillHidden", "1");
    } catch {}
  }

  return (
    <>
      {cheer && (
        <div className={styles.cheerBackdrop} onClick={() => setCheer(false)} role="dialog" aria-modal="true" aria-label="Chúc mừng ngày Phụ nữ Việt Nam">
          <div className={styles.cheerCard} onClick={(e) => e.stopPropagation()}>
            {PETALS.slice(0, 12).map(([x, size, , delay, rot], i) => (
              <span key={`c${i}`} className={`${styles.cheerPetal} ${i % 2 ? styles.petalRose : styles.petalBlush}`} style={{ left: `${(x * 7) % 100}%`, width: size * 0.8, height: size * 1.05, animationDelay: `${delay * 0.12}s`, "--rot": `${rot}deg` }} />
            ))}
            <Rose className={styles.cheerRose} />
            <div className={styles.cheerTitle}>Chúc mừng ngày Phụ nữ Việt Nam</div>
            <div className={styles.cheerDate}>20/10</div>
            <div className={styles.cheerText}>Chúc các chị em một ngày thật rạng rỡ và tràn đầy niềm vui ✿</div>
            <button type="button" className={styles.cheerBtn} onClick={() => setCheer(false)}>Cảm ơn ✿</button>
          </div>
        </div>
      )}
      <div className={styles.layer} aria-hidden="true">
        <div className={styles.glowA} />
        <div className={styles.glowB} />
        {STARS.map(([x, y, d], i) => (
          <span key={`s${i}`} className={styles.star} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }}>✦</span>
        ))}
        {PETALS.map(([x, size, dur, delay, rot], i) => (
          <span
            key={`p${i}`}
            className={`${styles.petal} ${i % 5 === 0 ? styles.petalOrchid : i % 5 < 3 ? styles.petalRose : styles.petalBlush}`}
            style={{ left: `${x}%`, width: size, height: size * 1.3, animationDuration: `${dur + 6}s`, animationDelay: `-${delay * 2}s`, "--rot": `${rot}deg` }}
          />
        ))}
        <Rose className={styles.roseTL} />
        <Rose className={styles.roseBL} />
        <Rose className={styles.roseTR} />
        <Rose className={styles.roseMini} />
        <Lotus />
      </div>
      <div className={styles.topLine} aria-hidden="true" />
      {!pillHidden && (
        <div className={styles.pill} role="status">
          <span className={styles.pillFlower}>✿</span>
          <span>Chúc mừng Ngày Phụ nữ Việt Nam 20/10</span>
          <span className={styles.pillFlower}>✿</span>
          <button type="button" className={styles.pillClose} onClick={hidePill} aria-label="Hide greeting">×</button>
        </div>
      )}
    </>
  );
}
