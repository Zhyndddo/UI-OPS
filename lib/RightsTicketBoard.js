"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "./AppShell";
import { supabase } from "./supabaseClient";
import TypeSwitcher from "./TypeSwitcher";
import LoadingSkeleton from "./LoadingSkeleton";
import ReleaseInfoBoard from "./ReleaseInfoBoard";
import { RIGHTS } from "./rightsForm";
import styles from "../app/shared.module.css";

// Round 645 — AR ticket board "Khai báo bản quyền" (was the Rights workstation, Round 633): rights declarations sent through the public /khai-bao/<token> form.
// AR checks the answers + the Drive PDF, picks (or corrects) the product, and Confirm writes it onto the release
// (detail page "Rights declaration" block + empty Copyright-checklist fields). Reject keeps it on file.
const TABS = [["pending", "Pending"], ["confirmed", "Confirmed"], ["rejected", "Rejected"], ["superseded", "Replaced"], ["all", "All"]];

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
  const [hist, setHist] = useState(null);
  const [lq, setLq] = useState("");
  const [lhits, setLhits] = useState([]);
  const [lmatch, setLmatch] = useState(row.info?.label_match || "");
  const songKey = row.title_key != null ? `${row.title_key}|${row.artist_key || ""}` : null;

  async function toggleHist() {
    if (hist) { setHist(null); return; }
    try { setHist(await api(`/api/rights-declaration/admin?history=${encodeURIComponent(songKey)}`)); } catch (e) { setMsg(e.message); }
  }
  async function fixHolderEmail() {
    const to = window.prompt("Email ĐÚNG của chủ sở hữu quyền (link xác nhận sẽ được gửi tới đây):", "");
    if (!to) return;
    setBusy(true); setMsg("");
    try { await api("/api/rights-declaration/admin", { method: "POST", body: JSON.stringify({ action: "fix_holder_email", id: row.id, to }) }); onChanged(); window.alert("Đã đổi email và gửi lại link xác nhận."); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  }
  async function resendLink() {
    const to = window.prompt("Gửi link khai báo tới email nào?", row.contact_email || "");
    if (!to) return;
    setBusy(true); setMsg("");
    try { await api("/api/rights-declaration/admin", { method: "POST", body: JSON.stringify({ action: "resend_link", id: row.id, to }) }); window.alert("Đã gửi lại link khai báo."); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => api(`/api/rights-declaration/admin?search=${encodeURIComponent(q)}`).then((j) => setHits(j.releases || [])).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (lq.trim().length < 2) { setLhits([]); return; }
    const t = setTimeout(() => api(`/api/rights-declaration/admin?labelsearch=${encodeURIComponent(lq)}`).then((j) => setLhits(j.labels || [])).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [lq]);
  async function pickLabel(name) {
    setBusy(true); setMsg("");
    try { const j = await api("/api/rights-declaration/admin", { method: "POST", body: JSON.stringify({ action: "map_label", id: row.id, label: name }) }); setLmatch(j.label); setLq(""); setLhits([]); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  async function act(action) {
    if (busy) return;
    if (action === "confirm" && !relId) { setMsg(lmatch ? "Chưa khớp được bài — chọn product để xác nhận (label đã khớp: " + lmatch + ")." : "Chưa khớp được bài: chọn product, hoặc ít nhất khớp label bên dưới."); return; }
    setBusy(true); setMsg("");
    try { await api("/api/rights-declaration/admin", { method: "POST", body: JSON.stringify({ action, id: row.id, release_id: relId || null }) }); onChanged(); if (action === "resend_holder") window.alert("Đã gửi lại link xác nhận tới chủ sở hữu quyền."); }
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
          {fmt(row.created_at)}<br />Người ký: {row.signer_name}{row.contact_email ? <><br />{row.contact_email}</> : null}
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12 }}>
        <div><b>Sở hữu:</b> {RIGHTS.map((r) => pill(!!row.owned?.[r.key], r.vi))}</div>
        <div style={{ marginTop: 4 }}><b>Được cấp phép:</b> {RIGHTS.map((r) => pill(!!row.licensed?.[r.key], row.licensed?.[r.key] && row.licensed_until?.[r.key] ? `${r.vi} · đến ${row.licensed_until[r.key].split("-").reverse().join("/")}` : r.vi))}</div>
        <div style={{ marginTop: 4 }}>
          <b>Nền tảng:</b> {row.platforms === "all" ? "Tất cả" : row.platforms === "some" ? `Một số: ${row.platforms_note || "?"}` : "—"} · <b>Thời hạn:</b> {row.term === "perpetual" ? "Vĩnh viễn" : `Có thời hạn ${row.term_note || ""}`}
        </div>
        {row.proof && <div style={{ marginTop: 4 }}><b>Minh chứng:</b> {/^https?:\/\//i.test(row.proof) ? <a href={row.proof} target="_blank" rel="noreferrer">{row.proof}</a> : row.proof}</div>}
        {row.verify_audit && (
          <div style={{ marginTop: 4, fontSize: 12 }}>
            <b>Xác minh email:</b> ✓ {row.verify_audit.email} · {fmt(row.verify_audit.verified_at)} · IP {row.verify_audit.ip} · {[row.verify_audit.city, row.verify_audit.country].filter(Boolean).join(", ") || "?"} · {row.verify_audit.device} / {row.verify_audit.os} / {row.verify_audit.browser}
            {row.pdf_sha256 && <> · SHA-256 PDF: <code title={row.pdf_sha256}>{row.pdf_sha256.slice(0, 12)}…</code></>}
          </div>
        )}
        {row.holder_name && (
          <div style={{ marginTop: 4 }}>
            <b>Chủ sở hữu xác nhận:</b> {row.holder_name} ({row.holder_email}){" "}
            <span className={styles.statusBadge} style={{ background: row.sign_status === "signed" ? "rgba(46,125,50,0.15)" : row.sign_status === "declined" ? "rgba(209,59,59,0.15)" : "rgba(255,167,38,0.15)" }}>
              {{ signed: "✓ Đã xác nhận", sent: "⏳ Chờ chủ sở hữu xác nhận", declined: "✕ Từ chối", not_configured: "Chưa bật e-sign", none: "—" }[row.sign_status] || row.sign_status}{row.sign_test ? " · TEST" : ""}
            </span>
            {row.signed_pdf_url && <> · <a href={row.signed_pdf_url} target="_blank" rel="noreferrer">📄 Bản đã ký (Drive)</a></>}
            {row.sign_status !== "signed" && row.sign_provider !== "dropbox" && <button className={styles.btnSecondary} style={{ marginLeft: 8, padding: "2px 8px", fontSize: 12 }} onClick={fixHolderEmail} disabled={busy}>✎ Sửa email & gửi lại</button>}
            {row.sign_status === "sent" && row.sign_provider !== "dropbox" && <button className={styles.btnSecondary} style={{ marginLeft: 8, padding: "2px 8px", fontSize: 12 }} onClick={() => act("resend_holder")} disabled={busy}>✉ Gửi lại link</button>}
            {row.holder_audit && !row.holder_audit.declined && <div style={{ fontSize: 12, marginTop: 2 }}>Gõ tên: <b>{row.holder_audit.typed_name}</b> · {fmt(row.signed_at)} · IP {row.holder_audit.ip} · {[row.holder_audit.city, row.holder_audit.country].filter(Boolean).join(", ") || "?"} · {row.holder_audit.device} / {row.holder_audit.os} / {row.holder_audit.browser}{row.holder_audit.confirm_hash && <> · hash <code title={row.holder_audit.confirm_hash}>{row.holder_audit.confirm_hash.slice(0, 12)}…</code></>}</div>}
          </div>
        )}
        {row.change_reason && <div style={{ marginTop: 4 }}><b>Lý do thay đổi:</b> {row.change_reason}</div>}
        {row.replace_reason && <div style={{ marginTop: 4 }}><b>Lý do xoá bản cũ:</b> {row.replace_reason}</div>}
        {row.status === "superseded" && <div style={{ marginTop: 4, color: "#ff9d5c" }}>Bản này đã được thay bằng khai báo mới (vẫn được lưu để đối chiếu).</div>}
        <div style={{ marginTop: 4 }}>{row.pdf_url ? <a href={row.pdf_url} target="_blank" rel="noreferrer">📄 Open signed PDF (Drive)</a> : <span style={{ color: "#ff9d5c" }}>No PDF stored — ask the sender for their downloaded copy</span>}</div>
      </div>
      {!relId && row.status !== "confirmed" && (
        <div style={{ marginTop: 10, padding: "8px 10px", border: `1px solid ${lmatch ? "var(--border)" : "#ff9d5c"}`, borderRadius: 8, fontSize: 12 }}>
          <b>Chưa khớp bài → phải khớp label:</b> khách ghi “{row.info?.label || "—"}”{" "}
          {lmatch ? <span className={styles.statusBadge} style={{ background: "rgba(46,125,50,0.15)" }}>✓ đã khớp: {lmatch}</span> : <span style={{ color: "#ff9d5c" }}>chưa khớp</span>}
          <div style={{ position: "relative", marginTop: 6 }}>
            <input className={styles.input} style={{ width: 260, padding: "4px 8px", fontSize: 12 }} placeholder="Gõ tên label trong danh sách Labels" value={lq} onChange={(e) => setLq(e.target.value)} />
            {lhits.length > 0 && (
              <div style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, width: 300, background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 8, maxHeight: 220, overflowY: "auto" }}>
                {lhits.map((n) => <div key={n} style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12 }} onClick={() => pickLabel(n)}>{n}</div>)}
              </div>
            )}
          </div>
        </div>
      )}
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
          <span className={styles.statusBadge}>{row.status === "confirmed" ? `Confirmed ${fmt(row.confirmed_at)}` : row.status === "superseded" ? "Replaced" : `Rejected ${fmt(row.confirmed_at)}`}</span>
          {row.status === "rejected" && <button className={styles.btnSecondary} onClick={() => act("reopen")} disabled={busy}>Reopen</button>}
        </>}
        <button className={styles.btnSecondary} onClick={resendLink} disabled={busy}>✉ Gửi lại link khai báo</button>
        {songKey && <button className={styles.btnSecondary} onClick={toggleHist}>{hist ? "Ẩn lịch sử" : "Lịch sử thay đổi"}</button>}
        {msg && <span style={{ color: "#d13b3b", fontSize: 12 }}>{msg}</span>}
      </div>
      {hist && (
        <div style={{ marginTop: 10, fontSize: 12, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          <b>Các phiên bản khai báo ({hist.versions.length})</b>
          {hist.versions.map((v) => <div key={v.id}>{fmt(v.created_at)} · {v.status} · {v.signer_name} · {v.contact_email || "—"}{v.change_reason ? ` · lý do: ${v.change_reason}` : ""}{v.pdf_url && <> · <a href={v.pdf_url} target="_blank" rel="noreferrer">PDF</a></>}</div>)}
          <div style={{ marginTop: 6 }}><b>Nhật ký</b></div>
          {hist.log.length === 0 ? <div style={{ color: "var(--text-faint)" }}>Chưa có.</div> : hist.log.map((l) => <div key={l.id}>{fmt(l.created_at)} · <b>{l.action}</b>{l.actor ? ` · ${l.actor}` : ""}{l.reason ? ` · "${l.reason}"` : ""}{l.ip ? ` · IP ${l.ip}` : ""}</div>)}
        </div>
      )}
    </div>
  );
}

export default function RightsTicketBoard() {
  const [view, setView] = useState("rights");   // Round 697 — "rights" | "info" (Thông tin phát hành, step 2)
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [sq, setSq] = useState("");
  useEffect(() => { const t = setTimeout(() => setSq(search.trim()), 350); return () => clearTimeout(t); }, [search]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { setRows((await api(`/api/rights-declaration/admin?list=${tab}${sq ? `&q=${encodeURIComponent(sq)}` : ""}`)).rows || []); }
    catch (e) { setErr(e.message); setRows([]); }
    setLoading(false);
  }, [tab, sq]);
  useEffect(() => { load(); }, [load]);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <TypeSwitcher kind="ticket" current="rights_declaration" />
          <div className={styles.eyebrow}>// Tickets</div>
          <h1 className={styles.title}>Khai báo bản quyền</h1>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[["rights", "Khai báo bản quyền"], ["info", "Thông tin phát hành"]].map(([k, l]) => <button key={k} className={view === k ? styles.btnPrimary || styles.btnSecondary : styles.btnSecondary} onClick={() => setView(k)}>{l}</button>)}
          </div>
          {view === "info" ? <ReleaseInfoBoard /> : <>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 14 }}>
            Sent by artists through the public form (/khai-bao). Per-release links (Copyrights tab) pre-fill the product. Check the answers and the signed PDF, make sure the product is right, then Confirm — it is written onto the release (Rights declaration block, plus empty Copyright-checklist fields).
          </p>
          <div style={{ marginBottom: 12 }}>
            <button className={styles.btnSecondary} onClick={() => { const u = `${window.location.origin}/khai-bao`; navigator.clipboard?.writeText(u).then(() => alert(`Public form link copied:\n${u}`)).catch(() => window.prompt("Copy this link", u)); }}>🔗 Copy public form link</button>
            <span style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: 8 }}>One link for everyone — blank form each time. Pick the product when you confirm.</span>
          </div>
          <input className={styles.input} style={{ maxWidth: 360, marginBottom: 10 }} placeholder="Tìm bài hát / nghệ sĩ (bỏ qua dấu, hoa thường)" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {TABS.map(([k, label]) => <button key={k} className={styles.tabBtn} onClick={() => setTab(k)} style={{ fontWeight: tab === k ? 800 : 500, borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent" }}>{label}</button>)}
          </div>
          {err && <div style={{ color: "#d13b3b", marginBottom: 10 }}>{err}</div>}
          {loading ? <LoadingSkeleton /> : rows.length === 0 ? <div className={styles.emptyState}>Không có khai báo nào{sq ? " khớp tìm kiếm" : ""}.</div> : rows.map((r) => <Row key={r.id} row={r} onChanged={load} />)}
          </>}
        </div>
      </div>
    </AppShell>
  );
}
