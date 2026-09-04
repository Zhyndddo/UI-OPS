// Round 155 item 1h — Milestone workstation's per-CHART tool links, one
// button next to the active chart's own tab name inside ChartEntryPopup
// (app/workstation/milestone/page.js) — not the topbar, per explicit
// request, since this page has far more distinct tools than one topbar
// button could sensibly hold.
//
// Extracted from the team's uploaded "Sam _ milstone 2.0.2026.xlsx" ->
// "input" sheet's own HYPERLINK() formulas — one URL per confirmed chart.
// A handful of PLATFORM_CHARTS entries (see milestone/page.js) had NO
// hyperlink anywhere in that workbook, and a few more had a label close
// enough to guess at but not an exact/certain match — both are left OUT
// of this map on purpose rather than guessed, per explicit instruction
// ("ask me" about ones without one). The button for those charts simply
// doesn't render until a real URL is added (dev role, via the Tools
// Directory page's Edit mode).
//
// Round 206 — the 8 Apple URLs below (direct request, one per chart)
// fill in exactly the "still needs a real URL" gap this comment used to
// flag for Apple's Album/Song genre charts. Per the request, "APPLE
// MUSIC - Top ALBUMs Vietnam" and "APPLE MUSIC - Top POP Albums" now
// intentionally share the same URL (the Vietnam top-albums page with no
// genreId is Apple's own "Pop" default view) — not a copy/paste mistake.
//
// Still needs a real URL from the team:
//  - Spotify: HANOI, LOCAL PULSE - HANOI, HOCHIMINH CITY,
//    LOCAL PULSE - HOCHIMINH CITY (no hyperlink found for these 4 in the
//    sheet — only the generic charts.spotify.com overview page, already
//    used below for the 6 official (non-regional) Spotify charts).
//  - Instagram (the whole platform) — no hyperlink anywhere in the
//    workbook, including its own "instagram" sheet.
//  - YouTube: the sheet DOES have 5+ YouTube chart hyperlinks, but their
//    labels don't line up exactly with PLATFORM_CHARTS' 5 YouTube entries
//    (e.g. sheet says "YOUTUBE CHARTS | Weekly Top Music Videos", the app
//    has "YOUTUBE CHARTS | TOP SONGS WEEKLY") — close enough to guess,
//    not close enough to trust unattended. Flagged for the team to
//    confirm which sheet URL maps to which app chart name rather than
//    silently picked here.
//  - "Playlist Đoá Hồng Nhạc Việt" — added as a real 5th Spotify-playlist
//    chart per explicit follow-up request (both here and in
//    app/workstation/milestone/page.js's PLATFORM_CHARTS.Spotify list).
export const MILESTONE_CHART_LINKS = {
  // Zing
  "ZMP3|ZING CHART": "https://zingmp3.vn/zing-chart",
  "ZMP3|BXH NHẠC MỚI": "https://zingmp3.vn/moi-phat-hanh",

  // Spotify — every official (non-playlist) chart type shares the one
  // charts.spotify.com overview URL in the source sheet; preserved as-is
  // rather than split into fake distinct per-chart URLs.
  "WEEKLY TOP ALBUM": "https://charts.spotify.com/charts/overview/vn",
  "WEEKLY TOP ARTIST": "https://charts.spotify.com/charts/overview/vn",
  "WEEKLY TOP SONG": "https://charts.spotify.com/charts/overview/vn",
  "DAILY TOP SONG": "https://charts.spotify.com/charts/overview/vn",
  "DAILY TOP ARTIST": "https://charts.spotify.com/charts/overview/vn",
  "DAILY VIRAL SONGs": "https://charts.spotify.com/charts/overview/vn",
  // Spotify playlists — each has its own distinct playlist URL.
  "Playlist NEW MUSIC FRIDAY VIETNAM": "https://open.spotify.com/playlist/37i9dQZF1DX5G3iiHaIzdf",
  "Playlist Fresh Find Vietnam": "https://open.spotify.com/playlist/37i9dQZF1DX34s4fg4Zx3Z",
  "Playlist Vsound Ngay Lúc Này": "https://open.spotify.com/playlist/37i9dQZF1DX1vC8WamgJcA",
  "Playlist Thiên Hạ Nghe Gì": "https://open.spotify.com/playlist/37i9dQZF1DWVOaOWiVD1Lf",
  "Playlist Đoá Hồng Nhạc Việt": "https://open.spotify.com/playlist/37i9dQZF1DX5UMwGFV95IS",

  // Apple
  "Playlist Vietnam Ơi!": "https://music.apple.com/us/playlist/vietnam-%C6%A1i/pl.6151356c0c2743b5bdb329391017536e",
  "Playlist New Music Daily": "https://music.apple.com/na/playlist/new-music-daily/pl.2b0e6e332fdf4b7a91164da3162127b5",
  "APPLE MUSIC - Top ALBUMs Vietnam": "https://music.apple.com/vn/new/top-charts/albums",
  "Apple - Top Alternative Songs": "https://music.apple.com/vn/new/top-charts/songs/?genreId=20",
  // Round 206 — direct request, one URL per Apple genre chart (see the
  // header comment above).
  "APPLE MUSIC - Top POP Albums": "https://music.apple.com/vn/new/top-charts/albums",
  "APPLE MUSIC -Top HIPHOP/RAP Albums": "https://music.apple.com/vn/new/top-charts/albums/?genreId=18",
  "APPLE MUSIC - Top DANCE Albums": "https://music.apple.com/vn/new/top-charts/albums/?genreId=17",
  "APPLE MUSIC - Top ALTERNATIVE Albums": "https://music.apple.com/vn/new/top-charts/albums/?genreId=20",
  "Apple Music - Top Songs Vietnam": "https://music.apple.com/vn/new/top-charts/songs",
  "Apple Music - Top POP Songs": "https://music.apple.com/vn/new/top-charts/songs/?genreId=14",
  "Apple Music - Top Dance Songs": "https://music.apple.com/vn/new/top-charts/songs/?genreId=17",
  "Apple Music - Top Hiphop/Rap Songs": "https://music.apple.com/vn/new/top-charts/songs/?genreId=18",

  // TikTok — all 3 tabs (Popular/Breakout/Hot) share the same Creative
  // Center hub URL in the sheet; the specific tab is chosen inside that
  // page itself, not via 3 different URLs.
  "TIKTOK POPULAR": "https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en",
  "TIKTOK BREAKOUT": "https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en",
  "TIKTOK HOT": "https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en",

  // Shazam
  "Shazam Top Songs": "https://kworb.net/charts/shazam/vn.html",
};
