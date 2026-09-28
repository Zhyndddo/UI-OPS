-- Round 433 Step 4 -- DIAGNOSTIC ONLY. No writes, safe to run directly.
--
-- This is the full sweep the user asked for: every release with
-- release_date >= 2026-08-01, resolved to its CURRENT locked package
-- (same INT MEDIA / Internal Package / exact project_type match as
-- buildPackageByRelease()), diffed across the confirmed corruption
-- boundary (2026-09-23 07h -> 13h, from the data-backups git branch)
-- for every field the pre-Round-433 resync could have overwritten.
--
-- That produced 39 candidate lines across 20 releases -- a much narrower,
-- more precise list than the original 113-candidate/33-release heuristic,
-- because this one diffs REAL values across the actual corruption window
-- instead of guessing from coincidental cross-package quantity matches.
-- (Separately: ~400 packages were touched by that Friday resync overall --
-- but nearly all of that is the resync CORRECTLY recomputing non-locked
-- packages. This list is only the locked packages it should never have
-- touched.)
--
-- Of the 39, 36 still show the exact post-corruption
-- value as of the 2026-09-28 04h backup -- those look safe to
-- auto-restore (Step 5). The other 3 have already changed SINCE the corruption --
-- meaning someone (the team, doing exactly the manual fixes you mentioned)
-- already touched them, so an automatic restore could clobber real manual
-- work. Those are flagged for manual review instead, not auto-fixed.
--
-- Purpose of THIS query: re-check all 39 against LIVE production right now
-- (the backup snapshot above is a few hours old) before Step 5 runs, in case
-- anyone touched one of the 36 'still corrupted' lines in the last few hours.
-- Paste the result back and I'll re-split the list if anything moved.
--
-- Per your second ask -- only apply the fix where a package still shows the
-- duplicate-quantity signature, otherwise report it for manual review -- the
-- `still_has_duplicate_sibling` column below re-runs that exact check live:
-- true means some OTHER package on the same release, same category+brand,
-- currently has the identical quantity (the original Step 1 fingerprint).
-- A line that comes back false here -- even if its own value still matches
-- the corrupted snapshot -- means whatever it was coincidentally matching
-- has since moved, so I'll pull it out of the Step 5 auto-fix and move it to
-- manual review too, alongside the 3 already flagged.

select
  l.id as line_id,
  r.did as release_did,
  r.title as release_title,
  cat.name as category_name,
  l.brand,
  pkg.name as package_name,
  l.quantity,
  l.brand_column_quantities,
  l.metric_quantities,
  l.detail,
  l.amount,
  exists (
    select 1
    from media_booking_package_lines other
    join media_booking_packages other_pkg on other_pkg.id = other.package_id
    where other_pkg.release_id = r.id
      and other.category_id = l.category_id
      and coalesce(other.brand, '') = coalesce(l.brand, '')
      and other.package_id <> l.package_id
      and other.quantity = l.quantity
  ) as still_has_duplicate_sibling
from media_booking_package_lines l
join media_booking_packages pkg on pkg.id = l.package_id
join releases r on r.id = pkg.release_id
join package_categories cat on cat.id = l.category_id
where l.id in (
  '53141e9f-f902-44ad-af00-755fddd1019e',
  'ddda953e-bbc0-4d9d-8ef0-22e2ca6743f5',
  '776ae362-f307-4c38-b39f-6c9cb82499eb',
  'd5a7127d-e174-4ecc-9429-549f42bffb56',
  '960bbec3-0b62-4a23-9eb2-20fcaba30c43',
  '99164d31-36e8-4e3a-b36d-d84a55c115a2',
  '54ec75ab-e259-4317-a99d-c507bfd2b059',
  'db0a5548-5324-4658-8ecf-3413063461c4',
  '5528cd29-6f2d-465d-b122-ce28210af68b',
  '66cf7123-8231-42ac-9906-0cf1a2586fc1',
  '322ad595-1eb2-498a-9079-7c85c7d2a212',
  '723f3bfc-2066-4579-b2ec-f437d638778a',
  '5f6208bd-401a-43b3-a214-7def11654c9d',
  '720471b5-7d22-4794-9b31-edc2d5daab99',
  'a5150180-7afd-4394-bd71-56d1bb8d833f',
  'c81da73a-1a7d-4623-9d34-0f6b24a0b2e4',
  '099bc560-51de-47f3-8590-4e0d5feff500',
  'a42e8c7a-8642-4795-ad3e-259e8b95e52d',
  '8a64a572-c8c0-4b6a-8f99-279c40bf7ec7',
  '8a4ad863-27e7-439d-a0c3-4dbc5dce7bcf',
  '30d373c7-f731-4a76-8455-aa2abf672e94',
  'e2dd4174-420c-471a-8e79-71afd93ce048',
  'eeebe9d6-8a93-47f2-9c5d-56b0c56f5eaf',
  '11b2f48d-b396-4152-ab1d-c75a157ec2b6',
  'e5ffb8d1-2ffa-4c3c-a9a1-4e3c24c35678',
  '3c7ced09-d4d4-4119-86d4-171b805771f7',
  '256c846d-2066-4618-beb3-7636258fcc39',
  '80e289b9-9f56-4c8b-b5ad-a3705f456ba8',
  '6db25ccf-a99b-45c5-bbde-136f6e725012',
  'a17718a6-e7a5-48e9-a2d0-ee1b905205e4',
  'fc9bfe9e-8304-4ad1-9e2a-19beea0590fa',
  'a184f996-f669-4a6e-aaae-7d4a3e48c3a8',
  'f72b6fe1-8fc5-419e-9b6f-48ce151670cd',
  '780de0a4-052f-4a59-93b1-707502e1d62e',
  'dd38de32-3cf4-4095-8cf6-087693378815',
  'bc0bbc76-7f17-4bb6-9f2c-5a3369cecaca',
  '9db2108c-c1b9-4b97-b296-35ef9b2114a0',
  '6ad9ac2d-7ebf-436d-a665-2143c5a672ba',
  'a6eced61-995e-45e6-b2a8-707311b1e009'
)
order by r.title, cat.name, l.brand;
