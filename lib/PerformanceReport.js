"use client";

import { useEffect, useState } from "react";
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

async function fetchMilestonesForReleases(releases) {
  if (!supabase || releases.length === 0) return [];
  const dids = [...new Set(releases.map((r) => r.did).filter(Boolean))];
  const artists = [...new Set(releases.map((r) => r.main_artist).filter(Boolean))];
  const byDid = dids.length > 0 ? await supabase.from("milestone_chart_entries").select("*").in("did", dids) : { data: [] };
  const byArtist = artists.length > 0 ? await supabase.from("milestone_chart_entries").select("*").in("artist", artists) : { data: [] };
  const merged = new Map();
  [...(byDid.data || []), ...(byArtist.data || [])].forEach((e) => merged.set(e.id, e));
  return [...merged.values()].sort((a, b) => a.rank - b.rank);
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

const STREAM_FIELDS = [
  ["current_spotify", "Spotify Current"],
  ["playlist_spotify", "Spotify Playlist"],
  ["views_tiktok", "TikTok Views"],
  ["creations_tiktok", "TikTok Creations"],
  ["current_zing", "Zing Current"],
  ["current_nct", "NCT Current"],
  ["current_ytb", "YouTube Current"],
  ["current_ytb_music", "YTB Music Current"],
  ["views_fb", "Facebook Views"],
];

// The shared presentational view. `styles` is the caller's own
// shared.module.css import (both call sites already have one) so this
// never has to guess at classnames. `linkToReleases` (admin tab only —
// the public share page never gets it) renders each song title as a
// real link into the release detail page.
export function PerformanceRollupView({ data, styles, linkToReleases }) {
  const { releases, milestones, streamByReleaseId } = data;
  const totalCost = releases.reduce((s, r) => s + (Number(r.package_total_value) || 0), 0);
  const bestMilestone = milestones[0] || null; // already sorted best-rank-first

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
                    <td>{bestOwn ? `#${bestOwn.rank}` : "—"}</td>
                    <td>{own.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.subheading}>Milestones {milestones.length > 0 ? `(${milestones.length}, best rank first)` : ""}</div>
      {milestones.length === 0 ? (
        <div className={styles.emptyState}>No milestone chart history yet.</div>
      ) : (
        <div className={styles.scrollBox} style={{ overflowX: "auto", maxHeight: "40vh", marginBottom: 20 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Song</th>
                <th>Chart</th>
                <th>Platform</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 700 }}>#{m.rank}</td>
                  <td>{m.track_title}</td>
                  <td style={{ fontSize: 11 }}>{m.chart}</td>
                  <td>{m.platform || "—"}</td>
                  <td>{fmtDate(m.entry_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.subheading}>Streaming</div>
      {releases.every((r) => !streamByReleaseId[r.id]) ? (
        <div className={styles.emptyState}>No streaming numbers recorded yet.</div>
      ) : (
        <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Song</th>
                {STREAM_FIELDS.map(([, label]) => <th key={label}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {releases.filter((r) => streamByReleaseId[r.id]).map((r) => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  {STREAM_FIELDS.map(([key]) => <td key={key} style={{ fontSize: 12 }}>{streamByReleaseId[r.id][key] || "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
