-- Round 710 — Friday can create a release from the group chat (/new or "tạo release không?" on an upload request). Idempotent.
-- Only widens the allowed intake kinds so the request can be stored (and shown in the recap as "Tạo release").
alter table public.tg_intakes drop constraint if exists tg_intakes_kind_check;
alter table public.tg_intakes add constraint tg_intakes_kind_check
  check (kind in ('upload','phai_sinh','presave','time_change','deliver','confirm','pitching','lyric_fix','sound_cut','create_release'));
-- UNDO: re-run add-round624-friday-options.sql (restores the previous list; delete create_release rows first).
