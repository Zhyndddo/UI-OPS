// Round 542 — the data half of the Performance rollup, split out of
// lib/PerformanceReport.js ("use client") so the SAME logic can run both in
// the browser (staff /report tab, authenticated client) and on the server
// (the public performance share link, via app/api/magic/route.js with the
// service role — so the logged-out role needs no access to releases /
// milestone_chart_entries / release_stream_metrics). Each fetch takes the
// Supabase client to use.
// NOTE: no "use client" directive here on purpose.

// link_share added round 230 — the public Performance share page uses it
// (song mode only) to crawl a cover image via /api/crawl-og-image.
export const RELEASE_FIELDS = "id, did, title, main_artist, main_artist_tags, package_total_value, release_date, project_type, status, link_share";

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

async function fetchMilestonesForReleases(supabase, releases) {
  if (!supabase || releases.length === 0) return [];
  const dids = [...new Set(releases.map((r) => r.did).filter(Boolean))];
  const artists = [...new Set(releases.map((r) => r.main_artist).filter(Boolean))];
  const byDid = dids.length > 0 ? await supabase.from("milestone_chart_entries").select("*").in("did", dids) : { data: [] };
  const byArtist = artists.length > 0 ? await supabase.from("milestone_chart_entries").select("*").in("artist", artists) : { data: [] };
  const merged = new Map();
  [...(byDid.data || []), ...(byArtist.data || [])].forEach((e) => merged.set(e.id, { ...e, platform: normalizePlatform(e.platform) }));
  return collapseToStreakBestRank([...merged.values()]);
}

export async function fetchArtistRollupWith(supabase, artistName) {
  if (!supabase || !artistName) return null;
  const [byTag, byName] = await Promise.all([
    supabase.from("releases").select(RELEASE_FIELDS).contains("main_artist_tags", [artistName]),
    supabase.from("releases").select(RELEASE_FIELDS).ilike("main_artist", artistName),
  ]);
  const merged = new Map();
  [...(byTag.data || []), ...(byName.data || [])].forEach((r) => merged.set(r.id, r));
  const releases = [...merged.values()].sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""));

  const [milestones, streamRows] = await Promise.all([
    fetchMilestonesForReleases(supabase, releases),
    releases.length > 0
      ? supabase.from("release_stream_metrics").select("*").in("release_id", releases.map((r) => r.id))
      : Promise.resolve({ data: [] }),
  ]);
  const streamByReleaseId = {};
  (streamRows.data || []).forEach((s) => (streamByReleaseId[s.release_id] = s));

  return { label: artistName, releases, milestones, streamByReleaseId };
}

export async function fetchSongRollupWith(supabase, releaseId) {
  if (!supabase || !releaseId) return null;
  const { data: release } = await supabase.from("releases").select(RELEASE_FIELDS).eq("id", releaseId).maybeSingle();
  if (!release) return null;
  const [milestones, streamRow] = await Promise.all([
    fetchMilestonesForReleases(supabase, [release]),
    supabase.from("release_stream_metrics").select("*").eq("release_id", release.id).maybeSingle(),
  ]);
  return {
    label: `${release.title} — ${release.main_artist}`,
    releases: [release],
    milestones,
    streamByReleaseId: streamRow.data ? { [release.id]: streamRow.data } : {},
  };
}

