// Shared milestone chart-name normalization table — extracted round 189
// from scripts/import-milestone-total-streak.js so it can be reused by
// scripts/import-milestone-input.js (and any future milestone import)
// without drifting out of sync. See that script's file-level comment
// for the full history of how this table was built; see this file's
// own trailing comments for entries added since.
//
// Keyed by `${rawChart}␟${rawPlatform}` (raw, as the team's sheets
// happened to label a chart/platform pair) -> the canonical
// { chart, platform } pair from app/workstation/milestone/page.js's
// PLATFORM_CHARTS. An unmapped pair should be reported and skipped, not
// guessed at — see either import script's handling of unmappedCounts.
const CHART_MAP = {
  "APPLE MUSIC - Top ALTERNATIVE Albums␟Apple": { chart: "APPLE MUSIC - Top ALTERNATIVE Albums", platform: "Apple" },
  "APPLE MUSIC - Top DANCE Albums␟Apple": { chart: "APPLE MUSIC - Top DANCE Albums", platform: "Apple" },
  "APPLE MUSIC -Top HIPHOP/RAP Albums␟Apple": { chart: "APPLE MUSIC -Top HIPHOP/RAP Albums", platform: "Apple" },
  "APPLE MUSIC CHART - Top ALBUMs Vietnam␟Apple": { chart: "APPLE MUSIC - Top ALBUMs Vietnam", platform: "Apple" },
  // Round 189 — "APPLE CHARTS - Top ALBUMs Vietnam" is a 3rd wording
  // variant of the same chart (seen in the "input" sheet's Sam milestone
  // workbook, alongside the "APPLE MUSIC CHART - ..." variant above).
  "APPLE CHARTS - Top ALBUMs Vietnam␟Apple": { chart: "APPLE MUSIC - Top ALBUMs Vietnam", platform: "Apple" },
  "APPLE MUSIC CHART - Top ALTERNATIVE Albums␟Apple": { chart: "APPLE MUSIC - Top ALTERNATIVE Albums", platform: "Apple" },
  "APPLE MUSIC CHART - Top DANCE Albums␟Apple": { chart: "APPLE MUSIC - Top DANCE Albums", platform: "Apple" },
  "APPLE MUSIC CHART - Top POP Album␟Apple": { chart: "APPLE MUSIC - Top POP Albums", platform: "Apple" },
  "APPLE MUSIC | Top Songs Vietnam␟Apple": { chart: "Apple Music - Top Songs Vietnam", platform: "Apple" },
  "Apple Daily Album␟Apple": { chart: "Apple Daily Album", platform: "Apple" },
  "Apple Music - Top Alternative Songs␟Apple": { chart: "Apple - Top Alternative Songs", platform: "Apple" },
  "Apple Music - Top Dance Songs␟Apple": { chart: "Apple Music - Top Dance Songs", platform: "Apple" },
  "Apple Music - Top Hiphop/Rap Songs␟Apple": { chart: "Apple Music - Top Hiphop/Rap Songs", platform: "Apple" },
  "Apple Music - Top POP Songs␟Apple": { chart: "Apple Music - Top POP Songs", platform: "Apple" },
  "Apple Music CHART - Top Alternative Songs␟Apple": { chart: "Apple - Top Alternative Songs", platform: "Apple" },
  "Apple Music CHART - Top Dance Songs␟Apple": { chart: "Apple Music - Top Dance Songs", platform: "Apple" },
  "Apple Playlist | New Music Daily␟Apple": { chart: "Playlist New Music Daily", platform: "Apple" },
  "Apple Playlist | Vietnam Ơi␟Apple": { chart: "Playlist Vietnam Ơi!", platform: "Apple" },
  "BXH NHẠC MỚI␟Zing": { chart: "ZMP3|BXH NHẠC MỚI", platform: "Zing" },
  // Round 189 — the "input" sheet's own block titles already use the exact
  // canonical strings ("ZMP3|BXH NHẠC MỚI" / "ZMP3|ZING CHART" below), so
  // they need a pass-through alias to themselves rather than a rename.
  "ZMP3|BXH NHẠC MỚI␟Zing": { chart: "ZMP3|BXH NHẠC MỚI", platform: "Zing" },
  "ZMP3|ZING CHART␟Zing": { chart: "ZMP3|ZING CHART", platform: "Zing" },
  "DAILY TOP ARTISTS␟Spotify": { chart: "DAILY TOP ARTIST", platform: "Spotify" },
  "DAILY TOP ARTIST␟Spotify": { chart: "DAILY TOP ARTIST", platform: "Spotify" },
  "DAILY TOP SONG␟Spotify": { chart: "DAILY TOP SONG", platform: "Spotify" },
  "DAILY VIRAL SONGs␟Spotify": { chart: "DAILY VIRAL SONGs", platform: "Spotify" },
  "HA NOI␟Spotify": { chart: "HANOI", platform: "Spotify" },
  "HANOI␟Spotify": { chart: "HANOI", platform: "Spotify" },
  "HO CHI MINH CITY␟Spotify": { chart: "HOCHIMINH CITY", platform: "Spotify" },
  "HOCHIMINH CITY␟Spotify": { chart: "HOCHIMINH CITY", platform: "Spotify" },
  "INSTAGRAM| TRENDING AUDIO␟Instagram": { chart: "INSTAGRAM", platform: "Instagram" },
  "LOCAL PULSE - HANOI␟Spotify": { chart: "LOCAL PULSE - HANOI", platform: "Spotify" },
  "LOCAL PULSE - HOCHIMINH CITY␟Spotify": { chart: "LOCAL PULSE - HOCHIMINH CITY", platform: "Spotify" },
  "PLAYLIST YOUTUBE CHARTS | RELEASED␟Youtube": { chart: "PLAYLIST YOUTUBE | RELEASED", platform: "YouTube" },
  "PLAYLIST YOUTUBE CHARTS | The Hit List␟Youtube": { chart: "PLAYLIST YOUTUBE | The Hit List", platform: "YouTube" },
  "PLAYLIST YOUTUBE | RELEASED␟Youtube": { chart: "PLAYLIST YOUTUBE | RELEASED", platform: "YouTube" },
  "PLAYLIST YOUTUBE | The Hit List␟Youtube": { chart: "PLAYLIST YOUTUBE | The Hit List", platform: "YouTube" },
  "Playlist Đoá Hồng Nhạc Việt␟Spotify": { chart: "Playlist Đoá Hồng Nhạc Việt", platform: "Spotify" },
  "Shazam Top Songs␟Shazam": { chart: "Shazam Top Songs", platform: "Shazam" },
  // Platform mis-tag fix — "Shazam Top Songs" tagged Platform="Youtube"
  // for 360 rows. The chart name unambiguously identifies Shazam; this
  // corrects it rather than either dropping 360 real rows or filing them
  // under YouTube.
  "Shazam Top Songs␟Youtube": { chart: "Shazam Top Songs", platform: "Shazam" },
  "Spotify Playlist | Fresh Find Vietnam␟Spotify": { chart: "Playlist Fresh Find Vietnam", platform: "Spotify" },
  "Spotify Playlist | NEW MUSIC FRIDAY VIETNAM␟Spotify": { chart: "Playlist NEW MUSIC FRIDAY VIETNAM", platform: "Spotify" },
  "Spotify Playlist | Thiên Hạ Nghe Gì␟Spotify": { chart: "Playlist Thiên Hạ Nghe Gì", platform: "Spotify" },
  "Spotify Playlist | Vsound Ngay Lúc Này␟Spotify": { chart: "Playlist Vsound Ngay Lúc Này", platform: "Spotify" },
  "TIKTOK BREAKOUT␟Tiktok": { chart: "TIKTOK BREAKOUT", platform: "TikTok" },
  "TIKTOK HOT␟Tiktok": { chart: "TIKTOK HOT", platform: "TikTok" },
  "TIKTOK POPULAR␟Tiktok": { chart: "TIKTOK POPULAR", platform: "TikTok" },
  "Vietnam iTunes Top Songs␟Apple": { chart: "Vietnam iTunes Top Songs", platform: "Apple" },
  "WEEKLY TOP ALBUM Tuần␟Spotify": { chart: "WEEKLY TOP ALBUM", platform: "Spotify" },
  "WEEKLY TOP ALBUM␟Spotify": { chart: "WEEKLY TOP ALBUM", platform: "Spotify" },
  "WEEKLY TOP ARTIST␟Spotify": { chart: "WEEKLY TOP ARTIST", platform: "Spotify" },
  "WEEKLY TOP SONG␟Spotify": { chart: "WEEKLY TOP SONG", platform: "Spotify" },
  "YOUTUBE CHART | TOP VIDEO␟YOUTUBE": { chart: "YOUTUBE CHARTS | Top Videos Daily", platform: "YouTube" },
  "YOUTUBE CHARTS | Daily Top Music Videos␟Youtube": { chart: "YOUTUBE CHARTS | Top Videos Daily", platform: "YouTube" },
  "YOUTUBE CHARTS | Daily Top Songs on Shorts␟Youtube": { chart: "YOUTUBE CHARTS | Daily Top Songs on Shorts", platform: "YouTube" },
  "YOUTUBE CHARTS | Nhạc thịnh hành␟Youtube": { chart: "YOUTUBE CHARTS | VIETNAM TRENDING MUSIC", platform: "YouTube" },
  "YOUTUBE CHARTS | TOP SONGS DAILY␟Youtube": { chart: "YOUTUBE CHARTS | TOP SONGS DAILY", platform: "YouTube" },
  "YOUTUBE CHARTS | TopArtists weekly␟Youtube": { chart: "YOUTUBE CHARTS | TOP ARTISTS WEEKLY", platform: "YouTube" },
  "YOUTUBE CHARTS | TopShortsSongs daily␟Youtube": { chart: "YOUTUBE CHARTS | Daily Top Songs on Shorts", platform: "YouTube" },
  "YOUTUBE CHARTS | TopSongs weekly␟Youtube": { chart: "YOUTUBE CHARTS | TOP SONGS WEEKLY", platform: "YouTube" },
  "YOUTUBE CHARTS | TopVideos daily␟Youtube": { chart: "YOUTUBE CHARTS | Top Videos Daily", platform: "YouTube" },
  "YOUTUBE CHARTS | Vietnam Trending Music␟Youtube": { chart: "YOUTUBE CHARTS | VIETNAM TRENDING MUSIC", platform: "YouTube" },
  "YOUTUBE CHARTS | Vietnam Trending Overall␟Youtube": { chart: "YOUTUBE CHARTS | VIETNAM TRENDING MUSIC", platform: "YouTube" },
  "YOUTUBE CHARTS | Weekly Top Artists␟Youtube": { chart: "YOUTUBE CHARTS | TOP ARTISTS WEEKLY", platform: "YouTube" },
  "YOUTUBE CHARTS | Weekly Top Music Videos␟Youtube": { chart: "YOUTUBE CHARTS | Weekly Top Music Videos", platform: "YouTube" },
  "YOUTUBE MUSIC CHART | TOP ARTIST WEEKLY␟Youtube": { chart: "YOUTUBE CHARTS | TOP ARTISTS WEEKLY", platform: "YouTube" },
  "YOUTUBE MUSIC CHART | TOP SONGS WEEKLY␟YOUTUBE": { chart: "YOUTUBE CHARTS | TOP SONGS WEEKLY", platform: "YouTube" },
  "YOUTUBE MUSIC CHART | TOP SONGS WEEKLY␟Youtube": { chart: "YOUTUBE CHARTS | TOP SONGS WEEKLY", platform: "YouTube" },
  "YOUTUBE MUSIC | DAILY TOP VIDEO␟Youtube": { chart: "YOUTUBE CHARTS | Top Videos Daily", platform: "YouTube" },
  "YOUTUBE MUSIC | WEEKLY TOP ARTIST␟Youtube": { chart: "YOUTUBE CHARTS | TOP ARTISTS WEEKLY", platform: "YouTube" },
  "YOUTUBE MUSIC | WEEKLY TOP SONG␟Youtube": { chart: "YOUTUBE CHARTS | TOP SONGS WEEKLY", platform: "YouTube" },
  "ZingCharts␟Zing": { chart: "ZMP3|ZING CHART", platform: "Zing" },
  "youworldtop | Trending On YouTube Vietnam Today␟Youtube": { chart: "YOUTUBE CHARTS | VIETNAM TRENDING MUSIC", platform: "YouTube" },
};

module.exports = { CHART_MAP };
