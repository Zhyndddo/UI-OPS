"use client";

import { useEffect, useState } from "react";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import { isOpsTeam } from "../../../lib/teamTypes";
import { filterProfilesByTeam } from "../../../lib/workstationHelpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import { statusNeedsNote, withStatusNote } from "../../../lib/statusNoteGate";
import { requestTypeLabel, isLegacyTicket } from "../../../lib/artistProfileRequestTypes";
import NewArtistProfileTicketPopup from "../../../lib/NewArtistProfileTicketPopup";
import ArtistProfileEditPopup from "../../../lib/ArtistProfileEditPopup";
import styles from "../../shared.module.css";

// Round 172 — bespoke (not the generic TicketListPage), same reason as
// before (see git history pre-this-round): request-type-dependent fields,
// a computed/view-only field, a Note column. This round replaced the wide
// always-scrolling table with a mobile-friendly card list — tapping a card
// opens ArtistProfileEditPopup with the exact same fields the table cells
// used to hold — and "+ New Ticket" now opens NewArtistProfileTicketPopup
// right here instead of navigating to a separate /new page. Per explicit
// request ("apply the pop up choice for the detail request tick as we
// discuss").
export default function ArtistProfileTicketList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [links, setLinks] = useState({ spotify: "", apple: "" });
  const [showNewPopup, setShowNewPopup] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const isExecutorView = !profile?.segment || isOpsTeam(profile.segment);

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], "OPS"))); // round 78
    supabase.from("app_settings").select("value").eq("key", "artist_profile_links").maybeSingle().then(({ data }) => {
      setLinks({ spotify: data?.value?.spotify || "", apple: data?.value?.apple || "" });
    });
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "artist_profile").single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data: tix } = await supabase
      .from("tickets")
      .select("*, profiles(name)")
      .eq("tab_id", tabRow.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setTickets(tix || []);
    setLoading(false);
  }

  async function updateTicketData(t, patch) {
    const newData = { ...t.data, ...patch };
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, data: newData } : x)));
    await supabase.from("tickets").update({ data: newData }).eq("id", t.id);
  }

  async function updatePic(t, profileId) {
    const patch = { pic_profile_id: profileId || null };
    if (profileId && t.status === tab.default_status) {
      const nextStatus = tab.status_options[1];
      if (nextStatus) { patch.status = nextStatus; patch.status_log = { ...t.status_log, [nextStatus]: new Date().toISOString() }; }
    }
    const pic = profiles.find((p) => p.id === profileId);
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch, profiles: pic ? { name: pic.name } : null } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  async function updateStatus(t, newStatus) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    const patch = { status: newStatus, status_log: newLog };
    // Round 80 — refund/cancel-like moves require a short reason, folded
    // into ticket.data.note (see lib/statusNoteGate.js).
    if (statusNeedsNote(newStatus)) {
      const newData = withStatusNote(t.data, newStatus);
      if (!newData) return; // cancelled / no reason given — abort the change
      patch.data = newData;
    }
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = isExecutorView ? tickets.filter((t) => t.status === statusFilter) : tickets;
  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);
  const editingTicket = editingId ? tickets.find((t) => t.id === editingId) || null : null;

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 900 }}>
          <TypeSwitcher kind="ticket" current="artist_profile" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Artist Profile</h1>
            </div>
            <button type="button" className={styles.btnPrimary} onClick={() => setShowNewPopup(true)}>+ New Ticket</button>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {links.spotify && (
              <a href={links.spotify} target="_blank" rel="noopener noreferrer" className={styles.btnSmall}>
                Spotify for Artists
              </a>
            )}
            {links.apple && (
              <a href={links.apple} target="_blank" rel="noopener noreferrer" className={styles.btnSmall}>
                Apple Music for Artists
              </a>
            )}
          </div>

          {isExecutorView && tab && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
              {tab.status_options.map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`${styles.tabBtn} ${statusFilter === s ? styles.tabBtnActive : ""}`} style={{ border: statusFilter === s ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: statusFilter === s ? "rgba(255,107,26,0.1)" : "transparent" }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : visibleTickets.length === 0 ? (
            <div className={styles.emptyState}>{isExecutorView ? `No tickets with status "${statusFilter}".` : "No tickets yet."}</div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pagedTickets.map((t) => {
                  const color = statusColor(t.status);
                  const legacy = isLegacyTicket(t);
                  const requestType = legacy ? null : t.data.requestType;
                  const artistLabel = !legacy && requestType === "transfer"
                    ? [t.data?.oldStageName, t.data?.newStageName].filter(Boolean).join(" → ") || "—"
                    : t.data?.artistName || "—";
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setEditingId(t.id)}
                      style={{
                        textAlign: "left",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "12px 14px",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          {artistLabel}
                          {legacy && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-faint)", fontWeight: 400 }}>(legacy)</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          {legacy ? "NEW Profile" : requestTypeLabel(requestType)} · {t.data?.platform || "—"}
                          {t.deadline && <> · Due {fmtDate(t.deadline)}</>}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          PIC: {t.profiles?.name || "— Unassigned —"}
                        </div>
                      </div>
                      <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg, flexShrink: 0 }}>{t.status}</span>
                    </button>
                  );
                })}
              </div>
              <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
            </>
          )}
        </div>
      </div>

      {showNewPopup && (
        <NewArtistProfileTicketPopup
          styles={styles}
          profile={profile}
          onClose={() => setShowNewPopup(false)}
          onCreated={(created) => {
            setTickets((prev) => [created, ...prev]);
            setShowNewPopup(false);
          }}
        />
      )}

      {editingTicket && (
        <ArtistProfileEditPopup
          styles={styles}
          ticket={editingTicket}
          tab={tab}
          profiles={profiles}
          isExecutorView={isExecutorView}
          onUpdateData={(patch) => updateTicketData(editingTicket, patch)}
          onUpdatePic={(profileId) => updatePic(editingTicket, profileId)}
          onUpdateStatus={(newStatus) => updateStatus(editingTicket, newStatus)}
          onClose={() => setEditingId(null)}
        />
      )}
    </AppShell>
  );
}
