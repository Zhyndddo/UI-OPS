-- ============================================================================
-- Round 621 — Ma Sói: soft-lock fix when EVERY wolf is sick ("Kẻ bệnh tật" was bitten the night before)
-- ============================================================================
-- Run once in the Supabase SQL editor (idempotent). Safe while a game is running.
-- Bug: after the Kẻ bệnh tật is killed, the wolves "can not bite tomorrow night" (state.no_bite_day) and the app already refuses their vote,
-- but the night kept waiting for those same wolves to confirm a bite — so the night only ended at its deadline (looked like a freeze).
-- Fix: wolves who can not bite tonight are not waited for. If no wolf can bite, the wolf stage closes at once (no victim, the witch is told
-- "the wolves chose nobody") and the night goes on with the other roles as usual. Everything else is unchanged.
create or replace function public.ms_wolves_done(g uuid) returns boolean
language plpgsql stable as $$
declare gm public.ms_games;
begin
  select * into gm from public.ms_games where id = g;
  return exists (select 1 from public.ms_players where game_id = g and alive and public.ms_is_wolf(role))
    and not exists (select 1 from public.ms_players w where w.game_id = g and w.alive and public.ms_is_wolf(w.role)
      and w.id <> coalesce(nullif(gm.ctx->>'blocked','')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      and coalesce((w.state->>'no_bite_day')::int, 0) <> gm.day_no
      and not exists (select 1 from public.ms_actions a where a.game_id = g and a.phase_no = gm.phase_no and a.player_id = w.id and a.kind = 'wolf_vote' and a.confirmed))
    and not exists (select 1 from public.ms_players c where c.game_id = g and c.alive and c.role = 'cupid' and gm.day_no = 1
      and not exists (select 1 from public.ms_actions a where a.game_id = g and a.phase_no = gm.phase_no and a.player_id = c.id and a.kind = 'cupid'));
end $$;
