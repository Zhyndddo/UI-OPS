"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "./supabaseClient";
import styles from "./HalloweenDecor.module.css";
import HalloweenFace from "./HalloweenFace";

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
const EVERYONE = true;
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

const OWNER_EMAIL = "an.thien@vieent.vn";
const CLICKS_TO_BREAK = 50;
const REWARD_TEXT = "Chúc mừng bạn đã tìm được phần thưởng là 1 cây kem thật ngon lành";

// Whole pumpkin: three lobes, face spans all of them (eyes in the side lobes, small nose, wide toothy mouth).
function Pumpkin({ lit }) {
  return (
    <>
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
      <g>
        <path className={lit ? styles.face : undefined} d="M-44 -29 L-21 -15 L-44 -3 Z M44 -29 L21 -15 L44 -3 Z M-5 -4 L5 -4 L0 -16 Z" fill={lit ? "#fff3b0" : "#3b1405"} stroke={lit ? "none" : "#ff9a3c"} strokeOpacity=".4" strokeWidth=".9" strokeLinejoin="round" />
        <path className={lit ? styles.face : undefined} d="M-50 12 Q-38 36 -24 24 Q-12 34 0 24 Q12 34 24 24 Q38 36 50 12 Q32 22 24 16 Q12 24 0 16 Q-12 24 -24 16 Q-32 22 -50 12 Z" fill={lit ? "#fff3b0" : "#3b1405"} stroke={lit ? "none" : "#ff9a3c"} strokeOpacity=".4" strokeWidth=".9" strokeLinejoin="round" />
      </g>
    </>
  );
}

// Candle stumps: what is left after the pumpkin has been broken once (unlit, wax pooled around them).
function Stumps({ lit }) {
  return (
    <>
      <ellipse cx="0" cy="38" rx="34" ry="7" fill="#e9d9ad" opacity=".9" />
      <path d="M-34 38 Q-26 28 -18 38 Q-10 46 0 38 Q10 30 20 38 Q28 46 36 38 Z" fill="#f2e2b3" />
      {[[-20, 9, 8], [-2, 6, 9], [16, 11, 8]].map(([x, h0, w], i) => { const h = lit ? h0 + 12 : h0; return (
        <g key={i}>
          {lit && <circle cx={x} cy={36 - h - 8} r="13" fill="#ffcf40" opacity=".28" />}
          <rect x={x - w / 2} y={36 - h} width={w} height={h} rx="2" fill="#fff8e1" stroke="#d9c79a" strokeWidth=".8" />
          {lit && <path className="hwFlame" d={`M${x} ${36 - h - 2} C${x - 4} ${36 - h - 8} ${x - 1} ${36 - h - 12} ${x} ${36 - h - 16} C${x + 1} ${36 - h - 12} ${x + 4} ${36 - h - 8} ${x} ${36 - h - 2} Z`} fill="#ffcf40" />}
          {!lit && <path d={`M${x - 1} ${36 - h} q-1 -3 1 -4`} stroke="#6b5a3a" strokeWidth="1" fill="none" />}
          <path d={`M${x + w / 2 - 1} ${36 - h + 1} q2 4 0 8`} stroke="#f2e2b3" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      ); })}
    </>
  );
}

// Broken state: two halves sliding apart, candles + wax between them, and a tiny note.
function Broken({ withNote, onNote, noteClass }) {
  return (
    <>
      <g className="hwHalfL"><path d="M-4 -44 C-4 -52 2 -56 8 -56 C6 -50 5 -47 4 -44 Z" fill="#4d7c0f" /><path d="M0 -40 C-14 -40 -56 -34 -56 0 C-56 30 -30 38 0 38 Z" fill="#ff7a1a" stroke="#9a3412" strokeWidth="1.5" /><path d="M-46 -26 L-26 -14 L-46 -4 Z" fill="#5a1d06" /></g>
      <g className="hwHalfR"><path d="M0 -40 C14 -40 56 -34 56 0 C56 30 30 38 0 38 Z" fill="#e8590c" stroke="#9a3412" strokeWidth="1.5" /><path d="M46 -26 L26 -14 L46 -4 Z" fill="#5a1d06" /></g>
      <ellipse cx="0" cy="38" rx="30" ry="6" fill="#f5e6c4" opacity=".9" />
      <path d="M-28 38 Q-20 30 -14 38 Q-8 44 0 38 Q10 30 18 38 Q24 44 30 38 Z" fill="#f2e2b3" />
      {[[-18, 14], [-4, 8], [12, 16]].map(([x, h], i) => (
        <g key={i}>
          <rect x={x - 4} y={36 - h} width="8" height={h} rx="1.5" fill="#fff8e1" stroke="#d9c79a" strokeWidth=".8" />
          <path className="hwFlame" d={`M${x} ${36 - h - 2} C${x - 4} ${36 - h - 8} ${x - 1} ${36 - h - 12} ${x} ${36 - h - 15} C${x + 1} ${36 - h - 12} ${x + 4} ${36 - h - 8} ${x} ${36 - h - 2} Z`} fill="#ffcf40" />
        </g>
      ))}
      {withNote && (
        <g className={noteClass} onClick={onNote} style={{ cursor: "pointer", pointerEvents: "auto" }} role="button" aria-label="Open the note">
          <rect x="-12" y="14" width="24" height="17" rx="2" fill="#fffdf5" stroke="#b79b5b" strokeWidth="1" transform="rotate(-8 0 22)" />
          <path d="M-8 20 L8 18 M-8 24 L6 22.5 M-8 28 L3 27" stroke="#b79b5b" strokeWidth="1" transform="rotate(-8 0 22)" />
        </g>
      )}
    </>
  );
}

// Small web in the top-left corner of the content area (just right of the sidebar, under the top bar).
// Only the fan spokes + arcs are drawn - no straight edge lines, which looked like a stray slash.
function Cobweb({ className }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
        <path d="M0 0 L86 86 M0 0 L112 42 M0 0 L42 112" />
        <path d="M26 0 Q22 22 0 26 M52 0 Q42 42 0 52 M80 0 Q64 64 0 80 M108 0 Q86 86 0 108" />
      </g>
      <path d="M70 52 L70 30" stroke="currentColor" strokeWidth="0.8" fill="none" />
      <g transform="translate(70 56)" fill="currentColor"><circle r="4" /><path d="M-3 -2 L-11 -8 M3 -2 L11 -8 M-4 1 L-12 4 M4 1 L12 4 M-3 3 L-8 10 M3 3 L8 10" stroke="currentColor" strokeWidth="1" fill="none" /></g>
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

  // ── Pumpkin easter egg ──
  // mode: "on" (lit pumpkin) | "off" (dark pumpkin) | "stumps" (candle stumps). Stumps only exist once the pumpkin
  // has been broken; from then on a click cycles on -> off -> stumps -> on, saved on this device, no auto switch back.
  const [mode, setMode] = useState("on");
  const [broken, setBroken] = useState(false);   // the break scene (halves + candles + note) is showing
  const [brokeOnce, setBrokeOnce] = useState(false);
  const [found, setFound] = useState(false);   // this person already got the prize -> no more note
  const [msg, setMsg] = useState(false);
  const clicks = useRef(0);
  const profileId = realProfile?.id || null;
  const lit = mode === "on";
  const glowing = mode === "on" || mode === "candles";   // something is burning -> light spreads from the pumpkin spot

  useEffect(() => {
    if (!active || !profileId) return undefined;
    let dead = false;
    try {
      if (localStorage.getItem("hw_found_" + profileId)) setFound(true);
      if (localStorage.getItem("hw_broke_" + profileId)) {
        setBrokeOnce(true);
        const m = localStorage.getItem("hw_mode_" + profileId);
        if (m === "on" || m === "off" || m === "stumps" || m === "candles") setMode(m);
      }
    } catch (e) {}
    (async () => {
      try {
        const { data } = await supabase.from("halloween_finds").select("profile_id").eq("profile_id", profileId).limit(1);
        if (!dead && data && data.length) { setFound(true); setBrokeOnce(true); }
      } catch (e) { /* table not created yet -> browser flag only */ }
    })();
    return () => { dead = true; };
  }, [active, profileId]);

  function saveMode(m) {
    setMode(m);
    try { localStorage.setItem("hw_mode_" + profileId, m); } catch (e) {}
  }
  // leave the break scene (click on it, or close the prize message): the pumpkin is back, lit
  function heal() {
    clicks.current = 0; setBroken(false); setMsg(false);
    try { localStorage.setItem("hw_broke_" + profileId, "1"); } catch (e) {}
    setBrokeOnce(true); saveMode("on");
  }

  function onPumpkin() {
    if (broken) { if (found) heal(); return; }   // with a note still lying there, only the note ends the scene
    if (brokeOnce) { saveMode(mode === "on" ? "off" : mode === "off" ? "stumps" : mode === "stumps" ? "candles" : "on"); return; }
    setMode((v) => (v === "on" ? "off" : "on"));
    clicks.current += 1;
    if (clicks.current >= CLICKS_TO_BREAK) { setBroken(true); setMode("on"); }
  }

  async function onNote(e) {
    e.stopPropagation();
    if (found) return;
    setMsg(true); setFound(true);
    try { localStorage.setItem("hw_found_" + profileId, "1"); } catch (err) {}
    const name = realProfile?.name || realProfile?.email || "Someone";
    let first = true;
    try {
      const { error } = await supabase.from("halloween_finds").insert({ profile_id: profileId, name });
      if (error && String(error.code) === "23505") first = false;   // already recorded earlier
    } catch (err) {}
    if (!first) return;
    try {
      const { data: owner } = await supabase.from("profiles").select("id").ilike("email", OWNER_EMAIL).limit(1);
      if (owner && owner[0]) {
        await supabase.from("notifications").insert({
          profile_id: owner[0].id, type: "halloween_find",
          title: "🍦 " + name + " found the pumpkin prize",
          body: name + " broke the pumpkin (50 clicks) and opened the note. You owe them an ice cream.",
        });
      }
    } catch (err) { /* best effort */ }
  }

  if (!active) return null;

  return (
    <>
      {/* Round 566 — "draw the pumpkin face" teaser (30 Oct – 1 Nov, enforced by its API; the owner can test any day). */}
      <HalloweenFace profile={realProfile} />
      <div className={`${styles.layer} ${glowing ? "" : styles.dim} ${mode === "candles" ? styles.soft : ""}`} aria-hidden="true">
        {glowing && <div className={styles.light} />}
        <div className={styles.glowB} />
        {PIECES.map(([x, size, dur, delay, rot], i) => (
          <span
            key={i}
            className={styles.piece}
            style={{ left: `${x}%`, fontSize: size, animationDuration: `${dur}s`, animationDelay: `-${delay}s`, "--rot": `${rot}deg` }}
          >
            {GLYPHS[i % GLYPHS.length]}
          </span>
        ))}
        <Cobweb className={styles.web} />
        <svg className={`${styles.pumpkin} ${broken ? styles.isBroken : ""} ${glowing ? "" : styles.isOff}`} viewBox="-64 -62 128 112" role="button" aria-label="Pumpkin" onClick={onPumpkin}>
          {broken ? <Broken withNote={!found} onNote={onNote} noteClass={styles.note} /> : mode === "stumps" ? <Stumps /> : mode === "candles" ? <Stumps lit /> : <Pumpkin lit={lit} />}
        </svg>
      </div>
      {msg && (
        <div className={styles.msgWrap} onClick={heal}>
          <div className={styles.msg} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 44, lineHeight: 1 }}>🍦</div>
            <p>{REWARD_TEXT}</p>
            <button type="button" onClick={heal}>OK</button>
          </div>
        </div>
      )}
      <div className={styles.topLine} aria-hidden="true" />
      {glowing && <div className={`${styles.bottomGlow} ${mode === "candles" ? styles.soft : ""}`} aria-hidden="true" />}
    </>
  );
}
