-- Round 305 — the "magic link for the TikTok channel reference table"
-- request, layout modeled on picture 1 (VPOP-TIKTOK / INDIE-TIKTOK /
-- TIKTOK MIỀN TÂY-BOLERO, 3 colored blocks). See app/channels/[token]/page.js
-- for the public page this token gates.
--
-- Deliberately its OWN table, not a row in `magic_links` — magic_links.
-- release_id is NOT NULL (every existing magic link is scoped to one
-- specific release: a package offer, a media report). This page shows the
-- exact same content to every viewer regardless of which release (or no
-- release at all) prompted the share — there's nothing release-specific
-- to key it to, so bolting it onto magic_links would mean either a fake
-- release_id or loosening that column's NOT NULL for everyone else's
-- links too. A small dedicated table keeps magic_links' existing meaning
-- intact.
--
-- No `locked`/`email` columns like magic_links has (no per-recipient
-- customization happens here — it's a read-only reference list, same for
-- everyone) — just enough to gate the URL and see it's actually being
-- used. `revoked_at` lets a leaked/no-longer-needed link be killed without
-- a code deploy — set it and the page starts showing "this link is no
-- longer active" the same as an unknown token.
create table if not exists channel_reference_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 16),
  created_at timestamptz not null default now(),
  created_by text,
  last_viewed_at timestamptz,
  revoked_at timestamptz
);

-- Seeds one ready-to-use token so there's an immediate concrete link
-- after running this migration — the app/booking-channels page also gets
-- a "🔗 Share Link" button (Round 305) to mint more of these later
-- without needing another SQL round. Idempotent via the label lookup
-- below (won't reseed a second row on re-run).
insert into channel_reference_share_links (created_by)
select 'round305-seed'
where not exists (select 1 from channel_reference_share_links where created_by = 'round305-seed');

-- Prints the seeded token so it's easy to find right after running this
-- in the SQL Editor, without a separate select.
do $$
declare v_token text;
begin
  select token into v_token from channel_reference_share_links where created_by = 'round305-seed';
  raise notice 'Channel reference magic link: https://ui-ops.vercel.app/channels/%', v_token;
end $$;
