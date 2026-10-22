"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../app/shared.module.css";

// Round 548 — compact filters for Non-Package Booking (TESTER ONLY for now, see
// lib/uiTesters.js). The three stacked rows of tab buttons (category / group /
// brand) plus the search box collapse into one line: search, one "Filters"
// button that shows the current path (e.g. "TikTok Channel › Partner › BK MUSIC")
// and opens a small panel, and the Unassigned chip with its count. The page's
// state and filtering logic are untouched — this only changes how the controls look.
const pill = (on) => ({
  border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
  borderRadius: 6,
  background: on ? "rgba(255,107,26,0.1)" : "transparent",
  color: on ? "var(--accent)" : "var(--text)",
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
});

export default function NpbFilterBar({
  categories, category, onCategory,
  groups, group, onGroup,
  brands, brand, onBrand, shortBrand,
  unassigned, unassignedCount, onUnassigned,
  search, onSearch, onReset,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const isTikTok = category === "TikTok Channel";
  const path = [category, isTikTok ? group : null, unassigned ? "Unassigned" : shortBrand(brand)].filter(Boolean).join(" › ");

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
      <input
        className={styles.input}
        style={{ maxWidth: 280, margin: 0 }}
        placeholder="Search DID, title, artist…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />

      <div ref={rootRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{ ...pill(open), display: "inline-flex", alignItems: "center", gap: 8 }}
          title="Change category, group or brand"
        >
          <span style={{ color: "var(--text-faint)", fontWeight: 600 }}>Filters</span>
          <span>{path}</span>
          <span aria-hidden="true" style={{ fontSize: 10 }}>{open ? "▴" : "▾"}</span>
        </button>

        {open && (
          <div
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, width: 440, maxWidth: "calc(100vw - 32px)",
              background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,.35)",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-faint)", marginBottom: 6, letterSpacing: "0.06em" }}>CATEGORY</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {categories.map((c) => (
                <button key={c} type="button" style={pill(category === c)} onClick={() => onCategory(c)}>{c}</button>
              ))}
            </div>

            {isTikTok && (
              <>
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-faint)", marginBottom: 6, letterSpacing: "0.06em" }}>GROUP</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {groups.map((g) => (
                    <button key={g} type="button" style={pill(group === g)} onClick={() => onGroup(g)}>{g}</button>
                  ))}
                </div>
              </>
            )}

            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-faint)", marginBottom: 6, letterSpacing: "0.06em" }}>BRAND</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {brands.map((b) => (
                <button key={b} type="button" style={pill(!unassigned && brand === b)} onClick={() => { onBrand(b); setOpen(false); }}>
                  {shortBrand(b)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onUnassigned(!unassigned)}
        style={pill(unassigned)}
        title="Tickets whose Brand hasn't been picked yet"
      >
        Unassigned{unassignedCount > 0 ? ` (${unassignedCount})` : ""}
      </button>

      <button
        type="button"
        onClick={onReset}
        style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}
        title="Back to TikTok Channel › Partner › first brand, search cleared"
      >
        Reset
      </button>
    </div>
  );
}
