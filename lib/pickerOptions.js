// Small shared option lists that need to stay identical across more than
// one page — pulled out here so they can't drift out of sync the way
// canva_status's options almost did (see the comment in
// app/workstation/pre-release/page.js about the CANVA/MV label swap).

// releases.canva_status — labeled "MV" on the Pre-release Workstation.
// Also reused as the conditional field revealed under Metadata Checklist's
// "MV" toggle (meta_mv) on the New Release form and the release detail
// page's Overview tab — ticking that toggle "Yes" pops this picker up
// right below it, per explicit request; it's the SAME underlying field
// the Pre-release Workstation already edits, not a new column.
export const MV_TYPE_OPTIONS = ["", "LYRIC", "Đã có", "Chưa có", "Không có"];

// Labels reference table (app/labels/page.js) — Hợp Tác is now a
// multi-select tag picker instead of free text; Phân Loại is now a
// single-choice select instead of free text. Both per explicit request.
export const LABEL_HOP_TAC_OPTIONS = ["Youtube", "Publishing", "Nhạc Số"];
export const LABEL_PHAN_LOAI_OPTIONS = ["Priority", "New", "Collab before"];
