"use client";

import { useState } from "react";
import { EVENT } from "../../lib/eventConfig";

// Round 574 — PUBLIC event registration (no login). Guest enters name + email (+ organisation) + the event code,
// gets a personal QR on screen AND by email. Not wrapped in AppShell on purpose.
const input = { width: "100%", boxSizing: "border-box", padding: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "inherit", font: "inherit", fontSize: 15 };
const label = { display: "block", fontSize: 13, fontWeight: 700, margin: "14px 0 5px" };

export default function RegisterPage() {
  const [f, setF] = useState({ name: "", email: "", org: "", code: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/event-register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`);
      setDone(j);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "24px 16px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 4 }}>{EVENT.host}</div>
        <h1 style={{ fontSize: 20, margin: "0 0 8px", lineHeight: 1.3 }}>{EVENT.title}</h1>
        <div style={{ fontSize: 13.5, marginBottom: 18, lineHeight: 1.6 }}>🕘 {EVENT.when}<br />📍 {EVENT.where}</div>

        {done ? (
          <div>
            <div style={{ padding: 14, borderRadius: 10, background: "rgba(80,200,120,0.14)", border: "1px solid rgba(80,200,120,0.5)", fontSize: 14, lineHeight: 1.55 }}>
              <b>{done.again ? "Email này đã đăng ký trước đó." : "Đăng ký thành công!"}</b>{" "}
              {done.mailed ? "Mã QR đã được gửi tới email của bạn (hãy kiểm tra cả thư rác / spam)." : "Chưa gửi được email — hãy lưu ảnh mã QR bên dưới."}
            </div>
            <div style={{ textAlign: "center", margin: "18px 0" }}>
              <img src={done.qr} alt="Mã QR tham dự" width={260} height={260} style={{ background: "#fff", padding: 8, borderRadius: 8, maxWidth: "100%", height: "auto" }} />
              <div style={{ marginTop: 10 }}>
                <a href={done.qr} download="ma-qr-tham-du.png" style={{ fontWeight: 700 }}>Lưu ảnh mã QR</a>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-faint)" }}>{EVENT.note}</p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label style={label} htmlFor="n">Họ và tên *</label>
            <input id="n" style={input} value={f.name} onChange={set("name")} required maxLength={120} autoComplete="name" />
            <label style={label} htmlFor="e">Email *</label>
            <input id="e" type="email" style={input} value={f.email} onChange={set("email")} required maxLength={160} autoComplete="email" />
            <label style={label} htmlFor="o">Đơn vị / Tổ chức</label>
            <input id="o" style={input} value={f.org} onChange={set("org")} maxLength={160} autoComplete="organization" />
            <label style={label} htmlFor="c">Mã sự kiện *</label>
            <input id="c" type="password" style={input} value={f.code} onChange={set("code")} required autoComplete="off" />
            {/* honeypot: real people never see or fill this */}
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set("website")} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
            <button type="submit" disabled={busy}
              style={{ marginTop: 20, width: "100%", padding: "12px 18px", fontSize: 15, fontWeight: 800, borderRadius: 8, border: "none", background: "#ff7a1a", color: "#fff", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Đang gửi…" : "Đăng ký và nhận mã QR"}
            </button>
            {err && <div style={{ marginTop: 12, fontSize: 13.5, color: "#ff6b6b" }}>{err}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
