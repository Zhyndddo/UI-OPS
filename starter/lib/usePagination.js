"use client";

import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [20, 50, 100];

// Generic client-side pagination for any workstation/dashboard table —
// same pairing pattern as useSortableRows: pass it the fully filtered +
// sorted row array, it slices out the current page. Purely a render-time
// slice, nothing about the underlying data changes; this is just what
// reduces how many rows get mounted into the DOM at once (the actual lag
// source on the bigger tables), not a server-side fetch limit.
export function usePagination(rows, options = {}) {
  const { defaultPageSize = 50 } = options;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  // If a filter/search narrows the row count (or pageSize changes) while
  // sitting on a later page, snap back into range instead of rendering an
  // empty table with no obvious way back.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  return { pageRows, page, setPage, pageSize, setPageSize, totalPages, totalRows: rows.length };
}
