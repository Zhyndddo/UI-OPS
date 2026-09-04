"use client";

// Round 155 item 1 — the "external tools directory": a compiled, team-per-
// tab / page-per-group list of every 3rd-party tool a team needs, plus a
// small "🔗 Tools" button on each page's own topbar that jumps straight to
// that page's slice of the list. View-only for everyone; only role==="dev"
// can edit (see app/tool-directory/page.js's edit mode) — a real narrowing
// from the old Config → "External Tool Links" tab, which any admin+ could
// edit (canManageOrgConfig), per explicit request scoping this feature to
// dev-only editing.
//
// Two storage rows, kept deliberately separate:
//  - TOOL_DIRECTORY_SETTING_KEY ("tool_directory_links") — the plain
//    {label,url} tool lists below, one bucket per OPS page.
//  - "artist_profile_links" (pre-existing, see lib/externalTools.js) — the
//    Spotify/Apple/Discovery Mode/Linkfire values booking.js and the
//    Artist Profile ticket page already read directly; kept on its own key
//    rather than folded in here so those two existing read sites don't
//    need touching. The Tools Directory page below still displays + edits
//    them (as part of the "Artist Profile" page group), it just writes to
//    that same pre-existing key.
export const TOOL_DIRECTORY_SETTING_KEY = "tool_directory_links";

// Every URL/label below is verbatim from the team's own list (see
// DATA_FIXES.md's Round 155 entry) — not corrected or normalized.
export const DEFAULT_TOOL_DIRECTORY = {
  upload: {
    team: "OPS", pageLabel: "New Release Setup", route: "/workstation/upload",
    tools: [
      { key: "labelMaster", label: "Label Master", url: "https://vieent.labelmaster.app/" },
      { key: "linkfire", label: "Linkfire", url: "https://app.linkfire.com/#/vieent-coltd/dashboard" },
      // Round 229 — "New release pre-view" (round 155 item 3, lib/
      // newReleasePreviewNote.js's buildNewReleasePreviewNote) was only
      // ever reachable from the standalone Tools Directory page
      // (app/tool-directory/page.js's special-cased NewReleasePreviewCard,
      // bucketKey === "upload"), never from this workstation's own
      // topbar tool row like Label Master/Linkfire are — per explicit
      // request, it's now a real generator entry here too (same idiom as
      // Pitching's "zingPitchNote" entry above), so it shows up as its own
      // button right on New Release Setup, not just on the directory page.
      { key: "newReleasePreview", label: "New Release Preview", generator: "newReleasePreviewNote" },
    ],
  },
  pitching: {
    team: "OPS", pageLabel: "Pitching", route: "/workstation/pitching",
    tools: [
      { key: "s4a", label: "S4A", url: "https://artists.spotify.com/c/artist/1949NgGs5369LNQZbPlUYc/home" },
      // Zing is a live text-generator (the team's Google Sheets LET()
      // formula, ported to JS in lib/zingPitchNote.js), not a static
      // link — rendered as a "Generate" button instead of a plain
      // outbound link wherever this tool list is shown.
      { key: "zing", label: "Zing", generator: "zingPitchNote" },
      // Round 187 — updated to the correct sheet per explicit report
      // (was pointing at a stale/wrong doc). This is only the seed
      // default read on a first-ever load, before any dev has saved
      // this bucket via the Tool Directory editor (app/tool-
      // directory/page.js) — once a save has happened, mergeToolDirectory()
      // below always uses the saved bucket's tools wholesale, so a
      // fix made through that editor was never at risk of being
      // overridden by this constant either way.
      { key: "nct", label: "NCT", url: "https://docs.google.com/spreadsheets/d/17cS2Sz1niaGDADOSrZQ_PdP9s2Pv8UtYcKHAkvoL35Y/edit?gid=1965064666#gid=1965064666" },
    ],
  },
  manualClaim: {
    team: "OPS", pageLabel: "Manual Claim", route: "/tickets/manual-claim",
    tools: [
      { key: "mediamatch", label: "Mediamatch", url: "https://mediamatch.bytedance.com/web/v2/home" },
    ],
  },
  preRelease: {
    team: "OPS", pageLabel: "Pre-release", route: "/workstation/pre-release",
    tools: [
      { key: "s4a", label: "S4A", url: "https://artists.spotify.com/c/artist/1949NgGs5369LNQZbPlUYc/home" },
      { key: "musixmatch", label: "Musixmatch", url: "https://pro-beta.musixmatch.com/label/18269965" },
      { key: "nctLyric", label: "NCT Lyric", url: "https://docs.google.com/spreadsheets/d/1437pddgRHq_gTgqeLMYoxjB856fAq8dNUF6ksPN5q-k/edit?gid=0#gid=0" },
      { key: "zingLyric", label: "Zing Lyric", url: "https://docs.google.com/spreadsheets/d/1437pddgRHq_gTgqeLMYoxjB856fAq8dNUF6ksPN5q-k/edit?gid=0#gid=0" },
    ],
  },
  confirm: {
    team: "OPS", pageLabel: "Re-Check", route: "/workstation/confirm",
    tools: [
      { key: "zingCatalog", label: "Zing Catalog", url: "https://partnerlink.zingmp3.vn/login" },
      { key: "spotifyCatalog", label: "Spotify Catalog", url: "https://musicproviders.spotify.com/catalog/release/5JEnYZpVLa9H9ybbBVB4mC?tab=releaseDetails" },
      { key: "mediamatch", label: "Mediamatch", url: "https://mediamatch.bytedance.com/web/login" },
      { key: "instagramCatalog", label: "Instagram Catalog", url: "https://business.facebook.com/business/loginpage/?next=https%3A%2F%2Fbusiness.facebook.com%2Flatest%2Frights_manager%2Faudio_releases%2Ftrack%3Fasset_id%3D107478107747761%26audio_release_id%3D888293427646422%26business_id%3D1080375176576457%26track_id%3D2648380415559097%26nav_ref%3Dbiz_unified_f3_login_page_to_mbs&login_options%5B0%5D=FB&login_options%5B1%5D=IG&login_options%5B2%5D=SSO&config_ref=biz_login_tool_flavor_mbs" },
      { key: "nctCatalog", label: "NCT Catalog", url: "https://provider.nct.vn/provider/" },
      { key: "linkfire", label: "Linkfire", url: "https://app.linkfire.com/#/vieent-coltd/dashboard" },
    ],
  },
  artistProfile: {
    team: "OPS", pageLabel: "Artist Profile", route: "/tickets/artist-profile",
    // Spotify/Apple/Discovery Mode/Linkfire are NOT plain entries here —
    // they're rendered from the separate "artist_profile_links" row (see
    // module comment above) so booking.js / the Artist Profile ticket
    // page's existing reads keep working unchanged. This bucket only
    // holds the one genuinely-new tool for this page.
    tools: [
      { key: "zingProfile", label: "Zing Profile", url: "https://docs.google.com/spreadsheets/d/1k14d_NcSiB8B0XvIhtYQX0j-GbA9jALwgJLIoVrzmDo/edit?gid=144697040#gid=144697040" },
    ],
  },
  streaming: {
    team: "OPS", pageLabel: "Streaming", route: "/workstation/stream",
    tools: [
      { key: "spotify", label: "Spotify", url: "https://open.spotify.com/" },
      { key: "mediamatch", label: "Mediamatch", url: "https://mediamatch.bytedance.com/web/v2/home" },
      { key: "zing", label: "Zing", url: "https://zingmp3.vn/" },
      { key: "nctCatalog", label: "NCT Catalog", url: "https://provider.nct.vn/provider/" },
      { key: "youtube", label: "Youtube", url: "https://www.youtube.com/" },
      { key: "youtubeMusic", label: "Youtube Music", url: "https://music.youtube.com/" },
    ],
  },
  // Round 155 item 1h — Milestone's per-CHART links (not per-platform),
  // seeded from lib/milestoneChartLinks.js's MILESTONE_CHART_LINKS. Shown
  // here too (compiled into the directory page like every other bucket),
  // in addition to the inline button next to each chart's own tab name
  // inside app/workstation/milestone/page.js's ChartEntryPopup. A real
  // subset of PLATFORM_CHARTS entries have no confirmed URL yet — see
  // that file's own comment for the exact list still needing one from the
  // team; those simply don't appear here until filled in (Edit mode below
  // lets a dev add any tool with a blank url, including new ones for
  // those gaps).
  milestone: {
    team: "OPS", pageLabel: "Milestone", route: "/workstation/milestone",
    tools: [], // populated from MILESTONE_CHART_LINKS at load time — see mergeToolDirectory()
  },
};

// Maps a pathname to the directory bucket whose tools should show as a
// topbar "🔗 Tools" button. Milestone is deliberately absent — its links
// go inline next to each chart's tab name instead (too many for one
// topbar button to make sense), per explicit request.
export const TOOLS_BUTTON_ROUTES = {
  "/workstation/upload": "upload",
  "/workstation/pitching": "pitching",
  "/tickets/manual-claim": "manualClaim",
  "/workstation/pre-release": "preRelease",
  "/workstation/confirm": "confirm",
  "/tickets/artist-profile": "artistProfile",
  "/workstation/stream": "streaming",
};

export function pageKeyForPathname(pathname) {
  if (!pathname) return null;
  if (TOOLS_BUTTON_ROUTES[pathname]) return TOOLS_BUTTON_ROUTES[pathname];
  const hit = Object.keys(TOOLS_BUTTON_ROUTES).find((route) => pathname.startsWith(route));
  return hit ? TOOLS_BUTTON_ROUTES[hit] : null;
}

// A saved app_settings row only needs the fields a dev actually touched —
// anything missing (a brand-new install, or a bucket/tool added after
// someone's last edit) falls back to the hardcoded seed, same "merge over
// defaults" idiom already used by MediaBookingPricingSection/
// milestoneHighlight.js elsewhere in this app.
export function mergeToolDirectory(saved, milestoneChartLinks) {
  const merged = {};
  Object.keys(DEFAULT_TOOL_DIRECTORY).forEach((bucketKey) => {
    const def = DEFAULT_TOOL_DIRECTORY[bucketKey];
    const savedBucket = saved?.[bucketKey];
    let tools = Array.isArray(savedBucket?.tools) && savedBucket.tools.length ? savedBucket.tools : def.tools;
    if (bucketKey === "milestone") {
      // Milestone's tool list is derived from MILESTONE_CHART_LINKS
      // (defaults) merged with any dev overrides/additions saved under
      // this same bucket, keyed by chart name.
      const base = Object.entries(milestoneChartLinks || {}).map(([label, url]) => ({ key: label, label, url }));
      const overrides = Array.isArray(savedBucket?.tools) ? savedBucket.tools : [];
      const byKey = {};
      base.forEach((t) => (byKey[t.key] = t));
      overrides.forEach((t) => (byKey[t.key || t.label] = t));
      tools = Object.values(byKey);
    }
    merged[bucketKey] = { ...def, tools };
  });
  return merged;
}

export const TEAM_LABELS = { OPS: "Operation / OPS" };
