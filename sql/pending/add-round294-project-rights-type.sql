-- Round 294 — project rights-type tag, per explicit request from AR/OPS:
-- classify every product (New Release AND Phái Sinh) into exactly one of
-- 3 rights situations:
--   PRJ_INHOUSE  — Dự án tự sản xuất (self-produced)
--   PRJ_LICENSED — Dự án mua cấp phép (licensed)
--   PRJ_OWNED    — Dự án mua đứt quyền sở hữu vĩnh viễn (bought outright)
-- See lib/projectRightsType.js for the full label/requirement text per
-- code — deliberately no CHECK constraint (this repo's convention, see
-- sql/README.md — short-enum text columns are validated in the app
-- layer, not the DB).
--
-- Single-select, one column, nullable (no tag set = null) — NOT a
-- column-per-type boolean set like Marketing's subteam_tags (Round 261).
--
-- Two homes, per explicit scoping decision:
--   1. releases.project_rights_type — New Release side (index, detail
--      page, and the New Release Setup create form all read/write this).
--   2. phai_sinh_batch_items.project_rights_type — Phái Sinh's Kho
--      Nhạc/Chuyển Net/Takedown batch family, per line item (same
--      granularity as Round 270's tac_quyen_master/vocal/author columns
--      on this same table). The single "Phái sinh" ticket type (no batch
--      items) stores its value in tickets.data.projectRightsType instead
--      — no schema change needed there, it's already jsonb.
--
-- Idempotent: safe to run more than once.
alter table if exists releases
  add column if not exists project_rights_type text;

alter table if exists phai_sinh_batch_items
  add column if not exists project_rights_type text;
