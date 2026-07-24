// Shared by the Labels reference page and the quick-create popup, so the
// "HĐ - " prefix rule only lives in one place. New labels always get the
// prefix; it can only be removed later once Curve ID is filled in — that
// check lives here too, so both edit paths enforce it identically.
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
// an edited label_name value.
export function validateLabelNameEdit(oldName, newName, curveId) {
  const hadPrefix = (oldName || "").startsWith(LABEL_PREFIX);
  const hasPrefix = (newName || "").startsWith(LABEL_PREFIX);
  if (hadPrefix && !hasPrefix && !curveId?.trim()) {
    return { ok: false, message: `Fill in Curve ID before removing the "${LABEL_PREFIX}" prefix.` };
  }
  return { ok: true };
}
