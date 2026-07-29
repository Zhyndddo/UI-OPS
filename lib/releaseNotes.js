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
