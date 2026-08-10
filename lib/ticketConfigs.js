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
  report_conflict: {
    releaseFieldMap: { attachTo: "assetTitle", map: { assetTitle: "title", artist: "main_artist" } },
    label: "Report Conflict",
    requesterTeam: "AR",
    executorTeam: "OPS",
    bothEditable: ["note"],
    fields: [
      { key: "conflictType", label: "Type", type: "text", required: true },
      { key: "assetTitle", label: "Asset Title", type: "text", required: true },
      { key: "artist", label: "Artist", type: "text" },
      { key: "reportedURL", label: "Reported Sound Link", type: "url", required: true },
      { key: "officialSongTitle", label: "Official Song Title", type: "text", required: true },
      { key: "officialArtist", label: "Official Artist", type: "text", required: true },
      { key: "officialISRC", label: "Official ISRC", type: "text" },
      { key: "officialUPC", label: "Official UPC", type: "text" },
      { key: "officialURL", label: "Official URL", type: "url" },
      { key: "originalReleaseDate", label: "Original Release Date", type: "text" },
      { key: "tiktokProfile", label: "TikTok Profile", type: "text" },
      { key: "linkMVYoutube", label: "MV YouTube Link", type: "url" },
      { key: "originalSoundLink", label: "Original Sound Link", type: "url" },
      { key: "textBlock", label: "Text Block", type: "textarea" },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  artist_profile: {
    label: "Artist Profile",
    // Also auto-created from gate_artist_profile at New Release creation
    // and from the release detail page's Save — see oneTicketPerRelease's
    // comment on the Data Request sub-tickets below for what this flag does.
    oneTicketPerRelease: true,
    requesterTeam: "AR",
    executorTeam: "OPS",
    bothEditable: [],
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
  khac: {
    label: "Khác",
    requesterTeam: null,
    executorTeam: null,
    bothEditable: [],
    fields: [
      { key: "request", label: "Request", type: "text", required: true },
      { key: "chiTiet", label: "Chi Tiết", type: "textarea" },
      // Defaults to Zhyn's own account so every "Khác" ticket also lands
      // on their radar without anyone having to remember to add it — free
      // text, not a real notification-system hookup, since Khác doesn't
      // have an executor/PIC concept to plug into (executorTeam: null
      // above). Anyone filling out the form can still edit or clear it.
      { key: "alsoNotify", label: "Also Notify (CC)", type: "text", defaultValue: "an.thien@vieent.vn" },
    ],
  },
};
