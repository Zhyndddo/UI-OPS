-- Round 264 — per explicit request ("hardcode it in"), the whole
-- `subteams` reference table + its Config tab (Round 262/263) are
-- retired. Every team's subteam options are now hardcoded in code —
-- Marketing's in lib/projectTags.js's MARKETING_SUBTEAM_TAGS, everyone
-- else's (today just OPS's Youtube/Publishing/Operation) in
-- lib/teamTypes.js's TEAM_SUBTEAMS. Nothing in the app reads this table
-- anymore, so it's safe to drop. profiles.subteam and
-- releases.subteam_tags / subteam_tags_locked are untouched — those are
-- the real data this table only ever fed a dropdown for.
--
-- Safe to skip if you'd rather keep the table around as a dead artifact.

drop table if exists subteams;
