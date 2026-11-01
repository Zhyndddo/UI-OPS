"use client";

import { useEffect, useState } from "react";
import PictureRender from "../../lib/PictureRender";

// Round 570 — PUBLIC Picture render (no login, like the public channel page). Visitors need the shared access code.
// Not wrapped in AppShell on purpose. Nothing is written to the database; pictures go to Drive via /api/picture-render-public.
const KEY = "picture_render_code";

export default function PublicPicturePage() {
  const [code, setCode] = useState("");      // accepted code
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function check(c) {
    const r = await fetch("/api/picture-render-public", { method: "POST", headers: { "x-access-code": encodeURIComponent(c), "x-check": "1" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  }

  useEffect(() => {
    let saved = "";
    try { saved = sessionStorage.getItem(KEY) || ""; } catch (e) { /* private window */ }
    if (saved) check(saved).then(() => setCode(saved)).catch(() => { try { sessionStorage.removeItem(KEY); } catch (e) {} });
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      await check(input.trim());
      try { sessionStorage.setItem(KEY, input.trim()); } catch (e2) {}
      setCode(input.trim());
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "24px 16px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, margin: "0 0 16px" }}>Invitation picture</h1>
        {code ? <PictureRender publicCode={code} /> : (
          <form onSubmit={submit} style={{ maxWidth: 360 }}>
            <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 0 }}>Enter the access code you were given.</p>
            <input
              type="password" value={input} onChange={(e) => setInput(e.target.value)} autoFocus placeholder="Access code"
              style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "inherit", font: "inherit" }}
            />
            <button type="submit" disabled={busy || !input.trim()}
              style={{ marginTop: 10, padding: "9px 18px", fontWeight: 800, borderRadius: 8, border: "none", background: "#ff7a1a", color: "#fff", opacity: busy || !input.trim() ? 0.5 : 1 }}>
              {busy ? "Checking…" : "Open"}
            </button>
            {err && <div style={{ marginTop: 10, fontSize: 13, color: "#ff6b6b" }}>{err}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
