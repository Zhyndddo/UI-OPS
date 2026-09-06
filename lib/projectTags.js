// Round 258/260 introduced a single cycling "project tag" column
// (INDIE/VPOP/ENVI/VIEENT/NONE) on releases. Round 262 retired that
// mechanism per explicit request — those 4 values are now modeled as 4
// independent is_subteam booleans under Marketing in the generic
// subteam_tags system (see app/releases/page.js, app/releases/[id]/
// page.js, sql/pending/add-round261-subteam-tags.sql /
// add-round262-subteam-rework.sql) instead of one column that could only
// ever hold one value at a time.
//
// Round 262 follow-up — these 4 names are hardcoded here on purpose, NOT
// pulled from the `subteams` config table, per explicit correction after
// trying the table-driven version first ("is making a new subteam config
// like this better, or hardcode will be better"). Turned out several
// OTHER places already hardcode the literal string "INDIE" and can't be
// made table-driven without real work: the automatic Indie-channel
// auto-flag (app/releases/[id]/page.js) writes subteam_tags.INDIE /
// subteam_tags_locked.INDIE by name, and the color map right below also
// keys off these exact 4 strings. If "INDIE" were just a freely-renamable
// row in the SUBTEAM config tab, renaming it would silently desync from
// both of those — the table was implying a flexibility that didn't
// actually exist underneath. OPS's Youtube/Publishing/Operation had no
// such hardcoded consumers (they're just labels), so THOSE stayed
// table-driven for one more round — until Round 264 hardcoded them too
// (lib/teamTypes.js's TEAM_SUBTEAMS), per explicit request to drop the
// whole SUBTEAM config table/tab for simplicity, once it was clear the
// table bought no real safety for OPS's case either. Adding a real 5th
// Marketing tag (or extending tagging to a new team) is a deliberate
// code change here, not a config-page click — intentional, given the
// hardcoded dependents above.
export const MARKETING_SUBTEAM_TAGS = ["INDIE", "VPOP", "ENVI", "VIEENT"];

// Color mapping for the 4 names above, wherever a subteam tag is shown as
// a pill (the read-only "which tags does this release have" pills, and
// the admin/dev popups). Any OTHER subteam name (there are none right
// now, since tagging is Marketing-only — see lib/permissions.js's
// SUBTEAM_TAG_TEAM) would fall back to a plain gray pill.
export const SUBTEAM_TAG_PILL_CLASS = {
  INDIE: "pillOrange",
  VPOP: "pillGreen",
  ENVI: "pillPublishing",
  VIEENT: "pillSplitshare",
};

export function subteamTagPillClass(styles, name) {
  return styles[SUBTEAM_TAG_PILL_CLASS[name]] || styles.pillGray;
}
