-- Round 433 -- surgical fix for ONE line: e2dd4174-420c-471a-8e79-71afd93ce048
-- (release DID DHKL-19092026-0080 "Dong Huong Dong Nai", TikTok Channel,
-- locked package "Doc Quyen Vinh Vien").
--
-- Does NOT touch the team's already-correct hand-fix on
-- EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT (left at 20, matches pre-corruption).
-- Adds back only the one bracket the team's fix missed --
-- TIKTOK BOLERO / MT::TIKTOK LYRICS, still sitting at the corrupted value
-- (10) and should be 15 -- and recomputes quantity/amount as the sum of
-- all 4 brand columns at their now-correct values (2 + 15 + 20 + 0 = 37,
-- amount = 37 units * 700,000/unit = 25,900,000), which matches the
-- confirmed pre-corruption totals exactly.
--
-- Single atomic statement, self-verifying like Step 3b: raises an
-- exception (auto-rollback, nothing committed) if the result does not
-- come out to exactly qty=37 / amount=25900000 / the 4-column mix below.
-- Run as ONE execution/one paste.

do $$
begin
  update media_booking_package_lines set
    quantity = 37,
    brand_column_quantities = '{"TIKTOK INDIE::TIKTOK LYRICS": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0}'::jsonb,
    amount = 25900000
  where id = 'e2dd4174-420c-471a-8e79-71afd93ce048';

  if (select quantity from media_booking_package_lines where id = 'e2dd4174-420c-471a-8e79-71afd93ce048') is distinct from 37
     or (select amount from media_booking_package_lines where id = 'e2dd4174-420c-471a-8e79-71afd93ce048') is distinct from 25900000
     or (select brand_column_quantities from media_booking_package_lines where id = 'e2dd4174-420c-471a-8e79-71afd93ce048')
        is distinct from '{"TIKTOK INDIE::TIKTOK LYRICS": 2, "TIKTOK BOLERO / MT::TIKTOK LYRICS": 15, "EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT": 20, "EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT": 0}'::jsonb
  then
    raise exception 'Round 433 DHKL surgical fix verification failed for line e2dd4174-420c-471a-8e79-71afd93ce048';
  end if;

  raise notice 'Round 433 DHKL-19092026-0080 surgical fix: verified and committed.';
end $$;
