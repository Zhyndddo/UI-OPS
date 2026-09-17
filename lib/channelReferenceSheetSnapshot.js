// Round 357 — the "auto fetch every day at 8:00" ask. Same one-shared-
// global_settings-row idiom as lib/channelReferenceIntro.js and
// lib/magicLinkThemeLock.js: one snapshot, written once a day by the new
// cron (app/api/cron/channel-reference-sheet/route.js), read by every
// viewer of the public magic link (app/channels/[token]/page.js) to show
// "auto-refreshed daily · last: ..." and to fall back on if that
// viewer's own live fetch fails.
export const CHANNEL_REFERENCE_SHEET_SNAPSHOT_KEY = "channel_reference_sheet_snapshot";

// Returns { count, fetchedAt, sheetUrl } or null if never written yet /
// unreachable / malformed — same fail-open shape
// readChannelReferenceIntro uses, so a missing snapshot just means "no
// auto-refresh timestamp to show yet," never a broken page.
export async function readChannelReferenceSheetSnapshot(supabaseClient) {
  if (!supabaseClient) return null;
  try {
    const { data } = await supabaseClient
      .from("global_settings")
      .select("value")
      .eq("key", CHANNEL_REFERENCE_SHEET_SNAPSHOT_KEY)
      .maybeSingle();
    const parsed = data?.value ? JSON.parse(data.value) : null;
    if (!parsed || typeof parsed.count !== "number" || !parsed.fetchedAt) return null;
    return { count: parsed.count, fetchedAt: parsed.fetchedAt, sheetUrl: parsed.sheetUrl || "" };
  } catch {
    return null;
  }
}
