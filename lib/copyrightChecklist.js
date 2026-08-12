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

export const COPYRIGHT_ITEMS = [
  { key: "master", label: "Quyền nhà xuất bản (quyền liên quan)", shortLabel: "Q1" },
  { key: "vocal", label: "Quyền của người biểu diễn (quyền liên quan)", shortLabel: "Q2" },
  { key: "author", label: "Quyền tác giả", shortLabel: "Q3" },
];

export function emptyCopyrightEntry() {
  return { owner: "", validFrom: "", validTo: "", noTimeLimit: false, contract: "" };
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
