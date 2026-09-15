"use client";

import { useEffect, useMemo, useState } from "react";

// Round 318 — general-purpose per-viewer column visibility + reorder
// control for index-style tables, per explicit request ("let's also
// build this new system... a small picker, a 3 dash button... a
// multiple picker for anything that will show upon the index. If we
// also can (optional) allow them to sort column from there as well").
// Built as reusable infrastructure (not hardcoded to any one page) —
// first wired into app/releases/page.js, meant to be reused by other
// index-style tables later.
//
// A column can be marked `required: true` — it can't be hidden (the
// checkbox stays checked/disabled), but it CAN still be reordered like
// any other column. app/releases/page.js uses this for DID and Name,
// the two columns that link into the release detail page — hiding both
// would leave a row with no way to click into it.
//
// Permission gating (who's even allowed to see a column at all — e.g.
// the PRJ/AR-PIC/subteam columns) stays entirely the CALLER's job: only
// pass columns the current viewer is permitted to see in the first
// place. This hook adds one more layer on top of that: does THIS viewer
// currently want to see it, and in what order.
//
// Persistence: localStorage, keyed by a caller-supplied page key + the
// viewer's profile id — same per-user-but-client-side pattern already
// used elsewhere in this app (lib/Sidebar.js's secret-message-seen list,
// lib/secretMessages.js's hidden-message list) rather than a new DB
// column/table. Per-device, not synced across browsers/devices — an
// acceptable trade-off for a display preference; easy to upgrade to a
// real DB column later if that turns out to matter.
//
// A column key present in the caller's list but NOT yet in a saved
// preference (a brand new column added later, or someone's first visit)
// is always treated as visible and appended at the end — never silently
// hidden just because it didn't exist when a preference was last saved.
function storageKeyFor(pageKey, profileId) {
  return `vieent_col_prefs_${pageKey}_${profileId || "anon"}`;
}

function readPrefs(pageKey, profileId) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKeyFor(pageKey, profileId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePrefs(pageKey, profileId, prefs) {
  if (typeof window === "undefined") return;
  try {
    if (prefs) window.localStorage.setItem(storageKeyFor(pageKey, profileId), JSON.stringify(prefs));
    else window.localStorage.removeItem(storageKeyFor(pageKey, profileId));
  } catch {
    // localStorage can throw (private browsing, storage full) — this is
    // a pure convenience, not worth surfacing an error for.
  }
}

// columns: [{ key, label, required? }] — the full set of columns THIS
// VIEWER is currently permitted to see, in the caller's default order.
// Recomputed by the caller on every render (permission gates can depend
// on profile/data that changes), so this hook re-syncs against it
// rather than freezing the column set at mount.
export function useColumnVisibility(pageKey, columns, profileId) {
  const columnKeys = columns.map((c) => c.key).join(",");
  const [prefs, setPrefs] = useState(() => readPrefs(pageKey, profileId));

  // Re-read from storage if the page/profile identity changes (e.g. dev
  // "View As" impersonation swapping profiles mid-session).
  useEffect(() => {
    setPrefs(readPrefs(pageKey, profileId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, profileId]);

  // Effective order: saved order first (minus any keys the viewer is no
  // longer permitted to see right now), then any columns not yet in the
  // saved order appended at the end — covers both "brand new column"
  // and "first visit, no saved prefs at all".
  const orderedColumns = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    const savedOrder = prefs?.order || [];
    const seen = new Set();
    const ordered = [];
    savedOrder.forEach((k) => {
      if (byKey.has(k) && !seen.has(k)) {
        ordered.push(byKey.get(k));
        seen.add(k);
      }
    });
    columns.forEach((c) => {
      if (!seen.has(c.key)) {
        ordered.push(c);
        seen.add(c.key);
      }
    });
    return ordered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnKeys, prefs]);

  const hiddenSet = useMemo(() => new Set(prefs?.hidden || []), [prefs]);
  function isVisible(col) {
    if (col.required) return true;
    return !hiddenSet.has(col.key);
  }
  const visibleColumns = orderedColumns.filter(isVisible);

  function persist(next) {
    setPrefs(next);
    writePrefs(pageKey, profileId, next);
  }

  function toggle(col) {
    if (col.required) return;
    const hidden = new Set(prefs?.hidden || []);
    if (hidden.has(col.key)) hidden.delete(col.key);
    else hidden.add(col.key);
    persist({ order: orderedColumns.map((c) => c.key), hidden: [...hidden] });
  }

  // Round 326 — replaces the old move(col, dir) up/down-one-step buttons
  // with drag-and-drop, per explicit request ("change up down from
  // re-oder column to drag"). Takes the dragged column's key straight to
  // wherever it was dropped, rather than nudging one position at a time.
  function moveTo(key, targetIndex) {
    const order = orderedColumns.map((c) => c.key);
    const i = order.indexOf(key);
    if (i < 0) return;
    const clamped = Math.max(0, Math.min(order.length - 1, targetIndex));
    if (clamped === i) return;
    const [moved] = order.splice(i, 1);
    order.splice(clamped, 0, moved);
    persist({ order, hidden: [...hiddenSet] });
  }

  function reset() {
    persist(null);
  }

  return { orderedColumns, visibleColumns, isVisible, toggle, moveTo, reset };
}

// The "⋮" button + popover. Purely presentational — a page just wires
// useColumnVisibility's own return values straight in as props.
export default function ColumnVisibilityButton({ orderedColumns, isVisible, toggle, moveTo, reset }) {
  const [open, setOpen] = useState(false);
  // Round 326 — plain native HTML5 drag-and-drop (no new dependency —
  // this app doesn't use a DnD library anywhere else). dragKey is the
  // column currently being dragged; overIndex is whichever row the
  // pointer is currently over, purely for the drop-target highlight.
  const [dragKey, setDragKey] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Choose which columns show, and reorder them"
        style={{
          background: "none",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          padding: "6px 10px",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--text-faint)",
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        ⋮
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 449 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              zIndex: 450,
              minWidth: 230,
              maxHeight: 380,
              overflowY: "auto",
              background: "var(--bg-card)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              padding: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 6 }}>
              Columns
            </div>
            {orderedColumns.map((c, i) => {
              const visible = isVisible(c);
              const isDragging = dragKey === c.key;
              const isDropTarget = overIndex === i && dragKey !== null && dragKey !== c.key;
              return (
                <div
                  key={c.key}
                  onDragOver={(e) => {
                    if (dragKey === null) return;
                    e.preventDefault(); // required to allow a drop at all
                    e.dataTransfer.dropEffect = "move";
                    if (overIndex !== i) setOverIndex(i);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragKey !== null) moveTo(dragKey, i);
                    setDragKey(null);
                    setOverIndex(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 0",
                    opacity: isDragging ? 0.4 : 1,
                    boxShadow: isDropTarget ? "inset 0 2px 0 var(--accent)" : "none",
                  }}
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDragKey(c.key);
                    }}
                    onDragEnd={() => {
                      setDragKey(null);
                      setOverIndex(null);
                    }}
                    title="Drag to reorder"
                    style={{ cursor: "grab", color: "var(--text-faint)", fontSize: 13, padding: "0 2px", userSelect: "none" }}
                  >
                    ⠿
                  </span>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      flex: 1,
                      cursor: c.required ? "default" : "pointer",
                      color: visible ? "var(--text)" : "var(--text-faint)",
                    }}
                  >
                    <input type="checkbox" checked={visible} disabled={!!c.required} onChange={() => toggle(c)} />
                    {c.label}
                    {c.required && <span style={{ fontSize: 9, color: "var(--text-faint)" }}>(always on)</span>}
                  </label>
                </div>
              );
            })}
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }}>
              <button
                type="button"
                onClick={reset}
                style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 11, cursor: "pointer", padding: 0 }}
              >
                Reset to default
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
