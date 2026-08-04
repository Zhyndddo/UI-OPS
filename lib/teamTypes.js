// Single source of truth for "which ticket/workstation types belong to
// which team" — used by Summary, the Tickets index/switcher, and the
// Workstation index/switcher, so these three don't drift out of sync.
//
// ticket_tabs.executor_team (schema.sql / add-notifications.sql) mirrors
// this on the SQL side, for the notification system's "who gets pinged on
// a new ticket" trigger — a DB trigger can't import this file, so if
// TEAM_TICKET_TYPES or DUAL_VIEW_EXECUTOR_TEAM (lib/notDoneCounts.js) ever
// change which team owns a type, update the matching ticket_tabs row too.

// "Legal" added per explicit request — the "Data Request → related ticket
// per field" wave introduces 4 Legal-executed ticket types (Splitshare,
// Phụ Lục MG, Phụ Lục Publishing, Phụ Lục Truyền Thông). Two OTHER places
// duplicate this list as a local hardcoded const instead of importing it —
// app/config/page.js (Team picker on profile create/reassign) and
// lib/TopBar.js (dev "View As" team switcher) — both updated to match.
export const TEAMS = ["AR", "Marketing", "OPS", "Design", "Legal"];

export const TEAM_TICKET_TYPES = {
  OPS: [
    "phai_sinh", "manual_claim", "report_conflict", "pitching_info", "pitching",
    // New Data Request sub-tickets (OPS-executed) — see lib/ticketConfigs.js
    "co_trong_net_youtube", "pre_order_itunes", "priority_sync_lyric",
    "mv_spotify", "discovery_mode_spotify", "sony_publish",
  ],
  AR: [
    "phai_sinh", "manual_claim", "report_conflict", "artist_profile", "phu_luc", "pitching_info", "pitching",
    // AR is the requester side of every new Data Request sub-ticket below
    "co_trong_net_youtube", "pre_order_itunes", "priority_sync_lyric",
    "mv_spotify", "discovery_mode_spotify", "sony_publish",
    "split_share", "phu_luc_mg", "phu_luc_publishing", "phu_luc_truyen_thong",
  ],
  Marketing: ["media_booking", "stream_update"],
  Design: ["design"],
  // New Legal Request sub-tickets (Legal-executed) — see lib/ticketConfigs.js
  Legal: ["split_share", "phu_luc_mg", "phu_luc_publishing", "phu_luc_truyen_thong"],
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
  pitching_info: "Pitching Info",
  // New Data Request / Legal Request sub-tickets — one per gate field, see
  // lib/GateFields.js's DATA_REQUEST_FIELDS/LEGAL_REQUEST_FIELDS for the
  // field this mirrors.
  co_trong_net_youtube: "Có Trong Net YouTube",
  pre_order_itunes: "Pre-order Itunes",
  priority_sync_lyric: "Priority Sync Lyric",
  mv_spotify: "Music Video on Spotify",
  discovery_mode_spotify: "Discovery Mode on Spotify",
  sony_publish: "Sony Publish",
  split_share: "Splitshare",
  phu_luc_mg: "Phụ Lục MG",
  phu_luc_publishing: "Phụ Lục Publishing",
  phu_luc_truyen_thong: "Phụ Lục Truyền Thông",
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
  // Now has a dedicated bespoke list page (app/tickets/pitching/page.js) —
  // "move that to the ticket system" per explicit request. Was previously
  // "/tickets/pitching-ticket" with no page behind it (fell back to
  // /tickets if visited directly).
  pitching: "/tickets/pitching",
  pitching_info: "/tickets/pitching-info",
  co_trong_net_youtube: "/tickets/co-trong-net-youtube",
  pre_order_itunes: "/tickets/pre-order-itunes",
  priority_sync_lyric: "/tickets/priority-sync-lyric",
  mv_spotify: "/tickets/mv-spotify",
  discovery_mode_spotify: "/tickets/discovery-mode-spotify",
  sony_publish: "/tickets/sony-publish",
  split_share: "/tickets/split-share",
  phu_luc_mg: "/tickets/phu-luc-mg",
  phu_luc_publishing: "/tickets/phu-luc-publishing",
  phu_luc_truyen_thong: "/tickets/phu-luc-truyen-thong",
};

// "Khác" is genuinely shared by every team (matches the plan doc: "Khác /
// Tất cả"), so it's not tied to one team's list above — every team's
// switcher includes it in addition to their own types.
export const SHARED_TICKET_TYPES = ["khac"];

export const TEAM_WORKSTATION_TYPES = {
  Marketing: ["booking", "package_price"],
  OPS: ["upload", "pitching", "confirm", "pre_release", "stream", "milestone"],
};

export const WORKSTATION_TYPE_LABELS = {
  booking: "Booking",
  upload: "Upload",
  confirm: "Re-Check",
  pre_release: "Pre-release",
  pitching: "Pitching",
  stream: "Streaming",
  milestone: "Milestone",
  package_price: "Package Price Management",
};

export const WORKSTATION_ROUTES = {
  booking: "/booking",
  upload: "/workstation/upload",
  confirm: "/workstation/confirm",
  pre_release: "/workstation/pre-release",
  pitching: "/workstation/pitching",
  stream: "/workstation/stream",
  milestone: "/workstation/milestone",
  package_price: "/workstation/package-price",
};

// dev has no team and sees everything; admin/exc are fixed to their own
// team's list. Returns the raw type keys (ticket or workstation), not routes.
export function typesForTeam(mapping, team, isDev) {
  if (isDev) return [...new Set(Object.values(mapping).flat())];
  return mapping[team] || [];
}
