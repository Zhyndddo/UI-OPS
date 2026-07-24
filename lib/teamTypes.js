// Single source of truth for "which ticket/workstation types belong to
// which team" — used by Summary, the Tickets index/switcher, and the
// Workstation index/switcher, so these three don't drift out of sync.

export const TEAMS = ["AR", "Marketing", "OPS", "Design"];

export const TEAM_TICKET_TYPES = {
  OPS: ["newrelease_upload", "phai_sinh", "manual_claim", "report_conflict"],
  AR: ["phai_sinh", "manual_claim", "report_conflict", "artist_profile", "phu_luc"],
  Marketing: ["media_booking", "stream_update"],
  Design: ["design"],
};

export const TICKET_TYPE_LABELS = {
  design: "Design",
  newrelease_upload: "Newrelease Upload",
  phai_sinh: "Phái Sinh",
  media_booking: "Media Booking",
  manual_claim: "Manual Claim",
  report_conflict: "Report Conflict",
  artist_profile: "Artist Profile",
  phu_luc: "Phụ Lục",
  stream_update: "Stream Update",
  khac: "Khác",
  pitching: "Pitching",
};

export const TICKET_ROUTES = {
  design: "/tickets/design",
  newrelease_upload: "/tickets/newrelease-upload",
  phai_sinh: "/tickets/phai-sinh",
  media_booking: "/tickets/media-booking",
  manual_claim: "/tickets/manual-claim",
  report_conflict: "/tickets/report-conflict",
  artist_profile: "/tickets/artist-profile",
  phu_luc: "/tickets/phu-luc",
  stream_update: "/tickets/stream-update",
  khac: "/tickets/khac",
  pitching: "/tickets/pitching-ticket", // no dedicated ticket page yet — falls back to /tickets if visited directly
};

// "Khác" is genuinely shared by every team (matches the plan doc: "Khác /
// Tất cả"), so it's not tied to one team's list above — every team's
// switcher includes it in addition to their own types.
export const SHARED_TICKET_TYPES = ["khac"];

export const TEAM_WORKSTATION_TYPES = {
  Marketing: ["booking", "package_price"],
  OPS: ["confirm", "pre_release", "pitching"],
};

export const WORKSTATION_TYPE_LABELS = {
  booking: "Booking",
  confirm: "Re-Check",
  pre_release: "Pre-release",
  pitching: "Pitching",
  package_price: "Package Price Management",
};

export const WORKSTATION_ROUTES = {
  booking: "/booking",
  confirm: "/workstation/confirm",
  pre_release: "/workstation/pre-release",
  pitching: "/workstation/pitching",
  package_price: "/workstation/package-price",
};

// dev has no team and sees everything; admin/exc are fixed to their own
// team's list. Returns the raw type keys (ticket or workstation), not routes.
export function typesForTeam(mapping, team, isDev) {
  if (isDev) return [...new Set(Object.values(mapping).flat())];
  return mapping[team] || [];
}
