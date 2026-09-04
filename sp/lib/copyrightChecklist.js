"use client";

// Round 88 (2nd follow-up) — simplified the flat 3-field Copyright
// Checklist template one more time, per explicit fixes, still applied
// identically to all 3 rights (Quyền nhà xuất bản/Master, Quyền của
// người biểu diễn/Vocal, Quyền tác giả/Author):
//   1. Owner — no more single-choice/who-split; just one free-text box
//      (expandable — see CopyrightChecklistFields.js's textarea).
//   2. Validity Period — a from/to date range, OR check "Không thời hạn"
//      or check "Không thời hạn" instead of picking dates at all.
//   3. Contract — unchanged: one textbox, auto-hyperlinked if it's a URL.
//
// Still stored as ONE jsonb column shaped { master: Entry, vocal: Entry,
// author: Entry } — jsonb has no fixed shape, so no new migration was
// needed for THIS reshape (releases.copyright_checklist already existed).
// A NEW migration WAS needed this round for the separate "per-track
// checklist for EP/Album" feature — see add-round88-track-copyright.sql —
// release_tracks didn't have a copyright_checklist column at all before.
// Old-shaped data (from either earlier round) just reads back blank under
// the fields it doesn't recognize (normalizeCopyrightChecklist ignores
// unknown keys) rather than crashing.

// Round 92 — labels extended with a plain-language suffix naming who that
// right actually belongs to (BẢN GHI/NGHỆ SĨ BIỂU DIỄN/TÁC GIẢ SÁNG TÁC),
// per explicit request. shortLabel (Q1/Q2/Q3, used in the index summary
// line and Booking Board's read-only preview) is unchanged.
export const COPYRIGHT_ITEMS = [
  { key: "master", label: "Quyền nhà xuất bản (quyền liên quan) - BẢN GHI", shortLabel: "Q1" },
  { key: "vocal", label: "Quyền của người biểu diễn (quyền liên quan) - NGHỆ SĨ BIỂU DIỄN", shortLabel: "Q2" },
  { key: "author", label: "Quyền tác giả - TÁC GIẢ SÁNG TÁC", shortLabel: "Q3" },
];

export function emptyCopyrightEntry() {
  // Round 109 — added `note` (a plain per-right internal note, optional,
  // not part of the "complete"/"declared" checks below) as part of the
  // Copyright tab's redesign into a read-only table + edit popup, matching
  // the "Note" field on the popup's own form.
  return { owner: "", validFrom: "", validTo: "", noTimeLimit: false, contract: "", note: "" };
}

export function emptyCopyrightChecklist() {
  const out = {};
  COPYRIGHT_ITEMS.forEach((item) => { out[item.key] = emptyCopyrightEntry(); });
  return out;
}

// Fills in any missing keys (older releases saved under an earlier shape,
// or a column that read back null/undefined) with the empty shape — same
// "merge over defaults" pattern used elsewhere (e.g. GateFields' data
// merges) instead of assuming the stored value already matches today's
// shape.
export function normalizeCopyrightChecklist(value) {
  const base = emptyCopyrightChecklist();
  const merged = { ...base, ...(value || {}) };
  COPYRIGHT_ITEMS.forEach((item) => {
    merged[item.key] = { ...base[item.key], ...(merged[item.key] || {}) };
  });
  return merged;
}

// Short validity display for read-only previews/summaries — "Không thời
// hạn", a "from → to" range, just "from →" (open-ended, only a start
// date given), or null if nothing's filled in.
export function copyrightValidityLabel(entry) {
  if (!entry) return null;
  if (entry.noTimeLimit) return "Không thời hạn";
  if (entry.validFrom && entry.validTo) return `${entry.validFrom} → ${entry.validTo}`;
  if (entry.validFrom) return `${entry.validFrom} →`;
  if (entry.validTo) return `→ ${entry.validTo}`;
  return null;
}

function truncate(s, n) {
  const str = String(s || "").trim();
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

// "Q1: <owner> · Q2: <owner> · Q3: <owner>" — only items with a non-blank
// Owner show up; returns null if nothing's filled in yet, so callers can
// skip rendering the row entirely.
export function copyrightChecklistSummary(value) {
  const data = normalizeCopyrightChecklist(value);
  const parts = COPYRIGHT_ITEMS
    .map((item) => {
      const owner = (data[item.key]?.owner || "").trim();
      return owner ? `${item.shortLabel}: ${truncate(owner, 16)}` : null;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// Whether ANY of the 3 rights has been touched at all — used to decide
// whether a read-only preview has anything worth showing.
export function copyrightChecklistIsEmpty(value) {
  const data = normalizeCopyrightChecklist(value);
  return COPYRIGHT_ITEMS.every((item) => {
    const e = data[item.key];
    return !e.owner && !e.validFrom && !e.validTo && !e.noTimeLimit && !e.contract;
  });
}

// Round 165 — pulled the per-right "complete" rule out of
// copyrightChecklistIsComplete below so the SAME rule can drive per-right
// UI (pills, popup default tab), not just the release-wide gate. Before
// this, the only per-right check available to the UI was
// copyrightEntryIsDeclared (Owner-only) — see its own comment for why that
// weaker check legitimately exists, but it was ALSO being used places that
// actually needed "fully complete," which is the bug this round fixes
// (see CopyrightRights.js / CopyrightRightsPopup.js call sites).
export function copyrightEntryIsComplete(entry) {
  if (!entry) return false;
  const validityDone = entry.noTimeLimit || (!!entry.validFrom && !!entry.validTo);
  return !!(entry.owner || "").trim() && !!(entry.contract || "").trim() && validityDone;
}

// Which of Owner/Contract/Validity Period is still missing on this entry —
// for a precise tooltip/label instead of a flat "not complete." Empty
// array means the entry is fully complete.
export function copyrightEntryMissingFields(entry) {
  if (!entry) return ["Owner", "Contract", "Validity Period"];
  const missing = [];
  if (!(entry.owner || "").trim()) missing.push("Owner");
  if (!(entry.contract || "").trim()) missing.push("Contract");
  if (!(entry.noTimeLimit || (entry.validFrom && entry.validTo))) missing.push("Validity Period");
  return missing;
}

// Round 105 — "fully filled in," not just "touched." Send Upload's new
// copyright gate needs every field on every one of the 3 rights actually
// completed, not merely started (that's what copyrightChecklistIsEmpty
// above already checks — the opposite, weaker condition). "Complete" per
// right: Owner non-blank, Contract non-blank, and Validity Period either
// "Không thời hạn" or both a from AND a to date (an open-ended range with
// only one end filled doesn't count as done).
export function copyrightChecklistIsComplete(value) {
  const data = normalizeCopyrightChecklist(value);
  return COPYRIGHT_ITEMS.every((item) => copyrightEntryIsComplete(data[item.key]));
}

// Round 109 — "has this specific right actually been declared" — Owner
// non-blank, same bar the read-only table uses to decide whether to show
// the real value or a "+ Declare" button for that cell. Deliberately
// weaker than copyrightChecklistIsComplete above (Contract + Validity
// aren't required to count as "declared" for display purposes — a
// half-filled-in right should still show its Owner instead of reverting
// to a bare "+ Declare" link).
export function copyrightEntryIsDeclared(entry) {
  return !!(entry?.owner || "").trim();
}

// Round 95 — "mushes" the structured checklist into one plain text block,
// for places that need a real STRING (not the jsonb object) — e.g. Phái
// Sinh's "Tác Quyền" field, which is a free-text column everywhere else it
// shows up (ticket index table cell, ticket detail textarea). Using
// CopyrightChecklistFields as the INPUT there but still saving a plain
// string keeps every existing string-only reader working unchanged. Only
// items with something actually filled in produce a block; returns "" if
// the whole checklist is empty.
export function mushCopyrightChecklistToText(value) {
  const data = normalizeCopyrightChecklist(value);
  const blocks = COPYRIGHT_ITEMS.map((item) => {
    const e = data[item.key];
    const lines = [];
    if ((e.owner || "").trim()) lines.push(`Owner: ${e.owner.trim()}`);
    const validity = copyrightValidityLabel(e);
    if (validity) lines.push(`Validity: ${validity}`);
    if ((e.contract || "").trim()) lines.push(`Contract: ${e.contract.trim()}`);
    if (lines.length === 0) return null;
    return `${item.label}\n${lines.join("\n")}`;
  }).filter(Boolean);
  return blocks.join("\n\n");
}
