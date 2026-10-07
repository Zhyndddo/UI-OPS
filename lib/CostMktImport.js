"use client";

// Round 445 — Cost Marketing workstation import, the other half of the
// Import/Export pair (see app/workstation/cost-mkt/page.js's Round 445
// comment on ExportButton for the "export IS the template" reasoning —
// this popup has no template generator of its own on purpose; Export
// produces exactly the file this expects back). Scoped to ONE tab/brand
// at a time, same as the page itself: every row written here gets the
// SAME funded_by/channel_kind/brand the page had selected when Import was
// opened, regardless of what the file's own DID column says — only DID
// picks WHICH release a row updates, never which tab/brand it lands in.
// That keeps a file exported from "Booking Package — TikTok Channel —
// EXT TIKTOK - BK MUSIC" from accidentally writing into a different
// brand's row if someone re-uploads it from the wrong tab — scopeLabel is
// shown up front specifically so that mismatch is obvious before import.
//
// Column matching follows lib/BulkReleaseImport.js's precedent: match by
// header text (trimmed, case-insensitive), reorder-proof — an unmatched
// header is ignored, not fatal. DID is the join key back to an existing
// release (via the `releases` prop, not a fresh query — same rows the
// page already loaded); a DID that doesn't match any release is a
// per-row error, not a silent skip, since a typo'd DID would otherwise
// just vanish with no explanation.
//
// Unlike BulkReleaseImport (one `insert` per row, sequential), every
// valid row here becomes one entry in a SINGLE batched upsert — matches
// "add data and import back in quickly": a few hundred cost-entry rows is
// well within one upsert call, and there's no live-data-flavored reason
// (no per-row duplicate check, this table's whole point is upsert-by-key)
// to go one at a time.

import { useState } from "react";
import { supabase } from "./supabaseClient";

function normalizeCell(v) {
  return String(v ?? "").trim();
}

// Pure parse — no network. rowsOfCells is SheetJS's { header: 1 } shape.
// `columns` is the page's current importExportColumns (did/title first,
// then whatever fields this tab shows). Returns { validRows, errors }
// where validRows is [{ rowNum, did, data: { [key]: value } }] — data
// only ever holds the editable columns (did/title are stripped out here,
// title was reference-only to begin with).
export function parseCostMktRows(rowsOfCells, columns) {
  if (!rowsOfCells || rowsOfCells.length < 2) return { validRows: [], errors: [{ rowNum: 0, reason: "No data rows found below the header." }] };
  const header = rowsOfCells[0].map((h) => normalizeCell(h).toLowerCase());
  const colIndex = {};
  columns.forEach((c) => {
    const idx = header.indexOf(c.label.toLowerCase());
    if (idx !== -1) colIndex[c.key] = idx;
  });
  if (colIndex.did === undefined) {
    return { validRows: [], errors: [{ rowNum: 0, reason: `No "DID" column found — this file doesn't look like it came from this page's own Export.` }] };
  }

  const editableColumns = columns.filter((c) => c.key !== "did" && c.key !== "title" && !c.readOnly);
  const validRows = [];
  const errors = [];
  rowsOfCells.slice(1).forEach((row, i) => {
    const rowNum = i + 2;
    if (!row.some((c) => normalizeCell(c) !== "")) return; // blank row — silently skip
    const did = normalizeCell(row[colIndex.did]);
    if (!did) { errors.push({ rowNum, reason: "DID is empty — can't tell which release this row belongs to." }); return; }

    const data = {};
    const rowErrors = [];
    editableColumns.forEach((c) => {
      const idx = colIndex[c.key];
      const raw = idx === undefined ? "" : normalizeCell(row[idx]);
      if (raw === "") { data[c.key] = null; return; }
      if (c.kind === "number") {
        const n = Number(raw);
        if (Number.isNaN(n)) { rowErrors.push(`${c.label} "${raw}" isn't a number`); return; }
        data[c.key] = n;
      } else {
        data[c.key] = raw;
      }
    });
    if (rowErrors.length > 0) errors.push({ rowNum, reason: `${did}: ${rowErrors.join("; ")}` });
    else validRows.push({ rowNum, did, data });
  });
  return { validRows, errors };
}

export default function CostMktImportPopup({ styles, profile, columns, releases, fundedBy, channelKind, brand, costEntries, scopeLabel, onClose, onImported, onAdsPerformUrlsImported }) {
  const [fileName, setFileName] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { updated, errors: [{rowNum, reason}] }

  const releaseByDid = {};
  releases.forEach((r) => { releaseByDid[r.did] = r; });

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
      setParsed(parseCostMktRows(rowsOfCells, columns));
    } catch (err) {
      setParsed({ validRows: [], errors: [{ rowNum: 0, reason: err?.message || "Couldn't read that file — is it a valid .xlsx or .csv?" }] });
    }
    setBusy(false);
  }

  async function runImport() {
    if (!parsed?.validRows?.length) return;
    setBusy(true);
    const unmatched = [];
    const payloads = [];
    // Round 447 — "report_link"/"URL Ads Perform" no longer belongs to
    // workstation_cost_mkt_entries at all; it's releases.ads_perform_url,
    // the ONE url shared across Booking Board's Ads popups, the release
    // detail page's URL tab, and now every cost-mkt tab too. Collected
    // separately here and written with its own upsert below instead of
    // going into the per-(release,funded_by,channel_kind,brand) payload —
    // keyed by release_id since the same release can appear only once per
    // import file, so no need to worry about one release's url colliding
    // with itself.
    const adsPerformUrlByReleaseId = {};
    for (const { rowNum, did, data } of parsed.validRows) {
      const release = releaseByDid[did];
      if (!release) { unmatched.push({ rowNum, reason: `DID "${did}" doesn't match any release.` }); continue; }
      // Round 475 — on TikTok Channel, Report Link is the row's own field
      // (stays in entryData); only Ads still maps to releases.ads_perform_url.
      const { report_link, ...entryRest } = data;
      const entryData = channelKind === "tiktok" ? { ...entryRest, ...(report_link !== undefined ? { report_link } : {}) } : entryRest;
      if (channelKind !== "tiktok" && report_link !== undefined) adsPerformUrlByReleaseId[release.id] = report_link;
      const key = `${release.id}:${fundedBy}:${channelKind}:${brand}`;
      const existing = costEntries[key];
      payloads.push({
        release_id: release.id,
        funded_by: fundedBy,
        channel_kind: channelKind,
        brand,
        // Preserve anything this import's column set doesn't cover
        // (e.g. Sup Cashback when the current tab hides it, or an
        // existing manual Is_thismonth override) — same "never clobber a
        // field this round doesn't own" rule saveField follows.
        no_booking_post: existing?.no_booking_post ?? null,
        no_support_post: existing?.no_support_post ?? null,
        cost_du_kien: existing?.cost_du_kien ?? null,
        cost_thuc_chay: existing?.cost_thuc_chay ?? null,
        thang_chi_tra: existing?.thang_chi_tra ?? null,
        vieent_ho_tro: existing?.vieent_ho_tro ?? null,
        artist_tra: existing?.artist_tra ?? null,
        sup_cashback: existing?.sup_cashback ?? null,
        report_link: existing?.report_link ?? null,
        override_month: existing?.override_month ?? null,
        is_installment: existing?.is_installment ?? false,
        ...entryData,
        updated_at: new Date().toISOString(),
        updated_by: profile?.id || null,
      });
    }

    const adsPerformUrlPayloads = Object.entries(adsPerformUrlByReleaseId).map(([release_id, ads_perform_url]) => ({ id: release_id, ads_perform_url }));

    if (payloads.length === 0 && adsPerformUrlPayloads.length === 0) {
      setBusy(false);
      setResult({ updated: [], errors: unmatched });
      return;
    }

    const [entriesResult, releasesResult] = await Promise.all([
      payloads.length > 0
        ? supabase.from("workstation_cost_mkt_entries").upsert(payloads, { onConflict: "release_id,funded_by,channel_kind,brand" }).select()
        : Promise.resolve({ data: [], error: null }),
      adsPerformUrlPayloads.length > 0
        ? supabase.from("releases").upsert(adsPerformUrlPayloads, { onConflict: "id" }).select("id, ads_perform_url")
        : Promise.resolve({ data: [], error: null }),
    ]);

    setBusy(false);
    if (entriesResult.error || releasesResult.error) {
      const msg = entriesResult.error?.message || releasesResult.error?.message;
      setResult({ updated: [], errors: [...unmatched, { rowNum: 0, reason: `Import failed: ${msg}` }] });
      return;
    }
    const updated = entriesResult.data || [];
    const updatedReleases = releasesResult.data || [];
    setResult({ updated, errors: unmatched });
    if (updated.length > 0) onImported?.(updated);
    if (updatedReleases.length > 0) onAdsPerformUrlsImported?.(updatedReleases);
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
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>Import Cost Marketing Data</div>
          <button type="button" onClick={onClose} disabled={busy} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: busy ? "default" : "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 0 }}>
          Scoped to <strong style={{ color: "var(--text)" }}>{scopeLabel}</strong> — every row in the file updates a release's cost fields on THIS
          tab/brand only, matched by its DID column. Use "Export / Template" first to get a file with every release currently on this tab, pre-filled
          with whatever's already saved — edit it in Excel, then upload it back here.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
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
                {busy ? "Importing…" : `Import ${parsed.validRows.length} Row(s)`}
              </button>
            )}
          </div>
        )}

        {result && (
          <div style={{ fontSize: 12 }}>
            <p style={{ color: "#81c784" }}>✓ Updated {result.updated.length} row(s).</p>
            {result.errors.length > 0 && (
              <>
                <p style={{ color: "#e57373" }}>{result.errors.length} row(s) skipped:</p>
                <div style={{ maxHeight: 140, overflowY: "auto", fontSize: 11, color: "var(--text-faint)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>Row {e.rowNum}: {e.reason}</div>
                  ))}
                </div>
              </>
            )}
            <button type="button" className={styles.btnSecondary} onClick={onClose} style={{ marginTop: 12 }}>Close</button>
          </div>
        )}
      </div>
    </>
  );
}
