-- Round 269 — Secret Messages: dev-only, targeted messages (one person, a
-- whole segment/team, a subteam, a role, or everyone) that show up as a
-- sidebar item + a one-time popup for whoever they're targeted at, and stay
-- there until dev deletes them. Delete is a SOFT delete (deleted_at set,
-- row kept) so dev retains a hidden audit trail of what was sent/to whom/
-- when — recipients never see a deleted row again, but dev's own list in
-- Config still shows it (greyed out) for that history. Idempotent — safe
-- to run again.

create table if not exists secret_messages (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles(id),
  -- 'individual' | 'segment' | 'subteam' | 'role' | 'all'
  target_type text not null,
  -- profiles.id (as text) for 'individual', a segment name for 'segment', a
  -- subteam name for 'subteam', a role name for 'role', null for 'all'.
  target_value text,
  message text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists secret_messages_target_idx on secret_messages (target_type, target_value);
create index if not exists secret_messages_active_idx on secret_messages (deleted_at);
