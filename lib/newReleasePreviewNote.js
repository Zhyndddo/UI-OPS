// Round 155 item 3 — "New release pre-view" tool: direct port of the
// team's Google Sheets formula (verbatim):
//
//   "LINK AUDIO: "&B3&" - "&C3& if(D3="";;" x "&D3)
//   "Landing page: "&B4
//   <br/>
//   "Spotify: "&B4&"/spotify"
//   "Apple Music: "&B4&"/applemusic"
//   "Zing MP3: "&B4&"/zingmp3"
//   "NCT: "&B4&"/nct"
//   "Tiktok: "&B4&"/tiktok"
//
// B3=product name, C3=main artist, D3=feature artist, B4=smartlink url —
// mapped onto releases.title / releases.main_artist / releases.
// feature_artist / releases.smartlink (all 4 already exist as real
// columns, confirmed against app/new-release/page.js and
// lib/releaseNotes.js's buildProductNote).
export function buildNewReleasePreviewNote(release) {
  if (!release) return "";
  const title = release.title || "";
  const mainArtist = release.main_artist || "";
  const featureArtist = release.feature_artist || "";
  const smartlink = release.smartlink || "";

  const linkAudio = `LINK AUDIO: ${title} - ${mainArtist}${featureArtist ? ` x ${featureArtist}` : ""}`;

  return [
    linkAudio,
    `Landing page: ${smartlink}`,
    "",
    `Spotify: ${smartlink}/spotify`,
    `Apple Music: ${smartlink}/applemusic`,
    `Zing MP3: ${smartlink}/zingmp3`,
    `NCT: ${smartlink}/nct`,
    `Tiktok: ${smartlink}/tiktok`,
  ].join("\n");
}
