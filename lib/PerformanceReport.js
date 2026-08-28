"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "./supabaseClient";
import { fmtDate } from "./helpers";

// Round 222 — shared rollup logic + presentational view for the
// Performance report, used by BOTH the admin-only "Performance" tab on
// /report (app/report/page.js) and the public, no-login, temporary
// (72h) share link (app/performance-report/[token]/page.js) — one
// implementation so the two can never drift, per the "the public link
// re-runs the same live query" design (see
// add-round222-performance-share-links.sql's comment).
//
// Two modes:
//   - "artist": every release where the given name appears in
//     main_artist_tags (the collab-safe array column), OR — for legacy
//     rows predating that column — a plain case-insensitive match on
//     main_artist. Feature-artist credits are deliberately NOT pulled
//     in: "their own catalog" reads as main-artist releases only, per
//     explicit decision (a feature credit's cost/package belongs to
//     the main artist, not the featured one).
//   - "song": exactly one release, by id.
//
// "Best song"/"best rank" is decided by the lowest (best) rank ever
// recorded in milestone_chart_entries — the only real numeric
// performance data in this app (streaming numbers are free-text per
// platform, not reliably comparable — see release_stream_metrics
// below). Milestone entries are matched by DID where the release has
// one (the reliable path), falling back to a plain artist-name/
// track-title match for entries that were never DID-autofilled.

export function fmtVnd(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

const RELEASE_FIELDS = "id, did, title, main_artist, main_artist_tags, package_total_value, release_date, project_type, status";

// Every distinct artist name this app knows about, for the admin tab's
// artist picker — pulled from main_artist_tags (preferred) with a
// main_artist fallback for any release that predates that column, so
// the picker never offers a name nothing will actually match.
export async function fetchDistinctArtists() {
  if (!supabase) return [];
  const { data } = await supabase.from("releases").select("main_artist, main_artist_tags");
  const names = new Set();
  (data || []).forEach((r) => {
    if (Array.isArray(r.main_artist_tags) && r.main_artist_tags.length > 0) {
      r.main_artist_tags.forEach((t) => t && names.add(t));
    } else if (r.main_artist) {
      names.add(r.main_artist);
    }
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}

// Round 225 — collapses the raw dated log entries down to one row per
// (chart, song) — its best-ever rank — same rule now applied to the
// Milestone workstation's Log tab once a filter narrows it to a specific
// song (see app/workstation/milestone/page.js's LogTable). Each
// collapsed row also carries `streak`: the current consecutive-calendar-
// day run on that chart, counted backward from its most recent logged
// date (not necessarily all the way to literal "today" — a chart that
// simply hasn't been re-logged yet today still reports its real run as
// of its last check, rather than reading 0 just because today's entry
// isn't in the sheet yet). Per explicit request/decision: this is a
// "current run" streak, so it resets to 0 the moment a day is skipped —
// not a running total of every day it's ever charted.
function collapseToStreakBestRank(rawEntries) {
  const byChartSong = new Map();
  rawEntries.forEach((e) => {
    const key = `${e.chart}::${e.track_title}::${e.artist || ""}`;
    if (!byChartSong.has(key)) byChartSong.set(key, []);
    byChartSong.get(key).push(e);
  });

  const collapsed = [...byChartSong.values()].map((group) => {
    const best = group.reduce((a, b) => (b.rank < a.rank ? b : a));
    const dates = [...new Set(group.map((e) => e.entry_date))].sort();
    let streak = dates.length > 0 ? 1 : 0;
    for (let i = dates.length - 1; i > 0; i--) {
      const diffDays = Math.round((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000);
      if (diffDays === 1) streak++;
      else break;
    }
    return { ...best, streak };
  });

  return collapsed.sort((a, b) => a.rank - b.rank);
}

// Round 226 — the workstation's own PLATFORM_CHARTS (app/workstation/
// milestone/page.js) always saves every Apple-family chart ("Apple Music
// - Top Songs Vietnam", "Vietnam iTunes Top Songs", etc.) under the one
// canonical platform "Apple" — there is no "Apple Music" platform in
// that map. A handful of older rows were written before that convention
// (or by the TOTAL_STREAK import) with the raw chart-provider name
// instead, which the new platform-tabs split (below) then surfaced as a
// separate, mostly-empty "Apple Music" tab. Normalizing here fixes the
// tab split for those legacy rows without needing a write; a companion
// SQL migration (sql/pending/add-round226-normalize-apple-platform.sql)
// cleans the stored values up for good, once it's run.
const PLATFORM_ALIASES = { "apple music": "Apple", itunes: "Apple" };
function normalizePlatform(raw) {
  if (!raw) return raw;
  const canonical = PLATFORM_ALIASES[raw.trim().toLowerCase()];
  return canonical || raw;
}

async function fetchMilestonesForReleases(releases) {
  if (!supabase || releases.length === 0) return [];
  const dids = [...new Set(releases.map((r) => r.did).filter(Boolean))];
  const artists = [...new Set(releases.map((r) => r.main_artist).filter(Boolean))];
  const byDid = dids.length > 0 ? await supabase.from("milestone_chart_entries").select("*").in("did", dids) : { data: [] };
  const byArtist = artists.length > 0 ? await supabase.from("milestone_chart_entries").select("*").in("artist", artists) : { data: [] };
  const merged = new Map();
  [...(byDid.data || []), ...(byArtist.data || [])].forEach((e) => merged.set(e.id, { ...e, platform: normalizePlatform(e.platform) }));
  return collapseToStreakBestRank([...merged.values()]);
}

export async function fetchArtistRollup(artistName) {
  if (!supabase || !artistName) return null;
  const [byTag, byName] = await Promise.all([
    supabase.from("releases").select(RELEASE_FIELDS).contains("main_artist_tags", [artistName]),
    supabase.from("releases").select(RELEASE_FIELDS).ilike("main_artist", artistName),
  ]);
  const merged = new Map();
  [...(byTag.data || []), ...(byName.data || [])].forEach((r) => merged.set(r.id, r));
  const releases = [...merged.values()].sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""));

  const [milestones, streamRows] = await Promise.all([
    fetchMilestonesForReleases(releases),
    releases.length > 0
      ? supabase.from("release_stream_metrics").select("*").in("release_id", releases.map((r) => r.id))
      : Promise.resolve({ data: [] }),
  ]);
  const streamByReleaseId = {};
  (streamRows.data || []).forEach((s) => (streamByReleaseId[s.release_id] = s));

  return { label: artistName, releases, milestones, streamByReleaseId };
}

export async function fetchSongRollup(releaseId) {
  if (!supabase || !releaseId) return null;
  const { data: release } = await supabase.from("releases").select(RELEASE_FIELDS).eq("id", releaseId).maybeSingle();
  if (!release) return null;
  const [milestones, streamRow] = await Promise.all([
    fetchMilestonesForReleases([release]),
    supabase.from("release_stream_metrics").select("*").eq("release_id", release.id).maybeSingle(),
  ]);
  return {
    label: `${release.title} — ${release.main_artist}`,
    releases: [release],
    milestones,
    streamByReleaseId: streamRow.data ? { [release.id]: streamRow.data } : {},
  };
}

// Round 228 — every stream field this rollup knows about, each tagged
// with the platform it belongs to (used by the Appearances badges
// below, independent of which columns the Streaming table itself is
// currently showing). The "Current" fields (current_spotify,
// current_zing, current_nct, current_ytb, current_ytb_music) mirror the
// Stream workstation's own in-progress staging numbers — genuinely
// useful there, but per explicit request not meaningful in this report,
// so they (and Spotify Playlist, a workstation-only field with no real
// reporting value here either) start hidden by default. Nothing is
// deleted — the column picker below can still bring any of them back.
const STREAM_FIELDS_ALL = [
  ["current_spotify", "Spotify Current", "Spotify"],
  ["playlist_spotify", "Spotify Playlist", "Spotify"],
  ["views_tiktok", "TikTok Views", "TikTok"],
  ["creations_tiktok", "TikTok Creations", "TikTok"],
  ["current_zing", "Zing Current", "Zing"],
  ["current_nct", "NCT Current", "NCT"],
  ["current_ytb", "YouTube Current", "YouTube"],
  ["current_ytb_music", "YTB Music Current", "YouTube"],
  ["views_fb", "Facebook Views", "Facebook"],
];
const STREAM_FIELD_BY_KEY = Object.fromEntries(STREAM_FIELDS_ALL.map((f) => [f[0], f]));
const ALL_STREAM_KEYS = STREAM_FIELDS_ALL.map((f) => f[0]);
const DEFAULT_VISIBLE_STREAM_KEYS = ["views_tiktok", "creations_tiktok", "views_fb"];

// A stream field's raw value is free-text (e.g. "1,234,567" or "12.3K"
// isn't used here, but commas and stray whitespace are common) — parse
// defensively rather than assuming a clean number, since a field that
// fails to parse should just not count toward the "big stream" bar
// rather than throwing or silently reading as 0.
function parseStreamNumber(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const cleaned = String(raw).replace(/[,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
const BIG_STREAM_THRESHOLD = 50000;

const STREAM_COLUMNS_STATE_KEY = "vieent-performance-stream-columns-v1";

function readStreamColumnsState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STREAM_COLUMNS_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || !Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) return null;
    // Guard against a stale saved list missing a field this version of
    // the app knows about (e.g. shipped after the save) — append any
    // key present in ALL_STREAM_KEYS but missing from the saved order,
    // so a new field always shows up rather than silently vanishing.
    const known = new Set(parsed.order.filter((k) => ALL_STREAM_KEYS.includes(k)));
    const order = [...parsed.order.filter((k) => ALL_STREAM_KEYS.includes(k)), ...ALL_STREAM_KEYS.filter((k) => !known.has(k))];
    const hidden = parsed.hidden.filter((k) => ALL_STREAM_KEYS.includes(k));
    return { order, hidden };
  } catch {
    return null;
  }
}

function writeStreamColumnsState(state) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STREAM_COLUMNS_STATE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage can throw in private-browsing/storage-full edge cases —
    // this is a pure convenience, not worth surfacing an error for.
  }
}

// The shared presentational view. `styles` is the caller's own
// shared.module.css import (both call sites already have one) so this
// never has to guess at classnames. `linkToReleases` (admin tab only —
// the public share page never gets it) renders each song title as a
// real link into the release detail page. `mode` ("artist" | "song",
// Round 225) gates the Milestones table's Streak column — per explicit
// request, streak is a song-report-only column, not shown on an artist
// rollup (an artist's milestones span many different songs at once,
// where a single "streak" number wouldn't have one clear subject).
export function PerformanceRollupView({ data, styles, linkToReleases, mode }) {
  const { releases, milestones, streamByReleaseId } = data;
  const totalCost = releases.reduce((s, r) => s + (Number(r.package_total_value) || 0), 0);
  const bestMilestone = milestones[0] || null; // already sorted best-rank-first

  // Round 226 — per explicit request: the Milestones table is now split
  // into one tab per platform (Zing/Spotify/Apple/YouTube/etc — whatever
  // this song or artist's own entries actually cover, never every
  // possible platform), same tab-container idiom used everywhere else in
  // this app. Falls back to a single "Other" tab for any legacy entry
  // with no platform recorded, rather than silently dropping it.
  const platforms = useMemo(() => [...new Set(milestones.map((m) => m.platform || "Other"))].sort(), [milestones]);
  const [activePlatform, setActivePlatform] = useState(platforms[0] || null);
  useEffect(() => {
    if (!platforms.includes(activePlatform)) setActivePlatform(platforms[0] || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platforms]);
  const platformMilestones = useMemo(() => milestones.filter((m) => (m.platform || "Other") === activePlatform), [milestones, activePlatform]);

  // Round 228 — Streaming table column visibility + order, remembered
  // per browser tab (same sessionStorage convention as the releases
  // dashboard's "remember position", round 224 — clears when the tab
  // closes, never touches the database). Starts from
  // DEFAULT_VISIBLE_STREAM_KEYS (Views/Creations/Facebook — the fields
  // with real reporting value) with every other known field available,
  // just hidden, in the picker below.
  const [streamColumns, setStreamColumns] = useState({ order: ALL_STREAM_KEYS, hidden: ALL_STREAM_KEYS.filter((k) => !DEFAULT_VISIBLE_STREAM_KEYS.includes(k)) });
  const [columnsOpen, setColumnsOpen] = useState(false);
  useEffect(() => {
    const saved = readStreamColumnsState();
    if (saved) setStreamColumns(saved);
  }, []);
  function updateStreamColumns(next) {
    setStreamColumns(next);
    writeStreamColumnsState(next);
  }
  function toggleStreamColumn(key) {
    updateStreamColumns({
      ...streamColumns,
      hidden: streamColumns.hidden.includes(key) ? streamColumns.hidden.filter((k) => k !== key) : [...streamColumns.hidden, key],
    });
  }
  function moveStreamColumn(key, dir) {
    const order = [...streamColumns.order];
    const i = order.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    updateStreamColumns({ ...streamColumns, order });
  }
  const visibleStreamFields = streamColumns.order.filter((k) => !streamColumns.hidden.includes(k)).map((k) => STREAM_FIELD_BY_KEY[k]);

  // Round 228 — click a badge in the Songs table's Appearances column to
  // jump straight to that platform, instead of leaving the reader to
  // scroll and guess. A milestone platform switches the Milestones tabs
  // to it and scrolls there; a platform with no milestones but a real
  // stream number (>= BIG_STREAM_THRESHOLD) scrolls to that song's row
  // in the Streaming table instead (no per-platform tabs there — the
  // whole row is the destination).
  const milestonesSectionRef = useRef(null);
  const streamRowRefs = useRef({});
  function jumpToMilestonePlatform(platform) {
    setActivePlatform(platform);
    milestonesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function jumpToStreamRow(releaseId) {
    streamRowRefs.current[releaseId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Songs" value={releases.length} />
        <StatCard
          label="Best Chart Rank"
          value={bestMilestone ? `#${bestMilestone.rank}` : "—"}
          sub={bestMilestone ? `${bestMilestone.track_title} · ${bestMilestone.platform || bestMilestone.chart}` : "No chart history yet"}
        />
        <StatCard label="Chart Appearances" value={milestones.length} />
        <StatCard label="Total Package Cost" value={fmtVnd(totalCost)} />
      </div>

      <div className={styles.subheading}>Songs</div>
      {releases.length === 0 ? (
        <div className={styles.emptyState}>No releases found.</div>
      ) : (
        <div className={styles.scrollBox} style={{ overflowX: "auto", marginBottom: 20 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Release Date</th>
                <th>Package Cost</th>
                <th>Best Rank</th>
                <th>Appearances</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => {
                const own = milestones.filter((m) => (r.did && m.did === r.did) || m.artist === r.main_artist);
                const bestOwn = own[0]; // milestones is already sorted best-rank-first, filter preserves order

                // Round 228 — "Appearances" used to just be a raw count of
                // logged milestone rows, which double-counts every day a
                // song stays on the same chart and gives no sense of
                // *where* it's actually showing up — confusing, per
                // explicit report. Replaced with one badge per platform
                // where this song has real presence: a milestone chart
                // entry, or a stream number at or above 50,000. Click a
                // badge to jump straight to that platform's section below.
                const milestonePlatforms = new Set(own.map((m) => m.platform || "Other"));
                const streamRow = streamByReleaseId[r.id];
                const bigStreamPlatforms = new Set();
                if (streamRow) {
                  STREAM_FIELDS_ALL.forEach(([key, , platform]) => {
                    const n = parseStreamNumber(streamRow[key]);
                    if (n !== null && n >= BIG_STREAM_THRESHOLD) bigStreamPlatforms.add(platform);
                  });
                }
                const appearancePlatforms = [...new Set([...milestonePlatforms, ...bigStreamPlatforms])].sort();

                return (
                  <tr key={r.id}>
                    <td>
                      {linkToReleases ? (
                        <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                      ) : (
                        r.title
                      )}
                    </td>
                    <td>{fmtDate(r.release_date)}</td>
                    <td>{fmtVnd(r.package_total_value)}</td>
                    <td>
                      {bestOwn ? (
                        <>
                          <div style={{ fontWeight: 700 }}>#{bestOwn.rank}</div>
                          <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{bestOwn.chart}</div>
                        </>
                      ) : "—"}
                    </td>
                    <td>
                      {appearancePlatforms.length === 0 ? (
                        "—"
                      ) : (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {appearancePlatforms.map((p) => {
                            const hasMilestone = milestonePlatforms.has(p);
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => (hasMilestone ? jumpToMilestonePlatform(p) : jumpToStreamRow(r.id))}
                                title={hasMilestone ? `Has ${p} chart milestone(s) — click to view` : `${p}: ${BIG_STREAM_THRESHOLD.toLocaleString()}+ — click to view streaming`}
                                className={styles.btnSmall}
                                style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10 }}
                              >
                                {p}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div ref={milestonesSectionRef} className={styles.subheading}>Milestones {milestones.length > 0 ? `(${milestones.length} chart${milestones.length === 1 ? "" : "s"}, best rank first)` : ""}</div>
      {milestones.length === 0 ? (
        <div className={styles.emptyState}>No milestone chart history yet.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
            {platforms.map((p) => {
              const count = milestones.filter((m) => (m.platform || "Other") === p).length;
              return (
                <button
                  key={p}
                  onClick={() => setActivePlatform(p)}
                  className={`${styles.tabBtn} ${activePlatform === p ? styles.tabBtnActive : ""}`}
                  style={{ border: activePlatform === p ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: activePlatform === p ? "rgba(255,107,26,0.1)" : "transparent" }}
                >
                  {p} ({count})
                </button>
              );
            })}
          </div>
          <div className={styles.scrollBox} style={{ overflowX: "auto", maxHeight: "40vh", marginBottom: 20 }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Song</th>
                  <th>Chart</th>
                  <th>Date of Best Rank</th>
                  {mode === "song" && <th>Streak</th>}
                </tr>
              </thead>
              <tbody>
                {platformMilestones.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 700 }}>#{m.rank}</td>
                    <td>{m.track_title}</td>
                    <td style={{ fontSize: 11 }}>{m.chart}</td>
                    <td>{fmtDate(m.entry_date)}</td>
                    {mode === "song" && (
                      <td title="Current consecutive-day run on this chart, as of its most recent logged entry">
                        {m.streak} day{m.streak === 1 ? "" : "s"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div className={styles.subheading} style={{ margin: "20px 0 12px" }}>Streaming</div>
        <div style={{ position: "relative" }}>
          <button type="button" onClick={() => setColumnsOpen((v) => !v)} className={styles.btnSmall} style={{ fontSize: 10, padding: "4px 10px" }}>
            ⚙ Columns
          </button>
          {columnsOpen && (
            <StreamColumnsPopover
              streamColumns={streamColumns}
              onToggle={toggleStreamColumn}
              onMove={moveStreamColumn}
              onClose={() => setColumnsOpen(false)}
            />
          )}
        </div>
      </div>
      {releases.every((r) => !streamByReleaseId[r.id]) ? (
        <div className={styles.emptyState}>No streaming numbers recorded yet.</div>
      ) : visibleStreamFields.length === 0 ? (
        <div className={styles.emptyState}>All streaming columns are hidden — use "⚙ Columns" above to show some.</div>
      ) : (
        <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Song</th>
                {visibleStreamFields.map(([key, label]) => <th key={key}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {releases.filter((r) => streamByReleaseId[r.id]).map((r) => (
                <tr key={r.id} ref={(el) => { streamRowRefs.current[r.id] = el; }}>
                  <td>{r.title}</td>
                  {visibleStreamFields.map(([key]) => <td key={key} style={{ fontSize: 12 }}>{streamByReleaseId[r.id][key] || "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Round 228 — the Streaming table's column picker: check to show/hide,
// ↑/↓ to reorder. Deliberately plain checkboxes + arrow buttons rather
// than drag-and-drop — no drag library in this codebase yet, and this
// list is short enough (9 fields) that reordering one step at a time is
// no real burden. `streamColumns.order` is the full known-field order
// (hidden fields included, at whatever position they'd resume at if
// re-shown); only fields not in `hidden` render in the live table.
function StreamColumnsPopover({ streamColumns, onToggle, onMove, onClose }) {
  return (
    <div
      style={{
        position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 10, minWidth: 240,
        background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
        padding: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Show &amp; reorder columns
        </div>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>
          ✕
        </button>
      </div>
      {streamColumns.order.map((key, i) => {
        const field = STREAM_FIELD_BY_KEY[key];
        if (!field) return null;
        const [, label] = field;
        const visible = !streamColumns.hidden.includes(key);
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flex: 1, cursor: "pointer" }}>
              <input type="checkbox" checked={visible} onChange={() => onToggle(key)} />
              {label}
            </label>
            <button type="button" onClick={() => onMove(key, -1)} disabled={i === 0} style={{ background: "none", border: "none", color: i === 0 ? "var(--text-faint)" : "var(--text-muted)", cursor: i === 0 ? "default" : "pointer", fontSize: 12, padding: "0 4px" }}>
              ↑
            </button>
            <button type="button" onClick={() => onMove(key, 1)} disabled={i === streamColumns.order.length - 1} style={{ background: "none", border: "none", color: i === streamColumns.order.length - 1 ? "var(--text-faint)" : "var(--text-muted)", cursor: i === streamColumns.order.length - 1 ? "default" : "pointer", fontSize: 12, padding: "0 4px" }}>
              ↓
            </button>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
    </div>
  );
}

// Small hook wrapper so both call sites can just do
// `const { data, loading } = usePerformanceRollup(queryType, queryValue)`
// instead of each re-implementing the same load-on-change effect.
export function usePerformanceRollup(queryType, queryValue) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!queryType || !queryValue) { setData(null); return; }
    setLoading(true);
    const run = queryType === "song" ? fetchSongRollup(queryValue) : fetchArtistRollup(queryValue);
    run.then((result) => { setData(result); setLoading(false); });
  }, [queryType, queryValue]);

  return { data, loading };
}
