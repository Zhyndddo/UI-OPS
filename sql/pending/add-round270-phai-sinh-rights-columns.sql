-- Round 270 — split the batch table's single "Tác quyền" free-text field
-- into 3 columns, one per right, matching New Release's Copyright
-- Checklist breakdown (Q1 Bản ghi / Q2 Người biểu diễn / Q3 Tác giả), per
-- explicit request ("a column copyrights for each row (3 rights just
-- like the new release)"). Scope deliberately limited to Owner-per-right
-- text — not the full Owner/Contract/Validity structure New Release
-- uses on releases.copyright_checklist — since the batch table is a flat
-- spreadsheet-style grid (paste/file-import + inline cell edit), not a
-- per-track popup editor.
--
-- The existing `tac_quyen` column is left as-is, untouched: any row
-- imported before this round keeps its value there and still displays
-- fine (that column simply stops being written to by new imports/edits
-- going forward — see lib/phaiSinhBatchParse.js and
-- app/tickets/batch-phai-sinh/[id]/page.js).
alter table if exists phai_sinh_batch_items
  add column if not exists tac_quyen_master text,
  add column if not exists tac_quyen_vocal text,
  add column if not exists tac_quyen_author text;
