-- Round 176 — Internal Package shortcut, per explicit request.
--
-- Mirrors int_media_requested exactly: a boolean flag on releases that
-- tracks whether the "Send Internal Package Follow-up" button has already
-- been used for this release (so it can disable itself, same as the
-- existing INT MEDIA follow-up button does). Deliberately its own column
-- rather than reusing int_media_requested — the two follow-ups are
-- independent now (using one doesn't disable or interfere with the
-- other), see app/releases/[id]/page.js's sendInternalPackageTicket.

alter table releases add column if not exists internal_package_requested boolean default false not null;
