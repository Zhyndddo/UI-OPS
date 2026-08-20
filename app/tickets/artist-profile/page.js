"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { REQUEST_TYPES, requestTypeLabel, fieldsForType, platformOptionsForType, ALL_PLATFORMS, isLegacyTicket } from "../../../lib/artistProfileRequestTypes";
import styles from "../../shared.module.css";

// Bespoke (not the generic TicketListPage) per explicit request — the
// generic engine only ever shows the first 4 config.fields as columns and
// has no concept of a view-only field, neither of which works once this
// type needs a computed/view-only column, a Note column, and (Round 166)
// a request-type-dependent field set. Round 166 — was one flat shape
// (Tên Nghệ Sĩ/Email/Spotify+Apple+Facebook URL/"set up on which
// platforms" checkboxes); now 7 request types across up to 7 platforms,
// each with its own extra fields (see lib/artistProfileRequestTypes.js,
// the single source of truth this page and the creation form both read).
// Columns stay fixed regardless of type — Loại Yêu Cầu, Nền Tảng, Nghệ
// Sĩ/Nghệ Danh, then a "Chi Tiết" column holding whatever OTHER fields
// that specific request type needs (stacked small inputs, same compact
// idiom the old platform-checkbox column already used) — rather than the
// table growing/shrinking columns per row, which HTML tables can't do
// sanely.
//
// Legacy tickets (created before this round, either via the old manual
// form or still via the release detail page's "Artist Profile Verify"
// gate — that auto-creation flow is UNCHANGED this round, see
// lib/artistProfileRequestTypes.js's file header) have no
// data.requestType. isLegacyTicket() flags them; Chi Tiết falls back to
// their old field set (Email/Bài Hát Phát Hành Gần Nhất/Spotify/Apple/
// Facebook URL) instead of a type it was never given, so nothing already
// in the DB goes blank or breaks.
export default function ArtistProfileTicketList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [links, setLinks] = useState({ spotify: "", apple: "" });

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

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1500 }}>
          <TypeSwitcher kind="ticket" current="artist_profile" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Artist Profile</h1>
            </div>
            <Link href="/tickets/artist-profile/new" className={styles.btnPrimary}>+ New Ticket</Link>
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
                <button key={s} onClick={() => setStatusFilter(s)} className={`${styles.tabBtn} ${statusFilter === s ? styles.tabBtnActive : ""}`} style={{ border: "1px solid var(--border)", borderRadius: 6 }}>
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
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ minWidth: 1400 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 130 }}>Loại Yêu Cầu</th>
                  <th style={{ minWidth: 110 }}>Nền Tảng</th>
                  <th style={{ minWidth: 160 }}>Nghệ Sĩ / Nghệ Danh</th>
                  <th style={{ minWidth: 240 }}>Chi Tiết</th>
                  <th style={{ minWidth: 140 }}>Note</th>
                  <th>PIC</th>
                  <th>Deadline</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedTickets.map((t) => {
                  const color = statusColor(t.status);
                  const legacy = isLegacyTicket(t);
                  const requestType = legacy ? null : t.data.requestType;
                  const platformOptions = legacy ? ALL_PLATFORMS : platformOptionsForType(requestType);
                  return (
                    <tr key={t.id}>
                      <td style={{ fontSize: 12 }}>
                        {legacy ? (
                          <span title="Created before request types existed — treated as NEW Profile for display." style={{ color: "var(--text-faint)" }}>
                            NEW Profile <span style={{ fontSize: 10 }}>(legacy)</span>
                          </span>
                        ) : (
                          requestTypeLabel(requestType)
                        )}
                      </td>
                      <td>
                        <select
                          className={styles.select}
                          style={{ minWidth: 100, fontSize: 12 }}
                          value={t.data?.platform || ""}
                          onChange={(e) => updateTicketData(t, { platform: e.target.value })}
                        >
                          <option value="">—</option>
                          {platformOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                        </select>
                      </td>
                      <td>
                        {!legacy && requestType === "transfer" ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 160 }} placeholder="Nghệ danh cũ" defaultValue={t.data?.oldStageName || ""} onBlur={(e) => updateTicketData(t, { oldStageName: e.target.value })} />
                            <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 160 }} placeholder="Nghệ danh mới" defaultValue={t.data?.newStageName || ""} onBlur={(e) => updateTicketData(t, { newStageName: e.target.value })} />
                          </div>
                        ) : (
                          <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 180 }} defaultValue={t.data?.artistName || ""} onBlur={(e) => updateTicketData(t, { artistName: e.target.value })} />
                        )}
                      </td>
                      <td>
                        <DetailCell ticket={t} legacy={legacy} requestType={requestType} onUpdate={(patch) => updateTicketData(t, patch)} />
                      </td>
                      <td>
                        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 180 }} defaultValue={t.data?.note || ""} onBlur={(e) => updateTicketData(t, { note: e.target.value })} />
                      </td>
                      <td>
                        {isExecutorView ? (
                          <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: "16ch" }} value={t.pic_profile_id || ""} onChange={(e) => updatePic(t, e.target.value)}>
                            <option value="">— Unassigned —</option>
                            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12 }}>{t.profiles?.name || "—"}</span>
                        )}
                      </td>
                      <td>{fmtDate(t.deadline)}</td>
                      <td title={t.data?.note || undefined}>
                        {isExecutorView ? (
                          <select value={t.status} onChange={(e) => updateStatus(t, e.target.value)} style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
                            {tab?.status_options.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{t.status}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// The Chi Tiết column — every field that request type needs, OTHER than
// platform (its own column) and the artist-name-shaped field(s) (also
// their own column, since Transfer needs 2 of those instead of 1). Each
// field renders as a small labeled input, stacked, same compact idiom the
// old platform-checkbox column used. "latestSong" (NEW only) stays
// view-only here, same as it always was — "computed, not an input field"
// per the original explicit request that hasn't changed.
function DetailCell({ ticket, legacy, requestType, onUpdate }) {
  if (legacy) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <input className={styles.input} style={{ padding: "3px 6px", fontSize: 11 }} placeholder="Email" defaultValue={ticket.data?.email || ""} onBlur={(e) => onUpdate({ email: e.target.value })} />
        <div style={{ fontSize: 10, color: "var(--text-faint)" }}>Bài gần nhất: {ticket.data?.latestSong || "—"}</div>
        <input className={styles.input} style={{ padding: "3px 6px", fontSize: 11 }} placeholder="Spotify URL" defaultValue={ticket.data?.spotifyUrl || ""} onBlur={(e) => onUpdate({ spotifyUrl: e.target.value })} />
        <input className={styles.input} style={{ padding: "3px 6px", fontSize: 11 }} placeholder="Apple URL" defaultValue={ticket.data?.appleUrl || ""} onBlur={(e) => onUpdate({ appleUrl: e.target.value })} />
        <input className={styles.input} style={{ padding: "3px 6px", fontSize: 11 }} placeholder="Facebook URL" defaultValue={ticket.data?.fbUrl || ""} onBlur={(e) => onUpdate({ fbUrl: e.target.value })} />
      </div>
    );
  }

  const fields = fieldsForType(requestType).filter((f) => f.key !== "artistName" && f.key !== "oldStageName" && f.key !== "newStageName");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {fields.map((f) => {
        if (f.key === "latestSong") {
          return <div key={f.key} style={{ fontSize: 10, color: "var(--text-faint)" }}>Bài gần nhất: {ticket.data?.latestSong || "—"}</div>;
        }
        if (f.type === "select") {
          return (
            <select key={f.key} className={styles.select} style={{ padding: "3px 6px", fontSize: 11 }} value={ticket.data?.[f.key] || ""} onChange={(e) => onUpdate({ [f.key]: e.target.value })}>
              {(f.options || ["", "Yes", "No"]).map((o) => <option key={o} value={o}>{o || f.label}</option>)}
            </select>
          );
        }
        if (f.multiline) {
          return (
            <textarea
              key={f.key}
              className={styles.textarea}
              style={{ padding: "3px 6px", fontSize: 11, minHeight: 44 }}
              placeholder={f.label}
              defaultValue={ticket.data?.[f.key] || ""}
              onBlur={(e) => onUpdate({ [f.key]: e.target.value })}
            />
          );
        }
        return (
          <input
            key={f.key}
            className={styles.input}
            style={{ padding: "3px 6px", fontSize: 11 }}
            placeholder={f.label}
            defaultValue={ticket.data?.[f.key] || ""}
            onBlur={(e) => onUpdate({ [f.key]: e.target.value })}
          />
        );
      })}
    </div>
  );
}
