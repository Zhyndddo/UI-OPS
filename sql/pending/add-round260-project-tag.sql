-- Round 260 — replaces Round 258's plain boolean INDIE flag with a real
-- single-choice project tag, per explicit request/follow-ups: "click on
-- it will cycle through ... 'INDIE'; 'VPOP'; 'ENVI', 'VIEENT', 'NONE'"
-- (values corrected in chat from an initial 'MITA' -> 'ENVI', then VIEENT
-- added) — these 4 real values line up with booking_channels.brand's own
-- raw grouping vocabulary (see that column's comment: "VIEENT / ENVI -
-- MIỀN TÂY/BOLERO / INDIE / VPOP / capcut"), which is also what the new
-- automatic-flag check (app/releases/[id]/page.js) reads against.
--
-- project_tag_locked tracks whether a human has ever manually set this
-- release's tag (via the dashboard's flag icon or the detail page's
-- switch) OR the automatic Indie-flag check has already fired once —
-- either way, once locked, nothing auto-sets this release's tag again;
-- only another manual action can change it. This is what makes the
-- automatic flag genuinely "one time, no change unless manually
-- unflag[ged]" instead of re-firing forever.
--
-- If Round 258's is_indie column was already applied and has real data on
-- it, backfill it manually after this migration:
--   update releases set project_tag = 'INDIE', project_tag_locked = true
--     where is_indie = true and project_tag is null;
-- (left as a manual step, not run automatically here, since is_indie may
-- not exist at all if Round 258 was never deployed — this migration
-- doesn't depend on it either way.)

alter table releases add column if not exists project_tag text;
alter table releases add column if not exists project_tag_locked boolean not null default false;
