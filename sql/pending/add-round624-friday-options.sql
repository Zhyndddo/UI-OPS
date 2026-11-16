-- Round 624 — Friday: more intake kinds + DM alert switch. Idempotent.
alter table public.tg_intakes drop constraint if exists tg_intakes_kind_check;
alter table public.tg_intakes add constraint tg_intakes_kind_check
  check (kind in ('upload','phai_sinh','presave','time_change','deliver','confirm','pitching','lyric_fix','sound_cut'));
alter table public.tg_links add column if not exists alerts boolean not null default false;   -- opt-in: /alert in the private chat turns it on
alter table public.tg_links add column if not exists last_alert_on date;
-- UNDO: alter table public.tg_links drop column alerts, drop column last_alert_on;
