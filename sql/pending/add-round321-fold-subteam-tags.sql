-- Round 321 — folds Marketing's per-subteam tags (releases.subteam_tags,
-- a {name: boolean} map going back to Round 261/262 — see
-- lib/projectTags.js's MARKETING_SUBTEAM_TAGS: INDIE/VPOP/ENVI/VIEENT)
-- into the SAME releases.tags array Round 319/320 already introduced for
-- PRJ/PUB/LBL + freeform tags. Per explicit spec: "yes, the marketing is
-- the subteam tags. fold into this for storage and appearance in the
-- detail page, the index page stay the same."
--
-- This does NOT change who can see/edit these tags — Marketing-only,
-- same gate as always (lib/permissions.js's canViewSubteamColumn /
-- visibleSubteamsFor, untouched) — and does NOT change the index page's
-- appearance at all, only where the same on/off data now lives.
--
-- releases.subteam_tags and releases.subteam_tags_locked are
-- DELIBERATELY left in place, not dropped:
--   - subteam_tags stays as the legacy fallback source for any release
--     this backfill hasn't reached yet (mirrors project_rights_type's
--     role for PRJ in Round 319) — see lib/releaseTags.js's
--     effectiveSubteamTags().
--   - subteam_tags_locked is a completely separate mechanism (whether a
--     subteam's value has ever been manually or automatically set, so
--     the INDIE auto-flag in app/releases/[id]/page.js never re-fires
--     over a real choice) — it was never a tag VALUE and has nothing to
--     do with this fold.
--
-- '_subteam_migrated' is a private marker (never rendered, filtered out
-- of freeform tags by lib/releaseTags.js's getFreeTags()) appended to
-- EVERY release here so a release with every subteam tag off afterward
-- is never mistaken for a release that hasn't been migrated yet — see
-- that file's own comment on SUBTEAM_MIGRATED_MARKER for why that
-- distinction matters.
--
-- Idempotent: safe to run more than once.
update releases
set tags = array_append(tags, '_subteam_migrated')
where not ('_subteam_migrated' = any(tags));

update releases
set tags = array_append(tags, 'INDIE')
where coalesce((subteam_tags ->> 'INDIE')::boolean, false)
  and not ('INDIE' = any(tags));

update releases
set tags = array_append(tags, 'VPOP')
where coalesce((subteam_tags ->> 'VPOP')::boolean, false)
  and not ('VPOP' = any(tags));

update releases
set tags = array_append(tags, 'ENVI')
where coalesce((subteam_tags ->> 'ENVI')::boolean, false)
  and not ('ENVI' = any(tags));

update releases
set tags = array_append(tags, 'VIEENT')
where coalesce((subteam_tags ->> 'VIEENT')::boolean, false)
  and not ('VIEENT' = any(tags));
