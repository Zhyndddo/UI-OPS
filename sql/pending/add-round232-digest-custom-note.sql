-- Round 232 — a free-text note field for the daily digest email, editable
-- from Config -> Notifications, per explicit request ("add a field ...
-- so I can change the email content when things get more developed").
-- Rendered near the top of the digest (below the title, above Tickets)
-- when non-empty; blank/null shows nothing, same as today.

alter table notification_settings add column if not exists digest_custom_note text;
