// Round 260 — the project tag cycle (dashboard flag column + detail page
// header switch both use this same list/order). Values line up with
// booking_channels.brand's raw grouping vocabulary (VIEENT / ENVI - MIỀN
// TÂY/BOLERO / INDIE / VPOP / capcut) minus "capcut" — per explicit
// request, only these 4 are real tag choices. null/"" is the untagged
// state ("NONE"), not a real array entry — cycleProjectTag below treats
// falling off the end of PROJECT_TAGS as going back to null.
export const PROJECT_TAGS = ["INDIE", "VPOP", "ENVI", "VIEENT"];

// Cycles null -> INDIE -> VPOP -> ENVI -> VIEENT -> null -> ... Any value
// not in PROJECT_TAGS (shouldn't happen, but covers a stale/manual DB
// edit) is treated as if it were null, so it always resolves to a real
// next step instead of getting stuck.
export function cycleProjectTag(current) {
  if (!current) return PROJECT_TAGS[0];
  const idx = PROJECT_TAGS.indexOf(current);
  if (idx === -1 || idx === PROJECT_TAGS.length - 1) return null;
  return PROJECT_TAGS[idx + 1];
}
