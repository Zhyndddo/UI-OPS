"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { checkPumpkinFace, FACE_W, FACE_H } from "./halloweenFaceCheck";
import styles from "./HalloweenFace.module.css";

// Round 566 — Halloween teaser for the 20 Nov launch: a rare glowing sticker falls -> click -> a big bat flies across the
// screen -> click -> a panel fades in with a blank pumpkin -> draw a lantern face (2 eyes + mouth) -> the FIRST valid
// drawing of the day wins one Jollibee combo for the whole team; every drawing is saved to Google Drive.
// Server side: app/api/halloween-face/route.js. Mounted by HalloweenDecor.js (so it only exists while the decor is on).
// Events: 30 Oct – 1 Nov (Vietnam dates, enforced by the server too); the owner account can test on any date and never uses up the prize.
const vnDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const FIRST_DELAY_MS = 15000;
const EVERY_MS = 150000;
const MAX_STICKERS = 6;
// TEST MODE (owner only): 1 sticker / minute, no cap. Remove with the two OWNER_ lines below.
const OWNER_EVERY_MS = 60000;

function paintPumpkin(ctx) {
  const W = FACE_W, H = FACE_H;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#140c24"; ctx.fillRect(0, 0, W, H);
  // body: three lobes
  const lobe = (cx, rx, c) => { ctx.beginPath(); ctx.ellipse(cx, 152, rx, 104, 0, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); };
  lobe(70, 58, "#e8650d"); lobe(250, 58, "#e8650d"); lobe(110, 80, "#f27a1a"); lobe(210, 80, "#f27a1a"); lobe(160, 92, "#ff9230");
  ctx.strokeStyle = "rgba(120,45,0,0.45)"; ctx.lineWidth = 3;
  [[118, 60, 104, 244], [202, 60, 216, 244]].forEach(([x0, y0, x1, y1]) => { ctx.beginPath(); ctx.moveTo(x0, y0 + 14); ctx.quadraticCurveTo(x0 - 18, 152, x1, y1 - 14); ctx.stroke(); });
  // stem
  ctx.fillStyle = "#4b7a2a"; ctx.beginPath(); ctx.moveTo(148, 54); ctx.lineTo(172, 54); ctx.lineTo(180, 30); ctx.lineTo(156, 24); ctx.closePath(); ctx.fill();
}

export default function HalloweenFace({ profile }) {
  const [phase, setPhase] = useState("idle");          // idle | sticker | bat | panel
  const [stickerX, setStickerX] = useState(50);
  const [batBack, setBatBack] = useState(false);
  const [open, setOpen] = useState(false);              // today's hunt exists and the prize is not taken
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);           // null | { kind: "won" | "lost" | "practice" | "error", text }
  const canvasRef = useRef(null);
  const strokes = useRef([]);
  const drawing = useRef(false);
  const shown = useRef(0);
  const phaseRef = useRef("idle");
  phaseRef.current = phase;
  const profileId = profile?.id || null;
  const isOwner = (profile?.email || "").trim().toLowerCase() === "an.thien@vieent.vn";

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  }

  // is there a prize left today? (also: did this browser already finish today?)
  useEffect(() => {
    if (!profileId) return undefined;
    let dead = false;
    (async () => {
      try {
        if (localStorage.getItem(`hwf_done_${profileId}_${vnDay()}`) && !isOwner) return;
        const r = await fetch("/api/halloween-face", { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (!dead && j.open && (!j.taken || isOwner)) setOpen(true);
      } catch (e) { /* stays closed */ }
    })();
    return () => { dead = true; };
  }, [profileId]);

  // spawn the sticker now and then (never while something is already on screen)
  useEffect(() => {
    if (!open) return undefined;
    let timer;
    const spawn = () => {
      if (!isOwner && shown.current >= MAX_STICKERS) return;
      if (phaseRef.current === "idle") { shown.current += 1; setStickerX(8 + Math.round(Math.random() * 80)); setPhase("sticker"); }
      timer = setTimeout(spawn, isOwner ? OWNER_EVERY_MS : EVERY_MS);
    };
    timer = setTimeout(spawn, isOwner ? 4000 : FIRST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // paint the blank pumpkin whenever the panel opens
  useEffect(() => {
    if (phase !== "panel" || result) return;
    const c = canvasRef.current; if (!c) return;
    c.width = FACE_W; c.height = FACE_H;
    paintPumpkin(c.getContext("2d"));
    strokes.current = []; setHint("");
  }, [phase, result]);

  function pos(e) {
    const c = canvasRef.current, r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * FACE_W) / r.width, y: ((e.clientY - r.top) * FACE_H) / r.height };
  }
  function down(e) {
    e.preventDefault();
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch (err) {}
    drawing.current = true;
    const p = pos(e); strokes.current.push([p]);
    const ctx = canvasRef.current.getContext("2d");
    ctx.fillStyle = "#2a1200"; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  function move(e) {
    if (!drawing.current) return;
    const s = strokes.current[strokes.current.length - 1]; const a = s[s.length - 1]; const b = pos(e);
    s.push(b);
    const ctx = canvasRef.current.getContext("2d");
    ctx.strokeStyle = "#2a1200"; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  function up() { drawing.current = false; }
  function clearAll() { paintPumpkin(canvasRef.current.getContext("2d")); strokes.current = []; setHint(""); }

  async function submit() {
    const check = checkPumpkinFace(strokes.current);
    if (!check.ok) { setHint(check.hint); return; }
    setBusy(true); setHint("");
    try {
      const r = await fetch("/api/halloween-face", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ png: canvasRef.current.toDataURL("image/png") }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setResult({ kind: "error", text: j.error || "Có lỗi rồi, thử lại nhé." });
      else if (j.practice) setResult({ kind: "practice", text: `Test OK — bạn sẽ thắng hôm nay. ${j.driveSaved ? "Đã lưu vào Google Drive." : "Chưa lưu được vào Drive: " + (j.driveError || "?")}` });
      else if (j.won) { setResult({ kind: "won", text: "Chúc mừng bạn! Bạn là người vẽ đèn lồng bí ngô đầu tiên hôm nay và nhận được 1 combo Jollibee thật ngon lành!" }); try { localStorage.setItem(`hwf_done_${profileId}_${vnDay()}`, "1"); } catch (e) {} }
      else setResult({ kind: "lost", text: "Đẹp lắm! Nhưng combo Jollibee hôm nay đã có chủ rồi — mai quay lại thử nhé. Bí ngô của bạn đã được lưu." });
    } catch (e) { setResult({ kind: "error", text: "Mất kết nối — thử lại nhé." }); }
    setBusy(false);
  }
  function closeAll() { setPhase("idle"); setResult(null); setBusy(false); if (result?.kind === "won" || result?.kind === "lost") setOpen(false); }

  if (!open && phase === "idle") return null;
  const emoji = (n) => n;
  return (
    <>
      <div className={styles.layer} aria-hidden={phase !== "sticker" && phase !== "bat"}>
        {phase === "sticker" && (
          <span className={styles.sticker} style={{ left: `${stickerX}%` }} role="button" aria-label="Sticker" onClick={() => { setBatBack(Math.random() < 0.5); setPhase("bat"); }} onAnimationEnd={(e) => { if (e.animationName.includes("hwfFall")) setPhase("idle"); }}>
            {emoji(shown.current % 2 ? "🦇" : "🎃")}
          </span>
        )}
        {phase === "bat" && (
          <span className={`${styles.bat} ${batBack ? styles.batFlip : ""}`} role="button" aria-label="Bat" onClick={() => setPhase("panel")} onAnimationEnd={(e) => { if (e.animationName.includes("hwfFly")) setPhase("idle"); }}>
            <span>🦇</span>
          </span>
        )}
      </div>
      {phase === "panel" && (
        <div className={styles.wrap} onClick={(e) => { if (e.target === e.currentTarget && !busy) closeAll(); }}>
          <div className={styles.card} onClick={(e) => e.stopPropagation()}>
            {!result ? (
              <>
                <div className={styles.title}>🎃 Kho báu của con dơi</div>
                <p className={styles.sub}>Vẽ khuôn mặt đèn lồng bí ngô: 2 mắt ở trên, 1 miệng ở dưới. Người đầu tiên mỗi ngày nhận 1 combo Jollibee!</p>
                <div className={styles.canvasWrap}>
                  <canvas ref={canvasRef} className={styles.canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
                </div>
                <div className={styles.hint}>{hint}</div>
                <div className={styles.row}>
                  <button type="button" className={styles.btn} onClick={clearAll} disabled={busy}>Xoá</button>
                  <button type="button" className={`${styles.btn} ${styles.btnMain}`} onClick={submit} disabled={busy}>{busy ? "Đang gửi…" : "Gửi bí ngô"}</button>
                  <button type="button" className={styles.btn} onClick={closeAll} disabled={busy}>Đóng</button>
                </div>
              </>
            ) : (
              <>
                <div className={styles.big}>{result.kind === "won" ? "🍔" : result.kind === "lost" ? "🎃" : result.kind === "practice" ? "🧪" : "⚠️"}</div>
                <p className={styles.msg}>{result.text}</p>
                <div className={styles.row}>
                  {result.kind === "error" && <button type="button" className={styles.btn} onClick={() => setResult(null)}>Thử lại</button>}
                  <button type="button" className={`${styles.btn} ${styles.btnMain}`} onClick={closeAll}>OK</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
