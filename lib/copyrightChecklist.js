"use client";

// Round 88 follow-up — replaced the original nested Copyright Checklist
// shape with a flat 3-field template, applied identically to all 3 rights
// (Quyền nhà xuất bản/Master, Quyền của người biểu diễn/Vocal, Quyền tác
// giả/Author), per explicit "change of plan":
//   1. Owner — single choice "Tự sản xuất" / "Hợp tác", with a sub text
//      field for who, shown only when "Hợp tác" is picked.
//   2. Validity Period — a from/to date range, with quick-preset buttons
//      (6 tháng / 1 năm / 2 năm / Vĩnh viễn) instead of always hand-picking
//      both dates.
//   3. Contract — one textbox; a URL typed in there renders as a clickable
//      hyperlink (reuses lib/LinkOrEditCell.js, the same link-or-edit
//      pattern Phái Sinh/Manual Claim's URL columns already use).
// Still stored as ONE jsonb column (releases.copyright_checklist) shaped
// { master: Entry, vocal: Entry, author: Entry } — same "one jsonb column,
// several named sub-objects" pattern labels.hop_tac_status uses. The
// column itself doesn't need a new migration — jsonb has no fixed shape,
// so the Round 88 column just now holds a differently-shaped Entry.

export const COPYRIGHT_OWNER_OPTIONS = [
  { key: "self", label: "Tự sản xuất" },
  { key: "hopTac", label: "Hợp tác" },
];

// Validity Period quick presets — sets validFrom to today and validTo to
// today+N months in one click; "Vĩnh viễn" clears validTo and flags
// perpetual instead of leaving it just blank/unset, so the index summary
// and any future gating logic can tell "picked perpetual on purpose" apart
// from "never touched this field".
export const COPYRIGHT_VALIDITY_PRESETS = [
  { key: "6m", label: "6 tháng", months: 6 },
  { key: "1y", label: "1 năm", months: 12 },
  { key: "2y", label: "2 năm", months: 24 },
  { key: "perpetual", label: "Vĩnh viễn", months: null },
];

export const COPYRIGHT_ITEMS = [
  { key: "master", label: "Quyền nhà xuất bản (quyền liên quan)", shortLabel: "Q1" },
  { key: "vocal", label: "Quyền của người biểu diễn (quyền liên quan)", shortLabel: "Q2" },
  { key: "author", label: "Quyền tác giả", shortLabel: "Q3" },
];

export function emptyCopyrightEntry() {
  return { owner: null, ownerName: "", validFrom: "", validTo: "", perpetual: false, contract: "" };
}

export function emptyCopyrightChecklist() {
  const out = {};
  COPYRIGHT_ITEMS.forEach((item) => { out[item.key] = emptyCopyrightEntry(); });
  return out;
}

// Fills in any missing keys (older releases saved under the previous
// nested shape, or a column that read back null/undefined) with the
// empty shape — same "merge over defaults" pattern used elsewhere (e.g.
// GateFields' data merges) instead of assuming the stored value already
// matches today's shape. A release saved under the OLD nested shape
// (type/subtype/subtypeName/contractType/contractText) just reads back as
// blank here rather than crashing — those old fields are simply ignored.
export function normalizeCopyrightChecklist(value) {
  const base = emptyCopyrightChecklist();
  const merged = { ...base, ...(value || {}) };
  COPYRIGHT_ITEMS.forEach((item) => {
    merged[item.key] = { ...base[item.key], ...(merged[item.key] || {}) };
  });
  return merged;
}

export function copyrightOwnerLabel(ownerKey) {
  return COPYRIGHT_OWNER_OPTIONS.find((o) => o.key === ownerKey)?.label || null;
}

// Short form used in the compiled index summary line.
export function copyrightOwnerShort(ownerKey) {
  if (ownerKey === "self") return "Tự SX";
  if (ownerKey === "hopTac") return "Hợp tác";
  return null;
}

// "Q1: Tự SX · Q2: Hợp tác · Q3: Tự SX" — only items that have actually
// been touched (owner set) show up; returns null if nothing's filled in
// yet, so callers can skip rendering the row entirely.
export function copyrightChecklistSummary(value) {
  const data = normalizeCopyrightChecklist(value);
  const parts = COPYRIGHT_ITEMS
    .map((item) => {
      const short = copyrightOwnerShort(data[item.key]?.owner);
      return short ? `${item.shortLabel}: ${short}` : null;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
