"use client";

import { useMemo, useState } from "react";
import { sortByReleaseDateDesc } from "./workstationHelpers";

// Generic click-to-sort for any workstation/dashboard table.
//
// Default state (sort === null) is always "release date, newest first" —
// matches sortByReleaseDateDesc, the rule every table already used before
// this existed. Clicking a column header cycles asc -> desc -> back to
// default (a third click, or the explicit reset button, undoes the sort).
//
// dateKeys lets callers mark which sortable columns hold date/datetime
// values so they compare as dates instead of strings.
export function useSortableRows(rows, options = {}) {
  const { defaultDateKey = "release_date", dateKeys = [defaultDateKey] } = options;
  const [sort, setSort] = useState(null); // null = default sort | { key, dir: "asc" | "desc" }

  function toggleSort(key) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function resetSort() {
    setSort(null);
  }

  const sorted = useMemo(() => {
    if (!sort) return sortByReleaseDateDesc(rows, defaultDateKey);
    const { key, dir } = sort;
    const isDate = dateKeys.includes(key);
    const withIndex = rows.map((r, i) => [r, i]);
    withIndex.sort(([a, ai], [b, bi]) => {
      let av = a[key];
      let bv = b[key];
      if (isDate) {
        av = av ? new Date(av).getTime() : -Infinity;
        bv = bv ? new Date(bv).getTime() : -Infinity;
      } else if (typeof av === "boolean" || typeof bv === "boolean") {
        av = av ? 1 : 0;
        bv = bv ? 1 : 0;
      } else {
        av = av == null ? "" : String(av).toLowerCase();
        bv = bv == null ? "" : String(bv).toLowerCase();
      }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return ai - bi; // stable
    });
    return withIndex.map(([r]) => r);
  }, [rows, sort, defaultDateKey, dateKeys]);

  return { sorted, sort, toggleSort, resetSort, isDefault: sort === null };
}
