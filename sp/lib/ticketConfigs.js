// Field configs for the ticket types sharing the generic list+form system
// (Newrelease Upload and Phụ Lục have bespoke pages for special logic).
// Matches the entity_fields seeded in schema.sql for each type.
//
// requesterTeam/executorTeam drive the dual-view pattern from v1: the same
// ticket type renders differently depending on which team you're viewing
// from — a plain table with narrow edit rights (requester) vs. status
// filter tabs + full edit (executor). requesterTeam: 'ANY' means every
// team except the executor team sees the requester view (Design can be
// requested by anyone). null on both means no dual view at all — a single
// unified view, matching types with no natural requester/executor split
// (auto-created or single-team tickets like Phụ Lục, Package Prep).
//
// bothEditable — field keys editable by BOTH sides even in dual-view mode
// (matches v1 exactly: description/note-type fields stayed open to the
// requester even though most fields locked to executor-only).

export const TICKET_CONFIGS = {
  // design intentionally NOT here anymore — it has its own bespoke pages
  // now (app/tickets/design/page.js + new/page.js) since it needs the
  // real Platform → Design Type → Size cascade, salvaged from v1's actual
  // Config admin panel. Every other type below still uses the generic
  // list+form system.
  phai_sinh: {
    // NOTE: the create form is now a bespoke page
    // (app/tickets/phai-sinh/new/page.js) — Type + Deadline share a row,
    // Composer/Lyricist are paired, and Artist/Label reference the
    // Artist/Label List tables, none of which the generic NewTicketPage
    // renderer supports well enough to be worth the special-casing. This
    // fields list (and defaultDeadlineFrom below) is kept only as a record
    // of the field set/labels — it's no longer read by any create form.
    // The list view (app/tickets/phai-sinh/page.js) is also bespoke and
    // doesn't read this config either.
    defaultDeadlineFrom: "releaseDate",
    label: "Phái Sinh",
    requesterTeam: "AR",
    executorTeam: "OPS",
    bothEditable: ["description", "tacQuyen", "note", "url", "refLink"],
    fields: [
      { key: "tenBai", label: "Tên Bài", type: "text", required: true },
      { key: "relatedDid", label: "Related DID", type: "relatedDid" },
      { key: "artist", label: "Artist", type: "text", required: true },
      { key: "featureArtist", label: "Feature Artist", type: "text" },
      { key: "label", label: "Label", type: "text" },
      { key: "typeRequest", label: "Type", type: "text" },
      { key: "composer", label: "Composer", type: "text" },
      { key: "lyricist", label: "Lyricist", type: "text" },
      { key: "producer", label: "Producer", type: "text" },
      { key: "mixer", label: "Mixer", type: "text" },
      { key: "url", label: "URL", type: "url" },
      // refLink (LBM url) and note are no longer collected at ticket
      // creation — OPS fills them in later from the list view — but the
      // keys stay real data fields once a ticket exists, so they're kept
      // here for the record.
      { key: "refLink", label: "LBM url", type: "url" },
      { key: "tacQuyen", label: "Tác Quyền", type: "textarea", required: true },
      { key: "releaseDate", label: "Release Date", type: "date" },
      { key: "releaseTime", label: "Release Time", type: "text" },
      { key: "description", label: "Description", type: "textarea", defaultValue: "Full CID, FB +4 ngày, TikTok +7 ngày" },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  // media_booking intentionally NOT here anymore — bespoke pages now
  // (app/tickets/media-booking/page.js + new/page.js), since it's where
  // the real package-building popup lives (Propose Package template
  // picker + editable itemized package + magic link generation).
  manual_claim: {
    releaseFieldMap: { attachTo: "tenBai", map: { tenBai: "title", artist: "main_artist", label: "label" } },
    label: "Manual Claim",
    requesterTeam: "AR",
    executorTeam: "OPS",
    bothEditable: ["note", "url"],
    fields: [
      { key: "label", label: "Label", type: "text", required: true },
      { key: "tenBai", label: "Tên Bài", type: "text", required: true },
      { key: "artist", label: "Artist", type: "text", required: true },
      // Round 80 — plain free-typed text, not a real timestamp/date picker
      // (per explicit request), optional at creation, editable anytime
      // after — same as every other field on this ticket.
      { key: "claimTimestamp", label: "Claim Timestamp", type: "text" },
      {
        key: "url",
        label: "URL",
        type: "url",
        required: true,
        // Multiple claims often mean multiple links — paste rows straight
        // out of Excel (each row keeps its own line) or just hit Enter
        // between them. The Manual Claim list shows each line as its own
        // clickable link when it's a real URL (see MultiLinkCell).
        multiline: true,
        placeholder: "https://…\nhttps://…\nhttps://…",
        helpText: "One link per line — paste straight from Excel or press Enter between links. Too many to list? Put them in a Google Sheet and paste that sheet's link here instead.",
      },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  // report_conflict intentionally NOT here anymore — bespoke pages now
  // (app/tickets/report-conflict/page.js + new/page.js), as of Round 144.
  // Reasons this outgrew the generic engine: a Type-dependent field (the
  // Official link slot edits officialURL for TikTok/Facebook/Spotify but
  // linkMVYoutube for YouTube), a grouped/sectioned form layout, an
  // auto-fill map wider than releaseFieldMap supports (Label/Original
  // Release Date/Official Song Title/Official Artist/Official ISRC/
  // Official UPC, all off the picked release), and — the generic engine
  // has no support for this at all — a genuinely different column SET per
  // status tab on the list view, several of them computed (combined
  // "A / B" display columns, dates read off status_log, a Hủy tab hidden
  // from the bar entirely while the underlying status stays valid). Old
  // field list kept below purely as a historical record of the pre-Round-
  // 144 shape — nothing reads it anymore.
  // report_conflict_LEGACY_UNUSED: {
  //   releaseFieldMap: { attachTo: "assetTitle", map: { assetTitle: "title", artist: "main_artist" } },
  //   label: "Report Conflict",
  //   requesterTeam: "AR",
  //   executorTeam: "OPS",
  //   bothEditable: ["note"],
  //   fields: [
  //     { key: "conflictType", label: "Type", type: "text", required: true },
  //     { key: "assetTitle", label: "Asset Title", type: "text", required: true },
  //     { key: "artist", label: "Artist", type: "text" },
  //     { key: "reportedURL", label: "Reported Sound Link", type: "url", required: true },
  //     { key: "officialSongTitle", label: "Official Song Title", type: "text", required: true },
  //     { key: "officialArtist", label: "Official Artist", type: "text", required: true },
  //     { key: "officialISRC", label: "Official ISRC", type: "text" },
  //     { key: "officialUPC", label: "Official UPC", type: "text" },
  //     { key: "officialURL", label: "Official URL", type: "url" },
  //     { key: "originalReleaseDate", label: "Original Release Date", type: "text" },
  //     { key: "tiktokProfile", label: "TikTok Profile", type: "text" },
  //     { key: "linkMVYoutube", label: "MV YouTube Link", type: "url" },
  //     { key: "originalSoundLink", label: "Original Sound Link", type: "url" },
  //     { key: "textBlock", label: "Text Block", type: "textarea" },
  //     { key: "note", label: "Note", type: "textarea" },
  //   ],
  // },
  artist_profile: {
    label: "Artist Profile",
    // Also auto-created from gate_artist_profile_verify at New Release
    // creation and from the release detail page's Save — one ticket PER
    // ARTIST checked in that gate's panel (see lib/GateFields.js's
    // ArtistProfileVerifyPanel), not one shared ticket for the whole
    // release. Round 97 follow-up — oneTicketPerRelease turned OFF here
    // (was on): that flag makes this manual "+ New Ticket" form's
    // ReleasePicker hide any release that already has ANY ticket of this
    // type, which was right back when it really was "at most one per
    // release" but is now wrong — a release with one artist's ticket
    // already sent can still need a second one for a different artist,
    // and hiding it from the picker's suggestions was exactly the gap
    // flagged after round 97 shipped. Off means every release shows up in
    // suggestions regardless of existing tickets — the real per-artist
    // idempotency guard lives in the gate's own panel/saveTab() logic, not
    // here; this only ever controlled picker suggestions, never a hard
    // block (the DID can always be typed by hand either way).
    oneTicketPerRelease: false,
    requesterTeam: "AR",
    executorTeam: "OPS",
    bothEditable: [],
    // Round 166 — the manual "+ New Ticket" form (app/tickets/artist-
    // profile/new/page.js) no longer reads this `fields` array; it went
    // bespoke like the list page already was, because the real field set
    // now depends on which of 7 request types is picked (see
    // lib/artistProfileRequestTypes.js — the new single source of truth
    // for both pages). Left here unchanged, matching the OLD flat shape,
    // purely as the legacy-ticket display fallback the list page's
    // isLegacyTicket()/DetailCell still reads for tickets created before
    // this round (including ones still auto-created from the release
    // detail page's Artist Profile Verify gate, which is unchanged this
    // round and still writes this exact shape).
    fields: [
      { key: "artistName", label: "Tên Nghệ Sĩ", type: "text", required: true },
      { key: "email", label: "Email Nghệ Sĩ", type: "text", required: true },
      { key: "latestSong", label: "Bài Hát Phát Hành Gần Nhất", type: "text" },
      { key: "spotifyUrl", label: "Spotify URL", type: "url" },
      { key: "appleUrl", label: "Apple URL", type: "url" },
      { key: "fbUrl", label: "Facebook URL", type: "url" },
    ],
  },
  stream_update: {
    releaseFieldMap: { attachTo: "releaseId", map: { releaseId: "did" } },
    label: "Stream Update",
    requesterTeam: null,
    executorTeam: null,
    bothEditable: [],
    fields: [
      { key: "releaseId", label: "DID", type: "text", required: true },
      { key: "platform", label: "Platform", type: "text", required: true },
      { key: "metric", label: "Metric", type: "text" },
      { key: "value", label: "Value", type: "text" },
    ],
  },
  // ── Data Request / Legal Request sub-tickets ────────────────────────────
  // One ticket type per gate field on the release detail page's Data
  // Request / Marketing Request / Legal Request groups (lib/GateFields.js),
  // per the "every request tick gets a related ticket" wave. Deliberately
  // minimal ("leave blank" per explicit request) — just enough to exist,
  // link back to the originating release, and carry a note. Each is
  // triggered from the release page (see the "Send Ticket"/"Open Ticket"
  // affordance added to GateGrid) once its gate field is ticked "Yes", but
  // can also be created standalone here via the generic /new form, same as
  // Stream Update. Flesh out fields on each one individually as follow-up
  // rounds cover them — this round is the placeholder/plumbing pass only.
  // This config block is no longer read by anything as of round 32 — both
  // the list (app/tickets/co-trong-net-youtube/page.js) and the manual
  // create form (…/new/page.js) are fully bespoke now (Teaser/Official/
  // Short-period/Mô Tả don't fit the generic engine's one-column-per-field
  // model). Kept only as a record of the original placeholder field set.
  co_trong_net_youtube: {
    releaseFieldMap: { attachTo: "releaseId", map: { releaseId: "did" } },
    label: "Có Trong Net YouTube",
    oneTicketPerRelease: true,
    requesterTeam: "AR",
    executorTeam: "OPS",
    bothEditable: ["note"],
    fields: [
      { key: "releaseId", label: "DID", type: "text", required: true },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  pre_order_itunes: {
    releaseFieldMap: { attachTo: "releaseId", map: { releaseId: "did" } },
    label: "Pre-order Itunes",
    oneTicketPerRelease: true,
    requesterTeam: "AR",
    executorTeam: "OPS",
    bothEditable: ["note"],
    fields: [
      { key: "releaseId", label: "DID", type: "text", required: true },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  priority_sync_lyric: {
    releaseFieldMap: { attachTo: "releaseId", map: { releaseId: "did" } },
    label: "Priority Sync Lyric",
    oneTicketPerRelease: true,
    requesterTeam: "AR",
    executorTeam: "OPS",
    bothEditable: ["note"],
    fields: [
      { key: "releaseId", label: "DID", type: "text", required: true },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  mv_spotify: {
    releaseFieldMap: { attachTo: "releaseId", map: { releaseId: "did" } },
    label: "Music Video on Spotify",
    oneTicketPerRelease: true,
    requesterTeam: "AR",
    executorTeam: "OPS",
    bothEditable: ["note"],
    fields: [
      { key: "releaseId", label: "DID", type: "text", required: true },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  // Also no longer read by anything as of round 32 — bespoke list
  // (app/tickets/discovery-mode-spotify/page.js) and create form
  // (…/new/page.js), same reason/pattern as Sony Publish/Music Video on
  // Spotify (Link LBM mapped straight back to the release, Clip Status is
  // a single-choice dropdown the generic engine has no concept of). Kept
  // only as a record of the original placeholder field set.
  discovery_mode_spotify: {
    releaseFieldMap: { attachTo: "releaseId", map: { releaseId: "did" } },
    label: "Discovery Mode on Spotify",
    oneTicketPerRelease: true,
    requesterTeam: "AR",
    executorTeam: "OPS",
    bothEditable: ["note"],
    fields: [
      { key: "releaseId", label: "DID", type: "text", required: true },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  // This config block only backs the generic manual "New Ticket" form
  // (app/tickets/sony-publish/new) — the real list view is fully bespoke
  // (app/tickets/sony-publish/page.js), same as Music Video on
  // Spotify/Pre-order Itunes/Priority Sync Lyric. Sony Publish's real
  // auto-creation is special-cased (not the generic "Yes -> ticket"
  // pattern every other type here uses): it only fires once the 4
  // required Metadata Checklist fields are all filled, and creating it
  // also sends the release to the Upload workstation — see
  // app/new-release/page.js's performInsert() and app/releases/[id]/
  // page.js's saveTab() for that logic, and SonyPublishLockRow.js /
  // useSonyPublishDids.js for the Upload/Pre-release Workstation row
  // lock that kicks in once this ticket exists.
  sony_publish: {
    releaseFieldMap: { attachTo: "releaseId", map: { releaseId: "did" } },
    label: "Sony Publish",
    oneTicketPerRelease: true,
    requesterTeam: "AR",
    executorTeam: "OPS",
    bothEditable: ["note"],
    fields: [
      { key: "releaseId", label: "DID", type: "text", required: true },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  split_share: {
    // Distinct from releases.split_share_entries (the inline % / Shared
    // Label / Scope editor already on the Legal Request group) — that
    // editor is untouched. This ticket is the new Legal-team tracking
    // surface for the request itself, not a replacement for the entries.
    releaseFieldMap: { attachTo: "releaseId", map: { releaseId: "did" } },
    label: "Splitshare",
    oneTicketPerRelease: true,
    requesterTeam: "AR",
    executorTeam: "Legal",
    bothEditable: ["note"],
    fields: [
      { key: "releaseId", label: "DID", type: "text", required: true },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  phu_luc_mg: {
    releaseFieldMap: { attachTo: "releaseId", map: { releaseId: "did" } },
    label: "Phụ Lục MG",
    oneTicketPerRelease: true,
    requesterTeam: "AR",
    executorTeam: "Legal",
    bothEditable: ["note"],
    fields: [
      { key: "releaseId", label: "DID", type: "text", required: true },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  phu_luc_publishing: {
    releaseFieldMap: { attachTo: "releaseId", map: { releaseId: "did" } },
    label: "Phụ Lục Publishing",
    oneTicketPerRelease: true,
    requesterTeam: "AR",
    executorTeam: "Legal",
    bothEditable: ["note"],
    fields: [
      { key: "releaseId", label: "DID", type: "text", required: true },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  // phu_luc_truyen_thong retired per explicit correction — it was never a
  // real distinct ticket type, it IS the existing "phu_luc" type (see
  // that type's own definition, and GATE_TICKET_TYPES's comment in
  // lib/GateFields.js). The config block that used to live here, the
  // /tickets/phu-luc-truyen-thong wrapper pages, and its ticket_tabs seed
  // row are all removed — see add-round31-*.sql for the matching cleanup
  // of any tickets a stray earlier version of this app may have already
  // created under that key.
  // Round 82 item 3 — 3 new blank Legal Request-style ticket types, per
  // explicit request ("blank template"). Same minimal shape as
  // split_share/phu_luc_mg/phu_luc_publishing directly above (DID + note,
  // one ticket per release, AR requests / Legal executes) — no bespoke
  // fields of their own.
  hop_dong_youtube: {
    releaseFieldMap: { attachTo: "releaseId", map: { releaseId: "did" } },
    label: "Hợp Đồng Youtube",
    oneTicketPerRelease: true,
    requesterTeam: "AR",
    executorTeam: "Legal",
    bothEditable: ["note"],
    fields: [
      { key: "releaseId", label: "DID", type: "text", required: true },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  hop_dong_publishing: {
    releaseFieldMap: { attachTo: "releaseId", map: { releaseId: "did" } },
    label: "Hợp Đồng Publishing",
    oneTicketPerRelease: true,
    requesterTeam: "AR",
    executorTeam: "Legal",
    bothEditable: ["note"],
    fields: [
      { key: "releaseId", label: "DID", type: "text", required: true },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  hop_dong_nhac_so: {
    releaseFieldMap: { attachTo: "releaseId", map: { releaseId: "did" } },
    label: "Hợp Đồng Nhạc Số",
    oneTicketPerRelease: true,
    requesterTeam: "AR",
    executorTeam: "Legal",
    bothEditable: ["note"],
    fields: [
      { key: "releaseId", label: "DID", type: "text", required: true },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  khac: {
    label: "Khác",
    requesterTeam: null,
    executorTeam: null,
    bothEditable: [],
    fields: [
      { key: "request", label: "Request", type: "text", required: true },
      { key: "chiTiet", label: "Chi Tiết", type: "textarea" },
      // Round 86 item 1 — switched from a free-typed email to a searchable
      // NAME field (lib/ProfileSearchField.js), referencing profiles from
      // ALL teams (not team-scoped) per explicit request. Still defaults
      // to Zhyn so every "Khác" ticket lands on their radar without anyone
      // having to remember to add it, but "Zhyn" has no literal profiles
      // row anywhere — it's the dev-team nickname for whoever's email is
      // an.thien@vieent.vn (see lib/Sidebar.js's DEFAULT_KHAC_LABEL). The
      // literal string below is a resolution marker, not a real name —
      // NewTicketPage looks up the real profiles.name for that email at
      // mount and swaps it in if the field is still untouched. Anyone
      // filling out the form can still edit or clear it either way.
      { key: "alsoNotify", label: "Also Notify (CC)", type: "profileSearch", defaultValue: "__ZHYN__" },
    ],
  },
  // Round 106 item 4a — "YouTube Ads" ticket, for ads run OUTSIDE the
  // Booking Board/Package flow entirely (per explicit request: "làm cái
  // ticket mới để chạy ads ngoài"). No shared data with media_booking —
  // this is its own standalone record. relatedDid is optional (an ads run
  // may or may not tie back to a specific release); when it IS filled in,
  // the magic link page (app/pick-package/[token]/page.js) looks up any
  // youtube_ads tickets whose relatedDid matches the release's DID and
  // shows a card next to the normal package display with the booked
  // quantity + result, per explicit clarification: "add a column right
  // next to the normal package in the magic links so that the booking
  // number show how many has been booked and what is the result."
  // requesterTeam/executorTeam both null — single unified view, same as
  // media_booking/stream_update — Marketing runs these themselves
  // start to finish (see teamTypes.js).
  youtube_ads: {
    releaseFieldMap: { attachTo: "relatedDid", map: { relatedDid: "did" } },
    label: "YouTube Ads",
    requesterTeam: null,
    executorTeam: null,
    bothEditable: [],
    fields: [
      { key: "relatedDid", label: "DID Liên Quan (nếu có)", type: "relatedDid" },
      { key: "adUrl", label: "Link Ads", type: "url" },
      { key: "soLuong", label: "Số Lượng Đặt (booked)", type: "text", placeholder: "vd: 55000 thruplay" },
      { key: "note", label: "Note", type: "textarea" },
      // Filled in after the ads actually run — kept as its own field
      // (rather than reusing "note") so the magic link card can show it
      // as a distinct labeled value.
      { key: "result", label: "Kết Quả (result)", type: "textarea", helpText: "Điền sau khi ads đã chạy xong." },
    ],
  },
  // Round 106 item 4b — "Booking Not In Package" — the "Nghệ Sĩ Trả"
  // (artist-pays) counterpart to Media Booking/Booking Board's "Vieent
  // Trả" (company-pays, tracked in the report). Per explicit correction,
  // this is NOT wired into Media Booking or the Booking Board at all —
  // "not related to the current package ticket and booking board. so same
  // mechanic but don't have auto ticket, just manual request" — so it's a
  // wholly independent ticket type through the generic engine, same
  // field-shape idea (Hạng Mục/brand/quantity) as a booking request but
  // created manually only, no auto-trigger.
  booking_not_in_package: {
    releaseFieldMap: { attachTo: "relatedDid", map: { relatedDid: "did" } },
    label: "Booking Không Trong Package (Nghệ Sĩ Trả)",
    requesterTeam: null,
    executorTeam: null,
    bothEditable: [],
    fields: [
      { key: "relatedDid", label: "DID", type: "relatedDid", required: true },
      { key: "hangMuc", label: "Hạng Mục", type: "text", required: true },
      { key: "brand", label: "Brand", type: "text" },
      { key: "soLuong", label: "Số Lượng", type: "text" },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
};
