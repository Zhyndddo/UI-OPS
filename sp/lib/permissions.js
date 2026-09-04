// Round 57 — the app's role model, made real. Was 3 flat tiers
// (exc/admin/dev) where "admin" barely did anything beyond one deadline-
// edit check, and Config itself had almost NO role gating at all — any
// logged-in exc-level user could open /config and edit Team (including
// granting themselves admin/dev), Package Terms, Media Booking Pricing,
// Platforms, etc. This file is the single source of truth for the new
// 4-tier model (exc < teamlead < admin < dev) and every capability check
// built on it — see DATA_FIXES.md round 57 for the full matrix and the
// reasoning behind each line.
//
// Every other file should import from here rather than comparing
// `profile.role` directly, so the matrix stays in exactly one place.

export const ROLES = ["exc", "teamlead", "admin", "dev"];
export const ROLE_LABELS = {
  exc: "Member",
  teamlead: "Team Lead",
  admin: "Admin",
  dev: "Dev",
};
const ROLE_RANK = { exc: 0, teamlead: 1, admin: 2, dev: 3 };

export function roleRank(profile) {
  return ROLE_RANK[profile?.role] ?? -1;
}
export function roleAtLeast(profile, role) {
  return roleRank(profile) >= (ROLE_RANK[role] ?? Infinity);
}

export function isDev(profile) {
  return profile?.role === "dev";
}
export function isAdminOrAbove(profile) {
  return roleAtLeast(profile, "admin");
}
export function isTeamLeadOrAbove(profile) {
  return roleAtLeast(profile, "teamlead");
}

// ── Capability checks — one per real gate in the app, named for what it
// actually unlocks so a reader doesn't have to reverse-engineer role
// names. Grouped to match the matrix in DATA_FIXES.md round 57. ──

// Phái Sinh / Batch Phái Sinh / Design tickets — editing a deadline once
// it's locked past the normal edit window. Was admin/dev; team leads now
// get this for their own team's tickets too (the actual page-level code
// still scopes "their own team" via the executor/segment check that was
// already there — this only adds teamlead to the rank check, it doesn't
// add cross-team reach).
export function canEditLockedDeadline(profile) {
  return isTeamLeadOrAbove(profile);
}

// Config → Team: whether the tab is visible at all. Team leads see it
// scoped to their own segment (see scopeableTeamMembers below); admin/dev
// see everyone.
export function canManageTeamMembers(profile) {
  return isTeamLeadOrAbove(profile);
}
// Given the FULL profiles list, returns just the ones this profile is
// allowed to see/edit in Config → Team. Team leads: their own segment
// only (can't see or touch other teams). Admin/dev: everyone.
export function scopeableTeamMembers(profile, allProfiles) {
  if (isAdminOrAbove(profile)) return allProfiles;
  if (profile?.role === "teamlead") return allProfiles.filter((p) => p.segment === profile.segment);
  return [];
}
// Which roles this profile is allowed to SET on someone else, when
// creating/editing a team member — prevents privilege escalation (a team
// lead granting themselves admin, an admin minting a dev). dev is the
// only rank that can grant dev.
export function assignableRoles(profile) {
  if (isDev(profile)) return ROLES;
  if (isAdminOrAbove(profile)) return ["exc", "teamlead", "admin"];
  if (profile?.role === "teamlead") return ["exc"];
  return [];
}

// Config's org-wide settings tabs — Lookup Options, Package Terms, Media
// Booking Pricing, Platforms, Design Types, Sizes, PIC Defaults, External
// Tool Links. These affect every team at once, so they're admin+ even
// though a team lead can manage their own team's people.
export function canManageOrgConfig(profile) {
  return isAdminOrAbove(profile);
}

// The 4 dev-only Config tabs (Notifications, Design Notifications,
// Sessions, Sidebar Label) plus "View As" impersonation and cross-team
// ticket/workstation/report visibility — unchanged from before this
// round, kept here so every call site references the same function
// instead of re-typing `profile?.role === "dev"`.
export function canImpersonate(profile) {
  return isDev(profile);
}
export function canViewCrossTeam(profile) {
  return isDev(profile);
}
export function canManageDangerousConfig(profile) {
  return isDev(profile);
}

// Round 58 — Package Runner (see app/package-runner/page.js): lets
// Marketing fast-track a release straight to a locked package without
// waiting on the real artist-facing magic-link flow, for the common case
// where Marketing already knows the answer up front (e.g. an evaluated
// release that's going to be Chỉ Phát Hành regardless). Was admin+ on the
// Marketing team specifically, plus dev unconditionally.
//
// Round 77 — item 4a: per explicit request, narrowed to dev only. Admins
// on Marketing (previously allowed) can no longer reach /package-runner —
// flagging this plainly since it's a real access change, not just a label
// tweak: anyone who was using this as a Marketing admin loses it and needs
// a dev to run it for them (or to be promoted) going forward.
export function canRunPackageSimulator(profile) {
  return isDev(profile);
}

// Round 141 — Media Booking ticket (app/tickets/media-booking/page.js's
// PackageBuilderPopup): "for now", per explicit request, locked to
// Marketing admin+ (the segment that actually executes this ticket type —
// see isExecutorView on the same page) plus dev unconditionally, same
// "dev is a global bypass regardless of segment" pattern every other
// capability check here already follows. Everyone else can still see the
// ticket list/status/counts; only the package-building popup itself is
// gated by this.
export function canEditMediaBookingTicket(profile) {
  return isDev(profile) || (profile?.segment === "Marketing" && isAdminOrAbove(profile));
}

// Round 222 — Performance report (the "Performance" tab on /report,
// app/report/page.js): accumulates one artist's or song's performance
// across the app (chart history, streaming, package cost) and can mint
// a temporary shareable link. Admin+ only, per explicit request — the
// broadest-reach rollup view in the app short of dev-only cross-team
// visibility, and the only place that can generate an external-facing
// link, so it's gated above the usual team-scoped reporting.
export function canViewPerformanceReport(profile) {
  return isAdminOrAbove(profile);
}

// Round 161 — Mã PL (app/tickets/phu-luc/page.js) is normally
// auto-assigned by the per-label counter (see lib/phuLucCounter.js) and
// left alone — this gates the manual override for genuine exceptions. Per
// explicit request: AR admin+ (not the whole AR team — matches
// canEditMediaBookingTicket's "segment admin+" shape above), plus the
// WHOLE Legal team unconditionally (Legal is the executor team for this
// ticket type — see TEAM_TICKET_TYPES in lib/teamTypes.js — so any Legal
// member working the ticket can fix it, not just Legal admins), plus dev
// as the usual global bypass.
export function canEditPhuLucMaPL(profile) {
  return isDev(profile) || profile?.segment === "Legal" || (profile?.segment === "AR" && isAdminOrAbove(profile));
}
