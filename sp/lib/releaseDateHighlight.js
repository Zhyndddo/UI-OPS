// Round 135 — shared "is this release today / this week" row highlight
// rule, originally added to the Re-Check workstation
// (app/workstation/confirm/page.js) and pulled out here in Round 139 so
// New Release Setup (app/workstation/upload/page.js) can apply the exact
// same rule/colors instead of maintaining a second copy that could drift.
//
// release_date is a plain `date` column (YYYY-MM-DD, no time) — always
// compare local-YYYY-MM-DD strings, never `toISOString()` (UTC-based,
// timezone drift risk).
export function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isReleasingToday(release) {
  if (!release?.release_date) return false;
  return String(release.release_date).slice(0, 10) === localDateStr(new Date());
}

// "This week" = last Sunday through next Sunday, inclusive of BOTH
// endpoints (per explicit wording, "from last sunday to next sunday") —
// an 8-day window, not the usual 7-day Sun-Sat week.
export function isReleasingThisWeek(release) {
  if (!release?.release_date) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const lastSunday = new Date(now);
  lastSunday.setDate(lastSunday.getDate() - lastSunday.getDay());
  const nextSunday = new Date(lastSunday);
  nextSunday.setDate(nextSunday.getDate() + 7);
  const dateStr = String(release.release_date).slice(0, 10);
  return dateStr >= localDateStr(lastSunday) && dateStr <= localDateStr(nextSunday);
}

// Today (yellow) always falls inside "this week" (light blue) too — per
// explicit confirmation (Round 135), today wins so a row never has to
// pick between them silently landing on whichever check happened to run
// last.
//
// Colors: today #FBEC5D (Round 139, was #FFF200); this week #B3EBF2
// (Round 138, was #007FFF before that, #FF8000 originally in Round 135).
export function rowHighlightColor(release) {
  if (isReleasingToday(release)) return "#FBEC5D";
  if (isReleasingThisWeek(release)) return "#B3EBF2";
  return null;
}
