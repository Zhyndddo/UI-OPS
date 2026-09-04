"use client";

// Round 167 — shared "one ticket per key" duplicate check, first real
// implementation of the rule captured in the Claude Project doc
// claude/one-ticket-per-key-rule.md. Piloted on Artist Profile this
// round; the plan is to roll the same shape out to the other 14 code-gate
// ticket types once this pattern is proven.
//
// The rule, in short: for any "code gate" tier ticket type, a SECOND
// ticket for a key that already has one is never silently created and
// never silently blocked either — it's dropped from what gets created,
// and the caller is told which ones were dropped so it can show a
// warning-only popup (see DuplicateTicketWarning.js — no "create anyway"
// bypass, by explicit design).
//
// This re-checks against the LIVE database at save time, not whatever a
// page's local state thinks exists — that's the actual gap this closes.
// Local state (e.g. the release detail page's artistProfileTicketByArtist,
// fetched once on page load) goes stale the moment a second tab/session
// creates a ticket for the same key in the meantime; only a fresh query
// right before insert catches that race.
//
// candidates: array of { label, filters }, where filters is a plain
// object of { dataKey: value } pairs ANDed together against the ticket's
// jsonb `data` column (e.g. { releaseId: did, artistName: "X" }). label
// is whatever should show up in the warning popup for that candidate
// (an artist name, a release title, etc.) — purely for display, not used
// in the query itself.
//
// Runs one query per candidate rather than trying to batch them into a
// single OR'd query — candidate lists here are always small (a handful of
// artists per release, at most), and a plain per-candidate `.eq()` chain
// is far simpler to get right than hand-building a dynamic OR filter
// across jsonb paths. Revisit if a future caller ever has a large
// candidate list.
export async function findDuplicateTicketKeys(supabase, tabId, candidates) {
  const dupes = [];
  for (const candidate of candidates) {
    let q = supabase.from("tickets").select("id").eq("tab_id", tabId).is("deleted_at", null);
    Object.entries(candidate.filters).forEach(([key, value]) => {
      q = q.eq(`data->>${key}`, value);
    });
    const { data } = await q.limit(1);
    if (data && data.length > 0) dupes.push(candidate);
  }
  return dupes;
}
