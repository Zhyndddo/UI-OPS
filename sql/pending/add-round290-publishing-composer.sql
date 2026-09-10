-- Round 290 — Publishing ticket, item 3: "when tick yes in the product
-- detail page to create the ticket, also do a popup new fields, label
-- composer... free text for now."
--
-- releases.publishing_composer backs the release detail page's
-- gate_publishing popup (see lib/GateFields.js's TEXT_GATE_FIELDS —
-- extraField, alongside the existing publishing_gia_tri/"Tỉ Lệ Sở Hữu"
-- field) and app/new-release/page.js's own copy of that same popup for a
-- release still being created. Carried into the auto-created Publishing
-- ticket's data.composer either way (app/releases/[id]/page.js's saveTab,
-- app/new-release/page.js's create flow) — same pattern giaTri already
-- uses. The manual "New Ticket" form (app/tickets/publishing/new/page.js)
-- has its own independent Composer input, writing straight to
-- data.composer, not this column.
--
-- Idempotent: safe to run more than once.
alter table if exists releases
  add column if not exists publishing_composer text;
