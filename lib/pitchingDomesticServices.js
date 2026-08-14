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

export function parsePitchingDomesticServices(rawValue) {
  if (!rawValue) return DEFAULT_PITCHING_DOMESTIC_SERVICES;
  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return DEFAULT_PITCHING_DOMESTIC_SERVICES;
  } catch {
    return DEFAULT_PITCHING_DOMESTIC_SERVICES;
  }
}
