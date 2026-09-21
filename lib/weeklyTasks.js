// Round 404 item 1 — "thêm task weekly cho task table... thêm bộ đếm cho
// các task lập lại." Per explicit decision: an admin adds a free-text
// weekly task for anyone on their own team (never dev); the counter
// counts how many weekly cycles the task has gone through, not a
// completion streak. No cron needed — rollForwardIfNeeded lazily catches
// a task up to the current week the next time anyone loads it, same
// "compute on read" idea as this app's other lazy-rollover logic.

const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;

// This week's Monday, as a "YYYY-MM-DD" string, in GMT+7 (matches this
// app's other "local day" conventions, e.g. the daily digest route).
export function currentWeekStartStr(now = new Date()) {
  const gmt7 = new Date(now.getTime() + GMT7_OFFSET_MS);
  const dow = gmt7.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7; // Mon=0, Sun=6
  const monday = new Date(Date.UTC(gmt7.getUTCFullYear(), gmt7.getUTCMonth(), gmt7.getUTCDate() - daysSinceMonday));
  return monday.toISOString().slice(0, 10);
}

function weeksBetween(fromStr, toStr) {
  const from = new Date(`${fromStr}T00:00:00Z`);
  const to = new Date(`${toStr}T00:00:00Z`);
  return Math.max(1, Math.round((to - from) / (7 * 86400000)));
}

// Given the full list of a profile's active weekly tasks (as loaded from
// the DB), rolls forward any whose week_start has fallen behind the
// current week: done resets to false, repeat_count advances by however
// many weeks actually elapsed (handles someone not opening the app for a
// few weeks without under-counting), week_start jumps to this week's
// Monday. Returns { rolled, patches } — patches is [{id, week_start,
// done, repeat_count}] for the caller to actually write; this function
// itself does no I/O so it's easy to call from anywhere (Sidebar's daily
// check, the Task Table page) without threading a supabase client through
// it.
export function rollForwardIfNeeded(tasks, now = new Date()) {
  const thisWeek = currentWeekStartStr(now);
  const patches = [];
  const rolled = (tasks || []).map((t) => {
    if (!t.week_start || t.week_start >= thisWeek) return t;
    const elapsed = weeksBetween(t.week_start, thisWeek);
    const patch = { id: t.id, week_start: thisWeek, done: false, repeat_count: (t.repeat_count || 1) + elapsed };
    patches.push(patch);
    return { ...t, ...patch };
  });
  return { rolled, patches };
}

// Applies rollForwardIfNeeded's patches to the DB — separate from the
// pure function above so callers that just want to know "is anything
// stale" (e.g. deciding whether to bother polling) can call the pure
// version alone.
export async function persistRollForward(supabase, patches) {
  if (!supabase || !patches || patches.length === 0) return;
  await Promise.all(
    patches.map((p) =>
      supabase.from("weekly_tasks").update({ week_start: p.week_start, done: p.done, repeat_count: p.repeat_count }).eq("id", p.id)
    )
  );
}
