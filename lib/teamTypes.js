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
//
// "OPS" split into three real sub-teams per explicit request — a profile
// is now assigned Youtube, Publishing, or Operation individually instead
// of the single "OPS" segment. "OPS" itself is deliberately NOT in this
// list (kept out of the config page's profile create/reassign dropdown
// and the "View As" switcher) — it still exists everywhere else in the
// app (executorTeam in ticketConfigs.js, TEAM_TICKET_TYPES/
// TEAM_WORKSTATION_TYPES below, notDoneCounts.js, DB-side
// ticket_tabs.executor_team) as a hidden aggregate representing the union
// of the three real sub-teams, for ticket-type ownership/routing and for
// counting/reporting/summarizing (see REPORTING_TEAMS below) — never
// assigned to a profile directly. OPS_SUB_TEAMS / isOpsTeam /
// resolveTeamKey below are what make that aggregation actually work
// wherever code used to compare `segment === "OPS"` directly.
export const TEAMS = ["AR", "Marketing", "Design", "Youtube", "Publishing", "Operation", "Legal"];

// The real, individually-assignable sub-teams that together do what used
// to be one "OPS" team's work.
export const OPS_SUB_TEAMS = ["Youtube", "Publishing", "Operation"];

// True if `segment` is one of the three real OPS sub-teams, or the
// literal legacy value "OPS" itself — the latter kept as a safety net in
// case a profile or old data row still has segment="OPS" sitting around
// (add-round30-ops-sub-teams.sql migrates every existing OPS profile to
// "Operation", but this keeps things working even if a stray one slips
// through, e.g. from a not-yet-run migration on some environment).
export function isOpsTeam(segment) {
  return segment === "OPS" || OPS_SUB_TEAMS.includes(segment);
}

// Maps a real profile segment onto the key it should look itself up
// under in TEAM_TICKET_TYPES/TEAM_WORKSTATION_TYPES (which are still
// keyed by the aggregate "OPS", not by the three sub-teams individually)
// — Youtube/Publishing/Operation all resolve to "OPS"; everything else
// (AR, Marketing, Design, Legal, or "OPS" itself) passes through as-is.
export function resolveTeamKey(team) {
  return OPS_SUB_TEAMS.includes(team) ? "OPS" : team;
}

// True if `profileSegment` is who should see the executor's (fuller)
// side of a dual-view ticket type whose config/DUAL_VIEW_EXECUTOR_TEAM
// executor is `executorTeam` — handles the "OPS" aggregate case (any of
// the three sub-teams counts), plain equality for everything else.
export function isExecutorSegment(profileSegment, executorTeam) {
  if (!executorTeam) return true;
  if (executorTeam === "OPS") return isOpsTeam(profileSegment);
  return profileSegment === executorTeam;
}

// Used only by reporting/summarizing UI (currently just the Summary
// page's dev team-tab picker) where OPS should show as ONE combined tab
// instead of three separate Youtube/Publishing/Operation ones — per
// explicit request, OPS is "the name to represent the other 3 in any
// counting and reporting and summarizing." Not used for the config
// page's profile dropdown or the "View As" switcher — those use the real
// assignable TEAMS list above.
export const REPORTING_TEAMS = ["AR", "Marketing", "OPS", "Design", "Legal"];

// Round 41 — "batch_phai_sinh" removed from both team lists below: Phái
// Sinh (Batch) merged into "phai_sinh" (Type = Kho nhạc / Chuyển net /
// Takedown now drives the batch flow within that one tab, see
// lib/phaiSinhTypes.js). Its route/label mappings further down are left
// in place (harmless, unused by TypeSwitcher once removed from these
// lists) since app/tickets/batch-phai-sinh/[id]/page.js is still real and
// reused as the "Open Batch" destination.
export const TEAM_TICKET_TYPES = {
  OPS: [
    "phai_sinh", "manual_claim", "report_conflict",
    // Round 146 — artist_profile added: lib/ticketConfigs.js has always
    // set executorTeam: "OPS" for this type, but it was only ever listed
    // in AR's own array below (the requester side) — OPS's Tickets
    // switcher/index never actually showed it. Per explicit report ("it's
    // not there at the moment"), OPS gets it here too, matching the
    // config's own executorTeam.
    "artist_profile",
    "pitching_info", "pitching",
    // New Data Request sub-tickets (OPS-executed) — see lib/ticketConfigs.js
    "co_trong_net_youtube", "pre_order_itunes", "priority_sync_lyric",
    "mv_spotify", "discovery_mode_spotify", "sony_publish",
  ],
  AR: [
    "phai_sinh", "manual_claim", "report_conflict", "artist_profile", "phu_luc", "pitching_info", "pitching",
    // AR is the requester side of every new Data Request sub-ticket below
    "co_trong_net_youtube", "pre_order_itunes", "priority_sync_lyric",
    "mv_spotify", "discovery_mode_spotify", "sony_publish",
    "split_share", "phu_luc_mg", "phu_luc_publishing",
    // Round 72 — "Publishing", a genuinely separate ticket type from
    // Phụ Lục Publishing above, built the same way as plain "phu_luc" is
    // (own releases columns, no fixed executor team) — same AR + Legal
    // visibility as phu_luc, per explicit request to use it as the model.
    "publishing",
    // Round 105 — AR can now also create/see Stream Update, per explicit
    // request. stream_update has no requesterTeam/executorTeam split in
    // ticketConfigs.js (both null — single unified view, same as Marketing
    // already gets), so this is purely a visibility change: AR's /tickets
    // switcher now lists it, same generic list+form engine, no dual-view
    // logic to add since there wasn't any to begin with.
    "stream_update",
  ],
  // Round 106 item 4 — 2 new standalone ticket types, both single-unified-
  // view (requesterTeam/executorTeam null in ticketConfigs.js), Marketing
  // runs both start to finish, same as media_booking/stream_update already
  // above. Neither is wired into media_booking or the Booking Board.
  Marketing: ["media_booking", "stream_update", "youtube_ads", "booking_not_in_package"],
  Design: ["design"],
  // New Legal Request sub-tickets (Legal-executed) — see lib/ticketConfigs.js.
  // "phu_luc" added per explicit correction — "Phụ Lục Truyền Thông" was
  // never a separate ticket type, it IS Phụ Lục (just relabeled below for
  // clarity), and Legal had visibility into it under its old name, so this
  // keeps that visibility rather than losing it in the retirement.
  // "publishing" (round 72) added the same way, same reasoning as "phu_luc".
  // Round 82 item 3 — 3 new blank Legal Request-style ticket types.
  Legal: ["split_share", "phu_luc_mg", "phu_luc_publishing", "phu_luc", "publishing", "hop_dong_youtube", "hop_dong_publishing", "hop_dong_nhac_so"],
};

export const TICKET_TYPE_LABELS = {
  design: "Design",
  newrelease_upload: "Newrelease Upload",
  phai_sinh: "Phái Sinh",
  // Batch Phái Sinh — round 33, one ticket for a whole bulk derivative-
  // tracklist request instead of one ticket per song (see
  // app/tickets/batch-phai-sinh/ and phai_sinh_batch_items in schema.sql).
  batch_phai_sinh: "Phái Sinh (Batch)",
  media_booking: "Media Booking",
  manual_claim: "Manual Claim",
  report_conflict: "Report Conflict",
  artist_profile: "Artist Profile",
  // Relabeled per explicit correction — "Phụ Lục Truyền Thông" (one of the
  // round-24 placeholder Legal Request sub-tickets) was never actually a
  // separate thing from this ticket type; that placeholder is retired
  // (see GATE_TICKET_TYPES's comment in lib/GateFields.js) and this is
  // the real one. Route/data/behavior are all unchanged — label only.
  phu_luc: "Phụ Lục Truyền Thông",
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
  // Round 72 — a separate ticket type from Phụ Lục Publishing above, not
  // a relabel of it.
  publishing: "Publishing",
  // phu_luc_truyen_thong retired — see phu_luc's label above.
  // Round 82 item 3 — 3 new blank Legal Request-style ticket types.
  hop_dong_youtube: "Hợp Đồng Youtube",
  hop_dong_publishing: "Hợp Đồng Publishing",
  hop_dong_nhac_so: "Hợp Đồng Nhạc Số",
  // Round 106 item 4 — new standalone ticket types, see ticketConfigs.js.
  youtube_ads: "YouTube Ads",
  booking_not_in_package: "Booking Không Trong Package (Nghệ Sĩ Trả)",
};

export const TICKET_ROUTES = {
  design: "/tickets/design",
  newrelease_upload: "/tickets/newrelease-upload",
  phai_sinh: "/tickets/phai-sinh",
  batch_phai_sinh: "/tickets/batch-phai-sinh",
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
  publishing: "/tickets/publishing",
  // phu_luc_truyen_thong retired — see phu_luc's label above.
  // Round 82 item 3 — 3 new blank Legal Request-style ticket types.
  hop_dong_youtube: "/tickets/hop-dong-youtube",
  hop_dong_publishing: "/tickets/hop-dong-publishing",
  hop_dong_nhac_so: "/tickets/hop-dong-nhac-so",
  // Round 106 item 4 — new standalone ticket types, see ticketConfigs.js.
  youtube_ads: "/tickets/youtube-ads",
  booking_not_in_package: "/tickets/booking-not-in-package",
};

// "Khác" is genuinely shared by every team (matches the plan doc: "Khác /
// Tất cả"), so it's not tied to one team's list above — every team's
// switcher includes it in addition to their own types.
export const SHARED_TICKET_TYPES = ["khac"];

// Round 159 — "AR" added, with only "pitching" — per explicit request ("add
// pitching workstation for AR team as executor"). Previously AR had no key
// here at all, so `typesForTeam` returned an empty array for AR profiles —
// they couldn't see ANY workstation card, including Pitching. AR keeps its
// existing "pitching" and "pitching_info" TICKET visibility (see
// TEAM_TICKET_TYPES above) unchanged — this is purely the separate
// WORKSTATION card/tab list, which AR previously had zero access to.
export const TEAM_WORKSTATION_TYPES = {
  Marketing: ["booking", "package_price"],
  OPS: ["upload", "pitching", "confirm", "pre_release", "stream", "milestone"],
  AR: ["pitching"],
};

export const WORKSTATION_TYPE_LABELS = {
  booking: "Booking",
  upload: "New Release Setup", // round 77 — relabeled from "Upload" per explicit request
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
// resolveTeamKey folds Youtube/Publishing/Operation onto the "OPS" entry
// these mappings are still keyed by, so a real sub-team profile sees
// exactly what an "OPS" profile always saw.
export function typesForTeam(mapping, team, isDev) {
  if (isDev) return [...new Set(Object.values(mapping).flat())];
  return mapping[resolveTeamKey(team)] || [];
}
