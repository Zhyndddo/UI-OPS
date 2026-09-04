"use client";

// Round 211 — per explicit report: sometimes OPS doesn't actually create
// the Link LBM upload themselves — the label does, and OPS just ends up
// pasting the resulting URL in later. There was no way to tell "who's
// responsible for actually creating this" just by looking at the Link
// LBM field, which matters because whoever's checking the Upload
// workstation needs to know whether they're waiting on the label to hand
// something over, or whether it's on them to go create it.
//
// Deliberately a SEPARATE field (releases.link_lbm_source), not a note
// typed into the Link LBM URL field itself — that field is a UrlField
// (lib/UrlField.js), which treats every non-empty line as a real,
// clickable URL, and every "is this done yet" check in the app
// (Upload/Re-Check workstations, dashboard NOT-DONE counts) is a plain
// non-empty check on it. A text note stuffed in there would render as a
// broken link AND falsely read as "already filled in" before any real
// URL exists.
//
// Shown as a small standalone control next to the Link LBM field
// wherever it's edited (release detail page's URL tab, Upload
// workstation row, Re-Check workstation's LbmCell — used in both its
// phase 1 and phase 2 tables). Always editable, not one-shot — the
// popup at Send Upload time (app/releases/[id]/page.js) just sets the
// initial value; anyone can correct it later if it turns out wrong.
export default function LinkLbmSourceBadge({ value, onChange, styles }) {
  const color = value === "label" ? "#5cb3ff" : value === "ops" ? "#ff9d5c" : "var(--text-faint)";
  return (
    <select
      className={styles.select}
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      title="Who's actually creating the Link LBM upload"
      style={{ fontSize: 10, padding: "2px 4px", color, borderColor: color, marginTop: 3, width: "100%" }}
    >
      <option value="">Upload by — unset</option>
      <option value="label">Label upload</option>
      <option value="ops">OPS upload</option>
    </select>
  );
}
