"use client";

// Round 591 — two small switches shared by the Rights tab ("Fully held") and the Metadata Checklist ("Gen AI").
//
// FlipToggle   — shows ONLY the chosen option; one click flips to the other (Yes <-> No). Unset shows "Not set", first click = Yes.
// ChoiceToggle — same look as GateToggle (all options visible, the chosen one lit) for a single choice out of a short list.

const TONES = {
  yes: { background: "rgba(46,125,50,0.18)", color: "#7ee6a8", border: "1px solid #2e7d32" },
  no: { background: "rgba(198,40,40,0.16)", color: "#ff9a9a", border: "1px solid #c62828" },
  "": { background: "transparent", color: "var(--text-faint)", border: "1px solid var(--border-strong)" },
};

export function FlipToggle({ value, onChange, disabled, title }) {
  const v = value === "yes" || value === "no" ? value : "";
  const next = v === "yes" ? "no" : "yes";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(next)}
      title={title || `Click to switch to ${next === "yes" ? "Yes" : "No"}`}
      style={{
        minWidth: 84, padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, ...TONES[v],
      }}
    >
      {v === "yes" ? "✓ Yes" : v === "no" ? "✕ No" : "Not set"} <span style={{ opacity: 0.6, fontWeight: 600 }}>⇄</span>
    </button>
  );
}

export function ChoiceToggle({ value, onChange, options, compact }) {
  return (
    <div style={{ display: "flex", border: "1px solid var(--border-strong)", borderRadius: 6, overflow: "hidden" }}>
      {options.map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          style={{
            flex: 1, padding: compact ? "5px 6px" : "8px 10px", fontSize: compact ? 11 : 12, fontWeight: 700, border: "none", cursor: "pointer", whiteSpace: "nowrap",
            background: value === val ? "#ff6b1a" : "transparent",
            color: value === val ? "#0a0a0a" : "var(--text-muted)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export const GEN_AI_OPTIONS = [["No AI", "No AI"], ["Partly AI", "Partly AI"], ["Fully AI", "Fully AI"]];
