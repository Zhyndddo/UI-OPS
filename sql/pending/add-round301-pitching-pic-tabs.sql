-- Round 301 — per-tab Pitching PIC lists + default auto-fill, per
-- explicit request ("same old rule: i sent member by email for easy
-- assign"):
--
--   Priority tab:  anh.lan@vieent.vn (default), suong.tuyet@vieent.com
--   Spotify S4A:   long.bao@vieent.vn (default), suong.tuyet@vieent.com,
--                  hieu.tran@vieent.vn
--   Domestic:      hieu.tran@vieent.vn (default), suong.tuyet@vieent.com,
--                  tam.truong@vieent.vn, an.khanh@vieent.vn
--
-- Stored as one JSON object under global_settings.pitching_pic_tabs (see
-- lib/pitchingPicTabs.js), keyed by the Pitching Workstation's own
-- PIC_COLUMNS keys — "priority", "spotify" (= the Spotify S4A tab),
-- "domestic". Each holds { default, allowed }: "default" auto-fills any
-- still-unassigned row for that platform (see the Round 301 code change
-- in app/workstation/pitching/page.js's load()); "allowed" is who can be
-- picked at all for that tab's PIC dropdown, replacing the old shared
-- flat list (pitching_pic_list) for JUST these 3 tabs — Priority Apple
-- and Spotify Banner keep using that old flat list untouched.
--
-- Idempotent: safe to run more than once — always overwrites these 3
-- keys with the emails above; any other key already in the object (none
-- expected yet) is left alone.
do $$
declare
  id_anh_lan text;
  id_suong_tuyet text;
  id_long_bao text;
  id_hieu_tran text;
  id_tam_truong text;
  id_an_khanh text;
  current_val text;
  cfg jsonb;
  missing text := '';
begin
  select id::text into id_anh_lan from profiles where email = 'anh.lan@vieent.vn';
  select id::text into id_suong_tuyet from profiles where email = 'suong.tuyet@vieent.com';
  select id::text into id_long_bao from profiles where email = 'long.bao@vieent.vn';
  select id::text into id_hieu_tran from profiles where email = 'hieu.tran@vieent.vn';
  select id::text into id_tam_truong from profiles where email = 'tam.truong@vieent.vn';
  select id::text into id_an_khanh from profiles where email = 'an.khanh@vieent.vn';

  if id_anh_lan is null then missing := missing || 'anh.lan@vieent.vn '; end if;
  if id_suong_tuyet is null then missing := missing || 'suong.tuyet@vieent.com '; end if;
  if id_long_bao is null then missing := missing || 'long.bao@vieent.vn '; end if;
  if id_hieu_tran is null then missing := missing || 'hieu.tran@vieent.vn '; end if;
  if id_tam_truong is null then missing := missing || 'tam.truong@vieent.vn '; end if;
  if id_an_khanh is null then missing := missing || 'an.khanh@vieent.vn '; end if;
  if missing <> '' then
    raise notice 'No profile found for: % — that person is skipped wherever they were listed (their tab(s) still get the others). Double check the email(s) and re-run this migration once fixed.', missing;
  end if;

  select value into current_val from global_settings where key = 'pitching_pic_tabs';
  cfg := coalesce(current_val::jsonb, '{}'::jsonb);

  cfg := cfg || jsonb_build_object(
    'priority', jsonb_build_object(
      'default', to_jsonb(id_anh_lan),
      'allowed', coalesce((select jsonb_agg(x) from unnest(array[id_anh_lan, id_suong_tuyet]) as x where x is not null), '[]'::jsonb)
    ),
    'spotify', jsonb_build_object(
      'default', to_jsonb(id_long_bao),
      'allowed', coalesce((select jsonb_agg(x) from unnest(array[id_long_bao, id_suong_tuyet, id_hieu_tran]) as x where x is not null), '[]'::jsonb)
    ),
    'domestic', jsonb_build_object(
      'default', to_jsonb(id_hieu_tran),
      'allowed', coalesce((select jsonb_agg(x) from unnest(array[id_hieu_tran, id_suong_tuyet, id_tam_truong, id_an_khanh]) as x where x is not null), '[]'::jsonb)
    )
  );

  insert into global_settings (key, value, updated_at)
  values ('pitching_pic_tabs', cfg::text, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;
