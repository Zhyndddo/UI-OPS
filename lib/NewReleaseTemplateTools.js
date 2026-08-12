"use client";

import { useState } from "react";
import { MV_TYPE_OPTIONS } from "./pickerOptions";
import { LINKSHARE_TIKTOK_OPTIONS, LINKSHARE_FACEBOOK_OPTIONS } from "./releaseNotes";
import { COPYRIGHT_ITEMS, COPYRIGHT_OWNER_OPTIONS, emptyCopyrightChecklist, normalizeCopyrightChecklist } from "./copyrightChecklist";

// Round 88 — item 2: a downloadable flat-sheet template (one row per
// release, one column per field) for fast bulk input, plus an import that
// reads a filled-in copy of it back into the create form. Per explicit
// scope: "the template only exclude all the additional request (legal,
// data, marketing)" — so this covers Core Info + Metadata Checklist + the
// new Copyright Checklist only. Everything inside <GateFields> (Data
// Request / Legal Request / Artist Profile / etc.) and the Marketing
// Checklist (GateGrid MARKETING_CHECKLIST_FIELDS) are deliberately left
// out — those stay manual, filled in on the form itself after import.
//
// Per explicit direction: this is a first pass with a flat, predictable
// header row — "I will base on that, build a formatted template and
// resend you for confirm and change to the import function". The import
// below matches columns BY HEADER TEXT (trimmed, case-insensitive), not by
// position, specifically so a reformatted/reordered version of this same
// header set still imports correctly without code changes — only a
// genuinely renamed or removed header would need this file touched again.
//
// Tri-state (meta_*) and single-choice fields (release_category,
// single_album_ep, canva_status, linkshare timings, and every Copyright
// Checklist choice) are validated against their real option list on
// import; anything else (free text/dates) is accepted as-is. Per explicit
// answer: "Import what's valid, flag the rest" — invalid cells are simply
// skipped (left at the form's default) and named back to the user in a
// summary, rather than rejecting the whole file.

const META_TOGGLE_OPTIONS = [
  { value: "false", label: "No" },
  { value: "true", label: "Yes" },
  { value: "update", label: "TBU" },
];

function metaToggleField(key, header) {
  return { key, header, kind: "choice", options: META_TOGGLE_OPTIONS };
}

// Copyright Checklist (flat 3-field template) is flattened into 5 columns
// per item — Owner / Owner Name / Valid From / Valid To / Contract — 15
// columns total across the 3 rights. Re-assembled into the nested jsonb
// shape on import. "Vĩnh viễn" in the Valid To column (case-insensitive)
// sets perpetual:true instead of trying to parse it as a date.
function copyrightFields() {
  const out = [];
  COPYRIGHT_ITEMS.forEach((item) => {
    out.push({ key: `copyright.${item.key}.owner`, header: `${item.label} — Owner`, kind: "choice", options: COPYRIGHT_OWNER_OPTIONS });
    out.push({ key: `copyright.${item.key}.ownerName`, header: `${item.label} — Hợp tác với ai`, kind: "text" });
    out.push({ key: `copyright.${item.key}.validFrom`, header: `${item.label} — Validity From`, kind: "date" });
    out.push({ key: `copyright.${item.key}.validTo`, header: `${item.label} — Validity To (hoặc "Vĩnh viễn")`, kind: "dateOrPerpetual" });
    out.push({ key: `copyright.${item.key}.contract`, header: `${item.label} — Contract`, kind: "text" });
  });
  return out;
}

const PERPETUAL_WORDS = ["vĩnh viễn", "vinh vien", "perpetual", "trọn đời", "tron doi"];

export const TEMPLATE_FIELDS = [
  { key: "label", header: "Hãng Đĩa", kind: "text" },
  { key: "title", header: "Tên bài hát", kind: "text" },
  { key: "main_artist", header: "Main Artist", kind: "text" },
  { key: "feature_artist", header: "Feature Artist", kind: "text" },
  { key: "genre", header: "Genre", kind: "text" },
  { key: "requester_segment", header: "Media Channel", kind: "text" },
  { key: "release_category", header: "Category", kind: "choice", options: [{ key: "New Release", label: "New Release" }, { key: "Remarketing", label: "Remarketing" }] },
  { key: "single_album_ep", header: "Single/Album/EP", kind: "choice", options: [{ key: "Single", label: "Single" }, { key: "EP", label: "EP" }, { key: "Album", label: "Album" }] },
  { key: "release_date", header: "Ngày phát hành (YYYY-MM-DD)", kind: "date" },
  { key: "release_time", header: "Giờ phát hành (HH:MM)", kind: "time" },
  { key: "theme", header: "Theme", kind: "text" },
  { key: "drive_link", header: "Drive Link", kind: "text" },
  { key: "brief", header: "Brief", kind: "text" },
  { key: "linkshare_tiktok_timing", header: "Thời gian phát hành Tiktok", kind: "choice", options: LINKSHARE_TIKTOK_OPTIONS.map((v) => ({ key: v, label: v })) },
  { key: "linkshare_facebook_timing", header: "Thời gian phát hành Facebook", kind: "choice", options: LINKSHARE_FACEBOOK_OPTIONS.map((v) => ({ key: v, label: v })) },
  metaToggleField("meta_audio", "Metadata Checklist — Audio"),
  metaToggleField("meta_artwork", "Metadata Checklist — Artwork"),
  metaToggleField("meta_working_files", "Metadata Checklist — Working Files"),
  metaToggleField("meta_lyric", "Metadata Checklist — Lyric"),
  metaToggleField("meta_mv", "Metadata Checklist — MV"),
  { key: "canva_status", header: "Metadata Checklist — MV Type", kind: "choice", options: MV_TYPE_OPTIONS.filter(Boolean).map((v) => ({ key: v, label: v })) },
  metaToggleField("meta_doc", "Metadata Checklist — Metadata Doc"),
  ...copyrightFields(),
];

function normalizeCell(v) {
  return String(v ?? "").trim();
}

function matchChoice(raw, options) {
  const norm = normalizeCell(raw).toLowerCase();
  if (!norm) return { ok: true, value: undefined }; // blank cell — leave field untouched
  const hit = options.find((o) => o.label.toLowerCase() === norm || String(o.key).toLowerCase() === norm);
  if (!hit) return { ok: false };
  return { ok: true, value: hit.key };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;

// Builds the flat header-row + one example row, and triggers the browser
// download via SheetJS (same `xlsx` package lib/BatchFileImport.js already
// uses for the Phái Sinh batch template — dynamic import so it's not in
// the main bundle for pages that never touch it).
export async function downloadNewReleaseTemplate() {
  const XLSX = await import("xlsx");
  const header = TEMPLATE_FIELDS.map((f) => f.header);
  const exampleRow = TEMPLATE_FIELDS.map((f) => {
    if (f.kind === "choice") return f.options[0]?.label || "";
    if (f.kind === "date") return "2026-01-01";
    if (f.kind === "dateOrPerpetual") return "Vĩnh viễn";
    if (f.kind === "time") return "19:00";
    return "";
  });
  const sheet = XLSX.utils.aoa_to_sheet([header, exampleRow]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "New Release");
  XLSX.writeFile(workbook, "new-release-template.xlsx");
}

// Parses [headerRow, ...dataRows] (SheetJS's header:1 shape) using the
// FIRST data row only — this template is one release per download/import,
// not a bulk multi-row sheet. Returns { patch, skipped, error }.
// `patch` merges straight into the create form's state; skipped lists
// every field that had a value SheetJS couldn't match to a real option,
// by header name, so the person can go fix it by hand.
export function parseNewReleaseTemplateRows(rows) {
  if (!rows || rows.length === 0) return { error: "Empty file." };
  const header = rows[0].map((h) => normalizeCell(h).toLowerCase());
  const dataRow = rows.slice(1).find((r) => r.some((c) => normalizeCell(c) !== "")); // first non-blank data row
  if (!dataRow) return { error: "No data row found below the header." };

  const patch = {};
  const copyrightPatch = emptyCopyrightChecklist();
  const skipped = [];

  TEMPLATE_FIELDS.forEach((f) => {
    const colIdx = header.indexOf(f.header.toLowerCase());
    if (colIdx === -1) return; // header not present in this file — leave untouched, not an error
    const raw = dataRow[colIdx];
    const rawStr = normalizeCell(raw);
    if (!rawStr) return; // blank cell — leave untouched

    let result;
    let perpetualFlag = null;
    if (f.kind === "choice") {
      result = matchChoice(raw, f.options);
    } else if (f.kind === "date") {
      result = DATE_RE.test(rawStr) ? { ok: true, value: rawStr } : { ok: false };
    } else if (f.kind === "dateOrPerpetual") {
      if (PERPETUAL_WORDS.includes(rawStr.toLowerCase())) {
        result = { ok: true, value: "" };
        perpetualFlag = true;
      } else if (DATE_RE.test(rawStr)) {
        result = { ok: true, value: rawStr };
        perpetualFlag = false;
      } else {
        result = { ok: false };
      }
    } else if (f.kind === "time") {
      result = TIME_RE.test(rawStr) ? { ok: true, value: rawStr.length === 4 ? `0${rawStr}` : rawStr } : { ok: false };
    } else {
      result = { ok: true, value: rawStr };
    }

    if (!result.ok) {
      skipped.push({ header: f.header, raw: rawStr });
      return;
    }
    if (result.value === undefined) return;

    if (f.key.startsWith("copyright.")) {
      const [, itemKey, fieldKey] = f.key.split(".");
      copyrightPatch[itemKey][fieldKey] = result.value;
      if (perpetualFlag !== null) copyrightPatch[itemKey].perpetual = perpetualFlag;
    } else {
      patch[f.key] = result.value;
    }
  });

  patch.copyright_checklist = normalizeCopyrightChecklist(copyrightPatch);
  return { patch, skipped };
}

// The actual toolbar UI — download button + file input, rendered once
// near the top of the create form. `form` is only read for nothing right
// now (kept as a prop in case a future "download prefilled from current
// form" mode is wanted) — today's template is always the blank example
// row, matching "download a formatted template" as asked.
export default function NewReleaseTemplateTools({ styles, onImport }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { skipped, fileName } | { error }

  async function handleDownload() {
    setBusy(true);
    try {
      await downloadNewReleaseTemplate();
    } catch (err) {
      setResult({ error: err?.message || "Couldn't build the template file." });
    }
    setBusy(false);
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("No sheets found in that file.");
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
      const { patch, skipped, error } = parseNewReleaseTemplateRows(rows);
      if (error) { setResult({ error }); setBusy(false); return; }
      onImport(patch);
      setResult({ skipped, fileName: file.name });
    } catch (err) {
      setResult({ error: err?.message || "Couldn't read that file — is it a valid .xlsx or .csv?" });
    }
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>
        Fast Input — Excel Template
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className={styles.btnSecondary} onClick={handleDownload} disabled={busy}>
          ⬇ Download Template
        </button>
        <label
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, cursor: busy ? "default" : "pointer",
            border: "1px solid var(--border-strong)", borderRadius: 6, padding: "8px 14px",
            fontSize: 12, fontWeight: 700, color: "var(--text)", opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "Working…" : "📄 Import Filled Template"}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} disabled={busy} />
        </label>
        <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
          Covers Core Info, Metadata Checklist, and Copyright Checklist only — Data/Legal/Marketing Request stay manual below.
        </span>
      </div>
      {result?.error && <p style={{ fontSize: 11, color: "var(--error-fg)", margin: 0 }}>{result.error}</p>}
      {result && !result.error && (
        <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0 }}>
          Imported "{result.fileName}".
          {result.skipped.length === 0
            ? " Every recognized field matched."
            : ` ${result.skipped.length} field(s) couldn't be matched and were left blank: ${result.skipped.map((s) => s.header).join(", ")}.`}
        </p>
      )}
    </div>
  );
}
