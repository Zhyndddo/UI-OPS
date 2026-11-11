"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTeachersDay } from "./teachersDay";

// Round 594b — "Bôi bảng sạch hơn nhé": after the bottom bar is wiped clean (ChalkBar fires "chalk-cleared"), a chalk bubble appears above the
// bar. Clicking it starts a wiping game over the whole screen. Three modes so they can be compared (pick in the bubble while testing):
//   dust   — a chalk-dust film over the LIVE page (clicks pass through); wiping reveals the page.
//   shot   — a real screenshot of the current view (html2canvas, loaded on demand from cdnjs); wiping erases the picture off a chalkboard.
//   frozen — dust film + the page is locked like a frozen picture; wiping reveals it.
// Always visible: a big "✕ Quay lại" button (also Esc), a progress counter, and the game ends by itself at ~92% wiped.
const MODES = [["chalkpic", "Vẽ phấn"], ["ghost", "Bóng mờ"], ["steam", "Hơi nước"], ["mix", "Ảnh + bụi"], ["dust", "Bụi phấn"], ["shot", "Ảnh chụp"], ["frozen", "Đóng băng"]];
const CAP = ["shot", "mix", "chalkpic", "ghost", "steam"];      // modes that take a screenshot first
const BLOCK = ["shot", "frozen", "chalkpic", "ghost"];           // modes that cover the page and take the pointer themselves
const H2C = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const FONT = '"Segoe Print","Bradley Hand","Chalkboard SE","Marker Felt","Comic Sans MS",cursive';
const WORDS = ["Tri ân thầy cô", "20/11", "♪ ♫", "Cảm ơn thầy cô ✿", "A+", "Thầy cô ơi ♡", "Công ơn thầy cô", "✿"];
const R = 30;          // eraser radius
const CW = 36, CH = 20; // coverage grid
const DONE = 0.92;

function loadH2C() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = H2C; s.async = true;
    s.onload = () => (window.html2canvas ? resolve(window.html2canvas) : reject(new Error("html2canvas missing")));
    s.onerror = () => reject(new Error("html2canvas load failed"));
    document.head.appendChild(s);
  });
}

// "Vẽ phấn": the screenshot becomes a chalk drawing of itself — only the EDGES of the page stay, as rough white chalk lines on the
// board, so wiping erases the page content instead of painting anything over it.
function paintChalkPic(ctx, shot, w, h) {
  const t = document.createElement("canvas"); t.width = w; t.height = h;
  const tc = t.getContext("2d", { willReadFrequently: true });
  tc.drawImage(shot, 0, 0, w, h);
  const src = tc.getImageData(0, 0, w, h), d = src.data;
  const L = new Float32Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) L[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const out = tc.createImageData(w, h), o = out.data;
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const j = y * w + x;
    const g = Math.abs(L[j + 1] - L[j]) + Math.abs(L[j + w] - L[j]);
    let a = Math.min(1, g / 42);
    if (a <= 0.05) continue;
    a *= 0.72 + 0.28 * ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 100) / 100;   // chalk grain
    const k = j * 4;
    o[k] = 246; o[k + 1] = 241; o[k + 2] = 225; o[k + 3] = Math.round(a * 235);
  }
  tc.putImageData(out, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 0.9; ctx.drawImage(t, 0, 0);
  ctx.globalAlpha = 0.55; ctx.drawImage(t, 0.8, 0.5);     // a second pass makes the line a little thicker, like real chalk
  ctx.globalAlpha = 1;
}

// "Hơi nước": a soft squeak while wiping, like a finger on a steamed window (throttled, quiet).
function squeak(ref) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const a = ref.current || (ref.current = { ctx: new AC(), t: 0 });
    const now = Date.now(); if (now - a.t < 240) return; a.t = now;
    const c = a.ctx, t0 = c.currentTime, o = c.createOscillator(), g = c.createGain(), f = 700 + Math.random() * 500;
    o.type = "triangle"; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 1.4, t0 + 0.12);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.025, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + 0.16);
  } catch {}
}

function paintDust(ctx, w, h, strong, keep) {
  if (!keep) ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = strong ? "rgba(26,46,36,0.9)" : keep ? "rgba(244,239,223,0.30)" : "rgba(244,239,223,0.34)";
  ctx.fillRect(0, 0, w, h);
  // smudges
  for (let i = 0; i < 26; i++) {
    const x = ((i * 977) % 1000) / 1000 * w, y = ((i * 613) % 1000) / 1000 * h, r = 60 + (i * 37) % 140;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(244,239,223,0.28)"); g.addColorStop(1, "rgba(244,239,223,0)");
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // chalk words
  ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(246,241,225,0.7)";
  for (let i = 0; i < 18; i++) {
    const x = ((i * 523) % 1000) / 1000 * (w - 200) + 20, y = ((i * 311 + 90) % 1000) / 1000 * (h - 60) + 30;
    ctx.save(); ctx.translate(x, y); ctx.rotate(((i % 5) - 2) * 0.05);
    ctx.font = `${22 + (i % 4) * 8}px ${FONT}`; ctx.fillText(WORDS[i % WORDS.length], 0, 0); ctx.restore();
  }
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < (w * h) / 40; i++) { ctx.globalAlpha = 0.2 + ((i * 7919) % 100) / 220; ctx.fillRect(((i * 2654435761) >>> 0) % w, ((i * 40503) >>> 0) % h, 1.5, 1.5); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
}

export default function ChalkGame() {
  const { active, testMode } = useTeachersDay();
  const [bubble, setBubble] = useState(false);
  const [mode, setMode] = useState("dust");
  const [game, setGame] = useState(null);   // null | "loading" | "play" | "won"
  const [pct, setPct] = useState(0);
  const [note, setNote] = useState("");
  const cvRef = useRef(null);
  const ghostRef = useRef(null);
  const audioRef = useRef(null);
  const gridRef = useRef(null);
  const lastRef = useRef(null);
  const bubbleTimer = useRef(null);
  const modeRef = useRef("dust");

  useEffect(() => { try { const m = window.localStorage.getItem("tdGameMode"); if (m && MODES.some((x) => x[0] === m)) { setMode(m); modeRef.current = m; } } catch {} }, []);
  const pickMode = (m) => { setMode(m); modeRef.current = m; try { window.localStorage.setItem("tdGameMode", m); } catch {} };

  // the bar was wiped clean -> show the bubble
  useEffect(() => {
    if (!active) return undefined;
    const on = () => {
      if (game) return;
      setBubble(true);
      clearTimeout(bubbleTimer.current);
      bubbleTimer.current = setTimeout(() => setBubble(false), 15000);
    };
    window.addEventListener("chalk-cleared", on);
    return () => { window.removeEventListener("chalk-cleared", on); clearTimeout(bubbleTimer.current); };
  }, [active, game]);

  const close = useCallback(() => { setGame(null); setPct(0); setNote(""); lastRef.current = null; gridRef.current = null; document.documentElement.removeAttribute("data-chalkgame"); }, []);

  const start = useCallback(async () => {
    setBubble(false); clearTimeout(bubbleTimer.current);
    gridRef.current = new Uint8Array(CW * CH);
    setPct(0); setNote("");
    const m = modeRef.current;
    setGame(CAP.includes(m) ? "loading" : "play");
    if (CAP.includes(m)) {
      try {
        const h2c = await loadH2C();
        const shot = await h2c(document.documentElement, {
          x: window.scrollX, y: window.scrollY, width: window.innerWidth, height: window.innerHeight, scale: 1,
          useCORS: true, logging: false, backgroundColor: null,
          ignoreElements: (el) => !!(el.getAttribute && el.getAttribute("data-chalkgame")),
        });
        window.__tdShot = shot;
      } catch (e) {
        window.__tdShot = null;
        setNote("Không chụp được màn hình — chuyển sang chế độ bụi phấn.");
        modeRef.current = "dust";
      }
      setGame("play");
    }
  }, []);

  // paint the film / picture once the canvas exists
  useEffect(() => {
    if (game !== "play") return undefined;
    const cv = cvRef.current; if (!cv) return undefined;
    const w = window.innerWidth, h = window.innerHeight;
    cv.width = w; cv.height = h;
    if (ghostRef.current) { ghostRef.current.width = w; ghostRef.current.height = h; }
    const ctx = cv.getContext("2d");
    const m = modeRef.current;
    if ((m === "shot" || m === "ghost") && window.__tdShot) { ctx.drawImage(window.__tdShot, 0, 0, w, h); window.__tdShot = null; }
    else if (m === "chalkpic" && window.__tdShot) { paintChalkPic(ctx, window.__tdShot, w, h); window.__tdShot = null; }
    else if ((m === "mix" || m === "steam") && window.__tdShot) {
      // fogged glass: the screenshot, blurred and dusted with chalk — wiping reveals the crisp live page underneath
      ctx.filter = "blur(5px)"; ctx.drawImage(window.__tdShot, -12, -12, w + 24, h + 24); ctx.filter = "none"; window.__tdShot = null;
      paintDust(ctx, w, h, false, true);
    } else paintDust(ctx, w, h, m === "frozen");
    document.documentElement.setAttribute("data-chalkgame", "on");
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const onResize = () => close();
    window.addEventListener("keydown", onKey); window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("resize", onResize); };
  }, [game, close]);

  const wipeAt = useCallback((x, y) => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "#000"; ctx.fillStyle = "#000"; ctx.lineWidth = R * 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const l = lastRef.current;
    if (l) { ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(x, y); ctx.stroke(); } else { ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalCompositeOperation = "source-over";
    const mm = modeRef.current;
    if (mm === "ghost" && ghostRef.current) {   // faint smudge left on the board where the content was rubbed out
      const gc = ghostRef.current.getContext("2d");
      gc.strokeStyle = "rgba(244,239,223,0.07)"; gc.lineWidth = R * 2.3; gc.lineCap = "round";
      gc.beginPath(); gc.moveTo((l || { x }).x, (l || { y }).y); gc.lineTo(x, y); gc.stroke();
    }
    if (mm === "steam") {
      squeak(audioRef);
      if (Math.random() < 0.04) {   // a water drip runs down from the wiped spot
        ctx.globalCompositeOperation = "destination-out"; ctx.lineWidth = 3 + Math.random() * 3; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x + (Math.random() - 0.5) * R, y + R * 0.5); ctx.lineTo(x + (Math.random() - 0.5) * 8, y + R * 0.5 + 30 + Math.random() * 80); ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
    }
    // coverage grid along the stroke
    const g = gridRef.current; if (!g) { lastRef.current = { x, y }; return; }
    const w = cv.width, h = cv.height, cw = w / CW, ch = h / CH;
    const a = l || { x, y };
    const steps = Math.max(1, Math.ceil(Math.hypot(x - a.x, y - a.y) / 10));
    for (let i = 0; i <= steps; i++) {
      const px = a.x + ((x - a.x) * i) / steps, py = a.y + ((y - a.y) * i) / steps;
      for (let gy = Math.max(0, Math.floor((py - R) / ch)); gy <= Math.min(CH - 1, Math.floor((py + R) / ch)); gy++)
        for (let gx = Math.max(0, Math.floor((px - R) / cw)); gx <= Math.min(CW - 1, Math.floor((px + R) / cw)); gx++) {
          const cx = (gx + 0.5) * cw, cy = (gy + 0.5) * ch;
          if (Math.hypot(cx - px, cy - py) <= R + 4) g[gy * CW + gx] = 1;
        }
    }
    lastRef.current = { x, y };
    let n = 0; for (let i = 0; i < g.length; i++) n += g[i];
    const p = n / g.length;
    setPct(Math.round(p * 100));
    if (p >= DONE) {
      gridRef.current = null;
      ctx.clearRect(0, 0, cv.width, cv.height);
      setGame("won");
      setTimeout(close, 2200);
    }
  }, [close]);

  // dust mode: the film does not take clicks, so the wiping is read from the window
  useEffect(() => {
    if (game !== "play" || (modeRef.current !== "dust" && modeRef.current !== "mix" && modeRef.current !== "steam")) return undefined;
    const mv = (e) => wipeAt(e.clientX, e.clientY);
    const lv = () => { lastRef.current = null; };
    window.addEventListener("pointermove", mv); document.addEventListener("pointerleave", lv);
    return () => { window.removeEventListener("pointermove", mv); document.removeEventListener("pointerleave", lv); };
  }, [game, wipeAt]);

  if (!active) return null;
  const m = modeRef.current;
  const captures = BLOCK.includes(m);
  const label = (MODES.find((x) => x[0] === mode) || MODES[0])[1];
  return (
    <>
      <style>{`
        @keyframes tdBubble { 0%,100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, -6px); } }
        @keyframes tdPop { from { opacity: 0; transform: translate(-50%, 10px) scale(.9); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
        html[data-chalkgame="on"] { cursor: crosshair; }
      `}</style>
      {bubble && !game && (
        <div data-chalkgame="ui" style={{ position: "fixed", zIndex: 270, left: "calc(50% + 125px)", bottom: "calc(var(--bottombar-height) + 14px)", transform: "translateX(-50%)", animation: "tdPop .4s ease-out both", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ animation: "tdBubble 2s ease-in-out infinite", display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={start} style={{ background: "#20372c", color: "#f4efdf", border: "2px solid #8a6a43", borderRadius: 16, padding: "9px 18px", font: `700 16px ${FONT}`, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,.4)" }}>
              ✎ Bôi bảng sạch hơn nhé
            </button>
            {testMode && (
              <select value={mode} onChange={(e) => pickMode(e.target.value)} aria-label="Chế độ (thử)" style={{ background: "#20372c", color: "#f4efdf", border: "2px solid #8a6a43", borderRadius: 10, padding: "6px 8px", font: `600 12px ${FONT}` }}>
                {MODES.map(([k, v]) => <option key={k} value={k}>{v} (thử)</option>)}
              </select>
            )}
            <button type="button" onClick={() => setBubble(false)} aria-label="Ẩn" style={{ background: "#20372c", color: "#f4efdf", border: "2px solid #8a6a43", borderRadius: 999, width: 28, height: 28, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>
        </div>
      )}
      {game && (
        <div data-chalkgame="ui" style={{ position: "fixed", inset: 0, zIndex: 8900, background: game === "play" && (m === "shot" || m === "chalkpic") ? "radial-gradient(ellipse at 30% 20%, #2c4a3b, #1d3328 70%)" : game === "play" && m === "ghost" ? "var(--bg)" : "transparent", pointerEvents: game === "play" && captures ? "auto" : "none", touchAction: "none" }}
          onPointerMove={game === "play" && captures ? (e) => wipeAt(e.clientX, e.clientY) : undefined}
          onPointerLeave={() => { lastRef.current = null; }}>
          {game === "play" && (m === "shot" || m === "chalkpic") && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", font: `700 42px ${FONT}`, color: "rgba(244,239,223,.18)" }}>Sạch bóng rồi ✿</div>}
          {game === "play" && m === "ghost" && <canvas ref={ghostRef} style={{ position: "absolute", left: 0, top: 0, width: "100vw", height: "100vh", pointerEvents: "none" }} />}
          {game === "play" && <canvas ref={cvRef} style={{ position: "absolute", left: 0, top: 0, width: "100vw", height: "100vh", pointerEvents: "none" }} />}
          {game === "loading" && <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translateX(-50%)", background: "#20372c", color: "#f4efdf", border: "2px solid #8a6a43", borderRadius: 14, padding: "12px 22px", font: `700 18px ${FONT}` }}>Đang chụp màn hình…</div>}
          {game === "won" && <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translateX(-50%)", animation: "tdPop .4s ease-out both", background: "#20372c", color: "#f4efdf", border: "3px solid #8a6a43", borderRadius: 18, padding: "16px 28px", font: `700 28px ${FONT}`, textAlign: "center" }}>Sạch bóng! ✿<div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>Cảm ơn thầy cô</div></div>}
          {game !== "won" && (
            <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, pointerEvents: "auto", zIndex: 8950 }}>
              <div style={{ background: "#20372c", color: "#f4efdf", border: "2px solid #8a6a43", borderRadius: 14, padding: "8px 14px", font: `600 13px ${FONT}`, boxShadow: "0 4px 16px rgba(0,0,0,.4)" }}>
                {note || `Rê chuột để lau · ${pct}%${testMode ? ` · ${label}` : ""}`}
              </div>
              <button type="button" onClick={close} style={{ background: "#c8412f", color: "#fff", border: "2px solid #f4efdf", borderRadius: 14, padding: "8px 16px", font: "800 14px sans-serif", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,.45)" }}>
                ✕ Quay lại trang
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
