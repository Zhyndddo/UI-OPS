"use client";

import { useState } from "react";
import { supabase } from "./supabaseClient";
import { RIGHTS } from "./rightsForm";

// Round 633 — release detail page → Copyrights tab: (1) copy the public declaration link for THIS release,
// (2) show the CONFIRMED rights declaration (read-only; confirmed in Workstation → Rights declarations).
export default function RightsDeclarationBlock({ styles, releaseId, declaration }) {
  const [msg, setMsg] = useState("");
  async function copyLink() {
    setMsg("");
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/rights-declaration/admin?link=${encodeURIComponent(releaseId)}`, { headers: { Authorization: `Bearer ${data?.session?.access_token || ""}` } });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error || `HTTP ${res.status}`); return; }
      try { await navigator.clipboard.writeText(j.url); setMsg("Link copied — send it to the artist."); }
      catch (e) { window.prompt("Copy this link", j.url); }
    } catch (e) { setMsg(e.message); }
  }
  const d = declaration;
  const yes = (o, k) => !!o?.[k];
  return (
    <div style={{ marginBottom: 22 }}>
      <div className={styles.subheading} style={{ marginTop: 0 }}>Rights declaration (artist form)</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <button type="button" className={styles.btnSmall} onClick={copyLink}>🔗 Copy declaration link</button>
        {msg && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{msg}</span>}
      </div>
      {!d ? (
        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No confirmed declaration yet. Submissions appear in Workstation → Rights declarations for AR to confirm.</div>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontSize: 12, lineHeight: 1.7 }}>
          <div><b>{d.song_title}</b> · Sáng tác: {d.composer || "—"} · Trình bày: {d.performer || "—"} · Producer: {d.producer || "—"} · Mixer: {d.mixer || "—"}</div>
          <div><b>Sở hữu:</b> {RIGHTS.filter((r) => yes(d.owned, r.key)).map((r) => r.vi).join(", ") || "—"}</div>
          <div><b>Được cấp phép:</b> {RIGHTS.filter((r) => yes(d.licensed, r.key)).map((r) => r.vi + (d.licensed_until?.[r.key] ? ` (đến ${d.licensed_until[r.key].split("-").reverse().join("/")})` : "")).join(", ") || "—"}{d.platforms ? ` · Nền tảng: ${d.platforms === "all" ? "tất cả" : d.platforms_note || "một số"}` : ""}</div>
          <div><b>Thời hạn:</b> {d.term === "perpetual" ? "Vĩnh viễn" : `Có thời hạn ${d.term_note || ""}`}</div>
          {d.proof && <div><b>Minh chứng:</b> {/^https?:\/\//i.test(d.proof) ? <a href={d.proof} target="_blank" rel="noreferrer">{d.proof}</a> : d.proof}</div>}
          <div style={{ color: "var(--text-faint)" }}>Ký bởi {d.signer_name} · xác nhận {d.confirmed_at ? new Date(d.confirmed_at).toLocaleDateString("vi-VN") : ""}{d.confirmed_by_name ? ` bởi ${d.confirmed_by_name}` : ""}{d.pdf_url && <> · <a href={d.pdf_url} target="_blank" rel="noreferrer">📄 PDF</a></>}</div>
        </div>
      )}
    </div>
  );
}
