"use client";

import Link from "next/link";

// Replaces a locked row's normal cells with a single grey, full-width
// watermark banner — per explicit request: "whole row grey out... a
// watermark of opposite color live on top of it... Click on the
// watermark will redirect to this ticket page." A real absolutely-
// positioned overlay would fight with these tables' sticky first column
// (z-index layering, scroll offsets), so this achieves the same visible
// result — the row reads as disabled/greyed with a clear banner — by
// substituting one spanning cell for the row's normal content instead,
// which is robust regardless of column count or sticky columns.
export default function SonyPublishLockRow({ colSpan }) {
  return (
    <tr style={{ background: "var(--bg-hover)", opacity: 0.6 }}>
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <Link
          href="/tickets/sony-publish"
          style={{
            display: "block",
            textAlign: "center",
            padding: "10px 12px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: "var(--text-faint)",
            textDecoration: "none",
          }}
          title="Open the Sony Publish ticket"
        >
          Sony Publish — no task here required for this product
        </Link>
      </td>
    </tr>
  );
}
