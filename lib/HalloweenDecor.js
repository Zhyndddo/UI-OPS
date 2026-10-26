"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import styles from "./HalloweenDecor.module.css";

// Round 558 — temporary Halloween decoration.
// Pure decoration: falling pumpkins / bats / ghosts, an orange-purple edge glow, a gradient line
// under the top bar, and a corner pumpkin + cobweb. Everything is pointer-events:none, so it can
// never block a click. Works on dark, Cosmic and light themes (colours switched in globals.css via
// [data-decor="halloween"]).
//
// WHO SEES IT (edit the two switches below):
//   * HALLOWEEN_TEST_EMAILS — see it NOW, any date (matched on the real signed-in profile).
//   * EVERYONE — false = only those accounts. When the owner says "apply to everyone", set it to
//     true: then every account sees it, but only inside the date window (24 Oct – 1 Nov, local date),
//     and it switches itself off after that.
// To remove for good: delete this file, HalloweenDecor.module.css, its <HalloweenDecor /> line in
// AppShell.js and the [data-decor="halloween"] block at the end of app/globals.css.
const HALLOWEEN_TEST_EMAILS = ["an.thien@vieent.vn"];
const EVERYONE = false;
const FROM = { month: 9, day: 24 }; // October = 9 (0-based)
const TO = { month: 10, day: 1 };   // 1 November

function inWindow(d) {
  const key = d.getMonth() * 100 + d.getDate();
  return key >= FROM.month * 100 + FROM.day && key <= TO.month * 100 + TO.day;
}

// Fixed table (left %, size px, fall seconds, delay, spin deg, glyph) — same scene every load, no hydration drift.
const GLYPHS = ["🎃", "🦇", "👻", "🎃", "🦇", "👻", "🦇", "🎃"];
const PIECES = [
  [4, 22, 17, 0, 20], [9, 18, 21, 4, -25], [15, 24, 19, 9, 15], [21, 19, 23, 2, -15],
  [27, 23, 18, 12, 25], [33, 17, 22, 6, -30], [39, 22, 20, 1, 10], [45, 20, 24, 10, -20],
  [51, 24, 17, 5, 30], [57, 18, 21, 14, -10], [63, 22, 19, 3, 20], [69, 19, 23, 8, -25],
  [75, 23, 18, 13, 15], [81, 17, 22, 7, -15], [87, 22, 20, 11, 25], [93, 20, 24, 0, -30],
  [12, 21, 26, 15, 18], [48, 19, 25, 16, -22], [72, 22, 27, 17, 12], [96, 18, 25, 18, -18],
];

function Pumpkin({ className }) {
  return (
    <svg className={className} viewBox="-60 -60 120 110" aria-hidden="true">
      <defs>
        <radialGradient id="hwBody" cx="0.5" cy="0.45" r="0.65">
          <stop offset="0" stopColor="#ffb347" />
          <stop offset="0.6" stopColor="#ff7a1a" />
          <stop offset="1" stopColor="#c2410c" />
        </radialGradient>
      </defs>
      <path d="M-4 -44 C-4 -52 2 -56 8 -56 C6 -50 5 -47 4 -44 Z" fill="#4d7c0f" />
      <ellipse cx="-30" cy="0" rx="26" ry="38" fill="url(#hwBody)" stroke="#9a3412" strokeWidth="1.5" />
      <ellipse cx="30" cy="0" rx="26" ry="38" fill="url(#hwBody)" stroke="#9a3412" strokeWidth="1.5" />
      <ellipse cx="0" cy="0" rx="26" ry="40" fill="url(#hwBody)" stroke="#9a3412" strokeWidth="1.5" />
      <path className={styles.face} d="M-24 -14 L-10 -14 L-17 -26 Z M10 -14 L24 -14 L17 -26 Z" fill="#fff3b0" />
      <path className={styles.face} d="M-26 8 Q-18 28 -8 18 Q0 28 8 18 Q18 28 26 8 Q14 16 8 10 Q0 18 -8 10 Q-14 16 -26 8 Z" fill="#fff3b0" />
    </svg>
  );
}

function Cobweb({ className }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M0 0 L118 0 M0 0 L0 118 M0 0 L84 84 M0 0 L110 40 M0 0 L40 110" />
        <path d="M30 0 Q24 24 0 30 M56 0 Q46 46 0 56 M84 0 Q68 68 0 84 M112 0 Q90 90 0 112" />
      </g>
      <g transform="translate(78 62)" fill="currentColor">
        <circle r="4" /><path d="M-3 -2 L-12 -9 M3 -2 L12 -9 M-4 1 L-13 4 M4 1 L13 4 M-3 3 L-9 11 M3 3 L9 11" stroke="currentColor" strokeWidth="1" fill="none" />
      </g>
      <path d="M78 58 L78 30" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  );
}

export default function HalloweenDecor() {
  const { realProfile } = useAuth();
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(new Date()); }, []);

  const email = (realProfile?.email || "").trim().toLowerCase();
  const isTester = !!email && HALLOWEEN_TEST_EMAILS.includes(email);
  const active = !!realProfile && !!now && (isTester || (EVERYONE && inWindow(now)));

  // The attribute switches the orange/purple palette in globals.css.
  useEffect(() => {
    if (!active) return undefined;
    document.documentElement.setAttribute("data-decor", "halloween");
    return () => document.documentElement.removeAttribute("data-decor");
  }, [active]);

  if (!active) return null;

  return (
    <>
      <div className={styles.layer} aria-hidden="true">
        <div className={styles.glowA} />
        <div className={styles.glowB} />
        {PIECES.map(([x, size, dur, delay, rot], i) => (
          <span
            key={i}
            className={styles.piece}
            style={{ left: `${x}%`, fontSize: size, animationDuration: `${dur + 6}s`, animationDelay: `-${delay * 2}s`, "--rot": `${rot}deg` }}
          >
            {GLYPHS[i % GLYPHS.length]}
          </span>
        ))}
        <Cobweb className={styles.web} />
        <Pumpkin className={styles.pumpkin} />
      </div>
      <div className={styles.topLine} aria-hidden="true" />
    </>
  );
}
