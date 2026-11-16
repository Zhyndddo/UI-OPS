"use client";

import { useEffect, useRef, useState } from "react";

// Round 622 — the doodle pad shown at the table entrance: draw a little picture, pick a background colour, save. It becomes the player's
// token on the board (stored as a small PNG, max ~24 KB). The pen layer and the background colour are separate, so changing the
// background never wipes the drawing.
const SW = ["#111111", "#ffffff", "#ff4d4d", "#ff9b3d", "#ffd23f", "#4ecb71", "#2ec4b6", "#3a86ff", "#8b5cf6", "#ff6fb5", "#8b5a2b", "#9aa0a6"];
const BG = ["#ffd23f", "#ffffff", "#ff9b9b", "#9be7ff", "#b9f6ca", "#d4b8ff", "#ffc2e0", "#2b2350", "#111111"];
const N = 192;

export default function HitMakersAvatarPad({ initialSrc, onSave, saving, saved }) {
  const cv = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const undo = useRef([]);
  const [color, setColor] = useState("#111111");
  const [size, setSize] = useState(8);
  const [eraser, setEraser] = useState(false);
  const [bg, setBg] = useState("#ffd23f");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const c = cv.current; if (!c) return;
    c.width = N; c.height = N;
    if (initialSrc) { const im = new Image(); im.onload = () => { c.getContext("2d").drawImage(im, 0, 0, N, N); setBg("#ffffff"); }; im.src = initialSrc; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pt = (e) => { const r = cv.current.getBoundingClientRect(); return { x: ((e.clientX - r.left) * N) / r.width, y: ((e.clientY - r.top) * N) / r.height }; };
  const style = (ctx) => { ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = size; ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over"; ctx.strokeStyle = color; ctx.fillStyle = color; };
  const down = (e) => {
    const c = cv.current; if (!c) return;
    e.preventDefault(); c.setPointerCapture(e.pointerId);
    const ctx = c.getContext("2d");
    undo.current.push(ctx.getImageData(0, 0, N, N)); if (undo.current.length > 15) undo.current.shift();
    drawing.current = true; const p = pt(e); last.current = p; style(ctx);
    ctx.beginPath(); ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2); ctx.fill(); setDirty(true);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = cv.current.getContext("2d"); const p = pt(e); style(ctx);
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last.current = p;
  };
  const up = () => { drawing.current = false; };
  const doUndo = () => { const s = undo.current.pop(); if (s) cv.current.getContext("2d").putImageData(s, 0, 0); };
  const clear = () => { const ctx = cv.current.getContext("2d"); undo.current.push(ctx.getImageData(0, 0, N, N)); ctx.clearRect(0, 0, N, N); setDirty(true); };
  const save = () => {
    for (const px of [96, 72, 56]) {
      const out = document.createElement("canvas"); out.width = out.height = px;
      const o = out.getContext("2d"); o.fillStyle = bg; o.fillRect(0, 0, px, px); o.drawImage(cv.current, 0, 0, px, px);
      const url = out.toDataURL("image/png");
      if (url.length <= 23500) { onSave(url); setDirty(false); return; }
    }
    onSave(null);
  };

  const sw = (c, on, fn) => <button key={c} type="button" onClick={fn} aria-label={c} style={{ width: 26, height: 26, borderRadius: 13, background: c, border: on ? "3px solid #fff" : "2px solid #5a4f8a", cursor: "pointer", padding: 0 }} />;
  const btn = { background: "#2b2350", color: "#f3efff", border: "1px solid #5a4f8a", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13 };
  return (
    <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
      <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ width: "min(100%, 300px)", aspectRatio: "1", background: bg, borderRadius: "22%", border: "3px solid #ffc857", touchAction: "none", cursor: "crosshair", boxShadow: "0 6px 18px #0008" }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", maxWidth: 320 }}>
        {SW.map((c) => sw(c, !eraser && color === c, () => { setColor(c); setEraser(false); }))}
        <input type="color" value={color} onChange={(e) => { setColor(e.target.value); setEraser(false); }} title="Màu tuỳ chọn" style={{ width: 30, height: 28, padding: 0, border: 0, background: "none", cursor: "pointer" }} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
        {[[4, "Nhỏ"], [8, "Vừa"], [16, "To"]].map(([n, t]) => <button key={n} type="button" style={{ ...btn, outline: size === n ? "2px solid #ffc857" : "none" }} onClick={() => setSize(n)}>{t}</button>)}
        <button type="button" style={{ ...btn, outline: eraser ? "2px solid #ffc857" : "none" }} onClick={() => setEraser((v) => !v)}>Tẩy</button>
        <button type="button" style={btn} onClick={doUndo}>↶ Hoàn tác</button>
        <button type="button" style={btn} onClick={clear}>Xoá hết</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", alignItems: "center", fontSize: 12, opacity: 0.9 }}>
        <span>Màu nền:</span>{BG.map((c) => sw(c, bg === c, () => { setBg(c); setDirty(true); }))}
      </div>
      <button type="button" disabled={saving} onClick={save} style={{ background: "#ffc857", color: "#2a1f00", border: 0, borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>{saving ? "Đang lưu…" : dirty ? "Lưu avatar" : saved ? "Đã lưu ✓ (vẽ tiếp để sửa)" : "Lưu avatar"}</button>
    </div>
  );
}
