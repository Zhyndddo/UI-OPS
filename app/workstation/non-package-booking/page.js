"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthContext";
import { fetchAllRows } from "../../../lib/helpers";
import { nonDidRowKey, fetchNonDidProducts } from "../../../lib/nonDidProducts";
import { logAudit } from "../../../lib/auditLog";
import { TIKTOK_CHANNEL_GROUPS, TIKTOK_SUBCHANNELS, ADS_METRICS } from "../../booking/page";
import styles from "../../shared.module.css";

// Round 448 — NON-PACKAGE BOOKING workstation (Nghệ Sĩ Trả side of the Booking Board).
// Round 496 — reworked to work exactly like the package Booking Board:
//   BOOKED = the Booking Không Trong Package TICKETS' Số liệu / Số lượng (the
//            target, same role as a package line). A ticket's URL is only a
//            note telling the team which post to run.
//   ADDED  = the URLs (TikTok) / quantities (Ads) the team adds HERE, stored in
//            their own table non_package_booking_entries (sql/pending/
//            add-round496-non-package-booking-entries.sql) — NOT as tickets.
// A cell shows "added / booked"; Cost Marketing reads the same two numbers.

const NPB_CATEGORIES = ["TikTok Channel", "Ads"];
const ADS_BRANDS = Object.keys(ADS_METRICS);
// Same link-status vocabulary/order/colors as Booking Board's own
// BrandCell (app/booking/page.js's STATUS_ORDER/STATUS_COLOR) — not
// exported, so duplicated here; MUST stay in sync if that file changes.
const LINK_STATUS_OPTIONS = ["Chưa Booking", "Đã Gửi", "Done"];
const LINK_STATUS_COLORS = { "Chưa Booking": "var(--text-faint)", "Đã Gửi": "#ffca4d", "Done": "#7ee6a8" };
// Same run-status vocabulary/colors as Booking Board's own AdsCell
// (ADS_STATUS_OPTIONS/ADS_STATUS_COLORS, also not exported) — MUST stay
// in sync if that file changes.
const ADS_RUN_STATUS_OPTIONS = ["Chưa Chạy", "Đang Chạy", "Đã Chạy", "Pending"];
const ADS_RUN_STATUS_COLORS = { "Chưa Chạy": "var(--text-faint)", "Đang Chạy": "#ffca4d", "Đã Chạy": "#7ee6a8", "Pending": "#ff9d5c" };

function shortTiktokBrand(b) {
  return (b || "").replace("EXT TIKTOK - ", "").replace("TIKTOK ", "");
}

export default function NonPackageBooking() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]); // booking_not_in_package tickets = the BOOKED side
  const [entries, setEntries] = useState([]); // non_package_booking_entries = the ADDED side
  const [entriesMissing, setEntriesMissing] = useState(false);
  const [codeByName, setCodeByName] = useState({});
  const [releasesByDid, setReleasesByDid] = useState({});

  const [category, setCategory] = useState("TikTok Channel");
  const [tiktokGroup, setTiktokGroup] = useState("Partner");
  const [tiktokBrand, setTiktokBrand] = useState(TIKTOK_CHANNEL_GROUPS["Partner"][0]);
  const [adsBrand, setAdsBrand] = useState(ADS_BRANDS[0]);
  // Round 497 — "Unassigned": tickets whose Brand the executor hasn't picked yet. Read-only here
  // (adding links needs a Brand); they move into the brand tab as soon as Brand is set.
  const [unassigned, setUnassigned] = useState(false);
  const brand = unassigned ? "" : category === "TikTok Channel" ? tiktokBrand : adsBrand;
  const allAdsMetrics = [...new Set(Object.values(ADS_METRICS).flat())];
  const columns = category === "TikTok Channel" ? TIKTOK_SUBCHANNELS : unassigned ? allAdsMetrics : ADS_METRICS[adsBrand] || [];

  const [search, setSearch] = useState("");
  const [expandedCell, setExpandedCell] = useState(null); // `${rowKey}:${col}` or null

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "booking_not_in_package").maybeSingle();
    if (!tab?.id) { setLoading(false); return; }
    const [{ data: ticketRows }, entryRes, products] = await Promise.all([
      fetchAllRows(() => supabase.from("tickets").select("id, data, status, created_at, requester_name").eq("tab_id", tab.id).is("deleted_at", null).order("created_at")),
      fetchAllRows(() => supabase.from("non_package_booking_entries").select("*").order("created_at")),
      fetchNonDidProducts(),
    ]);
    const list = ticketRows || [];
    setTickets(list);
    setEntriesMissing(!!entryRes.error);
    setEntries(entryRes.data || []);
    const cmap = {};
    (products || []).forEach((p) => { cmap[p.name.trim().toLowerCase()] = p.code; });
    setCodeByName(cmap);
    const dids = [...new Set(list.map((t) => t.data?.relatedDid).filter(Boolean))];
    if (dids.length > 0) {
      const { data: rels } = await supabase.from("releases").select("id, did, title, main_artist, label").in("did", dids);
      const map = {};
      (rels || []).forEach((r) => { map[r.did] = r; });
      setReleasesByDid(map);
    } else {
      setReleasesByDid({});
    }
    setLoading(false);
  }

  // The key a ticket's row is identified by — the release DID, or for a non-DID
  // product its generated code (falls back to the name for very old tickets).
  const rowKeyOf = (t) => {
    if (t.data?.relatedDid) return t.data.relatedDid;
    const name = String(t.data?.productName || "").trim();
    if (!name) return null;
    return t.data?.nonDidCode || codeByName[name.toLowerCase()] || nonDidRowKey(name);
  };

  const liveTickets = useMemo(
    () => tickets.filter((t) => t.status !== "CANCELED" && t.status !== "REFUND" && t.data?.category === category && (t.data?.brand || "") === brand),
    [tickets, category, brand]
  );
  const unassignedCount = useMemo(
    () => tickets.filter((t) => t.status !== "CANCELED" && t.status !== "REFUND" && t.data?.category === category && !(t.data?.brand || "").trim()).length,
    [tickets, category]
  );
  const brandEntries = useMemo(
    () => entries.filter((e) => e.category === category && (e.brand || "") === brand),
    [entries, category, brand]
  );

  const rows = useMemo(() => {
    const byKey = {};
    liveTickets.forEach((t) => {
      const k = rowKeyOf(t);
      if (!k) return;
      (byKey[k] = byKey[k] || { tickets: [], entries: [] }).tickets.push(t);
    });
    brandEntries.forEach((e) => {
      (byKey[e.row_key] = byKey[e.row_key] || { tickets: [], entries: [] }).entries.push(e);
    });
    const q = search.trim().toLowerCase();
    return Object.entries(byKey)
      .map(([key, g]) => {
        const release = releasesByDid[key] || null;
        const first = g.tickets[0]?.data || {};
        const isNonDid = !release && (key.startsWith("ND-") || key.startsWith("ND:"));
        const label = release?.title || first.productName || first.tenBai || g.entries[0]?.row_label || key;
        return { key, release, tickets: g.tickets, entries: g.entries, label, isNonDid };
      })
      .filter(({ key, release, label }) => !q || key.toLowerCase().includes(q) || label.toLowerCase().includes(q) || (release?.main_artist || "").toLowerCase().includes(q))
      .sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTickets, brandEntries, releasesByDid, codeByName, search]);

  async function addEntry(row, col, payload) {
    const { data, error } = await supabase
      .from("non_package_booking_entries")
      .insert({ row_key: row.key, row_label: row.label, category, brand, hang_muc: col, created_by: profile?.id || null, ...payload })
      .select("*")
      .single();
    if (!error && data) {
      setEntries((prev) => [...prev, data]);
      logAudit({ actor: profile?.id, action: "create", entity: "npb_entry", entityId: data.id, field: category === "TikTok Channel" ? "link" : "quantity", before: null, after: String(payload.link ?? payload.quantity ?? "") });
    }
    return { data, error };
  }
  async function patchEntry(entry, patch) {
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, ...patch } : e)));
    const { error } = await supabase.from("non_package_booking_entries").update(patch).eq("id", entry.id);
    if (error) setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
    return { error };
  }
  async function deleteEntry(entry) {
    const { error } = await supabase.from("non_package_booking_entries").delete().eq("id", entry.id);
    if (!error) {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      logAudit({ actor: profile?.id, action: "delete", entity: "npb_entry", entityId: entry.id, field: entry.category === "TikTok Channel" ? "link" : "quantity", before: String(entry.link ?? entry.quantity ?? ""), after: null });
    }
    return { error };
  }
  function cycleStatus(entry) {
    const opts = entry.category === "TikTok Channel" ? LINK_STATUS_OPTIONS : ADS_RUN_STATUS_OPTIONS;
    const cur = entry.status || opts[0];
    patchEntry(entry, { status: opts[(opts.indexOf(cur) + 1) % opts.length] });
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1400 }}>
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title}>NON-PACKAGE BOOKING</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 20, maxWidth: 760 }}>
            Works like the Booking Board. Each cell shows <b>added / booked</b>: booked is the Số liệu / Số lượng on
            the Booking Không Trong Package tickets; added is the links (TikTok) or quantity (Ads) you add here. A
            ticket's URL is only a note about which post to run.
          </p>
          {entriesMissing && (
            <div className={styles.errorBox} style={{ marginBottom: 12 }}>
              The entries table isn't set up yet — run sql/pending/add-round496-non-package-booking-entries.sql. Until then adding is disabled.
            </div>
          )}

          <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
            {NPB_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => { setCategory(c); setUnassigned(false); }}
                className={`${styles.tabBtn} ${category === c ? styles.tabBtnActive : ""}`}
                style={{ border: category === c ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: category === c ? "rgba(255,107,26,0.1)" : "transparent" }}
              >
                {c}
              </button>
            ))}
          </div>

          {category === "TikTok Channel" && (
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {["Partner", "In-house"].map((g) => (
                <button
                  key={g}
                  onClick={() => { setUnassigned(false); setTiktokGroup(g); setTiktokBrand(TIKTOK_CHANNEL_GROUPS[g][0]); }}
                  className={`${styles.tabBtn} ${tiktokGroup === g ? styles.tabBtnActive : ""}`}
                  style={{ border: tiktokGroup === g ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: tiktokGroup === g ? "rgba(255,107,26,0.1)" : "transparent", fontSize: 12 }}
                >
                  {g}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
            {(category === "TikTok Channel" ? TIKTOK_CHANNEL_GROUPS[tiktokGroup] : ADS_BRANDS).map((b) => (
              <button
                key={b}
                onClick={() => { setUnassigned(false); category === "TikTok Channel" ? setTiktokBrand(b) : setAdsBrand(b); }}
                className={`${styles.tabBtn} ${!unassigned && brand === b ? styles.tabBtnActive : ""}`}
                style={{ border: !unassigned && brand === b ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: !unassigned && brand === b ? "rgba(255,107,26,0.1)" : "transparent", fontSize: 12 }}
              >
                {category === "TikTok Channel" ? shortTiktokBrand(b) : b}
              </button>
            ))}
            <button
              onClick={() => setUnassigned(true)}
              className={`${styles.tabBtn} ${unassigned ? styles.tabBtnActive : ""}`}
              title="Tickets whose Brand hasn't been picked yet"
              style={{ border: unassigned ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: unassigned ? "rgba(255,107,26,0.1)" : "transparent", fontSize: 12, marginLeft: 8 }}
            >
              Unassigned{unassignedCount > 0 ? ` (${unassignedCount})` : ""}
            </button>
          </div>

          <input
            className={styles.input}
            style={{ maxWidth: 320, marginBottom: 16 }}
            placeholder="Search DID, title, artist…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : rows.length === 0 ? (
            <div className={styles.emptyState}>
              {unassigned
                ? "No tickets waiting for a Brand."
                : <>No Booking Không Trong Package tickets with Brand {category === "TikTok Channel" ? shortTiktokBrand(brand) : brand} yet. (The executor sets Brand on the ticket list — tickets without one are under Unassigned.)</>}
            </div>
          ) : (
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Release</th>
                    {columns.map((c) => <th key={c}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td style={{ minWidth: 160 }}>
                        {row.release ? (
                          <Link href={`/releases/${row.release.id}`} className={styles.rowLink}>{row.release.title}</Link>
                        ) : (
                          <span>{row.label}</span>
                        )}
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{row.isNonDid ? `Non-DID · ${row.key}` : row.release?.main_artist || row.key}</div>
                      </td>
                      {columns.map((col) => {
                        const cellKey = `${row.key}:${col}`;
                        return (
                          <NpbCell
                            key={col}
                            category={category}
                            expanded={expandedCell === cellKey}
                            onToggle={() => setExpandedCell(expandedCell === cellKey ? null : cellKey)}
                            bookedTickets={row.tickets.filter((t) => (t.data?.hangMuc || "") === col)}
                            cellEntries={row.entries.filter((e) => (e.hang_muc || "") === col)}
                            onCycleStatus={cycleStatus}
                            onPatchEntry={patchEntry}
                            onDeleteEntry={deleteEntry}
                            disabled={entriesMissing || unassigned}
                            onAdd={(payload) => addEntry(row, col, payload)}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// One cell = booked (tickets) vs added (entries) for this row × column, shown as
// "added / booked" with a status dot — same shape as the Booking Board's cells.
function NpbCell({ category, expanded, onToggle, bookedTickets, cellEntries, onCycleStatus, onPatchEntry, onDeleteEntry, onAdd, disabled }) {
  const isTiktok = category === "TikTok Channel";
  const booked = bookedTickets.reduce((s, t) => s + (Number(t.data?.soLuong) || 0), 0);
  const added = isTiktok ? cellEntries.length : cellEntries.reduce((s, e) => s + (Number(e.quantity) || 0), 0);
  const colors = isTiktok ? LINK_STATUS_COLORS : ADS_RUN_STATUS_COLORS;
  const firstStatus = isTiktok ? LINK_STATUS_OPTIONS[0] : ADS_RUN_STATUS_OPTIONS[0];
  const allDone = cellEntries.length > 0 && cellEntries.every((e) => e.status === (isTiktok ? "Done" : "Đã Chạy"));
  const anyProgress = cellEntries.some((e) => e.status && e.status !== firstStatus);
  const dotColor = cellEntries.length === 0 ? "var(--text-faint)" : allDone ? (isTiktok ? colors.Done : colors["Đã Chạy"]) : anyProgress ? (isTiktok ? colors["Đã Gửi"] : colors["Đang Chạy"]) : colors[firstStatus];
  const summary = added === 0 && booked === 0 ? "—" : `${added}${booked > 0 ? ` / ${booked}` : ""}`;
  const over = booked > 0 && added > booked;

  return (
    <td style={{ verticalAlign: "top", minWidth: 120, position: "relative", boxShadow: expanded ? "inset 0 0 0 2px var(--accent)" : "none" }}>
      <div onClick={onToggle} style={{ cursor: "pointer", textAlign: "center", padding: "6px 4px" }} title={booked > 0 ? `added ${added} of booked ${booked}` : "no booked number on a ticket yet"}>
        <div style={{ fontSize: 13, fontWeight: 700, color: over ? "#ff9d5c" : undefined }}>{summary}</div>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, margin: "3px auto 0" }} />
      </div>
      {expanded && (
        <NpbCellPopup
          category={category}
          bookedTickets={bookedTickets}
          cellEntries={cellEntries}
          onCycleStatus={onCycleStatus}
          onPatchEntry={onPatchEntry}
          onDeleteEntry={onDeleteEntry}
          onAdd={onAdd}
          disabled={disabled}
          onClose={onToggle}
        />
      )}
    </td>
  );
}

function DeleteEntryButton({ e, confirmDelId, setConfirmDelId, onDeleteEntry, setErr }) {
  if (confirmDelId === e.id) {
    return (
      <span style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
        <button type="button" onClick={async () => { const { error } = await onDeleteEntry(e); if (error) setErr(error.message || String(error)); setConfirmDelId(null); }} style={{ background: "none", border: "none", color: "#e57373", cursor: "pointer", fontSize: 10, fontWeight: 700, padding: 0 }}>Delete?</button>
        <button type="button" onClick={() => setConfirmDelId(null)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 10, padding: 0 }}>no</button>
      </span>
    );
  }
  return (
    <button type="button" title="Delete this entry (tickets are not touched)" onClick={() => setConfirmDelId(e.id)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 12, padding: 0, flexShrink: 0 }}>🗑</button>
  );
}

function NpbCellPopup({ category, bookedTickets, cellEntries, onCycleStatus, onPatchEntry, onDeleteEntry, onAdd, disabled, onClose }) {
  const isTiktok = category === "TikTok Channel";
  const [confirmDelId, setConfirmDelId] = useState(null);
  const [newLink, setNewLink] = useState("");
  const [newQty, setNewQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleAdd() {
    setErr(null);
    if (isTiktok && !newLink.trim()) { setErr("Link is required."); return; }
    if (!isTiktok && !(Number(newQty) > 0)) { setErr("Số lượng is required."); return; }
    setSaving(true);
    const payload = isTiktok
      ? { link: newLink.trim(), status: LINK_STATUS_OPTIONS[0] }
      : { quantity: Number(newQty), status: ADS_RUN_STATUS_OPTIONS[0] };
    const { error } = await onAdd(payload);
    setSaving(false);
    if (error) { setErr(error.message || String(error)); return; }
    setNewLink("");
    setNewQty("");
  }

  // Round 483 — rendered into document.body as a centred fixed panel so the
  // table's scroll box can no longer clip it.
  if (typeof document === "undefined") return null;
  const sectionTitle = { fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", margin: "0 0 4px" };
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(0,0,0,0.5)" }} />
      <div
        onClick={(ev) => ev.stopPropagation()}
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 5001,
          width: 360, maxWidth: "92vw", background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8,
          padding: 12, boxShadow: "0 12px 36px rgba(0,0,0,0.4)", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>{isTiktok ? "Links" : "Entries"}</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 10 }}>
          <div style={sectionTitle}>Booked (from tickets)</div>
          {bookedTickets.length === 0 && <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>No ticket for this column.</div>}
          {bookedTickets.map((t) => (
            <div key={t.id} style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <b>{t.data?.soLuong || 0}</b>
                <span style={{ color: "var(--text-faint)", fontSize: 10 }}>{t.status}{t.requester_name ? ` · ${t.requester_name}` : ""}</span>
              </div>
              {t.data?.linkUrl && <a href={t.data.linkUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-muted)", fontSize: 10, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title="URL on the ticket — a note of which post to run">🔗 {t.data.linkUrl}</a>}
              {t.data?.note && <div style={{ fontSize: 10, color: "var(--text-faint)", whiteSpace: "pre-line" }}>📝 {t.data.note}</div>}
            </div>
          ))}

          <div style={{ ...sectionTitle, marginTop: 10 }}>Added (here)</div>
          {cellEntries.length === 0 && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Nothing added yet.</div>}
          {cellEntries.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
              {isTiktok ? (
                <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.link}>{e.link || "—"}</a>
              ) : (
                <input
                  type="number"
                  defaultValue={e.quantity ?? ""}
                  onBlur={(ev) => { if (ev.target.value !== String(e.quantity ?? "")) onPatchEntry(e, { quantity: ev.target.value === "" ? null : Number(ev.target.value) }); }}
                  style={{ width: 70, fontSize: 11, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", padding: "2px 4px" }}
                />
              )}
              <button
                type="button"
                onClick={() => onCycleStatus(e)}
                title="Click to cycle status"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", flex: isTiktok ? "none" : 1, textAlign: "right",
                  color: (isTiktok ? LINK_STATUS_COLORS : ADS_RUN_STATUS_COLORS)[e.status || (isTiktok ? LINK_STATUS_OPTIONS[0] : ADS_RUN_STATUS_OPTIONS[0])] }}
              >
                {e.status || (isTiktok ? LINK_STATUS_OPTIONS[0] : ADS_RUN_STATUS_OPTIONS[0])}
              </button>
              <DeleteEntryButton e={e} confirmDelId={confirmDelId} setConfirmDelId={setConfirmDelId} onDeleteEntry={onDeleteEntry} setErr={setErr} />
            </div>
          ))}
        </div>

        {err && <div style={{ fontSize: 11, color: "#e57373", marginBottom: 6 }}>{err}</div>}

        <div style={{ display: "flex", gap: 6 }}>
          {isTiktok ? (
            <input className={styles.input} style={{ fontSize: 11, flex: 1 }} placeholder="https://…" value={newLink} onChange={(ev) => setNewLink(ev.target.value)} />
          ) : (
            <input type="number" className={styles.input} style={{ fontSize: 11, width: 90 }} placeholder="Số lượng" value={newQty} onChange={(ev) => setNewQty(ev.target.value)} />
          )}
          <button type="button" className={styles.btnPrimary} style={{ fontSize: 11, padding: "4px 10px" }} onClick={handleAdd} disabled={saving || disabled}>
            {saving ? "…" : "+ Add"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
