"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Round 480 — two popups for the Cost Marketing workstation.
const vnd = (n) => new Intl.NumberFormat("vi-VN").format(Math.round(Number(n) || 0)) + " đ";

function Shell({ onClose, title, children, width = 640 }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 399, background: "rgba(0,0,0,0.5)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 400,
          width: `min(${width}px, calc(100vw - 32px))`, maxHeight: "85vh", overflowY: "auto",
          background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10,
          padding: 20, boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>{title}</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </>
  );
}

// Detail behind the summary card's "TikTok Booking" number. `groups` is
// [{ label, rows: [{ id, title, artist, amount, cashback }] }] already
// filtered by the page's month filter, so it always adds up to the card.
export function TikTokBookingDetailPopup({ groups, total, scopeLabel, onClose }) {
  return (
    <Shell onClose={onClose} title="TikTok Booking — detail" width={720}>
      <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 0 }}>
        {scopeLabel} · Cost Thực Chạy, split by who pays and which partner. Adds up to the number on the card.
      </p>
      {groups.length === 0 && <p style={{ fontSize: 12 }}>Nothing counted for this filter.</p>}
      {groups.map((g) => (
        <div key={g.label} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, padding: "6px 8px", background: "var(--bg-hover)", borderRadius: 6 }}>
            <span>{g.label} <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>· {g.rows.length} release(s)</span></span>
            <span>{vnd(g.subtotal)}</span>
          </div>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "5px 8px" }}>{r.title}<div style={{ fontSize: 10, color: "var(--text-faint)" }}>{r.artist}</div></td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{vnd(r.amount)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap", color: "var(--text-faint)" }}>{r.cashback ? `cashback ${vnd(r.cashback)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 14, borderTop: "2px solid var(--border-strong)", paddingTop: 8 }}>
        <span>Total</span><span>{vnd(total)}</span>
      </div>
    </Shell>
  );
}

// Freeze the current tab+month into a snapshot row and list every snapshot
// minted so far (copy link / open / delete = revoke).
export function SnapshotPopup({ styles, profile, defaultTitle, buildPayload, meta, onClose }) {
  const [title, setTitle] = useState(defaultTitle);
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(null);
  const [err, setErr] = useState(null);
  const preview = buildPayload();

  async function load() {
    const { data, error } = await supabase
      .from("cost_mkt_snapshots")
      .select("id, token, title, brand, month_label, funded_by, created_by, created_at")
      .eq("channel_kind", "tiktok")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) setErr(`Couldn't load snapshots (has the Round 480 SQL been run?): ${error.message}`);
    else setList(data || []);
  }
  useEffect(() => { load(); }, []);

  const urlFor = (token) => `${window.location.origin}/cost-report/${token}`;
  function copy(token) {
    navigator.clipboard?.writeText(urlFor(token)).then(() => { setCopied(token); setTimeout(() => setCopied((t) => (t === token ? null : t)), 1500); });
  }
  async function mint() {
    setBusy(true); setErr(null);
    const { data, error } = await supabase
      .from("cost_mkt_snapshots")
      .insert({ title: title.trim() || defaultTitle, funded_by: meta.fundedBy, channel_kind: "tiktok", brand: meta.brand, month_label: preview.monthLabel, payload: buildPayload(), created_by: profile?.name || null })
      .select()
      .single();
    setBusy(false);
    if (error) { setErr(`Couldn't create it: ${error.message}`); return; }
    setList((prev) => [data, ...prev]);
    copy(data.token);
  }
  async function remove(row) {
    if (!window.confirm(`Delete "${row.title}"? Its link stops working.`)) return;
    const { error } = await supabase.from("cost_mkt_snapshots").delete().eq("id", row.id);
    if (!error) setList((prev) => prev.filter((r) => r.id !== row.id));
  }

  return (
    <Shell onClose={onClose} title="❄ Freeze & share" width={680}>
      <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 0 }}>
        Copies what this tab shows right now — <strong style={{ color: "var(--text)" }}>{preview.brandLabel} · {preview.monthLabel}</strong>, {preview.rows.length} release(s), actual cost {vnd(preview.tongChiPhi)} — into a link that never changes afterwards.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input className={styles.input} style={{ flex: 1 }} value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="button" className={styles.btnPrimary} onClick={mint} disabled={busy}>{busy ? "Freezing…" : "Freeze & copy link"}</button>
      </div>
      {err && <div className={styles.errorBox} style={{ marginBottom: 10 }}>{err}</div>}
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>Snapshots</div>
      {list.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-faint)" }}>None yet.</div> : list.map((r) => (
        <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{r.title}</div>
            <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{r.month_label} · {new Date(r.created_at).toLocaleString()}{r.created_by ? ` · ${r.created_by}` : ""}</div>
          </div>
          <button type="button" className={styles.btnSecondary} style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => copy(r.token)}>{copied === r.token ? "Copied ✓" : "Copy link"}</button>
          <a href={urlFor(r.token)} target="_blank" rel="noreferrer" className={styles.btnSecondary} style={{ padding: "3px 10px", fontSize: 11, textDecoration: "none" }}>Open</a>
          <button type="button" className={styles.btnSecondary} style={{ padding: "3px 10px", fontSize: 11, color: "#e57373" }} onClick={() => remove(r)}>Delete</button>
        </div>
      ))}
    </Shell>
  );
}
