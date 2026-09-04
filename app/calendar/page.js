"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, uploadPercent } from "../../lib/helpers";
import { MARKETING_CHECKLIST_FIELDS } from "../../lib/GateFields";
import styles from "../shared.module.css";

// Round 172 item 3 — new sidebar entry, per explicit request: "make me a
// new side bar item, label 'Calendar'; this is like a kanban calendar.
// taking the result from the recent 3 weeks, last-this-next for data."
// Clarified in follow-up: cards = releases, anchored to release_date.
//
// Layout: 3 columns (Last Week / This Week / Next Week, Mon–Sun), each a
// mini kanban board — releases falling in that week are grouped into
// lanes by project_type (the same field that drives the pipeline
// everywhere else in this app — see PIPELINE_STAGES in
// app/releases/[id]/page.js and lib/packageSimulator.js), lane order
// matches the real pipeline order (BRIEF & DATA → SENT TO MARKETING →
// DEALING) followed by every resolved package type alphabetically, "no
// package yet" last. Tapping a card opens that release's detail page.
const PIPELINE_ORDER = ["BRIEF & DATA", "SENT TO MARKETING", "DEALING"];
const MS_DAY = 24 * 60 * 60 * 1000;

// Round 255 item 3 — per-team completion pills, one per project card, per
// explicit request: "add the percentage of data, operation, marketing,
// legal as pill tag for each project... when hover over the pill tag, show
// the field (read only) belongs to that task." Each team's percentage is
// deliberately computed from the SAME source fields/tables the rest of the
// app already treats as that team's canonical checklist — nothing new is
// introduced, this just aggregates and displays it.
const GATE_LABELS_LOCAL = { false: "No", true: "Yes", update: "TBU" };

// The two yes/no/tbu checklists that make up "Data" — per explicit
// correction, just the checklists themselves, no Data Request fields: the
// Metadata Checklist (same 6 fields/order as META_ITEMS in
// app/releases/[id]/page.js, and the same keys metadataPercent in
// lib/helpers.js counts) plus the Marketing Checklist
// (lib/GateFields.js's MARKETING_CHECKLIST_FIELDS — Artist Info/Artist
// Photo/Project Proposal, 3 fields).
const DATA_META_FIELDS = [
  ["meta_audio", "Audio"],
  ["meta_artwork", "Artwork"],
  ["meta_working_files", "Working Files"],
  ["meta_lyric", "Lyric"],
  ["meta_mv", "MV"],
  ["meta_doc", "Metadata"],
];
const DATA_PROGRESS_FIELDS = [...DATA_META_FIELDS, ...MARKETING_CHECKLIST_FIELDS.map(([k, l]) => [k, l])];

function computeDataProgress(release) {
  const done = DATA_PROGRESS_FIELDS.filter(([k]) => release[k] === "true").length;
  const percent = Math.round((done / DATA_PROGRESS_FIELDS.length) * 100);
  const details = DATA_PROGRESS_FIELDS.map(([k, l]) => ({ label: l, value: GATE_LABELS_LOCAL[release[k] || "false"] }));
  return { percent, details };
}

// Operation — reuses lib/helpers.js's own uploadPercent() untouched so this
// can never drift from the Upload workstation's own definition of "done";
// details list mirrors that same function's field set.
function computeOperationProgress(release) {
  const percent = uploadPercent(release);
  const keys = [
    ["link_lbm", "LBM Link"],
    ["link_share", "Share Link"],
    ["smartlink", "Smartlink"],
  ];
  if (release.gate_pre_order === "true") keys.push(["link_preorder", "Pre-order Link"]);
  const details = keys.map(([k, l]) => ({ label: l, value: release[k] ? "Filled" : "Empty" }));
  return { percent, details };
}

// Marketing — package/media booking entries plus Pitching's own ticket
// completion pooled into one total, per explicit request ("by the package
// ticket booking (and the pitching, since it was share, and the other is
// already full)") — Pitching's completion counts toward Marketing here,
// not Operation (Operation already has its own self-contained metric
// above).
function computeMarketingProgress(release, joins) {
  const booking = joins.bookingByRelease[release.id] || { total: 0, done: 0 };
  const pitchRequested = release.gate_pitching === "true";
  const pitchTicket = joins.pitchingByDid[release.did];
  const total = booking.total + (pitchRequested ? 1 : 0);
  const done = booking.done + (pitchRequested && pitchTicket?.status === "COMPLETE" ? 1 : 0);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const details = [
    { label: "Booking Entries", value: booking.total ? `${booking.done}/${booking.total} done` : "None" },
    {
      label: "Pitching",
      value: !pitchRequested
        ? "Not requested"
        : pitchTicket?.status === "COMPLETE"
        ? "Complete"
        : pitchTicket
        ? `In progress (${pitchTicket.status})`
        : "Requested, no ticket yet",
    },
  ];
  return { percent, details };
}

// Legal — Phụ Lục Truyền Thông only, per explicit request ("currently just
// use the phụ lục truyền thông and every field of it is a step toward
// completion"): the ticket's own data.maPL/data.vcpmcDocQuyen, plus the 4
// release-row fields the pick-package/phụ lục flow writes onto
// releases.phu_luc_*.
function computeLegalProgress(release, joins) {
  const ticket = joins.phuLucByDid[release.did];
  const fields = [
    { label: "Mã PL", value: ticket?.data?.maPL || "" },
    { label: "VCPMC Độc Quyền", value: ticket?.data?.vcpmcDocQuyen ? "Yes" : "" },
    { label: "Giá Trị Phụ Lục", value: release.phu_luc_gia_tri || "" },
    { label: "Link Phụ Lục", value: release.link_phu_luc || "" },
    { label: "Ngày Gửi", value: release.phu_luc_ngay_gui || "" },
    { label: "Ngày Ký", value: release.phu_luc_ngay_ky || "" },
  ];
  const done = fields.filter((f) => f.value).length;
  const percent = Math.round((done / fields.length) * 100);
  const details = fields.map((f) => ({ label: f.label, value: f.value || "Not set" }));
  return { percent, details };
}

// Compact pill + hover popover — fixed-position (same clipping-safety
// convention as Booking Board's CellPopup) so it always escapes the card's
// own box regardless of where in the 3-column board the card sits.
function TeamPill({ label, percent, details }) {
  const [hoverEl, setHoverEl] = useState(null);
  const [pos, setPos] = useState(null);

  function handleEnter(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = 220;
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    setPos({ top: rect.bottom + 6, left: Math.max(8, left) });
    setHoverEl(true);
  }

  return (
    <span
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHoverEl(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: 4,
        background: "var(--bg-hover)",
        color: "var(--text-faint)",
        position: "relative",
      }}
    >
      {label} {percent}%
      {hoverEl && pos && (
        <div
          onClick={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: 220,
            zIndex: 300,
            background: "var(--bg-card)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", marginBottom: 6, textTransform: "uppercase" }}>
            {label} — {percent}%
          </div>
          {details.map((d, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>
              <span>{d.label}</span>
              <span style={{ color: "var(--text)", fontWeight: 600, textAlign: "right" }}>{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

function startOfWeek(date) {
  // Monday-anchored week, matching the app's other week-based UI (Booking
  // Board etc. all read Mon–Sun as "the week").
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function addDays(date, n) {
  return new Date(date.getTime() + n * MS_DAY);
}

function fmtRange(start, end) {
  const opts = { day: "2-digit", month: "2-digit" };
  return `${start.toLocaleDateString("vi-VN", opts)} – ${end.toLocaleDateString("vi-VN", opts)}`;
}

function laneSort(a, b) {
  const ia = PIPELINE_ORDER.indexOf(a);
  const ib = PIPELINE_ORDER.indexOf(b);
  if (a === "—" ) return 1;
  if (b === "—") return -1;
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  return a.localeCompare(b);
}

export default function CalendarPage() {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  // Round 255 item 3 — joins backing the 4 team-progress pills, keyed by
  // release id (booking) / release did (pitching + phụ lục, matching the
  // same key those tickets are stored against everywhere else in the app).
  const [teamJoins, setTeamJoins] = useState({ bookingByRelease: {}, pitchingByDid: {}, phuLucByDid: {} });

  const weeks = useMemo(() => {
    const thisStart = startOfWeek(new Date());
    return [
      { key: "last", label: "Last Week", start: addDays(thisStart, -7) },
      { key: "this", label: "This Week", start: thisStart },
      { key: "next", label: "Next Week", start: addDays(thisStart, 7) },
    ].map((w) => ({ ...w, end: addDays(w.start, 6) }));
  }, []);

  useEffect(() => {
    if (!supabase || weeks.length === 0) return;
    const rangeStart = weeks[0].start;
    const rangeEnd = addDays(weeks[weeks.length - 1].end, 1); // exclusive upper bound
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("releases")
        .select(
          "id, did, title, main_artist, project_type, release_date, release_category, " +
            "meta_audio, meta_artwork, meta_working_files, meta_lyric, meta_mv, meta_doc, " +
            "gate_artist_profile, gate_artist_photo, gate_project_proposal, " +
            "gate_pitching, gate_pre_order, " +
            "link_lbm, link_share, smartlink, link_preorder, " +
            "phu_luc_gia_tri, link_phu_luc, phu_luc_ngay_gui, phu_luc_ngay_ky"
        )
        .gte("release_date", rangeStart.toISOString().slice(0, 10))
        .lt("release_date", rangeEnd.toISOString().slice(0, 10))
        .order("release_date");
      const rows = data || [];
      setReleases(rows);
      setTeamJoins(await loadTeamJoins(rows));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same "batch-fetch just for the rows on screen" pattern as
  // app/releases/page.js's loadPageJoins (booking-percent query in
  // particular is copied verbatim from there).
  async function loadTeamJoins(rows) {
    const releaseIds = rows.map((r) => r.id);
    const dids = rows.map((r) => r.did).filter(Boolean);
    if (!supabase || releaseIds.length === 0) return { bookingByRelease: {}, pitchingByDid: {}, phuLucByDid: {} };

    const [bookingsResult, tabsResult] = await Promise.all([
      supabase.from("media_booking_entries").select("release_id, status").in("release_id", releaseIds),
      supabase.from("ticket_tabs").select("id, key").in("key", ["pitching", "phu_luc"]),
    ]);

    const bookingByRelease = {};
    (bookingsResult.data || []).forEach((b) => {
      if (!bookingByRelease[b.release_id]) bookingByRelease[b.release_id] = { total: 0, done: 0 };
      bookingByRelease[b.release_id].total++;
      if (b.status === "Done") bookingByRelease[b.release_id].done++;
    });

    const tabByKey = {};
    (tabsResult.data || []).forEach((t) => (tabByKey[t.key] = t));

    const pitchingByDid = {};
    const phuLucByDid = {};
    if (dids.length) {
      const [pitchingRes, phuLucRes] = await Promise.all([
        tabByKey.pitching
          ? supabase.from("tickets").select("status, data").eq("tab_id", tabByKey.pitching.id).is("deleted_at", null).filter("data->>releaseId", "in", `(${dids.join(",")})`)
          : Promise.resolve({ data: [] }),
        tabByKey.phu_luc
          ? supabase.from("tickets").select("data").eq("tab_id", tabByKey.phu_luc.id).is("deleted_at", null).filter("data->>releaseId", "in", `(${dids.join(",")})`)
          : Promise.resolve({ data: [] }),
      ]);
      (pitchingRes.data || []).forEach((t) => { const did = t.data?.releaseId; if (did) pitchingByDid[did] = t; });
      (phuLucRes.data || []).forEach((t) => { const did = t.data?.releaseId; if (did) phuLucByDid[did] = t; });
    }

    return { bookingByRelease, pitchingByDid, phuLucByDid };
  }

  function releasesForWeek(week) {
    return releases.filter((r) => {
      if (!r.release_date) return false;
      const d = new Date(r.release_date);
      return d >= week.start && d <= week.end;
    });
  }

  function laneGroups(weekReleases) {
    const groups = {};
    weekReleases.forEach((r) => {
      const lane = r.project_type || "—";
      if (!groups[lane]) groups[lane] = [];
      groups[lane].push(r);
    });
    return Object.keys(groups).sort(laneSort).map((lane) => ({ lane, items: groups[lane] }));
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1400 }}>
          <div className={styles.eyebrow}>// Overview</div>
          <h1 className={styles.title}>Calendar</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 24 }}>
            Releases by release date — last, this, and next week, grouped by pipeline stage.
          </p>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : (
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", overflowX: "auto" }}>
              {weeks.map((week) => {
                const weekReleases = releasesForWeek(week);
                const groups = laneGroups(weekReleases);
                return (
                  <div key={week.key} style={{ flex: "1 1 0", minWidth: 280, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: week.key === "this" ? "var(--accent)" : "var(--text)" }}>{week.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{fmtRange(week.start, week.end)} · {weekReleases.length} release{weekReleases.length === 1 ? "" : "s"}</div>
                    </div>

                    {groups.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No releases this week.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {groups.map(({ lane, items }) => (
                          <div key={lane}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
                              {lane} <span style={{ fontWeight: 400 }}>({items.length})</span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {items.map((r) => {
                                const dataP = computeDataProgress(r);
                                const opsP = computeOperationProgress(r);
                                const mktP = computeMarketingProgress(r, teamJoins);
                                const legalP = computeLegalProgress(r, teamJoins);
                                return (
                                  <Link
                                    key={r.id}
                                    href={`/releases/${r.id}`}
                                    style={{
                                      display: "block",
                                      background: "var(--bg)",
                                      border: "1px solid var(--border)",
                                      borderRadius: 6,
                                      padding: "8px 10px",
                                      textDecoration: "none",
                                      color: "var(--text)",
                                    }}
                                  >
                                    <div style={{ fontSize: 12, fontWeight: 700 }}>{r.title || "—"}</div>
                                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.main_artist || "—"}</div>
                                    <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>{fmtDate(r.release_date)} · {r.did || "—"}</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                                      <TeamPill label="Data" percent={dataP.percent} details={dataP.details} />
                                      <TeamPill label="Ops" percent={opsP.percent} details={opsP.details} />
                                      <TeamPill label="Mkt" percent={mktP.percent} details={mktP.details} />
                                      <TeamPill label="Legal" percent={legalP.percent} details={legalP.details} />
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
