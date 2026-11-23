// Shared by every workstation/ticket page for the general rules that
// apply everywhere: sort by release date (soonest-into-the-future
// first), auto-hide rows already flagged done (with a way to show them
// again — the exact "done" rule is a real business decision the team
// will refine later, so callers pass their own isDone check).

import { isOpsTeam } from "./teamTypes";
import { logAudit } from "./auditLog";
import { supabase } from "./supabaseClient";

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
//
// Round 159 — `team` may now also be an array of team strings (e.g.
// ["OPS", "AR"]), for the Pitching workstation's PIC dropdown once AR was
// added as a second executor team there. Every existing call site still
// passes a single string and keeps working exactly as before — the array
// branch just OR's the single-team logic above across each entry.
// Round 678 — a Super admin counts as a member (an "admin") of EVERY team they hold (segment, segment2, segments_extra); everyone else: their own segment only, as before.
function memberOfTeam(p, t) {
  const inSeg = (seg) => (t === "OPS" ? isOpsTeam(seg) : seg === t);
  if (p?.role === "superadmin") return [p.segment, p.segment2, ...(Array.isArray(p.segments_extra) ? p.segments_extra : [])].filter(Boolean).some(inSeg);
  return inSeg(p?.segment);
}
export function filterProfilesByTeam(profiles, team) {
  const noDev = profiles.filter((p) => p.role !== "dev");
  if (Array.isArray(team)) {
    if (!team.length) return noDev;
    return noDev.filter((p) => team.some((t) => memberOfTeam(p, t)));
  }
  if (!team) return noDev; // no specific team for this type — every non-dev profile stays eligible
  return noDev.filter((p) => memberOfTeam(p, team));
}

// Round 281 — "if no one has been assigned, auto assign that to the team
// lead, if no team lead, assign to admin, that push them to assign." Rule:
// exactly one role='teamlead' profile on the segment -> them; zero, or
// more than one (ambiguous — no single owner to pick), -> the segment's
// admin, deterministically the alphabetically-first by name if there's
// more than one of those too. Returns null if the segment has neither (page
// stays genuinely unassigned — nothing left to auto-assign to).
//
// `profiles` is the full roster the caller already has loaded (every
// workstation page already loads all profiles for its PIC dropdown) — this
// does not hit the DB itself, callers write the resulting profile id back
// via their own existing updatePic-style insert/update.
export function resolveAutoAssignee(profiles, segment) {
  const scoped = (profiles || []).filter((p) => p.role !== "dev" && memberOfTeam(p, segment));
  const leads = scoped.filter((p) => p.role === "teamlead").sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  if (leads.length === 1) return leads[0];
  const admins = scoped.filter((p) => p.role === "admin" || p.role === "superadmin").sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  if (admins.length > 0) return admins[0];
  return null;
}

// Writes the auto-assignment (if one was resolved) and logs it. Callers
// pass their own `write(profileId)` — the exact insert/update shape
// differs slightly per page (workstation_assignments upsert vs a plain
// tickets.update), so this only decides WHO and records that it happened;
// it doesn't own the write itself.
// Round 657 — batched version of the above. The per-release version fired
// one INSERT plus one audit_log row for EVERY unassigned release on EVERY
// page load (and the failed ones, rejected by the unique index, still
// count as writes), which is what drove workstation_assignments to 330k
// inserts for ~4.7k live rows. This resolves the assignee once, writes
// the missing rows in chunks, logs one summary audit row, and remembers
// (per browser tab) which releases it already tried so a reload of the
// same page never retries them.
const _autoTried = new Set();
export async function autoAssignBatch({ profiles, segment, workstation, releases, assigned, onAssigned }) {
  const assignee = resolveAutoAssignee(profiles, segment);
  if (!assignee || !supabase) return null;
  const todo = (releases || []).filter((r) => assigned[r.id] == null && !_autoTried.has(`${workstation}:${r.id}`));
  if (todo.length === 0) return null;
  todo.forEach((r) => _autoTried.add(`${workstation}:${r.id}`));
  let written = 0;
  for (let i = 0; i < todo.length; i += 200) {
    const chunk = todo.slice(i, i + 200);
    const rows = chunk.map((r) => ({ workstation, column_key: "all", release_id: r.id, pic_profile_id: assignee.id, pic_profile_ids: [assignee.id], auto_assigned: true }));
    const { error } = await supabase.from("workstation_assignments").insert(rows);
    if (error) { console.error("auto-assign batch failed:", workstation, error.message); continue; }
    written += chunk.length;
    if (onAssigned) onAssigned(chunk.map((r) => r.id), assignee.id);
  }
  if (written > 0) await logAudit({ actor: null, action: "auto_assign", entity: "workstation_assignment", entityId: `${workstation}:batch(${written})`, field: "pic", before: null, after: assignee.id });
  return assignee;
}

export async function autoAssignUnassigned({ profiles, segment, entity, entityId, write }) {
  const assignee = resolveAutoAssignee(profiles, segment);
  if (!assignee) return null;
  await write(assignee.id);
  await logAudit({ actor: null, action: "auto_assign", entity, entityId, field: "pic", before: null, after: assignee.id });
  return assignee;
}
