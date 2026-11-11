"use client";

import { useEffect, useRef } from "react";
import { useTeachersDay } from "./teachersDay";

// Round 594 — chalk writing on the bottom bar (Teachers' Day). A canvas sits BEHIND the bar's content (z-index -1 inside the bar's own
// stacking context). Moving the pointer over the bar wipes the chalk like an eraser; the chalk fades back in a few seconds after the
// wiping stops. Only the chalk is wiped — the pagination controls and the badge stay where they are and keep working.
const PHRASES = ["Tri ân thầy cô ✿", "20/11", "♪ ♫", "Cảm ơn thầy cô", "Ngày Nhà giáo Việt Nam", "✿", "Thầy cô ơi ♡", "Công ơn thầy cô", "A+", "♬ ♪", "Nhớ ơn thầy cô"];
const COLORS = ["#f6f1e1", "#f6f1e1", "#ffe9a6", "#f7c6d9", "#cfe8d5"];
const FONT = '"Segoe Print","Bradley Hand","Chalkboard SE","Marker Felt","Comic Sans MS",cursive';
const ERASER = 36;      // eraser width, px
const FADE_AFTER = 1800; // ms after the last wipe before the chalk starts to come back
const FADE_STEP = 0.1;   // share of the wiped area given back every 250 ms

function rng(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function drawArt(ctx, w, h, blocked) {
  ctx.clearRect(0, 0, w, h);
  const r = rng(20112026);
  ctx.textBaseline = "middle";
  let x = 14;
  while (x < w) {
    const text = PHRASES[Math.floor(r() * PHRASES.length)];
    const size = 15 + Math.floor(r() * 9);
    const y = h * 0.5 + (r() - 0.5) * h * 0.4;
    const ang = (r() - 0.5) * 0.16;
    ctx.font = `${size}px ${FONT}`;
    const tw = ctx.measureText(text).width;
    // Round 594b — never write under the bar's own text/buttons: skip this phrase if it would overlap one of them
    const hit = blocked.some((b) => x - 6 < b.x + b.w && x + tw + 6 > b.x && b.y < h && b.y + b.h > 0);
    if (hit) { const b = blocked.find((q) => x - 6 < q.x + q.w && x + tw + 6 > q.x); x = Math.max(x + 8, b.x + b.w + 14); continue; }
    ctx.fillStyle = COLORS[Math.floor(r() * COLORS.length)];
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    for (const [dx, dy, a] of [[0, 0, 0.5], [0.7, 0.4, 0.3], [-0.6, -0.5, 0.25]]) { ctx.globalAlpha = a; ctx.fillText(text, dx, dy); }
    ctx.restore();
    x += tw + 36 + r() * 70;
  }
  // chalk grain: knock tiny holes out of the strokes
  ctx.globalCompositeOperation = "destination-out";
  const dots = Math.round((w * h) / 14);
  for (let i = 0; i < dots; i++) { ctx.globalAlpha = 0.35 + r() * 0.5; ctx.fillRect(r() * w, r() * h, 1 + r(), 1); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
}

export default function ChalkBar() {
  const { active } = useTeachersDay();
  const ref = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    const cv = ref.current;
    const bar = cv && cv.parentElement;
    if (!cv || !bar) return undefined;
    bar.setAttribute("data-chalk", "on");
    const art = document.createElement("canvas");
    const mask = document.createElement("canvas");
    const ctx = cv.getContext("2d"), actx = art.getContext("2d"), mctx = mask.getContext("2d");
    let w = 1, h = 1, dpr = 1, last = null, timer = null, lastWipe = 0;

    function render() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(art, 0, 0);
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    }
    function measureBlocked() {
      const br = bar.getBoundingClientRect();
      const out = [];
      bar.querySelectorAll("button,select,input,img,svg,a,label,span,p,div").forEach((el) => {
        if (el === cv) return;
        const leaf = !el.firstElementChild;
        const isCtl = /^(BUTTON|SELECT|INPUT|IMG|SVG|A|LABEL)$/i.test(el.tagName);
        if (!isCtl && !(leaf && (el.textContent || "").trim())) return;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        out.push({ x: r.left - br.left, y: r.top - br.top, w: r.width, h: r.height });
      });
      return out;
    }
    function resize() {
      const rect = bar.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width)); h = Math.max(1, Math.round(rect.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const c of [cv, art, mask]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      actx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawArt(actx, w, h, measureBlocked());
      mctx.clearRect(0, 0, mask.width, mask.height);
      render();
    }
    function tick() {
      const idle = Date.now() - lastWipe;
      if (idle > FADE_AFTER) {
        mctx.setTransform(1, 0, 0, 1, 0, 0);
        mctx.globalCompositeOperation = "destination-out";
        mctx.fillStyle = `rgba(0,0,0,${FADE_STEP})`;
        mctx.fillRect(0, 0, mask.width, mask.height);
      }
      if (idle > 14000) { mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, mask.width, mask.height); clearInterval(timer); timer = null; }
      render();
    }
    function wipe(e) {
      const rect = bar.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mctx.globalCompositeOperation = "source-over";
      mctx.strokeStyle = "#000"; mctx.fillStyle = "#000"; mctx.lineWidth = ERASER; mctx.lineCap = "round"; mctx.lineJoin = "round";
      if (last) { mctx.beginPath(); mctx.moveTo(last.x, last.y); mctx.lineTo(x, y); mctx.stroke(); }
      else { mctx.beginPath(); mctx.arc(x, y, ERASER / 2, 0, Math.PI * 2); mctx.fill(); }
      last = { x, y };
      lastWipe = Date.now();
      render();
      if (!timer) timer = setInterval(tick, 250);
    }
    const leave = () => { last = null; };

    resize();
    bar.addEventListener("pointermove", wipe);
    bar.addEventListener("pointerleave", leave);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(bar);
    let mt = null;
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(() => { clearTimeout(mt); mt = setTimeout(resize, 250); }) : null;
    if (mo) mo.observe(bar, { childList: true, subtree: true, characterData: true });
    return () => {
      bar.removeEventListener("pointermove", wipe);
      bar.removeEventListener("pointerleave", leave);
      if (ro) ro.disconnect();
      if (mo) mo.disconnect();
      clearTimeout(mt);
      if (timer) clearInterval(timer);
      bar.removeAttribute("data-chalk");
    };
  }, [active]);

  if (!active) return null;
  return <canvas ref={ref} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, zIndex: -1, pointerEvents: "none" }} />;
}
