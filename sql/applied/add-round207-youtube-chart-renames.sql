-- Round 207 — YouTube tab-label correction, per the team's own recheck
-- of these labels against PLATFORM_CHARTS in
-- app/workstation/milestone/page.js ("most of them is not correct").
--
-- 4 of the corrected labels are renames of tabs that already have real
-- history saved under the old name. Per explicit confirmation
-- ("Migrate old rows to the new name"), this migrates every existing
-- row from each old chart name to its new one, so the Report/Highlight
-- tabs' today-vs-yesterday comparisons, REMAIN status, and streaks stay
-- continuous across the rename — a song doesn't reset to "IN" (day 1
-- of a brand new streak) just because the tab it's tracked under got
-- relabeled.
--
-- 3 other tabs (TOP SONGS WEEKLY, TOP SONGS DAILY, Top Video Trending
-- on YTB) are being dropped from PLATFORM_CHARTS entirely, not renamed
-- into anything — per explicit confirmation ("leave the rows in place,
-- untouched"), those are NOT touched by this migration. Their existing
-- rows stay under their old chart names forever: still visible in full
-- in the Log tab, just no longer editable (no Input tab points at them
-- anymore) and they'll drop out of Report/Highlight the next time
-- "today" no longer includes them.
--
-- Each UPDATE is scoped to platform = 'YouTube' as well as the old
-- chart name, matching how the app itself always scopes chart names
-- per-platform. If any of these hits the table's own unique constraint
-- (chart, track_title, artist, entry_date) — i.e. a row already exists
-- under the NEW name for the same song/artist/day — the whole statement
-- fails and rolls back rather than silently dropping data; that would
-- mean two differently-named rows already collided on the same
-- identity, which needs a human decision, not a guess, so re-check with
-- the team before re-running rather than deduping this blindly.

update milestone_chart_entries
  set chart = 'YOUTUBE CHARTS | Trending Music'
  where chart = 'YOUTUBE CHARTS | VIETNAM TRENDING MUSIC' and platform = 'YouTube';

update milestone_chart_entries
  set chart = 'YOUTUBE CHARTS | Daily Top Music Videos'
  where chart = 'YOUTUBE CHARTS | Top Videos Daily' and platform = 'YouTube';

update milestone_chart_entries
  set chart = 'YOUTUBE CHARTS | Weekly Top Artists'
  where chart = 'YOUTUBE CHARTS | TOP ARTISTS WEEKLY' and platform = 'YouTube';

update milestone_chart_entries
  set chart = 'PLAYLIST YOUTUBE MUSIC | The Hit List'
  where chart = 'PLAYLIST YOUTUBE | The Hit List' and platform = 'YouTube';

update milestone_chart_entries
  set chart = 'PLAYLIST YOUTUBE MUSIC | RELEASED'
  where chart = 'PLAYLIST YOUTUBE | RELEASED' and platform = 'YouTube';
