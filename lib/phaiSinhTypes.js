// Round 41 — Phái Sinh / Phái Sinh (Batch) merge. Type is now the single
// switch that decides which flow a Phái Sinh ticket uses: "Phái sinh" is
// the original one-song ticket (unchanged); "Kho nhạc" / "Chuyển net" /
// "Takedown" all behave as the SAME batch flow per explicit request
// ("chuyển net and takedown count as kho nhạc") — one parent `phai_sinh`
// ticket + N children in `phai_sinh_batch_items` (the table Phái Sinh
// (Batch) already used — reused here rather than building a second one).
export const PHAI_SINH_TYPE_OPTIONS = ["Phái sinh", "Kho nhạc", "Chuyển net", "Takedown"];
const KHO_NHAC_FAMILY = ["Kho nhạc", "Chuyển net", "Takedown"];

export function isKhoNhacType(typeRequest) {
  return KHO_NHAC_FAMILY.includes((typeRequest || "").trim());
}

// "Confirm Metadata" isn't a status — it's a computed count of children
// that have all of these fields filled in. Explicit list from the
// request, flagged there as "may change in the future," so kept as one
// array rather than scattered inline.
export const CONFIRM_METADATA_FIELDS = [
  "ten_bai", "version", "the_loai", "artist", "composer", "producer", "mixer",
  "release_date", "link_audio", "link_artwork", "lyrics",
];

export function isMetadataConfirmed(item) {
  return CONFIRM_METADATA_FIELDS.every((k) => !!item[k]);
}

// Child item status vocabulary, extended (round 41) with the Kho Nhạc
// workflow's own stages (UPLOADING/DELIVERY/RECHECKING) on top of the
// original REQUESTED/PROCESS/COMPLETE/CANCELED — kept the originals for
// backward compatibility with any rows created before this round.
export const CHILD_ITEM_STATUSES = ["REQUESTED", "PROCESS", "UPLOADING", "DELIVERY", "RECHECKING", "COMPLETE", "CANCELED"];

// The 4 status-based counters (item 2d) — each just counts children whose
// `status` matches. Confirm Metadata and Takedown Bên Cũ are separate,
// non-status-based counts (see isMetadataConfirmed / the takedown_ban_cu
// column) and are computed directly where needed instead of through this
// list.
export const CHILD_STATUS_COUNTERS = ["UPLOADING", "DELIVERY", "RECHECKING", "COMPLETE"];
