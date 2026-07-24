"use client";

// Done / Not Done / Cancel counter shown at the top of every workstation
// and ticket page. What counts as "done" varies per page (a real
// business-rule decision for the team to make later) — this component
// just renders whatever counts it's given.
export default function StatusCounter({ done, notDone, cancel }) {
  const items = [
    ["Done", done, "var(--success-fg)"],
    ["Not Done", notDone, "var(--warn-fg)"],
    ["Cancel", cancel, "var(--text-faint)"],
  ];
  return (
    <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
      {items.map(([label, value, color]) => (
        <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color }}>{value}</span>
          <span style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
