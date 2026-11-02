"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "../../lib/vendor/jsQR";

// Round 574 — PUBLIC door check-in (no login, door code). Scan the guest's QR with the phone camera (or type the code),
// the page answers: green = welcome (first time), amber = already checked in, red = not on the list.
const KEY = "event_door_code";
const COLORS = { ok: ["#1f9d55", "✅ Chào mừng"], already: ["#d98a00", "⚠️ Đã check-in trước đó"], unknown: ["#d13b3b", "❌ Không có trong danh sách"], invalid: ["#d13b3b", "❌ Mã QR không hợp lệ"] };

export default function CheckinPage() {
  const [door, setDoor] = useState("");
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);       // last result
  const [stats, setStats] = useState(null);   // { total, checked }
  const [camErr, setCamErr] = useState("");
  const [manual, setManual] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const last = useRef({ token: "", t: 0 });
  const working = useRef(false);

  async function api(code, body) {
    const r = await fetch("/api/event-checkin", { method: "POST", headers: { "Content-Type": "application/json", "x-door-code": encodeURIComponent(code) }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`);
    return j;
  }

  useEffect(() => {
    let saved = "";
    try { saved = sessionStorage.getItem(KEY) || ""; } catch (e) {}
    if (saved) api(saved, { mode: "check" }).then(() => setDoor(saved)).catch(() => { try { sessionStorage.removeItem(KEY); } catch (e) {} });
  }, []);

  async function enter(e) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true); setErr("");
    try { await api(input.trim(), { mode: "check" }); try { sessionStorage.setItem(KEY, input.trim()); } catch (e2) {} setDoor(input.trim()); }
    catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  async function submitToken(token) {
    if (working.current) return;
    working.current = true;
    try {
      const j = await api(door, { mode: "scan", token });
      setRes(j);
      if (typeof j.total === "number") setStats({ total: j.total, checked: j.checked });
      try { navigator.vibrate && navigator.vibrate(j.status === "ok" ? 120 : [80, 60, 80]); } catch (e) {}
    } catch (e) { setRes({ status: "error", error: e.message }); }
    working.current = false;
  }

  // camera + scan loop
  useEffect(() => {
    if (!door) return undefined;
    let stream = null, raf = 0, stop = false, lastRun = 0;
    api(door, { mode: "stats" }).then((j) => setStats({ total: j.total, checked: j.checked })).catch(() => {});
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        const v = videoRef.current; if (!v) return;
        v.srcObject = stream; v.setAttribute("playsinline", "true"); await v.play();
        const tick = (ts) => {
          if (stop) return;
          raf = requestAnimationFrame(tick);
          if (ts - lastRun < 120 || v.readyState < 2 || !v.videoWidth) return;
          lastRun = ts;
          const c = canvasRef.current; const w = Math.min(640, v.videoWidth), h = Math.round(w * v.videoHeight / v.videoWidth);
          c.width = w; c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(v, 0, 0, w, h);
          const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
          if (code && code.data) {
            const now = Date.now();
            if (code.data === last.current.token && now - last.current.t < 5000) return;   // same QR still in view
            last.current = { token: code.data, t: now };
            submitToken(code.data);
          }
        };
        raf = requestAnimationFrame(tick);
      } catch (e) { setCamErr("Không mở được camera (" + (e.name || "lỗi") + "). Hãy cho phép dùng camera, hoặc nhập mã thủ công bên dưới."); }
    })();
    return () => { stop = true; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [door]);   // eslint-disable-line react-hooks/exhaustive-deps

  const box = { width: "100%", boxSizing: "border-box", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "inherit", font: "inherit" };
  const [bg, title] = res && COLORS[res.status] ? COLORS[res.status] : ["#555", res?.status === "error" ? "⚠️ Lỗi kết nối" : ""];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "16px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ fontSize: 18, margin: "0 0 12px" }}>Check-in</h1>
        {!door ? (
          <form onSubmit={enter} style={{ maxWidth: 360 }}>
            <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 0 }}>Nhập mã cửa do ban tổ chức cung cấp.</p>
            <input type="password" style={box} value={input} onChange={(e) => setInput(e.target.value)} autoFocus placeholder="Mã cửa" />
            <button type="submit" disabled={busy || !input.trim()} style={{ marginTop: 10, padding: "10px 18px", fontWeight: 800, borderRadius: 8, border: "none", background: "#ff7a1a", color: "#fff", opacity: busy || !input.trim() ? 0.5 : 1 }}>{busy ? "Đang kiểm tra…" : "Mở"}</button>
            {err && <div style={{ marginTop: 10, fontSize: 13, color: "#ff6b6b" }}>{err}</div>}
          </form>
        ) : (
          <>
            {stats && <div style={{ fontSize: 14, marginBottom: 10 }}>Đã check-in: <b>{stats.checked}</b> / {stats.total} đã đăng ký</div>}
            <div style={{ position: "relative", background: "#000", borderRadius: 10, overflow: "hidden", aspectRatio: "1 / 1", maxHeight: "55vh" }}>
              <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: "18%", border: "3px solid rgba(255,255,255,0.85)", borderRadius: 12, pointerEvents: "none" }} />
            </div>
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {camErr && <div style={{ marginTop: 8, fontSize: 13, color: "#ff9a6b" }}>{camErr}</div>}
            {res && (
              <div style={{ marginTop: 12, padding: 16, borderRadius: 10, background: bg, color: "#fff" }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
                {res.name && <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{res.name}</div>}
                {res.org && <div style={{ fontSize: 14, opacity: 0.95 }}>{res.org}</div>}
                {res.status === "already" && res.at && <div style={{ fontSize: 13, marginTop: 6 }}>Lúc {res.at}</div>}
                {res.status === "error" && <div style={{ fontSize: 13, marginTop: 6 }}>{res.error}</div>}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { submitToken(manual.trim()); setManual(""); } }} style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <input style={box} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Nhập mã thủ công (EVT1.…)" autoComplete="off" />
              <button type="submit" style={{ padding: "0 16px", fontWeight: 800, borderRadius: 8, border: "none", background: "#ff7a1a", color: "#fff" }}>OK</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
