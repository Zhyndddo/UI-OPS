-- Round 258 — "INDIE" project flag, per explicit request: Marketing's team
-- lead needs a simple way to tag any release as INDIE, settable from the
-- New Release dashboard (index page, inline per row) or from the release
-- detail page's header (a small switch, visible only to the same people
-- who can flag it), plus a dashboard filter to show just INDIE releases.
-- Boolean, defaults false so every existing release is unaffected.

alter table releases add column if not exists is_indie boolean not null default false;
