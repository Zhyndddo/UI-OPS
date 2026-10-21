-- Round 453 followup — per-package-instance exception for the ĐIỀU KIỆN CAM
-- KẾT text (the "XX năm" commitment-duration lines, e.g. "Các bản phái sinh
-- từ bản sáng tác: 03 năm"). Today that text comes entirely from
-- contract_type_packages.terms_text, a GLOBAL config keyed by package tier
-- name (Config → Package Terms) — editing it changes the wording for every
-- release that uses that tier, which isn't what's wanted when just one
-- release/package needs a different number.
--
-- This adds a nullable per-package override column. When set, it takes
-- precedence over the global contract_type_packages.terms_text for that one
-- package row only (see app/pick-package/[token]/page.js's termsText
-- computation and the new "Edit Commitment Terms" button + popup in the
-- Package Builder, app/tickets/media-booking/page.js). Leaving it NULL (the
-- default — nothing changes for existing packages) keeps falling back to the
-- global text exactly as before.
--
-- Deliberately a stopgap, not a real per-release terms system — the plan is
-- to revisit this properly as part of the feedback-route rework.
--
-- Safe to run once; safe to re-run (IF NOT EXISTS guard).

ALTER TABLE media_booking_packages
  ADD COLUMN IF NOT EXISTS terms_text_override text;
