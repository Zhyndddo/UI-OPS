// Round 405 — "count if the user is afk for a long time (more than 4
// hours) then count them as first login on next activity." This app has
// no real per-day login event (Supabase Auth just silently refreshes
// tokens as long as a tab stays open — see Round 404's session-timeout
// answer), so someone who leaves a tab open across midnight never
// re-triggers Sidebar's mount-only daily generators (weekly task
// reminder, Bổ Sung DATA digest — see lib/Sidebar.js) until they actually
// reload the page. This fills that gap: treat "this tab was away/
// suspended for >4h and something just happened again" as equivalent to
// a fresh login for that one purpose.
//
// Two signals, since neither alone is reliable:
//   1. document.visibilitychange going visible again after being hidden
//      that long — covers switching away to another tab/app for hours.
//   2. A running setInterval's own tick landing much later than its
//      1-minute cadence — covers a laptop sleeping with this tab still
//      frontmost (the OS suspends timers along with everything else, so
//      the gap shows up in the very next tick once it wakes; visibility
//      doesn't reliably change in that case since the tab was never
//      hidden, just paused).
// Both funnel through the same onReturn callback. Calling onReturn is
// cheap and safe to do more than once — every daily generator it drives
// has its own per-day dedup (hasSystemMessageToday / weekly_tasks'
// week_start), so this only has to be a reasonable trigger, not a
// perfectly deduped one; a short cooldown just avoids firing twice for
// the same return (e.g. a tick landing right after a visibility change).
//
// Round 406 — the threshold's now a parameter (still defaulting to 4h),
// since "hide a system message until the next login" needs its OWN,
// longer notion of a return — "next afk login count more than 24 hours"
// — reusing this exact same detection machinery with a second,
// independently-running watcher rather than a second implementation (see
// lib/Sidebar.js's two watchForAfkReturn calls).
export const DEFAULT_AFK_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours
const TICK_MS = 60 * 1000;
const FIRE_COOLDOWN_MS = 5000;

export function watchForAfkReturn(onReturn, thresholdMs = DEFAULT_AFK_THRESHOLD_MS) {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let lastSeen = Date.now();
  let hiddenAt = document.hidden ? Date.now() : null;
  let cooldownUntil = 0;

  function maybeFire(gapMs) {
    if (gapMs < thresholdMs) return;
    const now = Date.now();
    if (now < cooldownUntil) return;
    cooldownUntil = now + FIRE_COOLDOWN_MS;
    try {
      onReturn(gapMs);
    } catch (e) {
      console.error("watchForAfkReturn's onReturn threw:", e);
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt) {
      maybeFire(Date.now() - hiddenAt);
      hiddenAt = null;
    }
    lastSeen = Date.now();
  }

  const interval = setInterval(() => {
    const now = Date.now();
    maybeFire(now - lastSeen);
    lastSeen = now;
  }, TICK_MS);

  document.addEventListener("visibilitychange", onVisibilityChange);

  return function stopWatching() {
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
