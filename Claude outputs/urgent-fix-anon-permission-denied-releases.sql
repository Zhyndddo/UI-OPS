-- URGENT — artist-facing magic link (Package Offer / Media Report) is broken
-- Reported symptom: an artist opening their pick-package link gets a raw
-- "permission denied for table releases" error instead of their page.
--
-- Context: this app has NO row-level security policies anywhere (confirmed
-- by grepping the whole schema reference — zero ENABLE ROW LEVEL SECURITY /
-- CREATE POLICY statements). The artist-facing pages
-- (app/pick-package/[token]/page.js, app/channels/[token]/page.js,
-- app/performance-report/[token]/page.js) are opened with NO login at all —
-- they run as Supabase's plain "anon" role. That means the ENTIRE security
-- model for what an artist can see/do depends only on plain Postgres table
-- GRANTs to the anon role. "permission denied for table X" (as opposed to
-- an empty/zero-row result) is the exact error Postgres gives when a table
-- GRANT is missing entirely — not an RLS-policy rejection. Something
-- revoked (or never granted, e.g. after a table was recreated by hand
-- outside Supabase's own migration flow) anon's privileges on at least
-- `releases`.
--
-- STEP 1 — diagnostic. Run this first and send me the output (or just eyeball
-- it): lists what anon/authenticated currently have on every table the
-- pick-package magic link page touches. Any row missing for `anon` below is
-- a table that will break the same way the moment that code path runs.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'releases', 'magic_links', 'tickets', 'ticket_tabs',
    'media_booking_entries', 'media_booking_packages', 'package_categories',
    'contract_type_packages', 'global_settings', 'release_package_items',
    'release_stream_metrics', 'milestone_chart_entries', 'milestone_viral_posts'
  )
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- STEP 2 — the fix. Re-grants exactly what each table needs for the
-- pick-package magic link flow (verified against the actual .select/.update/
-- .insert calls in app/pick-package/[token]/page.js), to both `anon` (the
-- artist, unauthenticated) and `authenticated` (staff — almost certainly
-- already fine, but re-granting is harmless/idempotent and cheap insurance
-- against the same issue hitting a staff view of these tables).
--
-- Read-only tables for this flow:
grant select on public.contract_type_packages to anon, authenticated;
grant select on public.global_settings to anon, authenticated;
grant select on public.ticket_tabs to anon, authenticated;
grant select on public.media_booking_entries to anon, authenticated;
grant select on public.media_booking_packages to anon, authenticated;
grant select on public.package_categories to anon, authenticated;
grant select on public.release_stream_metrics to anon, authenticated;
grant select on public.milestone_chart_entries to anon, authenticated;
grant select on public.milestone_viral_posts to anon, authenticated;

-- Read + write tables (the artist's own actions: picking/locking a
-- package, the auto-created Phụ Lục ticket, marking the media-booking
-- ticket COMPLETE, recording last_used_at on the magic link):
grant select, update on public.releases to anon, authenticated;
grant select, update on public.magic_links to anon, authenticated;
grant select, insert, update on public.tickets to anon, authenticated;
grant select, insert on public.release_package_items to anon, authenticated;

-- STEP 3 — re-run the Step 1 query after this to confirm every row is now
-- present for `anon`. If `releases` (or any other table above) still
-- doesn't show up for `anon` afterward, row level security may have been
-- turned ON for that specific table outside of this app's normal schema
-- (check with: select relrowsecurity from pg_class where relname =
-- 'releases';) — that needs a POLICY added, not just a GRANT, and is a
-- different fix I can write once you confirm that's the case.
