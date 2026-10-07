"use client";

import { useState } from "react";

// Round 476 — click-to-pick month grid (year ◀ ▶ + 12 month buttons) so a
// month can be chosen without typing or arrow-keying a native <input
// type="month">. value/onChange use the same "YYYY-MM" string that input did.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function MonthGridPicker({ value, onChange }) {
  const [vy, vm] = (value || "").split("-").map(Number);
  const nowYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth() + 1;
  const [year, setYear] = useState(vy || nowYear);
  const arrow = {
    background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)",
    cursor: "pointer", width: 32, height: 28, fontSize: 14,
  };
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button type="button" style={arrow} onClick={() => setYear((y) => y - 1)} aria-label="Previous year">◀</button>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{year}</div>
        <button type="button" style={arrow} onClick={() => setYear((y) => y + 1)} aria-label="Next year">▶</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {MONTHS.map((label, i) => {
          const m = i + 1;
          const selected = vy === year && vm === m;
          const isNow = year === nowYear && m === nowMonth;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange(`${year}-${String(m).padStart(2, "0")}`)}
              style={{
                padding: "9px 0", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: selected ? "1px solid var(--accent)" : isNow ? "1px dashed var(--accent)" : "1px solid var(--border)",
                background: selected ? "var(--accent)" : "transparent",
                color: selected ? "var(--accent-on)" : "var(--text)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
