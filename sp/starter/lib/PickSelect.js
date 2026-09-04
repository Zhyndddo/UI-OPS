"use client";

// Shared single-choice picker that surfaces a value not on the fixed
// option list as its own flagged option instead of silently rendering
// blank — same fix as the New Release dashboard's Channel column and the
// Pre-release Workstation's CANVA/MV/Artist Pick/etc columns (see the
// comment there). Reused here for the Labels reference table's Phân Loại
// field, which is being converted from free text to a fixed list and may
// have existing values that don't match any of the new options.
export default function PickSelect({ styles, opts, value, onChange, style, placeholder }) {
  const unrecognized = value && !opts.includes(value) ? value : null;
  return (
    <select
      className={styles.select}
      style={style}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      title={unrecognized ? "Existing value doesn't match any option — pick one to fix it" : undefined}
    >
      {opts.map((o) => <option key={o} value={o}>{o || placeholder || "—"}</option>)}
      {unrecognized && <option value={unrecognized}>{unrecognized} (unrecognized — pick to fix)</option>}
    </select>
  );
}
