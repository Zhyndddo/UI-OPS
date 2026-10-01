-- URGENT v2 — run this whole file now. It's a superset of the first file:
-- includes the same safe GRANT fixes (still needed — anon was missing
-- UPDATE on releases/magic_links and INSERT/UPDATE on tickets per your
-- diagnostic output) PLUS a check for the more likely real cause.
--
-- Your diagnostic showed anon already has SELECT on releases — so a missing
-- table GRANT isn't actually what's blocking the artist's page load (that
-- was a plain .select(), which should have worked). The much more likely
-- cause: row-level security got switched ON for `releases` with zero
-- policies defined — this whole app has NO row-level security anywhere
-- else (confirmed: zero CREATE POLICY / ENABLE ROW LEVEL SECURITY
-- statements in the schema), so if RLS got toggled on for just this one
-- table (e.g. via the "Enable RLS" banner/button in the Supabase Table
-- Editor — a very easy accidental click), it blocks everyone instantly —
-- including with a GRANT fully intact — in a way that can surface to
-- PostgREST/the browser as exactly "permission denied for table releases".

-- STEP A — check RLS status on every table this flow touches.
-- relrowsecurity = true with no matching policy is the smoking gun.
select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relname in (
  'releases', 'magic_links', 'tickets', 'ticket_tabs',
  'media_booking_entries', 'media_booking_packages', 'package_categories',
  'contract_type_packages', 'global_settings', 'release_package_items',
  'release_stream_metrics', 'milestone_chart_entries', 'milestone_viral_posts'
)
and relnamespace = 'public'::regnamespace
order by relname;

-- Also list any policies that DO exist on these tables (expect 0 rows —
-- if this returns anything, read it before touching Step B, it means
-- someone intentionally added a policy and Step B below could be wrong).
select schemaname, tablename, policyname, roles, cmd, qual
from pg_policies
where tablename in (
  'releases', 'magic_links', 'tickets', 'ticket_tabs',
  'media_booking_entries', 'media_booking_packages', 'package_categories',
  'contract_type_packages', 'global_settings', 'release_package_items',
  'release_stream_metrics', 'milestone_chart_entries', 'milestone_viral_posts'
);

-- STEP B — if Step A shows rls_enabled = true for `releases` (or any other
-- table above) and the policy list came back empty, turn RLS back off for
-- that table to match how every other table in this app already works.
-- UNCOMMENT only the lines for tables Step A actually flagged — don't run
-- blind against ones that were already false.
-- alter table public.releases disable row level security;
-- alter table public.magic_links disable row level security;
-- alter table public.tickets disable row level security;
-- alter table public.ticket_tabs disable row level security;
-- alter table public.media_booking_entries disable row level security;
-- alter table public.media_booking_packages disable row level security;
-- alter table public.package_categories disable row level security;
-- alter table public.contract_type_packages disable row level security;
-- alter table public.global_settings disable row level security;
-- alter table public.release_package_items disable row level security;
-- alter table public.release_stream_metrics disable row level security;
-- alter table public.milestone_chart_entries disable row level security;
-- alter table public.milestone_viral_posts disable row level security;

-- STEP C — the GRANT fixes from before. Still needed regardless of the RLS
-- finding above — anon's diagnostic output showed it's missing UPDATE on
-- releases/magic_links and INSERT+UPDATE on tickets, which confirmChoice()
-- (picking/locking a package) and the auto-created Phụ Lục ticket both need.
-- Safe/idempotent to run even if some of these already exist.
grant select, update on public.releases to anon, authenticated;
grant select, update on public.magic_links to anon, authenticated;
grant select, insert, update on public.tickets to anon, authenticated;
grant select, insert on public.release_package_items to anon, authenticated;
grant select on public.contract_type_packages to anon, authenticated;
grant select on public.global_settings to anon, authenticated;
grant select on public.ticket_tabs to anon, authenticated;
grant select on public.media_booking_entries to anon, authenticated;
grant select on public.media_booking_packages to anon, authenticated;
grant select on public.package_categories to anon, authenticated;
grant select on public.release_stream_metrics to anon, authenticated;
grant select on public.milestone_chart_entries to anon, authenticated;
grant select on public.milestone_viral_posts to anon, authenticated;

-- STEP D — after Step B/C, have the artist (or you, in an incognito/logged-
-- out browser tab) reload the same Package Offer link and confirm the page
-- actually renders now.
