// The two "generated note" templates shown on the release detail page's
// Pre-release & Note tab — pulled out here so other pages (the OPS Upload
// ticket list, for one) can show the same live-computed note + reuse the
// exact same option lists for its config fields, instead of re-deriving
// the template and drifting out of sync.

export function buildProductNote(f) {
  const lines = [
    `Tên Bài Hát: ${f.title || ""}`,
    `Ca sĩ: ${f.main_artist || ""}`,
    `Ngày Phát Hành: ${f.release_date || ""} ${f.release_time || ""}`,
    `---------------------`,
    `CHANNEL: ${f.requester_segment || ""}`,
    `---------------------`,
  ];
  const numbered = [
    ["LINK DRIVE", f.drive_link],
    ["LINK SHARE", f.link_share],
    ["SMARTLINK", f.smartlink],
    ["LINKDASH", f.link_lbm],
    ["UPC", f.upc],
    ["LINK UGC", f.link_ugc],
    ["MEDIA REPORT", f.link_media_report],
  ];
  numbered.forEach(([label, val], i) => {
    if (val) lines.push(`${i + 1}. ${label}: ${val}`);
  });
  return lines.join("\n");
}

export function buildLinkshareNote(f) {
  return [
    `Thời gian phát hành Tiktok: ${f.linkshare_tiktok_timing || ""}`,
    `Thời gian phát hành Facebook: ${f.linkshare_facebook_timing || ""}`,
    `Link DATA: ${f.drive_link || ""}`,
  ].join("\n");
}

// Config fields that feed buildProductNote — [key, label], edited as plain
// URL/text inputs. link_media_report is intentionally NOT here — it's
// auto-mapped from the release's magic link (see releases/[id]/page.js's
// URL tab), never hand-typed, so it has no place in an editable config panel.
export const PRODUCT_NOTE_FIELDS = [
  ["drive_link", "Link Drive"],
  ["link_share", "Link Share"],
  ["smartlink", "Smartlink"],
  ["link_lbm", "Link LBM"],
  ["upc", "UPC"],
  ["link_ugc", "Link UGC"],
];

// Streaming Workstation's auto-composed note — direct translation of the
// team's Google Sheets formula (LET/LAMBDA over columns K/O/P/T/AC/AJ/AO):
//
//   suffix := lambda(a; ifs(a>=1e9; round(a/1e9,1)&"B"; a>=1e6; round(a/1e6,1)&"M"; a>=1e3; round(a/1e3,1)&"K"; true; a))
//   stream := lambda(a,b,c; if(b=0; ""; a&": "&suffix(b)&" "&c))
//   if sum(spotify,ttview,zing,nct,ytb,ytbmusic)=0 then "" else
//     textjoin(char(10), true,
//       stream("Spotify", spotify, "streams"),
//       stream("Tiktok", ttview, "streams") & if(ttcreation=0; ""; "; "&suffix(ttcreation)&" creations"),
//       stream("Youtube", ytb, "views"),
//       stream("Youtube Music", ytbmusic, "streams"),
//       stream("Zing", zing, "streams"),
//       stream("NCT", nct, "streams"))
//
// This is a NEW/different thing from the manually-typed `stream_note`
// field already on release_stream_metrics (see StreamTable in
// app/workstation/stream/page.js) — that one stays a free-text field
// someone types into; this is a computed preview built straight from the
// same row's metric columns, offered as something to copy/fill in rather
// than auto-overwriting whatever's already been typed there.
//
// TEXTJOIN(char(10), true, ...) skips blank entries — mirrored here by
// .filter(Boolean). Note the zero-check only sums the 6 "current" metrics
// (not tiktok creations), and the Tiktok line's creations suffix is
// appended even if the base Tiktok line is itself blank (ttview=0) —
// preserved exactly as the sheet computes it, not "fixed".
function streamSuffix(n) {
  const a = Number(n) || 0;
  if (a >= 1000000000) return `${Math.round((a / 1000000000) * 10) / 10}B`;
  if (a >= 1000000) return `${Math.round((a / 1000000) * 10) / 10}M`;
  if (a >= 1000) return `${Math.round((a / 1000) * 10) / 10}K`;
  return `${a}`;
}
function streamLine(label, value, unit) {
  const v = Number(value) || 0;
  if (v === 0) return "";
  return `${label}: ${streamSuffix(v)} ${unit}`;
}
export function buildStreamNote(m) {
  const spotify = Number(m.current_spotify) || 0;
  const ttview = Number(m.views_tiktok) || 0;
  const ttcreation = Number(m.creations_tiktok) || 0;
  const zing = Number(m.current_zing) || 0;
  const nct = Number(m.current_nct) || 0;
  const ytb = Number(m.current_ytb) || 0;
  const ytbmusic = Number(m.current_ytb_music) || 0;

  if (spotify + ttview + zing + nct + ytb + ytbmusic === 0) return "";

  const tiktokLine = streamLine("Tiktok", ttview, "streams") + (ttcreation === 0 ? "" : `; ${streamSuffix(ttcreation)} creations`);

  return [
    streamLine("Spotify", spotify, "streams"),
    tiktokLine,
    streamLine("Youtube", ytb, "views"),
    streamLine("Youtube Music", ytbmusic, "streams"),
    streamLine("Zing", zing, "streams"),
    streamLine("NCT", nct, "streams"),
  ].filter(Boolean).join("\n");
}

export const LINKSHARE_TIKTOK_OPTIONS = ["Cùng Ngày", "Ngày release+4", "Ngày release+7"];
export const LINKSHARE_FACEBOOK_OPTIONS = ["Cùng ngày", "Ngày deliver+4"];

// Auto-defaults for the two Linkshare timing pickers, applied at New
// Release creation time (see app/new-release/page.js) and by the one-time
// backfill for existing releases that never got a value (see
// scripts/backfill-linkshare-timing.js). Both are pure defaults — a
// manual pick, live or backfilled, always wins; these only ever fill in
// where the value is genuinely blank.
//
// Facebook: if the release was created with at least 4 days of lead time
// before Release Date (created date <= release date − 4), default to the
// "+4" option; otherwise default to same-day.
export function defaultLinkshareFacebookTiming(createdAt, releaseDate) {
  if (!createdAt || !releaseDate) return LINKSHARE_FACEBOOK_OPTIONS[0]; // "Cùng ngày"
  const created = new Date(createdAt);
  const createdDateOnly = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate()));
  const release = new Date(`${releaseDate}T00:00:00Z`);
  const cutoff = new Date(release);
  cutoff.setUTCDate(cutoff.getUTCDate() - 4);
  return createdDateOnly.getTime() <= cutoff.getTime() ? LINKSHARE_FACEBOOK_OPTIONS[1] /* "Ngày deliver+4" */ : LINKSHARE_FACEBOOK_OPTIONS[0] /* "Cùng ngày" */;
}

// Tiktok: no date logic — if it's left blank at creation, it always
// defaults to the longest lead time option.
export function defaultLinkshareTiktokTiming() {
  return LINKSHARE_TIKTOK_OPTIONS[2]; // "Ngày release+7"
}

// Priority Pitching releases get pushed to OPS before their metadata
// checklist is actually complete (see app/releases/[id]/page.js's
// uploadReady bypass) — Smartlink specifically stays locked everywhere
// it's editable (release detail's URL tab, OPS Upload workstation,
// Confirm workstation, the Note popup's product-note config) until
// Priority Pitching is unticked, so nobody hand-fills a provisional value
// while the release is still in that state. One shared string so the
// wording never drifts between those four places.
export const PRIORITY_MODE_WARNING = "This product is in priority mode and doesn't have full data set.";
