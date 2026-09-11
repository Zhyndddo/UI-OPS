"use client";

// Round 312 — reusable pill/dot toggle switch. Per explicit request
// ("from now on, use the pill switch ... for any ticker" — a small pill
// track with a dot inside that slides across and turns green when it's
// switched on) this is now the house control for any plain yes/no
// toggle, replacing a raw <input type="checkbox"> rendered on its own.
// First applied to Secret Messages' Person/Team/Subteam picker
// (app/secret-messages/page.js's CheckboxList) — reach for this
// component anywhere else a checkbox-as-toggle shows up next, rather
// than adding another bare <input type="checkbox">.
//
// Built on a real (visually-hidden but still present/focusable)
// checkbox input so it keeps native keyboard, focus-ring, and form
// semantics instead of reinventing them with a plain <div onClick>.
//
// Props: checked, onChange(nextChecked), disabled, label (optional —
// omit for a bare switch, e.g. inside a list row that already renders
// its own label text next to it), size ("sm" | "md", default "md").
export default function PillSwitch({ checked, onChange, disabled, label, size = "md" }) {
  const dims =
    size === "sm"
      ? { w: 30, h: 16, dot: 12, pad: 2 }
      : { w: 36, h: 20, dot: 14, pad: 3 };

  const switchEl = (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: dims.w,
        height: dims.h,
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 999,
          background: checked ? "rgba(62, 207, 110, 0.16)" : "var(--bg-hover)",
          border: `1px solid ${checked ? "#3ecf6e" : "var(--border)"}`,
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: dims.pad - 1,
          left: checked ? dims.w - dims.dot - dims.pad - 1 : dims.pad - 1,
          width: dims.dot,
          height: dims.dot,
          borderRadius: "50%",
          background: checked ? "#3ecf6e" : "var(--text-faint)",
          transition: "left 0.15s ease, background 0.15s ease",
        }}
      />
      <input
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          margin: 0,
          opacity: 0,
          cursor: disabled ? "default" : "pointer",
        }}
      />
    </span>
  );

  if (label === undefined || label === null) return switchEl;

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {switchEl}
      {label}
    </label>
  );
}
