// Round 301 — per-tab PIC scoping + default auto-fill for 3 of the
// Pitching Workstation's 5 platforms (Priority, Spotify S4A, Domestic).
// Per explicit request ("same old rule: i sent member by email for easy
// assign") — each of these 3 tabs gets its OWN eligible-member list
// ("allowed") plus its own DEFAULT person, who auto-fills any row for
// that platform that's still unassigned (same "don't let it fall through
// the cracks" idea as Round 281's workstation_assignments auto-assign,
// just written straight onto the release's own PIC column since that's
// where Pitching PIC has always lived — see PIC_COLUMNS in
// app/workstation/pitching/page.js).
//
// Priority Apple and Spotify Banner are deliberately NOT part of this —
// the team didn't ask for those two to change, so they keep using the
// old flat allowlist (lib/pitchingPicList.js) / OPS+AR fallback exactly
// as before.
//
// Stored as one JSON object under global_settings.pitching_pic_tabs,
// keyed by the same PIC_COLUMNS keys the workstation already uses
// internally: "priority", "spotify" (= the Spotify S4A tab), "domestic".
// Each value is { default: profileId | null, allowed: profileId[] }.
// Configured via direct SQL for now (see sql/pending/
// add-round301-pitching-pic-tabs.sql) — same "send me emails, I'll wire
// it up" workflow as Round 274's single addition, not a Config UI, since
// that's the workflow the team has actually been using.
export const PITCHING_PIC_TABS_KEY = "pitching_pic_tabs";

// The only PIC_COLUMNS keys this mechanism applies to.
export const PITCHING_PIC_SCOPED_TABS = ["priority", "spotify", "domestic"];

export function parsePitchingPicTabs(rawValue) {
  if (!rawValue) return {};
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Profiles eligible to be picked for one PIC_COLUMNS key, per the
// per-tab config. Returns null when this key has no configured allowed
// list yet, so the caller falls back to its own existing logic (the old
// flat pitching_pic_list / OPS+AR).
export function applyPitchingPicTab(profiles, tabsConfig, key) {
  const allowed = tabsConfig?.[key]?.allowed;
  if (!allowed || allowed.length === 0) return null;
  const set = new Set(allowed);
  return profiles.filter((p) => set.has(p.id));
}

export function pitchingPicTabDefault(tabsConfig, key) {
  return tabsConfig?.[key]?.default || null;
}
