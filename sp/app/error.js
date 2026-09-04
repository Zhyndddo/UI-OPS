"use client";

import { useEffect } from "react";
import Link from "next/link";
import styles from "./shared.module.css";

// Round 223 — Next.js route-segment error boundary. Before this, a
// runtime error anywhere in the app (a bad prop, an undefined read, a
// Supabase error thrown instead of returned, a missing table from a
// migration that hasn't been run yet, etc.) fell through to Next.js's
// default error screen — a blank/dev-overlay page with no way back in
// for a non-technical teammate. This catches any error thrown while
// rendering a page, logs it to the console for debugging, and shows a
// plain "something broke" screen with a Try Again button (re-renders the
// segment fresh) and a link back to the dashboard — one broken page can
// no longer strand someone with no way forward.
//
// Catches errors anywhere under the root layout EXCEPT the root layout
// itself (app/layout.js) — see app/global-error.js for that case, which
// Next.js requires as a separate file since it has to replace the whole
// <html> document when it fires.
export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 560, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h1 className={styles.title} style={{ marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 24 }}>
          This page hit an error and couldn't finish loading. Nothing else in the app is affected —
          try again, or head back to the dashboard.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={() => reset()}
            style={{ border: "1px solid var(--accent)", borderRadius: 6, background: "rgba(255,107,26,0.1)", color: "var(--text)", padding: "8px 16px", fontSize: 13, cursor: "pointer" }}
          >
            Try Again
          </button>
          <Link
            href="/releases"
            style={{ border: "1px solid var(--border-strong)", borderRadius: 6, padding: "8px 16px", fontSize: 13, color: "var(--text)", textDecoration: "none" }}
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
