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
  // A REMAIN row only counts as "climbed" for Highlight when its rank
  // improved AND its current rank is at or better than this — matches
  // the real sheet's hardcoded "<=5".
  topNRank: 5,
  // Chart Highlight summary block: only list a chart if it currently has
  // MORE than this many charting entries — matches the real sheet's
  // hardcoded ">2".
  minChartCount: 2,
  // Charts left out of the Chart Highlight summary block entirely —
  // matches the real sheet's hardcoded ZingCharts/BXH NHẠC MỚI exclusion
  // (those two are Zing's own home charts, checked constantly elsewhere,
  // so the team doesn't need them repeated in this summary).
  excludedCharts: ["ZingCharts", "BXH NHẠC MỚI"],
  // The "X/200" denominator shown in both the Report and Highlight
  // digests — the real sheet shows this for every chart uniformly, so
  // it's one shared number rather than per-chart.
  chartDepth: 200,
};

export function parseMilestoneHighlightConfig(rawValue) {
  if (!rawValue || typeof rawValue !== "object") return DEFAULT_MILESTONE_HIGHLIGHT_CONFIG;
  return {
    topNRank: Number(rawValue.topNRank) || DEFAULT_MILESTONE_HIGHLIGHT_CONFIG.topNRank,
    minChartCount: Number(rawValue.minChartCount) || DEFAULT_MILESTONE_HIGHLIGHT_CONFIG.minChartCount,
    excludedCharts: Array.isArray(rawValue.excludedCharts) ? rawValue.excludedCharts : DEFAULT_MILESTONE_HIGHLIGHT_CONFIG.excludedCharts,
    chartDepth: Number(rawValue.chartDepth) || DEFAULT_MILESTONE_HIGHLIGHT_CONFIG.chartDepth,
  };
}
