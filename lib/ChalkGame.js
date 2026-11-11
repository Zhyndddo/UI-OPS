"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { useTeachersDay } from "./teachersDay";

// Round 594c — "Bôi bảng sạch hơn nhé" + the inbox (hộp thư) on the board.
// After the bottom bar is wiped clean (ChalkBar fires "chalk-cleared") a chalk bubble appears above the bar; the dock's 💌 button starts the
// same thing ("chalk-game-start"). The current view is photographed (html2canvas, loaded on demand from cdnjs) and turned into a CHALK DRAWING
// of itself — only the edges stay, as rough white lines on the board. Wiping erases the page content, and underneath each wipe the thank-you
// notes sent to this person appear, written in chalk. Notes are marked read once the person has wiped something. ✕ / Esc always goes back.
const FONT = '"Segoe Print","Bradley Hand","Chalkboard SE","Marker Felt","Comic Sans MS",cursive';
const BOARD = "#213a2d";
const H2C = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const WORDS = ["Tri ân thầy cô", "20/11", "♪ ♫", "Cảm ơn thầy cô ✿", "A+", "Thầy cô ơi ♡", "Công ơn thầy cô", "✿"];
const R = 30;           // eraser radius
const CW = 36, CH = 20; // coverage grid
const DONE = 0.92;
const MAX_NOTES = 20;

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

function rng(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// the screenshot -> a chalk drawing: only the EDGES of the page stay, as rough white lines, on an opaque board
function paintChalkPic(ctx, shot, w, h) {
  ctx.fillStyle = BOARD; ctx.fillRect(0, 0, w, h);
  if (!shot) {   // screenshot not possible: a plain chalk-dusted board instead
    ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(246,241,225,0.55)";
    for (let i = 0; i < 18; i++) {
      const x = ((i * 523) % 1000) / 1000 * (w - 200) + 20, y = ((i * 311 + 90) % 1000) / 1000 * (h - 60) + 30;
      ctx.save(); ctx.translate(x, y); ctx.rotate(((i % 5) - 2) * 0.05); ctx.font = `${22 + (i % 4) * 8}px ${FONT}`; ctx.fillText(WORDS[i % WORDS.length], 0, 0); ctx.restore();
    }
    return;
  }
  const t = document.createElement("canvas"); t.width = w; t.height = h;
  const tc = t.getContext("2d", { willReadFrequently: true });
  tc.drawImage(shot, 0, 0, w, h);
  const d = tc.getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) L[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const out = tc.createImageData(w, h), o = out.data;
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const j = y * w + x;
    let a = Math.min(1, (Math.abs(L[j + 1] - L[j]) + Math.abs(L[j + w] - L[j])) / 42);
    if (a <= 0.05) continue;
    a *= 0.72 + 0.28 * ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 100) / 100;   // chalk grain
    const k = j * 4;
    o[k] = 246; o[k + 1] = 241; o[k + 2] = 225; o[k + 3] = Math.round(a * 235);
  }
  tc.putImageData(out, 0, 0);
  ctx.globalAlpha = 0.9; ctx.drawImage(t, 0, 0);
  ctx.globalAlpha = 0.55; ctx.drawImage(t, 0.8, 0.5);   // a second pass makes the line a little thicker, like real chalk
  ctx.globalAlpha = 1;
}

// where each note is written on the board (a loose grid with jitter, away from the top buttons and the bottom bar)
function layoutNotes(notes, w, h) {
  const r = rng(20112026);
  const cw = 270;
  const cols = Math.max(1, Math.min(5, Math.floor((w - 40) / (cw + 20))));
  const rows = Math.max(1, Math.floor((h - 150) / 150));
  const cells = [];
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) cells.push([gx, gy]);
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const sx = (w - 40) / cols, sy = (h - 150) / rows;
  return notes.slice(0, cells.length).map((n, i) => {
    const [gx, gy] = cells[i];
    return { n, left: 20 + gx * sx + r() * Math.max(0, sx - cw - 10), top: 70 + gy * sy + r() * Math.max(0, sy - 140) * 0.6, rot: (r() - 0.5) * 5, width: cw };
  });
}

export default function ChalkGame() {
  const { active } = useTeachersDay();
  const [bubble, setBubble] = useState(false);
  const [game, setGame] = useState(null);   // null | "loading" | "play" | "won"
  const [pct, setPct] = useState(0);
  const [note, setNote] = useState("");
  const [placed, setPlaced] = useState([]);
  const [total, setTotal] = useState(0);
  const cvRef = useRef(null);
  const gridRef = useRef(null);
  const lastRef = useRef(null);
  const bubbleTimer = useRef(null);
  const shotRef = useRef(null);
  const notesRef = useRef([]);
  const pctRef = useRef(0);
  const readRef = useRef(false);

  const markRead = useCallback(async () => {
    if (readRef.current) return;
    readRef.current = true;
    const ids = notesRef.current.filter((r) => !r.read_at).map((r) => r.id);
    if (!ids.length) return;
    await supabase.from("thank_notes").update({ read_at: new Date().toISOString() }).in("id", ids);
    window.dispatchEvent(new CustomEvent("td-notes-read"));
  }, []);

  const close = useCallback(() => {
    if (pctRef.current > 0) markRead();
    setGame(null); setPct(0); setNote(""); setPlaced([]); pctRef.current = 0; lastRef.current = null; gridRef.current = null;
    document.documentElement.removeAttribute("data-chalkgame");
  }, [markRead]);

  const start = useCallback(async () => {
    setBubble(false); clearTimeout(bubbleTimer.current);
    gridRef.current = new Uint8Array(CW * CH);
    pctRef.current = 0; readRef.current = false;
    setPct(0); setNote(""); setPlaced([]); shotRef.current = null; notesRef.current = [];
    setGame("loading");
    const notesP = supabase.from("thank_notes").select("id, body, anonymous, from_name, created_at, read_at").order("created_at", { ascending: false }).limit(MAX_NOTES)
      .then(({ data }) => data || [], () => []);
    try {
      const h2c = await loadH2C();
      shotRef.current = await h2c(document.documentElement, {
        x: window.scrollX, y: window.scrollY, width: window.innerWidth, height: window.innerHeight, scale: 1,
        useCORS: true, logging: false, backgroundColor: null,
        ignoreElements: (el) => !!(el.getAttribute && el.getAttribute("data-chalkgame")),
      });
    } catch (e) {
      shotRef.current = null;
      setNote("Không chụp được màn hình — dùng bảng phấn trống.");
    }
    const rows = await notesP;
    notesRef.current = rows;
    setTotal(rows.length);
    setPlaced(layoutNotes(rows, window.innerWidth, window.innerHeight));
    setGame("play");
  }, []);

  // the bar was wiped clean -> the bubble;  the dock's 💌 button -> straight into the game
  useEffect(() => {
    if (!active) return undefined;
    const on = () => {
      if (game) return;
      setBubble(true);
      clearTimeout(bubbleTimer.current);
      bubbleTimer.current = setTimeout(() => setBubble(false), 15000);
    };
    const go = () => { if (!game) start(); };
    window.addEventListener("chalk-cleared", on);
    window.addEventListener("chalk-game-start", go);
    return () => { window.removeEventListener("chalk-cleared", on); window.removeEventListener("chalk-game-start", go); clearTimeout(bubbleTimer.current); };
  }, [active, game, start]);

  // paint the chalk drawing once the canvas exists
  useEffect(() => {
    if (game !== "play") return undefined;
    const cv = cvRef.current; if (!cv) return undefined;
    const w = window.innerWidth, h = window.innerHeight;
    cv.width = w; cv.height = h;
    paintChalkPic(cv.getContext("2d"), shotRef.current, w, h);
    shotRef.current = null;
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
    pctRef.current = Math.max(1, Math.round(p * 100));
    setPct(pctRef.current);
    if (p >= DONE) {
      gridRef.current = null;
      ctx.clearRect(0, 0, cv.width, cv.height);
      setGame("won");
      markRead();
    }
  }, [markRead]);

  if (!active) return null;
  const fmt = (iso) => { try { return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }); } catch { return ""; } };
  const playing = game === "play" || game === "won";
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
            <button type="button" onClick={() => setBubble(false)} aria-label="Ẩn" style={{ background: "#20372c", color: "#f4efdf", border: "2px solid #8a6a43", borderRadius: 999, width: 28, height: 28, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>
        </div>
      )}
      {game && (
        <div data-chalkgame="ui" style={{ position: "fixed", inset: 0, zIndex: 8900, background: playing ? BOARD : "transparent", pointerEvents: game === "loading" ? "none" : "auto", touchAction: "none" }}
          onPointerMove={game === "play" ? (e) => wipeAt(e.clientX, e.clientY) : undefined}
          onPointerLeave={() => { lastRef.current = null; }}>
          {playing && (
            <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
              {total === 0 && (
                <div style={{ position: "absolute", top: "38%", left: 0, right: 0, textAlign: "center", color: "rgba(246,241,225,.75)", font: `700 34px ${FONT}` }}>
                  Sạch bóng rồi ✿
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8, opacity: 0.8 }}>Chưa có lời tri ân nào gửi tới bạn — hãy là người gửi lời cảm ơn đầu tiên nhé.</div>
                </div>
              )}
              {placed.map(({ n, left, top, rot, width }) => (
                <div key={n.id} style={{ position: "absolute", left, top, width, transform: `rotate(${rot}deg)`, color: "#f6f1e1", font: `600 17px/1.35 ${FONT}`, textShadow: "0 0 1px rgba(255,255,255,.7)", padding: "8px 10px", border: "1px dashed rgba(246,241,225,.35)", borderRadius: 8, boxSizing: "border-box" }}>
                  {!n.read_at && <span style={{ color: "#ffe9a6", fontSize: 12, marginRight: 6 }}>✿ mới</span>}
                  <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{n.body}</span>
                  <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4, textAlign: "right" }}>— {n.anonymous || !n.from_name ? "một người ẩn danh" : n.from_name} · {fmt(n.created_at)}</div>
                </div>
              ))}
            </div>
          )}
          {game === "play" && <canvas ref={cvRef} style={{ position: "absolute", left: 0, top: 0, width: "100vw", height: "100vh", pointerEvents: "none" }} />}
          {game === "loading" && <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translateX(-50%)", background: "#20372c", color: "#f4efdf", border: "2px solid #8a6a43", borderRadius: 14, padding: "12px 22px", font: `700 18px ${FONT}` }}>Đang chụp màn hình…</div>}
          <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, pointerEvents: "auto", zIndex: 8950 }}>
            <div style={{ background: "#20372c", color: "#f4efdf", border: "2px solid #8a6a43", borderRadius: 14, padding: "8px 14px", font: `600 13px ${FONT}`, boxShadow: "0 4px 16px rgba(0,0,0,.4)" }}>
              {game === "won" ? `Sạch bóng! ✿ ${total ? `Đọc xong thì bấm ✕ nhé (💌 ${total})` : "Bấm ✕ để quay lại"}` : note || `Rê chuột để lau · ${pct}%${total ? ` · 💌 ${total} thư` : ""}`}
            </div>
            <button type="button" onClick={close} style={{ background: "#c8412f", color: "#fff", border: "2px solid #f4efdf", borderRadius: 14, padding: "8px 16px", font: "800 14px sans-serif", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,.45)" }}>
              ✕ Quay lại trang
            </button>
          </div>
        </div>
      )}
    </>
  );
}
