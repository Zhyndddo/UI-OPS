"use client";

import { useAuth } from "./AuthContext";
import { isUiTester } from "./uiTesters";
import styles from "../app/shared.module.css";

// Round 549 — table-shaped skeleton shown while a page's list is loading, in place
// of the plain "Loading…" line (TESTER ONLY for now, see lib/uiTesters.js — everyone
// else still gets exactly the old line, so nothing changes for them). Pure CSS shimmer
// (.uix-skeleton in app/globals.css); respects "reduce motion". Pages swap
// <div className={styles.emptyState}>Loading…</div> for <LoadingSkeleton />.
const WIDTHS = [
  [18, 34, 12, 20, 10],
  [14, 40, 10, 24, 8],
  [20, 30, 14, 18, 12],
  [16, 36, 12, 22, 9],
  [18, 32, 10, 26, 8],
  [15, 38, 13, 19, 11],
];

export default function LoadingSkeleton({ rows = 6, label = "Loading…" }) {
  const { realProfile } = useAuth();
  if (!isUiTester(realProfile)) return <div className={styles.emptyState}>{label}</div>;

  return (
    <div role="status" aria-busy="true" aria-label={label} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ display: "flex", gap: 14, paddingBottom: 10, marginBottom: 6, borderBottom: "1px solid var(--border)" }}>
        {WIDTHS[0].map((w, i) => (
          <span key={i} className="uix-skeleton" style={{ height: 10, width: `${w}%`, opacity: 0.7 }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: "flex", gap: 14, alignItems: "center", padding: "10px 0", borderBottom: r < rows - 1 ? "1px solid var(--border)" : "none" }}>
          {WIDTHS[r % WIDTHS.length].map((w, i) => (
            <span key={i} className="uix-skeleton" style={{ height: 14, width: `${w}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
