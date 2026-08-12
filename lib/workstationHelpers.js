// Shared by every workstation/ticket page for the general rules that
// apply everywhere: sort by release date (soonest-into-the-future
// first), auto-hide rows already flagged done (with a way to show them
// again — the exact "done" rule is a real business decision the team
// will refine later, so callers pass their own isDone check).

import { isOpsTeam } from "./teamTypes";

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

// A profile counts for a team's PIC list only if it's actually ON that
// team. "OPS" is the aggregate covering the three real sub-teams (Youtube/
// Publishing/Operation) — every workstation/ticket page that calls this
// with "OPS" as the team wants any of the three, not a literal segment
// match.
//
// Round 78 — per explicit request, dev no longer shows up in ANY PIC list,
// anywhere. Previously dev profiles were folded into every team's list
// ("sees/can be assigned everything") — that's still true for what dev can
// SEE, but dev is not a real team member to hand day-to-day work to, so
// assigning one as a PIC doesn't make sense and was cluttering every
// dropdown with names that don't belong to the team the list is for.
export function filterProfilesByTeam(profiles, team) {
  const noDev = profiles.filter((p) => p.role !== "dev");
  if (team === "OPS") return noDev.filter((p) => isOpsTeam(p.segment));
  if (!team) return noDev; // no specific team for this type — every non-dev profile stays eligible
  return noDev.filter((p) => p.segment === team);
}
