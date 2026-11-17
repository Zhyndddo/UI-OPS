"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import LoadingSkeleton from "../../../lib/LoadingSkeleton";
import { RIGHTS } from "../../../lib/rightsForm";
import styles from "../../shared.module.css";

// Round 633 — AR workstation: rights declarations sent through the public /khai-bao/<token> form.
// AR checks the answers + the Drive PDF, picks (or corrects) the product, and Confirm writes it onto the release
// (detail page "Rights declaration" block + empty Copyright-checklist fields). Reject keeps it on file.
const TABS = [["pending", "Pending"], ["confirmed", "Confirmed"], ["rejected", "Rejected"]];

async function api(path, opts = {}) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}`, ...(opts.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}
const fmt = (s) => (s ? new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "");

function Row({ row, onChanged }) {
  const [relId, setRelId] = useState(row.release_id || "");
  const [relLabel, setRelLabel] = useState(row.release ? `${row.release.title} — ${row.release.main_artist || ""} (${row.release.did || "no DID"})` : "");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => api(`/api/rights-declaration/admin?search=${encodeURIComponent(q)}`).then((j) => setHits(j.releases || [])).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q]);

  async function act(action) {
    if (busy) return;
    if (action === "confirm" && !relId) { setMsg("Pick the product first."); return; }
    setBusy(true); setMsg("");
    try { await api("/api/rights-declaration/admin", { method: "POST", body: JSON.stringify({ action, id: row.id, release_id: relId || null }) }); onChanged(); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  const pill = (on, text) => <span key={text} className={styles.statusBadge} style={{ marginRight: 4, opacity: on ? 1 : 0.35 }}>{text}</span>;
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{row.song_title}</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
            Sáng tác: {row.composer || "—"} · Trình bày: {row.performer || "—"} · Producer: {row.producer || "—"} · Mixer: {row.mixer || "—"}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "right" }}>
          {fmt(row.created_at)}<br />Người ký: {row.signer_name}
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12 }}>
        <div><b>Sở hữu:</b> {RIGHTS.map((r) => pill(!!row.owned?.[r.key], r.vi))}</div>
        <div style={{ marginTop: 4 }}><b>Được cấp phép:</b> {RIGHTS.map((r) => pill(!!row.licensed?.[r.key], r.vi))}</div>
        <div style={{ marginTop: 4 }}>
          <b>Nền tảng:</b> {row.platforms === "all" ? "Tất cả" : row.platforms === "some" ? `Một số: ${row.platforms_note || "?"}` : "—"} · <b>Thời hạn:</b> {row.term === "perpetual" ? "Vĩnh viễn" : `Có thời hạn ${row.term_note || ""}`}
        </div>
        {row.proof && <div style={{ marginTop: 4 }}><b>Minh chứng:</b> {/^https?:\/\//i.test(row.proof) ? <a href={row.proof} target="_blank" rel="noreferrer">{row.proof}</a> : row.proof}</div>}
        <div style={{ marginTop: 4 }}>{row.pdf_url ? <a href={row.pdf_url} target="_blank" rel="noreferrer">📄 Open signed PDF (Drive)</a> : <span style={{ color: "#ff9d5c" }}>No PDF stored — ask the sender for their downloaded copy</span>}</div>
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 12 }}>Product:</b>
        {relId ? <Link href={`/releases/${relId}`} className={styles.rowLink} style={{ fontSize: 12 }}>{relLabel || relId}</Link> : <span style={{ fontSize: 12, color: "var(--text-faint)" }}>not linked</span>}
        {row.status !== "confirmed" && (
          <div style={{ position: "relative" }}>
            <input className={styles.input} style={{ width: 240, padding: "4px 8px", fontSize: 12 }} placeholder="Change product — type title / DID / artist" value={q} onChange={(e) => setQ(e.target.value)} />
            {hits.length > 0 && (
              <div style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, width: 360, background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 8, maxHeight: 220, overflowY: "auto" }}>
                {hits.map((h) => (
                  <div key={h.id} style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12 }} onClick={() => { setRelId(h.id); setRelLabel(`${h.title} — ${h.main_artist || ""} (${h.did || "no DID"})`); setQ(""); setHits([]); }}>
                    {h.title} — {h.main_artist || ""} <span style={{ color: "var(--text-faint)" }}>{h.did}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {row.status === "pending" && <>
          <button className={styles.btnPrimary || styles.btnSecondary} onClick={() => act("confirm")} disabled={busy}>✓ Confirm & add to product</button>
          <button className={styles.btnSecondary} onClick={() => act("reject")} disabled={busy}>Reject</button>
        </>}
        {row.status !== "pending" && <>
          <span className={styles.statusBadge}>{row.status === "confirmed" ? `Confirmed ${fmt(row.confirmed_at)}` : `Rejected ${fmt(row.confirmed_at)}`}</span>
          {row.status === "rejected" && <button className={styles.btnSecondary} onClick={() => act("reopen")} disabled={busy}>Reopen</button>}
        </>}
        {msg && <span style={{ color: "#d13b3b", fontSize: 12 }}>{msg}</span>}
      </div>
    </div>
  );
}

export default function RightsWorkstation() {
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { setRows((await api(`/api/rights-declaration/admin?list=${tab}`)).rows || []); }
    catch (e) { setErr(e.message); setRows([]); }
    setLoading(false);
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <TypeSwitcher kind="workstation" current="rights" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title}>Rights declarations</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 14 }}>
            Sent by artists through the public form (link is on each release's detail page → Copyrights). Check the answers and the signed PDF, make sure the product is right, then Confirm — it is written onto the release (Rights declaration block, plus empty Copyright-checklist fields).
          </p>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {TABS.map(([k, label]) => <button key={k} className={styles.tabBtn} onClick={() => setTab(k)} style={{ fontWeight: tab === k ? 800 : 500, borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent" }}>{label}</button>)}
          </div>
          {err && <div style={{ color: "#d13b3b", marginBottom: 10 }}>{err}</div>}
          {loading ? <LoadingSkeleton /> : rows.length === 0 ? <div className={styles.emptyState}>Nothing {tab}.</div> : rows.map((r) => <Row key={r.id} row={r} onChanged={load} />)}
        </div>
      </div>
    </AppShell>
  );
}
