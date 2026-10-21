-- Round 480 — Cost Marketing: frozen "TikTok Booking" snapshots + magic links.
-- A snapshot is the sheet-style report (partner tab + month) copied at the
-- moment someone clicks "Freeze & mint link". The public page
-- (/cost-report/<token>) reads ONLY this row — later edits in Cost Marketing
-- never change it; mint a new one to update. Rows double as the history list
-- in the app; deleting a row revokes the link. No expiry.
-- Additive, idempotent, touches nothing existing. Needs NO Round 418 resync.
create table if not exists cost_mkt_snapshots (
  id uuid primary key default gen_random_uuid(),
  token text not null default generate_base36_token(),
  title text not null,
  funded_by text,
  channel_kind text,
  brand text,
  month_label text,
  payload jsonb not null,
  created_by text,
  created_at timestamptz not null default now()
);
create unique index if not exists cost_mkt_snapshots_token_idx on cost_mkt_snapshots (token);
create index if not exists cost_mkt_snapshots_created_idx on cost_mkt_snapshots (created_at desc);

-- This app has no RLS; access is plain grants. Public page = anon (read by
-- token); staff create/delete.
grant select on public.cost_mkt_snapshots to anon, authenticated;
grant insert, delete on public.cost_mkt_snapshots to authenticated;

-- CHECK (read-only): should return one row.
select table_name from information_schema.tables where table_name = 'cost_mkt_snapshots';
