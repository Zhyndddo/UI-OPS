-- Round 154 — Splitshare ticket didn't have a CANCEL status option, so
-- reverting a mistakenly-ticked gate meant using REFUND instead — which
-- deliberately means something different elsewhere in the app ("kicked
-- back to the requester, still their problem", not dead — see
-- lib/notDoneCounts.js's TERMINAL_EXECUTOR comment), and a REFUND ticket
-- still counted as "active" for the dashboard's Splitshare tag pill.
--
-- This appends "CANCEL" to the split_share ticket type's existing
-- status_options (does NOT overwrite/replace whatever options already
-- exist — array-append, idempotent: safe to run more than once, won't
-- add a duplicate).
--
-- Assumes ticket_tabs.status_options is a Postgres array column (text[]),
-- matching how every other ticket_tabs status_options update in this
-- project's history has worked. If your actual column type is jsonb
-- instead, this will error — let me know and I'll rewrite it for that
-- type.

UPDATE ticket_tabs
SET status_options = status_options || ARRAY['CANCEL']
WHERE key = 'split_share'
  AND NOT ('CANCEL' = ANY(status_options));
