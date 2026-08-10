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
import SearchBox, { matchesQuery } from "../../../lib/SearchBox";
import styles from "../../shared.module.css";

// "Move Pitching to the ticket system" per explicit request — the
// `pitching` ticket already existed (auto-created at New Release creation
// when any DSP is requested — see app/releases/[id]/page.js's "Which
// pitching?" picker) and `tickets.status`/`status_log` already exist as
// real columns on every ticket type, so per the request this is genuinely
// just "add the column status" at the UI level, not new schema. This page
// is the dedicated ticket list that was previously missing entirely
// (TICKET_ROUTES.pitching fell back to /tickets if visited directly).
//
// Deliberately does NOT duplicate the Pitching Workstation
// (app/workstation/pitching/page.js) — that page still owns the rich
// per-DSP (Priority/Spotify/NCT/Zing) status editing via its popup. This
// page owns the ticket-level concerns only: overall Status (with
// timestamped history via status_log, same convention as every other
// ticket type) and PIC (tickets.pic_profile_id — the "OPS executive" seat,
// kept separate from the workstation's own workstation_assignments PIC,
// which is a different, release-level assignment used for the DSP work
// itself). AR is the requester side (dual-view, same as every other type).
export default function PitchingTicketList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [rows, setRows] = useState([]); // { ticket, release }
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [query, setQuery] = useState(""); // round 76 — quick index search box

  const isExecutorView = !profile?.segment || isOpsTeam(profile.segment);

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], "OPS"))); // round 78
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "pitching").single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data: tickets } = await supabase
      .from("tickets")
      .select("*, profiles(name)")
      .eq("tab_id", tabRow.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    const dids = [...new Set((tickets || []).map((t) => t.data?.releaseId).filter(Boolean))];
    let releaseMap = {};
    if (dids.length > 0) {
      const { data: rels } = await supabase.from("releases").select("did, title, main_artist, release_date").in("did", dids);
      (rels || []).forEach((r) => (releaseMap[r.did] = r));
    }
    setRows((tickets || []).map((t) => ({ ticket: t, release: releaseMap[t.data?.releaseId] || null })));
    setLoading(false);
  }

  async function updatePic(t, profileId) {
    const patch = { pic_profile_id: profileId || null };
    if (profileId && t.status === tab.default_status) {
      const nextStatus = tab.status_options[1];
      if (nextStatus) { patch.status = nextStatus; patch.status_log = { ...t.status_log, [nextStatus]: new Date().toISOString() }; }
    }
    const pic = profiles.find((p) => p.id === profileId);
    setRows((prev) => prev.map((row) => (row.ticket.id === t.id ? { ...row, ticket: { ...row.ticket, ...patch, profiles: pic ? { name: pic.name } : null } } : row)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  async function updateStatus(t, newStatus) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    const patch = { status: newStatus, status_log: newLog };
    setRows((prev) => prev.map((row) => (row.ticket.id === t.id ? { ...row, ticket: { ...row.ticket, ...patch } } : row)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleRows = (isExecutorView
    ? rows.filter((row) => row.ticket.status === statusFilter)
    : rows
  ).filter((row) => matchesQuery(row, query));

  const { pageRows: pagedRows, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleRows);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1100 }}>
          <TypeSwitcher kind="ticket" current="pitching" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Pitching</h1>
            </div>
          </div>
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: -8, marginBottom: 16 }}>
            Overall request status + PIC only. Per-DSP work (Priority/Spotify/NCT/Zing) is still on
            the <Link href="/workstation/pitching" className={styles.rowLink}>Pitching Workstation</Link>.
          </p>

          <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />

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
          ) : visibleRows.length === 0 ? (
            <div className={styles.emptyState}>{isExecutorView ? `No tickets with status "${statusFilter}".` : "No tickets yet."}</div>
          ) : (
            <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Request Date</th><th>Release</th><th>Requested</th><th>PIC</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(({ ticket, release }) => {
                  const color = statusColor(ticket.status);
                  const requested = ["priority", "spotify", "nct", "zing"].filter((k) => ticket.data?.[k]);
                  return (
                    <tr key={ticket.id}>
                      <td style={{ fontSize: 12 }}>{fmtDate(ticket.created_at)}</td>
                      <td style={{ fontSize: 12 }}>
                        {release ? (
                          <Link href={`/releases/${release.did}`} className={styles.rowLink}>
                            {release.title} — {release.main_artist}
                          </Link>
                        ) : (ticket.data?.releaseId || "—")}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {requested.length > 0 ? requested.map((k) => (
                          <span key={k} className={styles.pill} style={{ marginRight: 4 }}>{k}</span>
                        )) : "—"}
                      </td>
                      <td>
                        {isExecutorView ? (
                          <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: "16ch" }} value={ticket.pic_profile_id || ""} onChange={(e) => updatePic(ticket, e.target.value)}>
                            <option value="">— Unassigned —</option>
                            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12 }}>{ticket.profiles?.name || "—"}</span>
                        )}
                      </td>
                      <td>
                        {isExecutorView ? (
                          <select
                            value={ticket.status}
                            onChange={(e) => updateStatus(ticket, e.target.value)}
                            style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}
                            title={Object.entries(ticket.status_log || {}).map(([s, ts]) => `${s}: ${fmtDate(ts)}`).join(" · ") || undefined}
                          >
                            {tab?.status_options.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span
                            className={styles.statusBadge}
                            style={{ background: color.bg, color: color.fg }}
                            title={Object.entries(ticket.status_log || {}).map(([s, ts]) => `${s}: ${fmtDate(ts)}`).join(" · ") || undefined}
                          >
                            {ticket.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
