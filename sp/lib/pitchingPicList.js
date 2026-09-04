// Round 106 item 5 — "make a new pic list just for this one since there is
// multiple team join in but not all member" — a Pitching-Workstation-only
// allowlist of who can show up as PIC, distinct from the general
// filterProfilesByTeam(profiles, "OPS") every other workstation uses.
// Stored as an array of profiles.id (uuid strings), config-editable
// (Config → Pitching → PIC List), blank by default per explicit request
// ("leave it blank and add it in the config, i will set them manually
// later") — see PitchingPicListSection in app/config/page.js.
export const PITCHING_PIC_LIST_KEY = "pitching_pic_list";

export const DEFAULT_PITCHING_PIC_LIST = [];

export function parsePitchingPicList(rawValue) {
  if (!rawValue) return DEFAULT_PITCHING_PIC_LIST;
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : DEFAULT_PITCHING_PIC_LIST;
  } catch {
    return DEFAULT_PITCHING_PIC_LIST;
  }
}

// Blank list = not configured yet -> fall back to the normal OPS-team
// filter so nothing breaks before an admin visits Config and picks names.
// Once the list has at least one id in it, it becomes the real allowlist.
export function applyPitchingPicList(profiles, picListIds) {
  if (!picListIds || picListIds.length === 0) return profiles;
  const allowed = new Set(picListIds);
  return profiles.filter((p) => allowed.has(p.id));
}
