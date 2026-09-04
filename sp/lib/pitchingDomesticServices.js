// Round 106 item 5 — the 8-item "Có Gói" multi-select checklist that shows
// up on the Domestic tab of the Pitching Workstation once NCT or Zing's
// status is set to "Có gói" (per explicit request). Config-editable (Config
// → Pitching → Domestic "Có Gói" Services), same "global_settings blob,
// parse-with-fallback" idiom as lib/troGiaBooking.js.
export const PITCHING_DOMESTIC_SERVICES_KEY = "pitching_domestic_services_items";

export const DEFAULT_PITCHING_DOMESTIC_SERVICES = [
  "Banner",
  "Add-in Playlist",
  "Playlist cover",
  "Seeding feed",
  "Playlist",
  "Broadcast",
  "Bài PR",
  "Album Hot",
];

function parseStringListSetting(rawValue, fallback) {
  if (!rawValue) return fallback;
  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return fallback;
  } catch {
    return fallback;
  }
}

export function parsePitchingDomesticServices(rawValue) {
  return parseStringListSetting(rawValue, DEFAULT_PITCHING_DOMESTIC_SERVICES);
}

// Round 187 — per-platform extra items on top of the shared list above, per
// explicit request ("for zing option: noti push. for NCT option: social
// post, noti push"), plus "is making a config list for this now worth it,
// if the team would add more option once in a while though" — yes: the
// shared list already has this exact editor (add/remove-row over a
// global_settings blob) built and working, so extending it to 2 more keys
// costs almost nothing and saves a code deploy every time the team wants
// to tweak these. NCT's pre-existing round-170 extra item ("New Release
// Song") is left as-is — still hardcoded (NCT_ONLY_SERVICES) in
// app/workstation/pitching/page.js, not migrated here, since only adding
// the 2 new items was asked for; these 2 new keys are additive alongside
// it (NCT ends up with New Release Song + whatever's in this list).
export const PITCHING_NCT_EXTRA_SERVICES_KEY = "pitching_nct_extra_services_items";
export const DEFAULT_PITCHING_NCT_EXTRA_SERVICES = ["Social Post", "Noti Push"];
export const PITCHING_ZING_EXTRA_SERVICES_KEY = "pitching_zing_extra_services_items";
export const DEFAULT_PITCHING_ZING_EXTRA_SERVICES = ["Noti Push"];

export function parsePitchingNctExtraServices(rawValue) {
  return parseStringListSetting(rawValue, DEFAULT_PITCHING_NCT_EXTRA_SERVICES);
}
export function parsePitchingZingExtraServices(rawValue) {
  return parseStringListSetting(rawValue, DEFAULT_PITCHING_ZING_EXTRA_SERVICES);
}
