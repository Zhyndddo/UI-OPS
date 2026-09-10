"use client";

import { useEffect, useId } from "react";
import { PAGE_SIZE_OPTIONS } from "./usePagination";
import { useBottomBarSlot } from "./BottomBarContext";

// Paired with usePagination — page-size picker + prev/next, matching
// SortableTh/ResetSortButton's pattern of taking `styles` in as a prop so
// it renders with whichever page's shared.module.css classes are already
// in scope, instead of importing its own.
//
// Round 108 — hideCount (default false) lets a caller suppress the
// "Showing X–Y of Z" text here without losing the prev/next controls, for
// pages that have moved that same count somewhere more visible on their
// own (see the Booking Board's top-right counter, added per explicit
// request — "the team want to easily see it" without scrolling to the
// bottom of the table).
//
// Round 284 — this component itself now renders nothing inline. The new
// shell-level BottomBar (lib/BottomBar.js) is where pagination controls
// actually show up, fixed to the bottom of the viewport instead of
// scrolling away at the bottom of a long table. Every one of this
// component's 26 call sites is UNCHANGED — same props, same import, same
// JSX position in the caller — this file just registers its controls into
// BottomBarContext instead of returning them directly, and returns null.
// The exact same count text + select + prev/next markup as before, just
// relocated.
export default function Pagination({ page, setPage, pageSize, setPageSize, totalPages, totalRows, styles, hideCount }) {
  const { register, unregister } = useBottomBarSlot();
  const id = useId();

  useEffect(() => {
    if (!totalRows) {
      unregister(id);
      return;
    }
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalRows);

    const left = !hideCount ? (
      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
        Showing {start}–{end} of {totalRows}
      </div>
    ) : null;

    const right = (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <select
          className={styles.select}
          style={{ maxWidth: 110, fontSize: 12 }}
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
        >
          {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
        <button
          type="button"
          className={styles.btnSmall}
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          style={{ opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? "default" : "pointer" }}
        >
          ← Prev
        </button>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Page {page} / {totalPages}</span>
        <button
          type="button"
          className={styles.btnSmall}
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          style={{ opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? "default" : "pointer" }}
        >
          Next →
        </button>
      </div>
    );

    register(id, { left, right });
    // Runs on every relevant prop change (page turn, row count changing,
    // etc.) as well as on real unmount — React always cleans up the
    // previous effect run before either re-running it or tearing down for
    // good. That means an ordinary page turn does unregister-then-
    // register back to back inside one synchronous effect flush (no
    // visible flicker, same idiom as any other effect that re-subscribes
    // on prop change); a real unmount (route change, or totalRows
    // dropping to 0 above) just leaves it unregistered.
    return () => unregister(id);
  }, [id, page, setPage, pageSize, setPageSize, totalPages, totalRows, hideCount, styles, register, unregister]);

  return null;
}
