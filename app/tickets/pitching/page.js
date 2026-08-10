"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import { isOpsTeam } from "../../../lib/teamTypes";
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
// per-DSP (Priority/Spotify/Apple/NCT/Zing) status editing via its popup.
//
// Round 79 — per explicit request, PIC is no longer tracked at this
// ticket-wide level at all — the Pitching Workstation's popup now assigns
// a separate PIC per platform tab instead (too coarse otherwise, once the
// work is split by platform for individual tracking). Status is also no
// longer manually settable here — it's fully computed from those same 4
// tabs (see the Workstation's computeTicketStatus()) and just displayed
// read-only, same as the requester side already saw it.
export default function PitchingTicketList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [rows, setRows] = useState([]); // { ticket, release }
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [query, setQuery] = useState(""); // round 76 — quick index search box

  const isExecutorView = !profile?.segment || isOpsTeam(profile.segment);

  useEffect(() => {
    if (!supabase) return;
    load();
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
      const { data: rels } = await supabase.from("releases").select("id, did, title, main_artist, release_date").in("did", dids);
      (rels || []).forEach((r) => (releaseMap[r.did] = r));
    }
    setRows((tickets || []).map((t) => ({ ticket: t, release: releaseMap[t.data?.releaseId] || null })));
    setLoading(false);
  }

  const visibleRows = (isExecutorView
    ? rows.filter((row) => row.ticket.status === statusFilter)
    : rows
  ).filter((row) => matchesQuery(row, query));

  const { pageRows: pagedRows, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleRows);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1000 }}>
          <TypeSwitcher kind="ticket" current="pitching" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Pitching</h1>
            </div>
          </div>
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: -8, marginBottom: 16 }}>
            Overall request status only — read-only, computed from the 4 platform tabs. PIC and the
            actual per-platform work (Priority Spotify/Spotify (S4A)/Priority Apple/Domestic) is on
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
                  <th>Request Date</th><th>Release</th><th>Requested</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(({ ticket, release }) => {
                  const color = statusColor(ticket.status);
                  const requested = ["priority", "spotify", "apple", "nct", "zing"].filter((k) => ticket.data?.[k]);
                  return (
                    <tr key={ticket.id}>
                      <td style={{ fontSize: 12 }}>{fmtDate(ticket.created_at)}</td>
                      <td style={{ fontSize: 12 }}>
                        {release ? (
                          <Link href={`/releases/${release.id}`} className={styles.rowLink}>
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
                        <span
                          className={styles.statusBadge}
                          style={{ background: color.bg, color: color.fg }}
                          title={Object.entries(ticket.status_log || {}).map(([s, ts]) => `${s}: ${fmtDate(ts)}`).join(" · ") || undefined}
                        >
                          {ticket.status}
                        </span>
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
