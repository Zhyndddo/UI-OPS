"use client";

import { useState } from "react";

// Round 417 — generic "universal export" building block, per explicit
// request ("have we done something of a universal import? ... do
// optimized for export"). Nothing in this codebase shares one export
// implementation before this — Booking Board/Booking Channels each
// hand-roll their own CSV writer, and everything else that reads a
// spreadsheet (lib/BatchFileImport.js, lib/googleSheetCsv.js,
// lib/NewReleaseTemplateTools.js) only goes ONE direction, file → app.
// This file is the app → file direction, meant to be reusable by any
// list page: hand it `columns` + a way to get `rows`, get a CSV/XLSX
// download.
//
// "Optimized" here means: the CSV writer builds one big array and joins
// it once (not repeated string concatenation, which is O(n²) on a large
// export), and XLSX is written via SheetJS's own array-of-arrays builder
// (aoa_to_sheet) — no per-cell DOM/React work either way. The `xlsx`
// package itself is dynamically imported (same convention as
// lib/BatchFileImport.js / lib/NewReleaseTemplateTools.js) so it never
// lands in a page's main bundle unless that page actually uses it.
//
// A column is `{ key, label, format? }` — `format(value, row)` lets a
// caller turn a raw DB value (an array, a code, a boolean-as-string) into
// the human string that belongs in a cell; keys with no `format` are
// read straight off the row and stringified.

function cellValue(row, col) {
  const raw = row?.[col.key];
  if (col.format) return col.format(raw, row) ?? "";
  if (raw === null || raw === undefined) return "";
  if (Array.isArray(raw)) return raw.join(", ");
  return String(raw);
}

function rowsToAoa(rows, columns) {
  const header = columns.map((c) => c.label);
  const body = rows.map((row) => columns.map((c) => cellValue(row, c)));
  return [header, ...body];
}

// RFC4180: wrap in quotes only when the cell needs it (contains a comma,
// quote, or newline), doubling any embedded quote. Matches the quoting
// convention lib/googleSheetCsv.js's parseCsv already reads back.
function csvEscape(cell) {
  const s = String(cell ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows, columns) {
  const aoa = rowsToAoa(rows, columns);
  return aoa.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(rows, columns, filename) {
  const csv = rowsToCsv(rows, columns);
  // BOM so Excel opens UTF-8 (Vietnamese diacritics) correctly instead of
  // guessing the wrong codepage — same reason lib/BatchFileImport.js's
  // sibling tools all go through SheetJS rather than a raw CSV blob for
  // anything with non-ASCII content, but a plain download has no SheetJS
  // step to do that for us.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  triggerBrowserDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export async function downloadXlsx(rows, columns, filename, sheetName = "Export") {
  const XLSX = await import("xlsx");
  const aoa = rowsToAoa(rows, columns);
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

// Reusable "Export ▾" button — CSV / Excel. `fetchRows` is an async
// function returning the rows to export, called lazily on click (not
// prefetched on mount), so a caller can point it at a live, filtered
// query — see app/releases/page.js's exportMatchingReleases for the
// "export whatever's currently filtered/searched, not just this page's
// 25 on-screen rows" case this was built for.
export default function ExportButton({ columns, filename, fetchRows, label = "Export", disabled }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(kind) {
    setOpen(false);
    setError(null);
    setBusy(true);
    try {
      const rows = await fetchRows();
      if (!rows || rows.length === 0) {
        setError("Nothing matches the current filters to export.");
        setBusy(false);
        return;
      }
      if (kind === "csv") downloadCsv(rows, columns, filename);
      else await downloadXlsx(rows, columns, filename);
    } catch (err) {
      setError(err?.message || "Export failed.");
    }
    setBusy(false);
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || busy}
        style={{ background: "none", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "6px 12px", fontSize: 11, color: "var(--text-faint)", cursor: disabled || busy ? "default" : "pointer" }}
      >
        {busy ? "Exporting…" : `⬇ ${label} ▾`}
      </button>
      {open && !busy && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, zIndex: 20, marginTop: 4,
            background: "var(--bg-hover)", border: "1px solid #333", borderRadius: 6,
            minWidth: 140, overflow: "hidden",
          }}
        >
          <button type="button" onClick={() => run("csv")} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12, background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}>
            CSV
          </button>
          <button type="button" onClick={() => run("xlsx")} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12, background: "none", border: "none", cursor: "pointer", color: "var(--text)", borderTop: "1px solid var(--border)" }}>
            Excel (.xlsx)
          </button>
        </div>
      )}
      {error && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, whiteSpace: "nowrap", fontSize: 10, color: "var(--error-fg)", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 8px", zIndex: 20 }}>
          {error}
        </div>
      )}
    </div>
  );
}
