"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthContext";
import { fetchAllRows } from "../../../lib/helpers";
import { TIKTOK_CHANNEL_GROUPS, TIKTOK_SUBCHANNELS, ADS_METRICS } from "../../booking/page";
import styles from "../../shared.module.css";

// Round 448 — new Workstation item, per explicit request: "NON-PACKAGE
// BOOKING" — Booking Board, shaped the same way (Hạng Mục tabs → brand →
// columns, a cell per release×column that can hold several entries each
// with their own status, click-to-expand editing), but reading/writing
// Booking Không Trong Package tickets (lib/ticketConfigs.js's
// booking_not_in_package) instead of media_booking_entries/packages —
// this is the Nghệ Sĩ Trả side Booking Board itself deliberately doesn't
// touch (see that type's own Round 106 comment: "not related to the
// current package ticket and booking board"). Confirmed via
// AskUserQuestion: full Booking-Board-style multi-entry-per-cell +
// per-entry status + an Add-Link-shaped popup, not a flat one-number
// grid — that's what's built below.
//
// Deliberate scope cuts vs. the real Booking Board (documented here, not
// silently dropped — see claude/round448-non-package-booking.md for the
// full writeup):
//   - No server-side pagination / booking_board_page() RPC equivalent —
//     every row here is driven by these tickets directly (fetchAllRows,
//     same pattern Cost Marketing already uses), which are expected to be
//     a small fraction of Booking Board's full release volume. Revisit if
//     this ever grows into the thousands.
//   - No Round (INT/Đợt 1/Đợt 2) filter, no CSV export, no Done/Not-Done
//     click-filter counters, no booking_channels reference-search in the
//     Add-Link popup — Booking Board's own peripheral features, not the
//     core "multiple entries, per-entry status" shape this round was
//     actually about.
//   - "Booked" is always "—": there is no package here to compare
//     against by definition (that's the whole point of "non-package").
//
// Entries live as ordinary `tickets` rows (type booking_not_in_package) —
// NOT a new table — so every entry still has a real ticket id, shows up
// in that ticket type's own list/detail pages, and keeps its audit trail.
// "Add" inserts a new ticket row directly (bypassing the full New Ticket
// form — same idea as Booking Board's own inline Add-Link popup writing
// straight to media_booking_entries). There is no delete here: nothing
// else in this app deletes a ticket from the UI (deleted_at is only ever
// set by an offline cleanup script) — getting an entry "off the board"
// means cycling it to a terminal status instead (Done, or Ads' own
// Pending/Cancel-shaped states), same as how Booking Board treats a
// locked/cancelled Ads cell.

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
  const [tabId, setTabId] = useState(null);
  const [defaultStatus, setDefaultStatus] = useState(null);
  const [tickets, setTickets] = useState([]); // every non-deleted booking_not_in_package ticket — each one is an "entry"
  const [releasesByDid, setReleasesByDid] = useState({});

  const [category, setCategory] = useState("TikTok Channel");
  const [tiktokGroup, setTiktokGroup] = useState("Partner");
  const [tiktokBrand, setTiktokBrand] = useState(TIKTOK_CHANNEL_GROUPS["Partner"][0]);
  const [adsBrand, setAdsBrand] = useState(ADS_BRANDS[0]);
  const brand = category === "TikTok Channel" ? tiktokBrand : adsBrand;
  const columns = category === "TikTok Channel" ? TIKTOK_SUBCHANNELS : ADS_METRICS[adsBrand] || [];

  const [search, setSearch] = useState("");
  const [expandedCell, setExpandedCell] = useState(null); // `${did}:${col}` or null

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: tab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "booking_not_in_package").maybeSingle();
    setTabId(tab?.id || null);
    setDefaultStatus(tab?.default_status || null);
    if (!tab?.id) { setLoading(false); return; }
    const { data: ticketRows } = await fetchAllRows(() =>
      supabase.from("tickets").select("id, data, status, created_at").eq("tab_id", tab.id).is("deleted_at", null).order("created_at")
    );
    const list = ticketRows || [];
    setTickets(list);
    const dids = [...new Set(list.map((t) => t.data?.relatedDid).filter(Boolean))];
    if (dids.length > 0) {
      const { data: rels } = await supabase.from("releases").select("id, did, title, main_artist").in("did", dids);
      const map = {};
      (rels || []).forEach((r) => { map[r.did] = r; });
      setReleasesByDid(map);
    } else {
      setReleasesByDid({});
    }
    setLoading(false);
  }

  // Entries for the current category/brand (any column) — used both to
  // decide which release rows show up, and (filtered further by column)
  // to fill each cell.
  const entriesForBrand = useMemo(
    () => tickets.filter((t) => t.data?.category === category && (t.data?.brand || "") === brand),
    [tickets, category, brand]
  );

  const rows = useMemo(() => {
    const byDid = {};
    entriesForBrand.forEach((t) => {
      const did = t.data?.relatedDid;
      if (!did) return;
      (byDid[did] = byDid[did] || []).push(t);
    });
    const q = search.trim().toLowerCase();
    return Object.entries(byDid)
      .map(([did, entries]) => {
        const release = releasesByDid[did];
        const label = release?.title || entries[0]?.data?.tenBai || did;
        return { did, release, entries, label };
      })
      .filter(({ did, release, label }) => {
        if (!q) return true;
        return did.toLowerCase().includes(q) || label.toLowerCase().includes(q) || (release?.main_artist || "").toLowerCase().includes(q);
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [entriesForBrand, releasesByDid, search]);

  async function insertEntry(payload) {
    if (!tabId) return { error: new Error("Booking Không Trong Package tab not found — did schema.sql get redeployed?") };
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        tab_id: tabId,
        data: payload,
        status: defaultStatus,
        status_log: defaultStatus ? { [defaultStatus]: new Date().toISOString() } : {},
        requester_segment: profile?.segment || null,
        requester_name: profile?.name || null,
        requester_profile_id: profile?.id || null,
      })
      .select("id, data, status, created_at")
      .single();
    if (!error && data) setTickets((prev) => [...prev, data]);
    return { data, error };
  }

  async function updateEntry(ticket, patch) {
    const nextData = { ...ticket.data, ...patch };
    setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, data: nextData } : t)));
    const { data, error } = await supabase.from("tickets").update({ data: nextData }).eq("id", ticket.id).select("id, data, status, created_at").single();
    if (!error && data) setTickets((prev) => prev.map((t) => (t.id === ticket.id ? data : t)));
    return { data, error };
  }

  function cycleLinkStatus(ticket) {
    const cur = ticket.data?.linkStatus || LINK_STATUS_OPTIONS[0];
    const next = LINK_STATUS_OPTIONS[(LINK_STATUS_OPTIONS.indexOf(cur) + 1) % LINK_STATUS_OPTIONS.length];
    updateEntry(ticket, { linkStatus: next });
  }
  function cycleAdsStatus(ticket) {
    const cur = ticket.data?.adsStatus || ADS_RUN_STATUS_OPTIONS[0];
    const next = ADS_RUN_STATUS_OPTIONS[(ADS_RUN_STATUS_OPTIONS.indexOf(cur) + 1) % ADS_RUN_STATUS_OPTIONS.length];
    updateEntry(ticket, { adsStatus: next });
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1400 }}>
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title}>NON-PACKAGE BOOKING</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 20, maxWidth: 760 }}>
            Booking Board, shaped the same way, for Booking Không Trong Package (Nghệ Sĩ Trả) — TikTok Channel and
            Ads only. Every cell is backed by real tickets of that type; opening one shows every entry and lets you
            add another.
          </p>

          <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
            {NPB_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
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
                  onClick={() => { setTiktokGroup(g); setTiktokBrand(TIKTOK_CHANNEL_GROUPS[g][0]); }}
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
                onClick={() => (category === "TikTok Channel" ? setTiktokBrand(b) : setAdsBrand(b))}
                className={`${styles.tabBtn} ${brand === b ? styles.tabBtnActive : ""}`}
                style={{ border: brand === b ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: brand === b ? "rgba(255,107,26,0.1)" : "transparent", fontSize: 12 }}
              >
                {category === "TikTok Channel" ? shortTiktokBrand(b) : b}
              </button>
            ))}
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
              No Booking Không Trong Package entries yet for {category === "TikTok Channel" ? shortTiktokBrand(brand) : brand}.
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
                  {rows.map(({ did, release, entries, label }) => (
                    <tr key={did}>
                      <td style={{ minWidth: 160 }}>
                        {release ? (
                          <Link href={`/releases/${release.id}`} className={styles.rowLink}>{release.title}</Link>
                        ) : (
                          <span>{label}</span>
                        )}
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release?.main_artist || did}</div>
                      </td>
                      {columns.map((col) => {
                        const cellKey = `${did}:${col}`;
                        const cellEntries = entries.filter((t) => (t.data?.hangMuc || "") === col);
                        return (
                          <NpbCell
                            key={col}
                            category={category}
                            expanded={expandedCell === cellKey}
                            onToggle={() => setExpandedCell(expandedCell === cellKey ? null : cellKey)}
                            cellEntries={cellEntries}
                            onCycleLinkStatus={cycleLinkStatus}
                            onCycleAdsStatus={cycleAdsStatus}
                            onUpdateEntry={updateEntry}
                            onAdd={(payload) => insertEntry({
                              relatedDid: did,
                              tenBai: release?.title || entries[0]?.data?.tenBai || "",
                              category,
                              brand,
                              hangMuc: col,
                              ...payload,
                            })}
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

// One cell = every entry (ticket) for this release × column. Shows a
// compact "count + status dot" at rest (same visual idiom Booking Board's
// own BrandCell/AdsCell use — a number plus a colored status dot), click
// to expand into a listing of every entry (click an entry's status pill
// to cycle it) plus a small inline "add another" form.
function NpbCell({ category, expanded, onToggle, cellEntries, onCycleLinkStatus, onCycleAdsStatus, onUpdateEntry, onAdd }) {
  const count = cellEntries.length;
  let dotColor = "var(--text-faint)";
  let summary = "—";
  if (category === "TikTok Channel") {
    const done = cellEntries.filter((t) => t.data?.linkStatus === "Done").length;
    const sent = cellEntries.filter((t) => t.data?.linkStatus === "Đã Gửi").length;
    dotColor = count === 0 ? "var(--text-faint)" : done === count ? LINK_STATUS_COLORS.Done : sent + done > 0 ? LINK_STATUS_COLORS["Đã Gửi"] : LINK_STATUS_COLORS["Chưa Booking"];
    summary = count > 0 ? `${done}/${count}` : "—";
  } else {
    const total = cellEntries.reduce((s, t) => s + (Number(t.data?.soLuong) || 0), 0);
    const worst = cellEntries.find((t) => t.data?.adsStatus === "Chưa Chạy") ? "Chưa Chạy" : cellEntries[0]?.data?.adsStatus;
    dotColor = count === 0 ? "var(--text-faint)" : ADS_RUN_STATUS_COLORS[worst] || "var(--text-faint)";
    summary = count > 0 ? String(total) : "—";
  }

  return (
    <td style={{ verticalAlign: "top", minWidth: 120, position: "relative", boxShadow: expanded ? "inset 0 0 0 2px var(--accent)" : "none" }}>
      <div onClick={onToggle} style={{ cursor: "pointer", textAlign: "center", padding: "6px 4px" }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{summary}</div>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, margin: "3px auto 0" }} />
      </div>
      {expanded && (
        <NpbCellPopup
          category={category}
          cellEntries={cellEntries}
          onCycleLinkStatus={onCycleLinkStatus}
          onCycleAdsStatus={onCycleAdsStatus}
          onUpdateEntry={onUpdateEntry}
          onAdd={onAdd}
          onClose={onToggle}
        />
      )}
    </td>
  );
}

function NpbCellPopup({ category, cellEntries, onCycleLinkStatus, onCycleAdsStatus, onUpdateEntry, onAdd, onClose }) {
  const [newLink, setNewLink] = useState("");
  const [newQty, setNewQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleAdd() {
    setErr(null);
    if (category === "TikTok Channel" && !newLink.trim()) { setErr("Link is required."); return; }
    if (category === "Ads" && !newQty) { setErr("Số Lượng is required."); return; }
    setSaving(true);
    const payload = category === "TikTok Channel"
      ? { linkUrl: newLink.trim(), linkStatus: LINK_STATUS_OPTIONS[0] }
      : { soLuong: newQty, adsStatus: ADS_RUN_STATUS_OPTIONS[0] };
    const { error } = await onAdd(payload);
    setSaving(false);
    if (error) { setErr(error.message || String(error)); return; }
    setNewLink("");
    setNewQty("");
  }

  // Round 483 — rendered into document.body as a centred fixed panel so the
  // table's scroll box can no longer clip it.
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(0,0,0,0.5)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 5001,
          width: 340, maxWidth: "92vw", background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8,
          padding: 12, boxShadow: "0 12px 36px rgba(0,0,0,0.4)", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>
            {category === "TikTok Channel" ? "Links" : "Entries"}
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 10 }}>
          {cellEntries.length === 0 && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Nothing here yet.</div>}
          {cellEntries.map((t) => (
            category === "TikTok Channel" ? (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <a href={t.data?.linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.data?.linkUrl}>
                  {t.data?.linkUrl || "—"}
                </a>
                <button
                  type="button"
                  onClick={() => onCycleLinkStatus(t)}
                  title="Click to cycle: Chưa Booking → Đã Gửi → Done"
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, color: LINK_STATUS_COLORS[t.data?.linkStatus || LINK_STATUS_OPTIONS[0]], whiteSpace: "nowrap" }}
                >
                  {t.data?.linkStatus || LINK_STATUS_OPTIONS[0]}
                </button>
              </div>
            ) : (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <input
                  type="number"
                  defaultValue={t.data?.soLuong ?? ""}
                  onBlur={(e) => { if (e.target.value !== String(t.data?.soLuong ?? "")) onUpdateEntry(t, { soLuong: e.target.value === "" ? null : Number(e.target.value) }); }}
                  style={{ width: 70, fontSize: 11, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", padding: "2px 4px" }}
                />
                <button
                  type="button"
                  onClick={() => onCycleAdsStatus(t)}
                  title="Click to cycle status"
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, color: ADS_RUN_STATUS_COLORS[t.data?.adsStatus || ADS_RUN_STATUS_OPTIONS[0]], flex: 1, textAlign: "right", whiteSpace: "nowrap" }}
                >
                  {t.data?.adsStatus || ADS_RUN_STATUS_OPTIONS[0]}
                </button>
              </div>
            )
          ))}
        </div>

        {err && <div style={{ fontSize: 11, color: "#e57373", marginBottom: 6 }}>{err}</div>}

        <div style={{ display: "flex", gap: 6 }}>
          {category === "TikTok Channel" ? (
            <input
              className={styles.input}
              style={{ fontSize: 11, flex: 1 }}
              placeholder="https://…"
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
            />
          ) : (
            <input
              type="number"
              className={styles.input}
              style={{ fontSize: 11, width: 90 }}
              placeholder="Số lượng"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
            />
          )}
          <button type="button" className={styles.btnPrimary} style={{ fontSize: 11, padding: "4px 10px" }} onClick={handleAdd} disabled={saving}>
            {saving ? "…" : "+ Add"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
