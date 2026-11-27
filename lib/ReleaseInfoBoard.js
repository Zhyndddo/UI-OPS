"use client";
// Round 697 — AR side of the release-info forms ("Thông tin phát hành", step 2 of /khai-bao).
//   <ReleaseInfoBoard />            list with Pending / Confirmed / Rejected tabs (shown inside the "Khai báo bản quyền" ticket page)
//   <ReleaseInfoPanel releaseId />  the same card for ONE release (release detail page tab "Hồ sơ phát hành")
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "./supabaseClient";
import LoadingSkeleton from "./LoadingSkeleton";
import { infoBlocks } from "./releaseInfoDocs";
import styles from "../app/shared.module.css";

const TABS = [["submitted", "Pending"], ["confirmed", "Confirmed"], ["rejected", "Rejected"], ["all", "All"]];
const fmt = (s) => (s ? new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "");

async function api(path, opts = {}) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}`, ...(opts.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}
const isUrl = (v) => /^https?:\/\//i.test(String(v || ""));

function Card({ row, onChanged, showRelease = true }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const a = row.answers || {};
  const rel = row.release;
  async function act(action) {
    setBusy(true); setMsg("");
    try {
      const j = await api("/api/release-info/admin", { method: "POST", body: JSON.stringify({ action, id: row.id }) });
      if (action === "confirm") setMsg((j.filled?.length ? `Đã xác nhận. Đã điền vào sản phẩm: ${j.filled.join(", ")}.` : "Đã xác nhận (các ô của sản phẩm đã có dữ liệu nên không ghi đè).") + (j.note?.length ? ` ⚠️ ${j.note.join("; ")}.` : ""));
      onChanged();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }
  // after the "03." heading: the filled-in metadata / promo / design rows
  const all = infoBlocks(a); const start = all.findIndex((b) => b.t === "h1" && b.text.startsWith("03."));
  const detail = start >= 0 ? all.slice(start + 1) : all;
  const docs = row.docs || {};
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>{a.song_title || rel?.title || "—"}</b>
        <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{a.performer || rel?.main_artist || ""}{rel?.did ? ` · ${rel.did}` : ""}</span>
        {a.sender_name && <span style={{ fontSize: 12 }}>👤 Người gửi: <b>{a.sender_name}</b>{a.contact_email ? ` · ${a.contact_email}` : ""}</span>}
        {row.source === "demo" && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 6, background: "#fff4d6", color: "#7a5b00" }}>DEMO</span>}
        <span className={styles.statusBadge}>{row.status === "submitted" ? "Pending" : row.status}</span>
        <span style={{ color: "var(--text-faint)", fontSize: 12 }}>Gửi {fmt(row.submitted_at || row.updated_at)}{row.confirmed_at ? ` · xử lý ${fmt(row.confirmed_at)}${row.confirmed_by_name ? " bởi " + row.confirmed_by_name : ""}` : ""}</span>
      </div>
      <div style={{ fontSize: 12, marginTop: 6, color: "var(--text-faint)" }}>
        Phát hành: {[a.release_date && a.release_date.split("-").reverse().join("/"), a.release_time].filter(Boolean).join(" ") || "—"} · Thể loại: {(a.genres || []).filter(Boolean).join(", ") || "—"} · Loại dự án: {a.project_kind || "—"}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, fontSize: 12 }}>
        {docs.pdf && <a href={docs.pdf} target="_blank" rel="noreferrer">📄 PDF (Drive)</a>}
        {docs.info_docx && <a href={docs.info_docx} target="_blank" rel="noreferrer">📝 Thông tin phát hành (Drive)</a>}
        {docs.metadata_docx && <a href={docs.metadata_docx} target="_blank" rel="noreferrer">📝 Metadata / Lyrics (Drive)</a>}
        {rel?.drive_link && <a href={rel.drive_link} target="_blank" rel="noreferrer">📁 Thư mục sản phẩm</a>}
        {showRelease && row.release_id && <Link href={`/releases/${row.release_id}`}>↗ Mở sản phẩm</Link>}
        {!docs.pdf && !docs.info_docx && <span style={{ color: "var(--text-faint)" }}>Chưa có file tài liệu trên Drive.</span>}
      </div>
      <div style={{ marginTop: 8 }}><button className={styles.btnSmall} onClick={() => setOpen((o) => !o)}>{open ? "Ẩn chi tiết" : "Xem chi tiết đã điền"}</button></div>
      {open && (
        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          {detail.map((b, i) => b.t === "h2" ? <div key={i} style={{ fontWeight: 800, marginTop: 8 }}>{b.text}</div>
            : b.t === "kv" ? <div key={i}><b>{b.k}:</b> {isUrl(b.v) ? <a href={b.v} target="_blank" rel="noreferrer">{b.v}</a> : b.v}</div>
            : b.t === "gap" ? null : <div key={i} style={{ color: "var(--text-faint)" }}>{b.text}</div>)}
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {row.status === "submitted" && <>
          <button className={styles.btnPrimary || styles.btnSecondary} onClick={() => act("confirm")} disabled={busy}>✓ Confirm & fill empty product fields</button>
          <button className={styles.btnSecondary} onClick={() => act("reject")} disabled={busy}>Reject</button>
        </>}
        {row.status !== "submitted" && <button className={styles.btnSecondary} onClick={() => act("reopen")} disabled={busy}>Reopen</button>}
        {msg && <span style={{ fontSize: 12, color: msg.startsWith("Đã") ? "var(--text-faint)" : "#d13b3b" }}>{msg}</span>}
      </div>
    </div>
  );
}

export default function ReleaseInfoBoard() {
  const [tab, setTab] = useState("submitted");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { setRows((await api(`/api/release-info/admin?list=${tab}${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ""}`)).rows || []); }
    catch (e) { setErr(e.message); setRows([]); }
    setLoading(false);
  }, [tab, search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 14 }}>
        Step 2 of the artist form (Thông tin phát hành): metadata, lyrics, release time, files uploaded to the product's Drive folder, PDF + Word files. Check it, then Confirm — empty product fields (genre, release date / time, composer) are filled from it; nothing already filled is overwritten.
      </p>
      <input className={styles.input} style={{ maxWidth: 360, marginBottom: 10 }} placeholder="Tìm bài hát / nghệ sĩ / DID" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map(([k, label]) => <button key={k} className={styles.tabBtn} onClick={() => setTab(k)} style={{ fontWeight: tab === k ? 800 : 500, borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent" }}>{label}</button>)}
      </div>
      {err && <div style={{ color: "#d13b3b", marginBottom: 10 }}>{err}</div>}
      {loading ? <LoadingSkeleton /> : rows.length === 0 ? <div className={styles.emptyState}>Chưa có bản nào.</div> : rows.map((r) => <Card key={r.id} row={r} onChanged={load} />)}
    </div>
  );
}

export function ReleaseInfoPanel({ releaseId }) {
  const [row, setRow] = useState(undefined);
  const [err, setErr] = useState("");
  const [linkMsg, setLinkMsg] = useState("");
  const load = useCallback(async () => {
    try { setRow((await api(`/api/release-info/admin?release=${encodeURIComponent(releaseId)}`)).row); setErr(""); }
    catch (e) { setErr(e.message); setRow(null); }
  }, [releaseId]);
  useEffect(() => { load(); }, [load]);
  async function copyLink(demo) {
    setLinkMsg("");
    try {
      const j = await api(`/api/rights-declaration/admin?link=${encodeURIComponent(releaseId)}`);
      const url = String(j.url).replace("/khai-bao/", demo ? "/khai-bao-demo/" : "/khai-bao/") + (demo ? "" : "/thong-tin");
      try { await navigator.clipboard.writeText(url); setLinkMsg(demo ? "Demo link copied." : "Step-2 link copied — send it to the artist."); } catch (e) { window.prompt("Copy this link", url); }
    } catch (e) { setLinkMsg(e.message); }
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" className={styles.btnSmall} onClick={() => copyLink(false)}>🔗 Copy artist link (view / edit release info)</button>
        <button type="button" className={styles.btnSmall} onClick={() => copyLink(true)}>🧪 Copy DEMO link</button>
        {linkMsg && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{linkMsg}</span>}
      </div>
      {err && <div style={{ color: "#d13b3b", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      {row === undefined ? <LoadingSkeleton /> : row === null ? <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Chưa có thông tin phát hành nào được gửi cho sản phẩm này.</div> : <Card row={row} onChanged={load} showRelease={false} />}
    </div>
  );
}
