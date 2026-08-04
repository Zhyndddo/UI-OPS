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
export function validateLabelNameEdit(oldName, newName) {
  const hadPrefix = (oldName || "").startsWith(LABEL_PREFIX);
  const hasPrefix = (newName || "").startsWith(LABEL_PREFIX);
  if (hadPrefix && !hasPrefix) {
    return { ok: false, message: `The "${LABEL_PREFIX}" prefix can only be removed via "Contract Signed" on the Label List — not by editing the name directly.` };
  }
  return { ok: true };
}
