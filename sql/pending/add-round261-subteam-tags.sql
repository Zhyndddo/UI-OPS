-- Round 261 — subteam tagging system, per explicit request/spec:
--
-- 1. profiles.subteam (text, nullable) — a NEW, separate dimension from
--    role/segment. Free text, manually assigned by admin/dev in Config ->
--    Team ("I will manually filled them in so no worries about that") —
--    no fixed list/enum on purpose, so adding a new subteam later needs
--    zero schema changes, just typing its name into someone's row.
--
-- 2. releases.subteam_tags (jsonb, default '{}') — one boolean per
--    subteam, keyed by that exact subteam name (matches profiles.subteam
--    text), e.g. {"Social Media": true}. A map instead of one column per
--    subteam for the same reason as #1 — a fixed column per subteam
--    would need a migration every time a new subteam is added, which is
--    exactly the "more subteam, more complicated" scaling problem this
--    was designed to avoid.

alter table profiles add column if not exists subteam text;
alter table releases add column if not exists subteam_tags jsonb not null default '{}'::jsonb;
