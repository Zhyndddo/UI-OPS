-- Round 262 follow-up — "is making a new subteam config like this
-- better, or hardcode will be better": Marketing's 4 tags (INDIE/VPOP/
-- ENVI/VIEENT) turned out to have real hardcoded dependents elsewhere
-- (the automatic Indie auto-flag, the tag pill color map — see
-- lib/projectTags.js's MARKETING_SUBTEAM_TAGS), so per explicit
-- correction they're a hardcoded constant now, not table rows. The app
-- no longer reads `subteams` rows for Marketing at all — this just
-- removes the 4 seed rows add-round262-subteam-rework.sql inserted so
-- the table doesn't carry stale, unused data that could mislead anyone
-- looking at it directly. Harmless either way — safe to skip if you'd
-- rather leave them as a historical record.

delete from subteams where team_name = 'Marketing';
