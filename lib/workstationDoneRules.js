// Round 460 — single shared definition of "is this release's workstation
// work done" for the 4 release-field-driven workstations (upload,
// confirm phase1/phase2, pre_release). Previously private copies lived in
// app/task-table/page.js (and a third, inline copy of the confirm rules in
// lib/notDoneCounts.js); extracted so Task Table, notDoneCounts and the KPI
// layer (lib/kpiMetrics.js) can't drift apart. Rules are unchanged, moved
// verbatim.
export const DSP_CHECK_FIELDS = ["confirm_spotify_correct", "confirm_apple_correct", "confirm_zing_correct", "confirm_nct_correct", "confirm_fb_correct", "confirm_ytb_correct"];

export function isUploadDone(r) {
  if (r.upload_status === "Cancel") return true; // cancelled isn't outstanding work
  const keys = ["link_lbm", "link_share", "smartlink"];
  if (r.gate_pre_order === "true") keys.push("link_preorder");
  return keys.every((k) => r[k]);
}
export function isConfirmPhase1Done(r) {
  return DSP_CHECK_FIELDS.every((f) => r[f]) && !!r.link_lbm && !!r.confirm_tag;
}
export function isConfirmPhase2Done(r) {
  return !!(r.smartlink && r.confirm_smartlink_updated && r.confirm_insta_sound && r.confirm_tiktok_sound_updated);
}
export function isPreReleaseDone(r) {
  return !!(r.canva_mv_status && r.canva_status && r.musixmatch_link && r.musixmatch_status && r.nct_lyric && r.zing_lyric);
}
