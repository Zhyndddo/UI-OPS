"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthContext";
import { isOpsTeam } from "../../../lib/teamTypes";
import { filterProfilesByTeam } from "../../../lib/workstationHelpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { GateToggle } from "../../../lib/GateFields";
import { META_ITEMS, REQUIRED_META_KEYS, missingMetaKeys } from "../../../lib/metadataChecklist";
import PicTagInput from "../../../lib/PicTagInput";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import SearchBox, { matchesQuery } from "../../../lib/SearchBox";
import { useIsMobile } from "../../../lib/useIsMobile";
import styles from "../../shared.module.css";
// Round 281 — audit log / requester attribution
import { logTicketStatusChange } from "../../../lib/auditLog";

// Round 280 — Bổ Sung DATA: OPS picks a release (app/tickets/bo-sung-data/
// new/page.js, also reachable from a button on the New Release Setup
// workstation row), AR works through whichever of the release's 6
// Metadata Checklist fields aren't resolved yet — SAME columns the release
// detail page's own Metadata Checklist reads/writes (lib/metadataChecklist.js),
// not a separate copy. This list is a thin lens onto those columns per
// release, plus a status that the app flips to COMPLETE automatically —
// there's no manual status workflow here at all.
//
// "Resolved" (see lib/metadataChecklist.js): the 4 required fields
// (Audio/Artwork/Lyric/Metadata) at Yes; the other 2 (Working Files/MV) at
// EITHER Yes or No (not TBU/blank) — matches the release page's own Send
// Upload gate. A ticket auto-completes the moment every field on its
// release reaches that state, checked fresh on every load — so it also
// self-corrects if the data got filled in from the release detail page
// directly, not through this ticket at all, and reopens (stays/returns to
// PENDING) if a required field ever gets walked back off Yes.
export default function BoSungDataList() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [releaseMap, setReleaseMap] = useState({}); // did -> release row (title/artist/label + the 6 meta_* columns)
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [query, setQuery] = useState("");

  const isExecutorView = !profile?.segment || profile.segment === "AR";

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], "AR")));
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "bo_sung_data").single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);

    const { data: rows } = await supabase.from("tickets").select("*, profiles!tickets_pic_profile_id_fkey(name)").eq("tab_id", tabRow.id).is("deleted_at", null).order("created_at", { ascending: false });
    const ticketRows = rows || [];

    const dids = [...new Set(ticketRows.map((t) => t.data?.releaseId).filter(Boolean))];
    let relMap = {};
    if (dids.length > 0) {
      const { data: rels } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, label, meta_audio, meta_artwork, meta_working_files, meta_lyric, meta_mv, meta_doc")
        .in("did", dids);
      (rels || []).forEach((r) => (relMap[r.did] = r));
    }
    setReleaseMap(relMap);

    // Reconciliation pass — a PENDING ticket whose release now has every
    // field resolved auto-completes right here, regardless of whether the
    // last field got filled in through this page or the release detail
    // page directly. Runs on every load, not just when this page made the
    // edit — see the header comment.
    const toComplete = ticketRows.filter((t) => t.status !== "COMPLETE" && missingMetaKeys(relMap[t.data?.releaseId]).length === 0);
    if (toComplete.length > 0) {
      const now = new Date().toISOString();
      await Promise.all(toComplete.map((t) =>
        supabase.from("tickets").update({ status: "COMPLETE", status_log: { ...t.status_log, COMPLETE: now } }).eq("id", t.id)
      ));
      // Round 281 — audit log / requester attribution. This is a bulk
      // page-load reconciliation, not a single click — attributed to the
      // viewing AR member whose page load caused it to run, per the
      // judgment call in the round's design doc.
      toComplete.forEach((t) => logTicketStatusChange({ actor: profile?.id, ticketId: t.id, prevStatus: t.status, newStatus: "COMPLETE", statusOptions: ["PENDING", "COMPLETE"] }));
      const doneIds = new Set(toComplete.map((t) => t.id));
      ticketRows.forEach((t) => { if (doneIds.has(t.id)) { t.status = "COMPLETE"; t.status_log = { ...t.status_log, COMPLETE: now }; } });
    }

    setTickets(ticketRows);
    setLoading(false);
  }

  // A field changing on the ticket's own release — writes straight to the
  // releases table (the real source of truth) and immediately re-checks
  // this ticket's completeness against the fresh value, same as the
  // reconciliation pass above but scoped to just the one row that changed
  // so it doesn't need a full reload.
  async function updateMetaField(t, key, value) {
    const release = releaseMap[t.data?.releaseId];
    if (!release) return;
    const nextRelease = { ...release, [key]: value };
    setReleaseMap((prev) => ({ ...prev, [release.did]: nextRelease }));
    await supabase.from("releases").update({ [key]: value }).eq("id", release.id);

    if (missingMetaKeys(nextRelease).length === 0 && t.status !== "COMPLETE") {
      const now = new Date().toISOString();
      const patch = { status: "COMPLETE", status_log: { ...t.status_log, COMPLETE: now } };
      setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
      await supabase.from("tickets").update(patch).eq("id", t.id);
      // Round 281 — audit log / requester attribution
      logTicketStatusChange({ actor: profile?.id, ticketId: t.id, prevStatus: t.status, newStatus: "COMPLETE", statusOptions: ["PENDING", "COMPLETE"] });
    } else if (missingMetaKeys(nextRelease).length > 0 && t.status === "COMPLETE") {
      // A required field got walked back off Yes after the ticket had
      // already completed — reopens it rather than leaving a stale
      // "COMPLETE" badge on a release that's missing data again.
      const patch = { status: "PENDING" };
      setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
      await supabase.from("tickets").update(patch).eq("id", t.id);
      // Round 281 — audit log / requester attribution
      logTicketStatusChange({ actor: profile?.id, ticketId: t.id, prevStatus: "COMPLETE", newStatus: "PENDING", statusOptions: ["PENDING", "COMPLETE"] });
    }
  }

  async function updatePics(t, ids) {
    const patch = { pic_profile_ids: ids.length > 0 ? ids : null, pic_profile_id: ids[0] || null };
    const firstPic = profiles.find((p) => p.id === ids[0]);
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch, profiles: firstPic ? { name: firstPic.name } : null } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = (isExecutorView ? tickets.filter((t) => t.status === statusFilter) : tickets).filter((t) => matchesQuery(t, query));
  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1400 }}>
          <TypeSwitcher kind="ticket" current="bo_sung_data" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Bổ Sung DATA</h1>
            </div>
            <Link href="/tickets/bo-sung-data/new" className={styles.btnPrimary}>+ New Ticket</Link>
          </div>

          <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />

          {isExecutorView && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
              {tab?.status_options.map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`${styles.tabBtn} ${statusFilter === s ? styles.tabBtnActive : ""}`} style={{ border: statusFilter === s ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: statusFilter === s ? "rgba(255,107,26,0.1)" : "transparent" }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : visibleTickets.length === 0 ? (
            <div className={styles.emptyState}>{isExecutorView ? `No ${statusFilter.toLowerCase()} tickets.` : "No tickets yet."}</div>
          ) : isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pagedTickets.map((t) => (
                <BoSungDataRow key={t.id} mobile ticket={t} release={releaseMap[t.data?.releaseId]} profiles={profiles} isExecutorView={isExecutorView} onUpdateMetaField={updateMetaField} onUpdatePics={updatePics} />
              ))}
            </div>
          ) : (
            <>
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th style={{ minWidth: 220 }}>Release</th>
                  <th style={{ minWidth: 340 }}>{isExecutorView ? "Metadata Checklist" : "Missing Data"}</th>
                  <th style={{ minWidth: 160 }}>PIC</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedTickets.map((t, i) => (
                  <BoSungDataRow key={t.id} index={(page - 1) * pageSize + i} ticket={t} release={releaseMap[t.data?.releaseId]} profiles={profiles} isExecutorView={isExecutorView} onUpdateMetaField={updateMetaField} onUpdatePics={updatePics} />
                ))}
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

const fieldLabelStyle = { fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 4 };

function BoSungDataRow({ ticket, release, profiles, isExecutorView, onUpdateMetaField, onUpdatePics, mobile = false, index }) {
  const missing = missingMetaKeys(release);
  const picIds = ticket.pic_profile_ids || (ticket.pic_profile_id ? [ticket.pic_profile_id] : []);
  const picNames = picIds.map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean);

  const releaseBody = release ? (
    <div style={{ fontSize: 12 }}>
      <div style={{ fontWeight: 700 }}>{release.title}</div>
      <div style={{ color: "var(--text-faint)" }}>{release.main_artist} · {release.label || "—"}</div>
      <Link href={`/releases/${release.id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open release →</Link>
    </div>
  ) : (
    <span style={{ color: "var(--text-faint)", fontSize: 12 }}>Release not found ({ticket.data?.releaseId})</span>
  );

  // AR (executor) side gets the full interactive checklist — same
  // Yes/No/TBU toggle the release detail page's own Metadata Checklist
  // uses, writing straight back to the same columns. OPS (requester) side
  // is read-only: just which fields are still outstanding, as tags.
  const checklistBody = isExecutorView ? (
    <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
      {META_ITEMS.map((m) => {
        const isRequired = REQUIRED_META_KEYS.includes(m.key);
        return (
          <div key={m.key}>
            <div style={fieldLabelStyle}>{m.label}{isRequired ? " *" : ""}</div>
            <GateToggle value={release?.[m.key] || "false"} onChange={(v) => onUpdateMetaField(ticket, m.key, v)} />
          </div>
        );
      })}
    </div>
  ) : (
    missing.length === 0 ? (
      <span style={{ fontSize: 12, color: "var(--success-fg)" }}>✓ All done</span>
    ) : (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {missing.map((key) => (
          <span key={key} className={styles.pill} style={{ borderColor: "var(--error-fg)", color: "var(--error-fg)" }}>
            {META_ITEMS.find((m) => m.key === key)?.label}
          </span>
        ))}
      </div>
    )
  );

  const picBody = isExecutorView ? (
    <PicTagInput styles={styles} value={picIds} onChange={(ids) => onUpdatePics(ticket, ids)} profiles={profiles} />
  ) : (
    <span style={{ fontSize: 12 }}>{picNames.length > 0 ? picNames.join(", ") : "—"}</span>
  );

  const statusBody = (
    <span className={styles.statusBadge} style={ticket.status === "COMPLETE" ? { background: "var(--success-bg)", color: "var(--success-fg)" } : undefined}>
      {ticket.status}
    </span>
  );

  if (mobile) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: "var(--bg-card)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          {releaseBody}
          {statusBody}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={fieldLabelStyle}>{isExecutorView ? "Metadata Checklist" : "Missing Data"}</div>
          {checklistBody}
        </div>
        <div>
          <div style={fieldLabelStyle}>PIC</div>
          {picBody}
        </div>
      </div>
    );
  }

  return (
    <tr>
      <td>{index + 1}</td>
      <td style={{ verticalAlign: "top" }}>{releaseBody}</td>
      <td style={{ verticalAlign: "top" }}>{checklistBody}</td>
      <td style={{ verticalAlign: "top" }}>{picBody}</td>
      <td style={{ verticalAlign: "top" }}>{statusBody}</td>
    </tr>
  );
}
