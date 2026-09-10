-- Round 280 — daily reminder popup for outstanding Bổ Sung DATA rows (see
-- lib/BoSungDataReminder.js). Ticking "Don't remind me today" writes
-- now() + 24h here; the reminder stays suppressed for that profile until
-- this timestamp passes, then starts showing again on their next session.
--
-- Idempotent: safe to run more than once.
alter table if exists profiles
  add column if not exists bo_sung_data_snooze_until timestamptz;
