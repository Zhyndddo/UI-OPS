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
  design: {
    label: "Design",
    requesterTeam: "ANY",
    executorTeam: "Design",
    bothEditable: [],
    fields: [
      { key: "project", label: "Project", type: "text", required: true },
      { key: "artist", label: "Artist", type: "text" },
      { key: "typeRequest", label: "Request Type", type: "text" },
      { key: "designType", label: "Design Type", type: "text" },
      { key: "size", label: "Size", type: "text" },
      { key: "priority", label: "Priority", type: "text" },
      { key: "expectedDeadline", label: "Expected Deadline", type: "date" },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  phai_sinh: {
    label: "Phái Sinh",
    requesterTeam: "AR",
    executorTeam: "OPS",
    bothEditable: ["description", "tacQuyen", "note", "url", "refLink"],
    fields: [
      { key: "tenBai", label: "Tên Bài", type: "text", required: true },
      { key: "artist", label: "Artist", type: "text", required: true },
      { key: "label", label: "Label", type: "text" },
      { key: "typeRequest", label: "Type", type: "text" },
      { key: "composer", label: "Composer", type: "text" },
      { key: "producer", label: "Producer", type: "text" },
      { key: "mixer", label: "Mixer", type: "text" },
      { key: "url", label: "URL", type: "url" },
      { key: "refLink", label: "LBM url", type: "url" },
      { key: "tacQuyen", label: "Tác Quyền", type: "textarea", required: true },
      { key: "releaseDate", label: "Release Date", type: "date" },
      { key: "releaseTime", label: "Release Time", type: "text" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  media_booking: {
    label: "Media Booking",
    requesterTeam: null,
    executorTeam: null,
    bothEditable: [],
    fields: [
      { key: "releaseId", label: "Release (DID)", type: "text", required: true },
      { key: "bookingRound", label: "Booking Round", type: "text" },
      { key: "channel", label: "Channel", type: "text" },
      { key: "requestNote", label: "Request Note", type: "textarea" },
    ],
  },
  manual_claim: {
    label: "Manual Claim",
    requesterTeam: "AR",
    executorTeam: "OPS",
    bothEditable: ["note", "url"],
    fields: [
      { key: "label", label: "Label", type: "text", required: true },
      { key: "tenBai", label: "Tên Bài", type: "text", required: true },
      { key: "artist", label: "Artist", type: "text", required: true },
      { key: "url", label: "URL", type: "url", required: true },
      { key: "note", label: "Note", type: "textarea" },
    ],
  },
  report_conflict: {
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
  khac: {
    label: "Khác",
    requesterTeam: null,
    executorTeam: null,
    bothEditable: [],
    fields: [
      { key: "request", label: "Request", type: "text", required: true },
      { key: "chiTiet", label: "Chi Tiết", type: "textarea" },
    ],
  },
};
