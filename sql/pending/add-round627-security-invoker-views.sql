-- Round 627 — Supabase linter ERROR 0010 (security_definer_view): two views ran with their creator's rights and ignored the
-- caller's row level security. Make them run as the person who queries (security_invoker) and close them to the public API role.
-- The app's code does not read either view (checked), so nothing on screen changes. Idempotent.
alter view public.milestone_rank_history set (security_invoker = on);
alter view public.package_change_log_unexpected set (security_invoker = on);
revoke all on public.milestone_rank_history from anon;
revoke all on public.package_change_log_unexpected from anon;
-- CHECK (expect both rows to show security_invoker=true):
-- select relname, reloptions from pg_class where relname in ('milestone_rank_history','package_change_log_unexpected');
-- UNDO: alter view public.milestone_rank_history set (security_invoker = off); alter view public.package_change_log_unexpected set (security_invoker = off);
