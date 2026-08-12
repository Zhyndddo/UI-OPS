"use client";

// Round 88 — "Copyright Checklist": 3 identical-shaped fields (Quyền nhà
// xuất bản/Master, Quyền của người biểu diễn/Vocal, Quyền tác giả/Author),
// each: top-level single choice (Tự sản xuất / Hợp tác Độc quyền) -> if
// exclusive, a sub single choice naming WHO the exclusive deal is with ->
// a free-text name for that party -> a "Có hợp đồng" pair (single-choice
// confirm method + a text field, except the text field is replaced by a
// warning message when "confirm qua miệng" is picked — per explicit spec,
// verbal-only confirmation isn't allowed to just sit there as accepted).
// Stored as ONE jsonb column (releases.copyright_checklist) shaped
// { master: Entry, vocal: Entry, author: Entry } — same "one jsonb column,
// several named sub-objects" pattern labels.hop_tac_status already uses,
// rather than a pile of new flat columns.

export const COPYRIGHT_TYPE_OPTIONS = [
  { key: "self", label: "Tự sản xuất" },
  { key: "exclusive", label: "Hợp tác Độc quyền (có thời hạn/vô thời hạn)" },
];

export const COPYRIGHT_CONTRACT_OPTIONS = [
  { key: "verbal", label: "Confirm qua miệng" },
  { key: "message", label: "Confirm tin nhắn" },
  { key: "contract", label: "Hợp Đồng" },
];

export const COPYRIGHT_ITEMS = [
  {
    key: "master",
    label: "Quyền nhà xuất bản (quyền liên quan)",
    shortLabel: "Q1",
    subOptions: [
      { key: "producer", label: "Producer" },
      { key: "otherLabel", label: "Label khác" },
      { key: "thirdParty", label: "Bên thứ 3" },
    ],
  },
  {
    key: "vocal",
    label: "Quyền của người biểu diễn (quyền liên quan)",
    shortLabel: "Q2",
    subOptions: [
      { key: "freeArtist", label: "Ca Sĩ Tự do" },
      { key: "management", label: "Công ty quản lý" },
      { key: "otherLabel", label: "Label khác" },
    ],
  },
  {
    key: "author",
    label: "Quyền tác giả",
    shortLabel: "Q3",
    subOptions: [
      { key: "author", label: "Tác Giả" },
      { key: "vcpmc", label: "VCPMC" },
      { key: "publisher", label: "Publisher" },
    ],
  },
];

export function emptyCopyrightEntry() {
  return { type: null, subtype: null, subtypeName: "", contractType: null, contractText: "" };
}

export function emptyCopyrightChecklist() {
  const out = {};
  COPYRIGHT_ITEMS.forEach((item) => { out[item.key] = emptyCopyrightEntry(); });
  return out;
}

// Fills in any missing keys (older releases saved before a field existed,
// or the column read back null/undefined) with the empty shape, same
// "merge over defaults" pattern used elsewhere (e.g. GateFields' data
// merges) instead of assuming the stored value is always complete.
export function normalizeCopyrightChecklist(value) {
  const base = emptyCopyrightChecklist();
  const merged = { ...base, ...(value || {}) };
  COPYRIGHT_ITEMS.forEach((item) => {
    merged[item.key] = { ...base[item.key], ...(merged[item.key] || {}) };
  });
  return merged;
}

export function copyrightTypeLabel(typeKey) {
  return COPYRIGHT_TYPE_OPTIONS.find((o) => o.key === typeKey)?.label || null;
}

// Short "Tự SX" / "HTĐQ" form used in the compiled index summary line —
// layer-1 choice only, per explicit spec ("no need for layer 2 choices").
export function copyrightTypeShort(typeKey) {
  if (typeKey === "self") return "Tự SX";
  if (typeKey === "exclusive") return "HTĐQ";
  return null;
}

// "Quyền 1: Tự SX · Quyền 2: HTĐQ · Quyền 3: Tự SX" — only items that have
// actually been touched (type set) show up; returns null if nothing's
// filled in yet, so callers can skip rendering the row entirely.
export function copyrightChecklistSummary(value) {
  const data = normalizeCopyrightChecklist(value);
  const parts = COPYRIGHT_ITEMS
    .map((item, i) => {
      const short = copyrightTypeShort(data[item.key]?.type);
      return short ? `${item.shortLabel}: ${short}` : null;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
