-- Round 667 — every Teachers' Day thank-you note is anonymous (the receiver never sees the sender's name).
-- 1) scrub the names already stored, 2) stop the receiver from reading the column at all, 3) new notes can never carry a name.
update public.thank_notes set anonymous = true, from_name = null where anonymous is not true or from_name is not null;

revoke select on public.thank_notes from authenticated;
grant select (id, to_profile, to_board, body, anonymous, created_at, read_at) on public.thank_notes to authenticated;
revoke insert on public.thank_notes from authenticated;
grant insert (from_profile, to_profile, to_board, body, anonymous) on public.thank_notes to authenticated;

alter table public.thank_notes alter column anonymous set default true;

-- VERIFY: both counts 0
select count(*) filter (where from_name is not null) as with_name, count(*) filter (where anonymous is not true) as not_anon from public.thank_notes;
-- UNDO: grant select (from_name) / insert (from_name) back; alter column anonymous set default false;
