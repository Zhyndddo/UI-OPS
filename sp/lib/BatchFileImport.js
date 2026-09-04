"use client";

import { useState } from "react";
import { parseBatchRows, BATCH_ITEM_COLUMNS } from "./phaiSinhBatchParse";

// Round 41 — file-upload alternative to the paste textarea, per explicit
// request ("also make the import so they can import the data via
// template file"). Reads a .xlsx or .csv straight in the browser via
// SheetJS (`xlsx` package) — nothing is uploaded anywhere, the file never
// leaves the browser before being turned into rows and inserted through
// the normal Supabase client, same as a paste. Column order must match
// BATCH_ITEM_COLUMNS exactly — use the delivered
// batch-phai-sinh-template.xlsx, or any sheet built the same way; a
// header row is auto-detected and skipped either way.
//
// onParsed({ rows, skipped, fileName }) fires once a file is chosen and
// successfully parsed — the caller owns what happens next (create a
// batch, or insert into an existing one), same split of responsibility
// paste already uses.
export default function BatchFileImport({ styles, onParsed }) {
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-choosing the same file name twice in a row
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("No sheets found in that file.");
      const sheet = workbook.Sheets[sheetName];
      const rowsOfCells = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
      const { rows, skipped } = parseBatchRows(rowsOfCells);
      if (rows.length === 0) {
        setError("Nothing parsed from that file — check the column order matches the template.");
        setBusy(false);
        return;
      }
      setFileName(file.name);
      setBusy(false);
      onParsed({ rows, skipped, fileName: file.name });
    } catch (err) {
      setBusy(false);
      setError(err?.message || "Couldn't read that file — is it a valid .xlsx or .csv?");
    }
  }

  return (
    <div>
      <label
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
          border: "1px solid var(--border-strong)", borderRadius: 6, padding: "8px 14px",
          fontSize: 12, fontWeight: 700, color: "var(--text)",
        }}
      >
        {busy ? "Reading…" : fileName ? `📄 ${fileName} — choose a different file` : "📄 Import from .xlsx / .csv"}
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} disabled={busy} />
      </label>
      <p style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4, marginBottom: 0 }}>
        Column order must match: {BATCH_ITEM_COLUMNS.join(" · ")}
      </p>
      {error && <p style={{ fontSize: 11, color: "var(--error-fg)", marginTop: 4, marginBottom: 0 }}>{error}</p>}
    </div>
  );
}
