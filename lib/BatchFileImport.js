"use client";

import { useState } from "react";
import {
  detectBatchLayout,
  applyBatchLayout,
  BATCH_FIELD_KEYS,
  BATCH_FIELD_LABELS,
} from "./phaiSinhBatchParse";

// Round 41 — file-upload alternative to the paste textarea. Reads a
// spreadsheet straight in the browser via SheetJS (`xlsx` package) —
// nothing is uploaded anywhere, the file never leaves the browser before
// being turned into rows and inserted through the normal Supabase client,
// same as a paste.
//
// Round 547 — "import anything": the file no longer has to follow the
// template's column order. Columns are matched by header name (Vietnamese
// or English, any order, extra columns ignored), a sheet picker appears for
// multi-sheet workbooks, and a preview step lets the user re-point any
// column before importing. A file with no recognisable header still falls
// back to the fixed template order. Also reads .xls / .ods / .tsv / .txt.
//
// onParsed({ rows, skipped, fileName }) now fires when the user confirms
// the preview (not the moment the file is chosen) — the caller owns what
// happens next (create a batch, or insert into an existing one), same
// split of responsibility paste already uses.
//
// Round 438 — an empty result is allowed on the create form (the team can
// add songs later); a caller that cannot accept an empty import (adding to
// an existing batch) passes allowEmpty={false}.
const TEXT_EXT = /\.(csv|tsv|txt)$/i;
const MAX_COLS = 40;
const MAX_PREVIEW_ROWS = 3;

function colLetter(i) {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

async function readWorkbook(file) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  if (TEXT_EXT.test(file.name)) {
    // Decode as UTF-8 ourselves (Vietnamese diacritics) and keep every cell
    // as the exact text in the file, so "2/6/2025" stays day-first for the
    // parser instead of being re-read as a US date by SheetJS.
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const opts = { type: "string", raw: true };
    if (/\.tsv$/i.test(file.name) || (firstLine.includes("\t") && !firstLine.includes(","))) opts.FS = "\t";
    return { XLSX, workbook: XLSX.read(text, opts) };
  }
  return { XLSX, workbook: XLSX.read(buf, { type: "array" }) };
}

function sheetRows(XLSX, workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
}

export default function BatchFileImport({ styles, onParsed, allowEmpty = true }) {
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState(null);
  // Round 438 — a file that parses to zero rows is a non-red notice, not a
  // blocking error. A genuine read failure (bad file, no sheet) still goes
  // through the catch block and blocks via `error`.
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  // Round 547 — pending preview: { fileName, sheetNames, sheetName, rows, layout, imported }
  const [pending, setPending] = useState(null);
  const [wb, setWb] = useState(null); // { XLSX, workbook } kept between sheet switches
  const [doneCount, setDoneCount] = useState(null);

  function openSheet(XLSX, workbook, name, file) {
    const rows = sheetRows(XLSX, workbook, name);
    const layout = detectBatchLayout(rows);
    setPending({ fileName: file, sheetNames: workbook.SheetNames, sheetName: name, rows, layout });
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-choosing the same file name twice in a row
    if (!file) return;
    setError(null);
    setNotice(null);
    setDoneCount(null);
    setPending(null);
    setBusy(true);
    try {
      const loaded = await readWorkbook(file);
      const names = loaded.workbook.SheetNames || [];
      if (!names.length) throw new Error("No sheets found in that file.");
      // Prefer the first sheet that actually has something on it.
      const firstWithData = names.find((n) => sheetRows(loaded.XLSX, loaded.workbook, n).some((r) => r.some((c) => String(c ?? "").trim() !== ""))) || names[0];
      setWb(loaded);
      openSheet(loaded.XLSX, loaded.workbook, firstWithData, file.name);
      setBusy(false);
    } catch (err) {
      setBusy(false);
      setError(err?.message || "Couldn't read that file — is it a valid spreadsheet (.xlsx, .xls, .ods, .csv, .tsv)?");
    }
  }

  function changeSheet(name) {
    if (!wb || !pending) return;
    openSheet(wb.XLSX, wb.workbook, name, pending.fileName);
  }

  function setColumn(ci, key) {
    setPending((p) => {
      const mapping = p.layout.mapping.slice();
      while (mapping.length <= ci) mapping.push(null);
      if (key) for (let i = 0; i < mapping.length; i++) if (mapping[i] === key) mapping[i] = null; // one column per field
      mapping[ci] = key || null;
      return { ...p, layout: { ...p.layout, mapping } };
    });
  }

  function confirmImport() {
    if (!pending) return;
    const { rows, skipped } = applyBatchLayout(pending.rows, pending.layout);
    if (rows.length === 0 && !allowEmpty) {
      setError("No songs found with the current mapping — pick the column that holds the song title.");
      return;
    }
    setError(null);
    setNotice(
      rows.length === 0
        ? "No songs parsed from that file — the ticket will be created without any pre-filled songs. Add them later, or check the column mapping if this wasn't expected to be empty."
        : null
    );
    setFileName(pending.fileName);
    setDoneCount(rows.length);
    setPending(null);
    onParsed({ rows, skipped, fileName: pending.fileName });
  }

  // ── preview model ──
  let preview = null;
  if (pending) {
    const { rows, layout } = pending;
    const hasHeader = layout.mode === "header";
    const dataStart = hasHeader ? layout.headerIndex + 1 : 0;
    const nonBlank = rows.filter((r) => r && r.some((c) => String(c ?? "").trim() !== ""));
    const width = Math.min(
      MAX_COLS,
      Math.max(layout.mapping.length, ...nonBlank.slice(0, 50).map((r) => r.length), 1)
    );
    const samples = rows.slice(dataStart).filter((r) => r && r.some((c) => String(c ?? "").trim() !== "")).slice(0, MAX_PREVIEW_ROWS);
    const result = applyBatchLayout(rows, layout);
    const titleMapped = layout.mapping.includes("ten_bai");
    preview = { hasHeader, width, samples, result, titleMapped };
  }

  const th = { textAlign: "left", fontSize: 10, color: "var(--text-faint)", fontWeight: 700, padding: "4px 6px", whiteSpace: "nowrap", verticalAlign: "top" };
  const td = { fontSize: 11, padding: "3px 6px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" };

  return (
    <div>
      <label
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
          border: "1px solid var(--border-strong)", borderRadius: 6, padding: "8px 14px",
          fontSize: 12, fontWeight: 700, color: "var(--text)",
        }}
      >
        {busy ? "Reading…" : fileName ? `📄 ${fileName} — choose a different file` : "📄 Import a spreadsheet (.xlsx / .xls / .ods / .csv / .tsv)"}
        <input type="file" accept=".xlsx,.xls,.ods,.csv,.tsv,.txt" onChange={handleFile} style={{ display: "none" }} disabled={busy} />
      </label>
      <p style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4, marginBottom: 0 }}>
        Any column order works — columns are matched by their header name, and you can fix any of them before importing.
      </p>

      {pending && preview && (
        <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--bg-card)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: 12 }}>📄 {pending.fileName}</strong>
            {pending.sheetNames.length > 1 && (
              <label style={{ fontSize: 11, display: "inline-flex", gap: 6, alignItems: "center" }}>
                Sheet
                <select value={pending.sheetName} onChange={(e) => changeSheet(e.target.value)} style={{ fontSize: 11 }}>
                  {pending.sheetNames.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            )}
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              {preview.hasHeader
                ? `Header found on row ${pending.layout.headerIndex + 1} — columns matched by name.`
                : "No header recognised — using the template column order."}
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
              <thead>
                <tr>
                  {Array.from({ length: preview.width }, (_, ci) => (
                    <th key={ci} style={th}>
                      <div style={{ marginBottom: 3 }}>
                        {preview.hasHeader ? String(pending.layout.headers?.[ci] || colLetter(ci)) : `Column ${colLetter(ci)}`}
                      </div>
                      <select
                        value={pending.layout.mapping[ci] || ""}
                        onChange={(e) => setColumn(ci, e.target.value)}
                        style={{ fontSize: 11, maxWidth: 170 }}
                      >
                        <option value="">— ignore —</option>
                        {BATCH_FIELD_KEYS.map((k) => (
                          <option key={k} value={k}>{BATCH_FIELD_LABELS[k]}</option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.samples.map((r, ri) => (
                  <tr key={ri}>
                    {Array.from({ length: preview.width }, (_, ci) => (
                      <td key={ci} style={{ ...td, opacity: pending.layout.mapping[ci] ? 1 : 0.45 }} title={String(r[ci] ?? "")}>
                        {String(r[ci] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!preview.titleMapped && (
            <p style={{ fontSize: 11, color: "var(--error-fg)", margin: "8px 0 0" }}>
              No column is set to “{BATCH_FIELD_LABELS.ten_bai}” — pick it above, otherwise no songs can be read.
            </p>
          )}
          <p style={{ fontSize: 12, margin: "8px 0", color: preview.result.rows.length > 0 ? "var(--success-fg)" : "var(--text-faint)" }}>
            {preview.result.rows.length} song{preview.result.rows.length === 1 ? "" : "s"} will be imported
            {preview.result.skipped > 0 ? `, ${preview.result.skipped} row${preview.result.skipped === 1 ? "" : "s"} skipped (no song title)` : ""}.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className={styles?.btnPrimary}
              onClick={confirmImport}
              disabled={preview.result.rows.length === 0 && !allowEmpty}
            >
              {preview.result.rows.length === 0 ? "Continue without songs" : `Import ${preview.result.rows.length} song${preview.result.rows.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" className={styles?.btnSmall} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!pending && doneCount !== null && !error && (
        <p style={{ fontSize: 11, color: "var(--success-fg)", marginTop: 4, marginBottom: 0 }}>
          {doneCount} song{doneCount === 1 ? "" : "s"} imported from {fileName}.
        </p>
      )}
      {error && <p style={{ fontSize: 11, color: "var(--error-fg)", marginTop: 4, marginBottom: 0 }}>{error}</p>}
      {!error && notice && <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4, marginBottom: 0 }}>{notice}</p>}
    </div>
  );
}
