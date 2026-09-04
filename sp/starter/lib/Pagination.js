"use client";

import { PAGE_SIZE_OPTIONS } from "./usePagination";

// Paired with usePagination — page-size picker + prev/next, matching
// SortableTh/ResetSortButton's pattern of taking `styles` in as a prop so
// it renders with whichever page's shared.module.css classes are already
// in scope, instead of importing its own.
export default function Pagination({ page, setPage, pageSize, setPageSize, totalPages, totalRows, styles }) {
  if (totalRows === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalRows);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
        Showing {start}–{end} of {totalRows}
      </div>
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
    </div>
  );
}
