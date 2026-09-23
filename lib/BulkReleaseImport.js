"use client";

// Round 417 — bulk/"universal" import for Releases, per explicit request
// ("Im doing import old data soon enough too"). This is a DIFFERENT tool
// from lib/NewReleaseTemplateTools.js's existing "Fast Input — Excel
// Template": that one is scoped to ONE release per file, merged into the
// live create form for a person to review/finish by hand before
// submitting. This one is scoped to MANY releases per file (a real
// migration/backfill), inserted straight into the releases table with no
// form step in between — meant for a batch of old records, not a single
// in-progress one.
//
// Field coverage is deliberately the same "Core Info only" scope
// NewReleaseTemplateTools.js settled on (title/artist/label/date/
// category/etc. — see CORE_FIELDS below, header text matches that file's
// TEMPLATE_FIELDS 1:1 on purpose so the two tools read as one family, not
// two competing formats) — no Metadata/Copyright/Data/Legal/Marketing
// Request columns. A legacy row lands exactly where a brand-new release
// created through the normal form would start (every gate "false", every
// meta toggle "false", Copyright Checklist empty) — AR fills in whatever
// else that record needs afterward, the same way they would for a
// release created by hand today.
//
// Admin-gated (see app/releases/page.js's isAdminOrAbove check before
// rendering the trigger button) — this inserts directly into `releases`
// with no per-row confirmation UI, so it's scoped to the smaller group
// that would actually run a data migration.

import { useState } from "react";
import { supabase } from "./supabaseClient";
import { emptyCopyrightChecklist } from "./copyrightChecklist";
import { logAudit } from "./auditLog";

const RELEASE_CATEGORY_OPTIONS = ["New Release", "Remarketing"];
const SINGLE_ALBUM_EP_OPTIONS = ["Single", "EP", "Album"];
const CHANNEL_OPTIONS = ["VIEENT", "ENVI"];

// key/header pairs mirror lib/NewReleaseTemplateTools.js's TEMPLATE_FIELDS
// core-info subset exactly (same header text) — required: true marks the
// 4 fields the create form itself won't submit without (see
// app/new-release/page.js's handleSubmit).
export const CORE_FIELDS = [
  { key: "label", header: "Hãng Đĩa", required: true },
  { key: "title", header: "Tên bài hát", required: true },
  { key: "main_artist", header: "Main Artist", required: true },
  { key: "feature_artist", header: "Feature Artist" },
  { key: "genre", header: "Genre" },
  { key: "requester_segment", header: "Media Channel", choices: CHANNEL_OPTIONS },
  { key: "release_category", header: "Category", choices: RELEASE_CATEGORY_OPTIONS, default: "New Release" },
  { key: "single_album_ep", header: "Single/Album/EP", choices: SINGLE_ALBUM_EP_OPTIONS, default: "Single" },
  { key: "release_date", header: "Ngày phát hành (YYYY-MM-DD)", required: true, kind: "date" },
  { key: "release_time", header: "Giờ phát hành (HH:MM)", kind: "time", default: "19:00" },
  { key: "upc", header: "UPC" },
  { key: "theme", header: "Theme" },
  { key: "drive_link", header: "Drive Link" },
  { key: "brief", header: "Brief" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;

function normalizeCell(v) {
  return String(v ?? "").trim();
}

export async function downloadBulkReleaseTemplate() {
  const XLSX = await import("xlsx");
  const header = CORE_FIELDS.map((f) => f.header);
  const example = CORE_FIELDS.map((f) => {
    if (f.choices) return f.default || f.choices[0];
    if (f.kind === "date") return "2026-01-01";
    if (f.kind === "time") return "19:00";
    if (f.key === "title") return "Song Title";
    if (f.key === "main_artist") return "Artist Name";
    if (f.key === "label") return "Label Name";
    return "";
  });
  const sheet = XLSX.utils.aoa_to_sheet([header, example]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Releases");
  XLSX.writeFile(workbook, "bulk-release-import-template.xlsx");
}

// Pure parse — no network. rowsOfCells is SheetJS's { header: 1 } shape
// (array of arrays, first row is headers). Matches columns by header text
// (trimmed, case-insensitive), same "reorder-proof" reasoning
// NewReleaseTemplateTools.js uses — an unmatched header is simply ignored
// (not fatal), matching that file's "import what's valid" precedent.
// Returns { validRows: [{ rowNum, data }], errors: [{ rowNum, reason }] }.
export function parseBulkReleaseRows(rowsOfCells) {
  if (!rowsOfCells || rowsOfCells.length < 2) return { validRows: [], errors: [{ rowNum: 0, reason: "No data rows found below the header." }] };
  const header = rowsOfCells[0].map((h) => normalizeCell(h).toLowerCase());
  const colIndex = {};
  CORE_FIELDS.forEach((f) => {
    const idx = header.indexOf(f.header.toLowerCase());
    if (idx !== -1) colIndex[f.key] = idx;
  });

  const validRows = [];
  const errors = [];
  rowsOfCells.slice(1).forEach((row, i) => {
    const rowNum = i + 2; // 1-based, +1 for the header row itself
    if (!row.some((c) => normalizeCell(c) !== "")) return; // blank row — silently skip, not an error
    const data = {};
    const rowErrors = [];
    CORE_FIELDS.forEach((f) => {
      const idx = colIndex[f.key];
      const raw = idx === undefined ? "" : normalizeCell(row[idx]);
      if (!raw) {
        if (f.required) rowErrors.push(`${f.header} is required`);
        else if (f.default !== undefined) data[f.key] = f.default;
        return;
      }
      if (f.choices) {
        const hit = f.choices.find((c) => c.toLowerCase() === raw.toLowerCase());
        if (!hit) { rowErrors.push(`${f.header} "${raw}" isn't one of: ${f.choices.join(", ")}`); return; }
        data[f.key] = hit;
      } else if (f.kind === "date") {
        if (!DATE_RE.test(raw)) { rowErrors.push(`${f.header} "${raw}" isn't YYYY-MM-DD`); return; }
        data[f.key] = raw;
      } else if (f.kind === "time") {
        if (!TIME_RE.test(raw)) { rowErrors.push(`${f.header} "${raw}" isn't HH:MM`); return; }
        data[f.key] = raw.length === 4 ? `0${raw}` : raw;
      } else {
        data[f.key] = raw;
      }
    });
    if (rowErrors.length > 0) errors.push({ rowNum, reason: rowErrors.join("; ") });
    else validRows.push({ rowNum, data });
  });
  return { validRows, errors };
}

// Splits a free-text artist field on commas into the tag array this app
// keeps in sync with the string field everywhere else — see
// app/new-release/page.js's EMPTY_FORM comment on main_artist_tags/
// feature_artist_tags: "auto-derived, joined with ', '". A legacy row
// with one name in the cell becomes a one-element tag array; a
// comma-separated cell splits into several, same as typing multiple tags
// in ArtistTagInput would produce.
function toTags(value) {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Builds the actual `releases` insert payload for one parsed row —
// mirrors app/new-release/page.js's EMPTY_FORM baseline (every gate
// "false", meta toggles "false", empty Copyright Checklist) so an
// imported row is indistinguishable, structurally, from one created
// through the normal form and then left untouched. DID is left for the
// DB's own set_release_did() trigger, same as every other insert path —
// never set client-side.
function buildReleasePayload(data, profileId) {
  return {
    label: data.label,
    title: data.title,
    main_artist: data.main_artist,
    main_artist_tags: toTags(data.main_artist),
    feature_artist: data.feature_artist || null,
    feature_artist_tags: toTags(data.feature_artist),
    genre: data.genre || null,
    requester_segment: data.requester_segment || null,
    release_category: data.release_category || "New Release",
    single_album_ep: data.single_album_ep || "Single",
    release_date: data.release_date,
    release_time: data.release_time || "19:00",
    upc: data.upc || null,
    theme: data.theme || null,
    drive_link: data.drive_link || null,
    brief: data.brief || null,
    gate_artist_profile_verify: "false",
    gate_pitching: "false",
    gate_goi_ho_tro_truyen_thong: "update",
    gate_data_request: "false",
    gate_split_share: "false",
    gate_lyric_musixmatch: "false",
    gate_mv_spotify: "false",
    gate_discovery_mode_spotify: "false",
    gate_sony_publish: "false",
    gate_phu_luc_mg: "false",
    gate_phu_luc_truyen_thong: "false",
    gate_phu_luc_publishing: "false",
    gate_design: "false",
    gate_co_trong_net_youtube: "false",
    gate_pre_order: "false",
    gate_artist_profile: "false",
    gate_artist_photo: "false",
    gate_project_proposal: "false",
    gate_publishing: "false",
    meta_audio: "false",
    meta_artwork: "false",
    meta_working_files: "false",
    meta_lyric: "false",
    meta_mv: "false",
    meta_doc: "false",
    design_content_types: [],
    split_share_entries: [],
    copyright_checklist: emptyCopyrightChecklist(),
    project_rights_type: null,
    created_by_profile_id: profileId || null,
  };
}

// The popup itself — upload, preview (valid/error counts), then a single
// "Import N Releases" action that inserts sequentially (not
// Promise.all — a migration batch is not latency-sensitive, and
// sequential inserts keep the per-row duplicate check + result reporting
// simple and give the DB no burst to contend with). Each row gets its own
// lightweight duplicate check (exact title+artist match, same signal
// app/new-release/page.js's own "title-artist" dedup uses) — a hit is
// SKIPPED and reported, not overwritten, since this tool never updates an
// existing release, only creates new ones.
export default function BulkReleaseImportPopup({ styles, profile, onClose, onImported }) {
  const [fileName, setFileName] = useState(null);
  const [parsed, setParsed] = useState(null); // { validRows, errors }
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { created, duplicates, failed: [{rowNum, reason}] }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setParsed(null);
    setResult(null);
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("No sheets found in that file.");
      const rowsOfCells = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
      setParsed(parseBulkReleaseRows(rowsOfCells));
    } catch (err) {
      setParsed({ validRows: [], errors: [{ rowNum: 0, reason: err?.message || "Couldn't read that file — is it a valid .xlsx or .csv?" }] });
    }
    setBusy(false);
  }

  async function runImport() {
    if (!parsed?.validRows?.length) return;
    setBusy(true);
    const created = [];
    const failed = [];
    let duplicates = 0;
    for (const { rowNum, data } of parsed.validRows) {
      try {
        const { data: dupes } = await supabase
          .from("releases")
          .select("id")
          .ilike("title", data.title)
          .ilike("main_artist", data.main_artist)
          .limit(1);
        if (dupes && dupes.length > 0) { duplicates++; continue; }
        const payload = buildReleasePayload(data, profile?.id);
        const { data: inserted, error } = await supabase.from("releases").insert(payload).select("id, did, title").single();
        if (error) { failed.push({ rowNum, reason: error.message }); continue; }
        logAudit({ actor: profile?.id, action: "create", entity: "release", entityId: inserted.id });
        created.push(inserted);
      } catch (err) {
        failed.push({ rowNum, reason: err?.message || "Insert failed." });
      }
    }
    setBusy(false);
    setResult({ created, duplicates, failed });
    if (created.length > 0) onImported?.(created);
  }

  return (
    <>
      <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 399, background: "rgba(0,0,0,0.5)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 400,
          width: "min(600px, calc(100vw - 32px))", maxHeight: "85vh", overflowY: "auto",
          background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10,
          padding: 20, boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>Bulk Import Releases (Legacy Data)</div>
          <button type="button" onClick={onClose} disabled={busy} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: busy ? "default" : "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 0 }}>
          One row per release — Core Info only (same fields as the "Fast Input" single-release template, just many rows at once). Every other field
          (Metadata Checklist, Data/Legal/Marketing Request, Copyright Checklist) starts blank/false, exactly like a brand-new release — fill those in
          afterward on each release's own page.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <button type="button" className={styles.btnSecondary} onClick={downloadBulkReleaseTemplate} disabled={busy}>
            ⬇ Download Template
          </button>
          <label
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, cursor: busy ? "default" : "pointer",
              border: "1px solid var(--border-strong)", borderRadius: 6, padding: "8px 14px",
              fontSize: 12, fontWeight: 700, color: "var(--text)", opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? "Working…" : "📄 Choose File"}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} disabled={busy} />
          </label>
          {fileName && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{fileName}</span>}
        </div>

        {parsed && !result && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 12, margin: "0 0 8px" }}>
              {parsed.validRows.length} row(s) ready to import.
              {parsed.errors.length > 0 && <span style={{ color: "#ffca4d" }}> {parsed.errors.length} row(s) have problems and will be skipped.</span>}
            </p>
            {parsed.errors.length > 0 && (
              <div style={{ maxHeight: 140, overflowY: "auto", fontSize: 11, color: "var(--text-faint)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
                {parsed.errors.map((e, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>Row {e.rowNum}: {e.reason}</div>
                ))}
              </div>
            )}
            {parsed.validRows.length > 0 && (
              <button type="button" className={styles.btnPrimary} onClick={runImport} disabled={busy} style={{ marginTop: 10 }}>
                {busy ? "Importing…" : `Import ${parsed.validRows.length} Release(s)`}
              </button>
            )}
          </div>
        )}

        {result && (
          <div style={{ fontSize: 12 }}>
            <p style={{ color: "#81c784" }}>✓ Created {result.created.length} release(s).</p>
            {result.duplicates > 0 && <p style={{ color: "var(--text-faint)" }}>{result.duplicates} row(s) skipped — a release with the same title + main artist already exists.</p>}
            {result.failed.length > 0 && (
              <>
                <p style={{ color: "#e57373" }}>{result.failed.length} row(s) failed:</p>
                <div style={{ maxHeight: 140, overflowY: "auto", fontSize: 11, color: "var(--text-faint)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
                  {result.failed.map((f, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>Row {f.rowNum}: {f.reason}</div>
                  ))}
                </div>
              </>
            )}
            <button type="button" className={styles.btnSecondary} onClick={onClose} style={{ marginTop: 10 }}>Close</button>
          </div>
        )}
      </div>
    </>
  );
}
