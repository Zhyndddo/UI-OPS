"use client";

import { useCallback, useEffect, useState } from "react";
import HitMakersGame from "../../../lib/HitMakersGame";

// Round 620 — Hit Makers guest door (no login). A code from the host + an alias → private token kept in this browser. No AppShell on purpose.
const KEY = "hm_guest_token";
const lsGet = () => { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } };
const lsSet = (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };

export default function HitMakersGuestPage() {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(lsGet());
    try { const c = new URLSearchParams(window.location.search).get("c"); if (c) setCode(c.toUpperCase().slice(0, 6)); } catch (e) { /* ignore */ }
    setReady(true);
  }, []);

  const call = useCallback(async (body) => {
    const r = await fetch("/api/hit-makers", { method: "POST", headers: { "Content-Type": "application/json", "x-guest-token": token }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `Lỗi ${r.status}`); e.status = r.status; throw e; }
    return j;
  }, [token]);

  const join = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/hit-makers-guest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`);
      lsSet(j.token); setToken(j.token);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const box = { minHeight: "100vh", background: "#0e0c18", color: "#f3efff", padding: 16, fontFamily: "system-ui, sans-serif" };
  if (!ready) return <div style={box} />;
  if (token) return <div style={box}><div style={{ maxWidth: 1180, margin: "0 auto" }}><HitMakersGame call={call} mode="guest" onGone={() => { lsSet(""); setToken(""); }} /></div></div>;
  const input = { background: "#14121f", color: "#f3efff", border: "1px solid #5a4f8a", borderRadius: 8, padding: "11px 12px", fontSize: 16, width: "100%", boxSizing: "border-box" };
  return (
    <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 360, background: "#1f1b33", border: "1px solid #3a3358", borderRadius: 14, padding: 22 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 26, background: "linear-gradient(90deg,#ffc857,#ff7ab6,#7fd3e8)", WebkitBackgroundClip: "text", color: "transparent" }}>Hit Makers</h1>
        <p style={{ margin: "0 0 16px", opacity: 0.8, fontSize: 14 }}>Vào chơi với tư cách khách: nhập mã từ người mời và đặt tên hãng đĩa của bạn.</p>
        <label style={{ fontSize: 13, opacity: 0.85 }}>Mã mời</label>
        <input style={{ ...input, letterSpacing: 6, textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }} value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="ABC123" />
        <label style={{ fontSize: 13, opacity: 0.85 }}>Tên hãng đĩa</label>
        <input style={{ ...input, marginBottom: 14 }} value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="VD: Sao Mai Records" onKeyDown={(e) => { if (e.key === "Enter") join(); }} />
        {err && <div style={{ background: "#4a1d2b", border: "1px solid #a03a55", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>{err}</div>}
        <button disabled={busy || code.length !== 6 || name.trim().length < 2} onClick={join} style={{ width: "100%", background: "#ffc857", color: "#2a1f00", border: 0, borderRadius: 10, padding: 13, fontWeight: 800, fontSize: 16, cursor: "pointer", opacity: busy || code.length !== 6 || name.trim().length < 2 ? 0.5 : 1 }}>Vào chơi</button>
      </div>
    </div>
  );
}
