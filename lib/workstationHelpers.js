// Shared by every workstation/ticket page for the general rules that
// apply everywhere: sort by release date (soonest-into-the-future
// first), auto-hide rows already flagged done (with a way to show them
// again — the exact "done" rule is a real business decision the team
// will refine later, so callers pass their own isDone check).

export function sortByReleaseDateDesc(rows, dateKey = "release_date") {
  return [...rows].sort((a, b) => {
    const da = a[dateKey] ? new Date(a[dateKey]).getTime() : -Infinity;
    const db = b[dateKey] ? new Date(b[dateKey]).getTime() : -Infinity;
    return db - da; // descending — furthest into the future first
  });
}

export function isThisWeekOrNext(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - now.getDay());
  startOfThisWeek.setHours(0, 0, 0, 0);
  const endOfNextWeek = new Date(startOfThisWeek);
  endOfNextWeek.setDate(startOfThisWeek.getDate() + 14);
  return d >= startOfThisWeek && d < endOfNextWeek;
}

// A profile counts for a team's PIC list if it's actually on that team,
// or if it's dev (sees/can be assigned everything, no team of its own).
export function filterProfilesByTeam(profiles, team) {
  return profiles.filter((p) => p.segment === team || p.role === "dev");
}
