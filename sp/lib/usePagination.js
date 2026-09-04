"use client";

import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [20, 50, 100];

// Generic client-side pagination for any workstation/dashboard table —
// same pairing pattern as useSortableRows: pass it the fully filtered +
// sorted row array, it slices out the current page. Purely a render-time
// slice, nothing about the underlying data changes; this is just what
// reduces how many rows get mounted into the DOM at once (the actual lag
// source on the bigger tables), not a server-side fetch limit.
// Round 224 — defaultPage (optional, backward-compatible) lets a caller
// restore a remembered page instead of always starting at 1 — see
// app/releases/page.js's sessionStorage-backed "remember position" for
// the first real use. Every existing caller that doesn't pass it behaves
// exactly as before.
export function usePagination(rows, options = {}) {
  const { defaultPageSize = 50, defaultPage = 1 } = options;
  const [page, setPage] = useState(defaultPage);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  // If a filter/search narrows the row count (or pageSize changes) while
  // sitting on a later page, snap back into range instead of rendering an
  // empty table with no obvious way back. Skipped while rows is still
  // empty (nothing fetched yet) — otherwise a restored defaultPage > 1
  // would get clamped straight back to 1 before the first fetch ever
  // resolves, undoing the restore before it has a chance to apply.
  useEffect(() => {
    if (rows.length === 0) return;
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages, rows.length]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  return { pageRows, page, setPage, pageSize, setPageSize, totalPages, totalRows: rows.length };
}
