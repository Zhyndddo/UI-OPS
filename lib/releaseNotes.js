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
