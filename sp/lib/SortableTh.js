"use client";

// A <th> that's clickable to sort the table it's in. Pair with
// useSortableRows — pass its `sort` state and `toggleSort` here.
export default function SortableTh({ label, sortKey, sort, onToggle, children, style, ...rest }) {
  const active = sort?.key === sortKey;
  const arrow = active ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th
      {...rest}
      onClick={() => onToggle(sortKey)}
      title="Click to sort"
      style={{ cursor: "pointer", userSelect: "none", ...style }}
    >
      {children || label}
      {arrow}
    </th>
  );
}

// Small "back to default" control — only worth rendering while a
// non-default sort is active (isDefault === false).
export function ResetSortButton({ isDefault, onReset, styles }) {
  if (isDefault) return null;
  return (
    <button onClick={onReset} className={styles.btnSmall} style={{ marginLeft: 8 }}>
      ✕ Reset sort (Release Date, newest first)
    </button>
  );
}
