// Shared by the Labels reference page and the quick-create popup, so the
// "HĐ - " prefix rule only lives in one place. New labels always get the
// prefix; it can only be removed via the one-time "Contract Signed" button
// on the Label List (app/labels/page.js), never by hand-editing the name —
// that check lives here too, so both edit paths (this page's inline
// rename, the release detail page's Label field) enforce it identically.
export const LABEL_PREFIX = "HĐ - ";

export function withLabelPrefix(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith(LABEL_PREFIX) ? trimmed : LABEL_PREFIX + trimmed;
}

export function stripLabelPrefix(name) {
  const trimmed = (name || "").trim();
  return trimmed.startsWith(LABEL_PREFIX) ? trimmed.slice(LABEL_PREFIX.length) : trimmed;
}

export function hasLabelPrefix(name) {
  return (name || "").trim().startsWith(LABEL_PREFIX);
}

// Returns { ok: true } or { ok: false, message } — call before persisting
// an edited label_name value. Manual removal of the prefix is never
// allowed anymore — the one-time "Contract Signed" button on the Label
// List (app/labels/page.js) is the only sanctioned way to strip it, so any
// hand-edit that would drop the prefix gets rejected and redirected there.
//
// Round 562 — what is blocked is STRIPPING the prefix off the same label by hand (typing the
// name without it). Switching a release to a DIFFERENT label is always fine, including one
// with no prefix (contract already signed): pass `knownLabels` (rows with label_name) and a
// new name that matches one of them exactly is accepted, as is any name whose base differs
// from the old one's.
export function validateLabelNameEdit(oldName, newName, knownLabels) {
  const hadPrefix = (oldName || "").startsWith(LABEL_PREFIX);
  const hasPrefix = (newName || "").startsWith(LABEL_PREFIX);
  const next = (newName || "").trim();
  if (hadPrefix && !hasPrefix && next) {
    if ((knownLabels || []).some((l) => (l.label_name || "").trim() === next)) return { ok: true };
    if (stripLabelPrefix(oldName).trim().toLowerCase() !== next.toLowerCase()) return { ok: true };
  }
  if (hadPrefix && !hasPrefix) {
    return { ok: false, message: `The "${LABEL_PREFIX}" prefix can only be removed via "Contract Signed" on the Label List — not by editing the name directly.` };
  }
  return { ok: true };
}
