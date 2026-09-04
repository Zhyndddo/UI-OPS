// Round 127 — shared home for the Milestone workstation's "Highlight"
// criteria, admin-editable via Config → Milestone (app/config/page.js,
// MilestoneHighlightSection), same app_settings idiom as
// ARTIST_PROFILE_LINKS_SETTING_KEY (lib/externalTools.js) — a small jsonb
// object under one settings row, not a whole table.
//
// This replaces what was hardcoded directly into the real running
// system's "Highlight" sheet formulas (see the Apps Script source the
// team sent: report!H2:H="IN" + report!H2:H="RETURN" +
// (regexmatch(report!G2:G,"↑") * (rank<=5)) + (output!C2:C="#1"), plus a
// separate "Chart Highlight" summary block filtered to
// count>2 and excluding ZingCharts/BXH NHẠC MỚI by name). Per explicit
// request, those hardcoded numbers/exclusions are now editable here
// instead of requiring a code round to tune.
export const MILESTONE_HIGHLIGHT_SETTING_KEY = "milestone_highlight_config";

export const DEFAULT_MILESTONE_HIGHLIGHT_CONFIG = {
  // Round 192 — replaces the old single "climbed AND top-5" AND-gated
  // rule (topNRank) with two independent thresholds, per explicit
  // request at the time: "those going up but going up to rank 10 at
  // least, while remain must be in top 5". A REMAIN row is
  // highlight-worthy if EITHER it's climbing and its new rank is at or
  // better than climbToRankHighlight, OR its rank (regardless of
  // movement — holding, falling, whatever) is at or better than
  // topRankAlwaysHighlight.
  //
  // Round 210 — reverted back to the real system's own original
  // hardcoded numbers, per explicit follow-up after the team pasted
  // that exact formula and confirmed they want the app to match it
  // exactly rather than the round-192 loosened thresholds: climb-highlight
  // is rank ≤5 (was ≤10, matching the formula's `rank<=5`), and
  // "always highlight regardless of movement" narrows back down to
  // exactly rank #1 (was ≤5, matching the formula's `output!C="#1"`) —
  // this also restores the old "held #1" case as effectively the only
  // thing topRankAlwaysHighlight=1 can mean, same as before round 192
  // introduced the wider top-5 version.
  //
  // NOTE: this only changes the DEFAULT. If a custom value was ever
  // saved via Config → Milestone (MilestoneHighlightSection), that
  // saved value still wins over this default — see
  // parseMilestoneHighlightConfig below. Re-save 5 / 1 there if the
  // Highlight list still doesn't reflect this after deploying.
  climbToRankHighlight: 5,
  topRankAlwaysHighlight: 1,
  // Chart Highlight summary block: only list a chart if it currently has
  // MORE than this many charting entries — matches the real sheet's
  // hardcoded ">2".
  minChartCount: 2,
  // Charts left out of the Chart Highlight summary block entirely —
  // matches the real sheet's hardcoded ZingCharts/BXH NHẠC MỚI exclusion
  // (those two are Zing's own home charts, checked constantly elsewhere,
  // so the team doesn't need them repeated in this summary). Round 192 —
  // fixed to the app's own canonical chart names: the original values
  // here ("ZingCharts", "BXH NHẠC MỚI") were copied straight from the
  // real sheet's raw, pre-canonicalization labels, but this app's
  // `entries.chart` always stores the CHART_MAP-canonicalized name
  // ("ZMP3|ZING CHART" / "ZMP3|BXH NHẠC MỚI") — the raw strings never
  // matched anything actually in the database, so this exclusion was
  // silently a no-op. Confirmed against a real reference Highlight
  // export where Zing (11 and 21 charting entries) was correctly absent
  // from the Chart Highlight summary.
  excludedCharts: ["ZMP3|ZING CHART", "ZMP3|BXH NHẠC MỚI"],
  // The "X/200" denominator shown in both the Report and Highlight
  // digests — the real sheet shows this for every chart uniformly, so
  // it's one shared number rather than per-chart.
  chartDepth: 200,
};

export function parseMilestoneHighlightConfig(rawValue) {
  if (!rawValue || typeof rawValue !== "object") return DEFAULT_MILESTONE_HIGHLIGHT_CONFIG;
  // Back-compat: a config saved before round 192 only has the old
  // single `topNRank` field. Map it to both new thresholds rather than
  // silently reverting to the defaults — climbToRankHighlight has no
  // real precedent in the old shape, so it still falls back to the
  // default (5, as of round 210) even when migrating an old topNRank
  // value.
  const legacyTopNRank = Number(rawValue.topNRank) || null;
  return {
    climbToRankHighlight: Number(rawValue.climbToRankHighlight) || legacyTopNRank || DEFAULT_MILESTONE_HIGHLIGHT_CONFIG.climbToRankHighlight,
    topRankAlwaysHighlight: Number(rawValue.topRankAlwaysHighlight) || legacyTopNRank || DEFAULT_MILESTONE_HIGHLIGHT_CONFIG.topRankAlwaysHighlight,
    minChartCount: Number(rawValue.minChartCount) || DEFAULT_MILESTONE_HIGHLIGHT_CONFIG.minChartCount,
    excludedCharts: Array.isArray(rawValue.excludedCharts) ? rawValue.excludedCharts : DEFAULT_MILESTONE_HIGHLIGHT_CONFIG.excludedCharts,
    chartDepth: Number(rawValue.chartDepth) || DEFAULT_MILESTONE_HIGHLIGHT_CONFIG.chartDepth,
  };
}
