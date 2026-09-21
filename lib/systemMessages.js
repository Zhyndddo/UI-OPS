// Round 404 — System Messages: the app's own auto-generated notices
// (weekly task reminders, a release's critical info changing, the Bổ
// Sung DATA daily digest), as opposed to Secret Messages (lib/
// secretMessages.js), which are always admin-composed. Deliberately a
// separate table/mechanism — Secret Messages' team-scoped-sending and
// permanent-record rules are about a PERSON choosing to message someone;
// these are the system noticing something and telling the person(s) it
// affects. Same recipient-facing shape as Secret Messages on purpose
// (poll, pop the newest unseen one, "seen" tracked per-profile in
// localStorage) so the UI pattern stays familiar — see lib/Sidebar.js.

// True while `now` (an ISO string or Date) is still before expires_at —
// the recipient-facing cutoff. Dev's log page (app/system-log/page.js)
// intentionally does NOT use this; it reads every row regardless of age.
function isActive(msg, now = new Date()) {
  if (!msg?.expires_at) return false;
  return new Date(msg.expires_at).getTime() > new Date(now).getTime();
}

export function isSystemMessageForProfile(msg, profileId) {
  if (!msg || !profileId) return false;
  return Array.isArray(msg.recipient_profile_ids) && msg.recipient_profile_ids.includes(profileId);
}

// Fetches this profile's currently-active (not yet expired) system
// messages. Same "fetch the small active set, filter in JS" choice
// secretMessages.js's loadMyActiveSecretMessages makes, for the same
// reason — the table is expected to stay small (24h-expiring rows only),
// so a `.contains()` filter plus a JS pass is simpler than pushing the
// array-membership check into the query string.
export async function loadMyActiveSystemMessages(supabase, profile) {
  if (!supabase || !profile?.id) return [];
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("system_messages")
    .select("*")
    .gt("expires_at", nowIso)
    .contains("recipient_profile_ids", [profile.id])
    .order("created_at", { ascending: false });
  return data || [];
}

// Per-recipient "hide," same idea and same storage convention as
// secretMessages.js's hide list — a separate, purely-client-side list
// from the 24h server-side expiry, so someone can dismiss something
// early without that affecting anyone else or the dev log.
function hiddenStorageKey(profileId) {
  return `vieent_system_hidden_${profileId}`;
}
export function getHiddenSystemMessageIds(profileId) {
  if (!profileId || typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(hiddenStorageKey(profileId)) || "[]");
  } catch {
    return [];
  }
}
export function hideSystemMessageForProfile(profileId, messageId) {
  if (!profileId || !messageId || typeof window === "undefined") return;
  try {
    const hidden = getHiddenSystemMessageIds(profileId);
    if (!hidden.includes(messageId)) {
      window.localStorage.setItem(hiddenStorageKey(profileId), JSON.stringify([...hidden, messageId].slice(-500)));
    }
  } catch {}
}

// Round 406 — "hide until the afk comeback and next afk login count more
// than 24 hours." A SNOOZE, not the permanent-ish Hide above
// (getHiddenSystemMessageIds/hideSystemMessageForProfile, used by
// app/system-messages/page.js's own "Hide" button) — deliberately its own
// separate localStorage key/list per explicit request ("make a new one
// instead of replacing the current close panel... should have customized
// behavior than the vanilla one"), so the two "gone until I say so" vs
// "gone until I've clearly stepped away and come back" behaviors can
// never collide or get restored by the wrong mechanism. There's no
// per-message expiry timestamp — clearSnoozedSystemMessages wipes the
// whole list at once, called from lib/Sidebar.js's own >24h
// watchForAfkReturn, which is what "next login" means for this feature.
function snoozedStorageKey(profileId) {
  return `vieent_system_snoozed_${profileId}`;
}
export function getSnoozedSystemMessageIds(profileId) {
  if (!profileId || typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(snoozedStorageKey(profileId)) || "[]");
  } catch {
    return [];
  }
}
export function snoozeSystemMessageForProfile(profileId, messageId) {
  if (!profileId || !messageId || typeof window === "undefined") return;
  try {
    const snoozed = getSnoozedSystemMessageIds(profileId);
    if (!snoozed.includes(messageId)) {
      window.localStorage.setItem(snoozedStorageKey(profileId), JSON.stringify([...snoozed, messageId].slice(-500)));
    }
  } catch {}
}
export function clearSnoozedSystemMessages(profileId) {
  if (!profileId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(snoozedStorageKey(profileId));
  } catch {}
}

// Insert helper every producer (release-change notice, weekly task
// reminder, Bổ Sung DATA digest) shares — just fills in expires_at from
// hoursValid so nothing has to compute that inline each time.
export async function createSystemMessage(supabase, { kind, title, body, link, recipientProfileIds, source, hoursValid = 24 }) {
  if (!supabase || !kind || !Array.isArray(recipientProfileIds) || recipientProfileIds.length === 0) return null;
  const expiresAt = new Date(Date.now() + hoursValid * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("system_messages")
    .insert({ kind, title, body, link: link || null, recipient_profile_ids: recipientProfileIds, source: source || {}, expires_at: expiresAt })
    .select()
    .single();
  if (error) {
    console.error(`createSystemMessage(${kind}) failed:`, error);
    return null;
  }
  return data;
}

// "Already generated today for this profile+kind?" — the dedup check
// every DAILY producer (weekly task reminder, Bổ Sung DATA digest) needs
// before generating, so a page reload mid-day doesn't spam a fresh row
// (and a fresh popup) every time. Scoped to created_at >= the start of
// today in GMT+7 — matches this app's other "local day" conventions
// (see app/api/cron/daily-digest/route.js's own GMT+7 note) rather than
// UTC, since "once a day" here means once per the team's actual calendar
// day, not once per UTC day.
export async function hasSystemMessageToday(supabase, { kind, profileId }) {
  if (!supabase || !kind || !profileId) return true; // fail closed — never spam if the check itself fails
  const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowGmt7 = new Date(Date.now() + GMT7_OFFSET_MS);
  const todayStartGmt7 = new Date(Date.UTC(nowGmt7.getUTCFullYear(), nowGmt7.getUTCMonth(), nowGmt7.getUTCDate(), 0, 0, 0) - GMT7_OFFSET_MS);
  const { data, error } = await supabase
    .from("system_messages")
    .select("id")
    .eq("kind", kind)
    .contains("recipient_profile_ids", [profileId])
    .gte("created_at", todayStartGmt7.toISOString())
    .limit(1);
  if (error) return true; // same fail-closed reasoning
  return (data || []).length > 0;
}
