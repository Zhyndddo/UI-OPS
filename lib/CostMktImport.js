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
    // Round 478 — metric (post count) cells are read-only live numbers, but a
    // typed value in the file becomes a manual override; keep the raw text.
    const metrics = {};
    columns.forEach((c) => {
      if (c.idx == null) return;
      const mi = colIndex[c.key];
      const rawM = mi === undefined ? "" : normalizeCell(row[mi]);
      if (rawM !== "") metrics[c.idx] = rawM;
    });
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
    else validRows.push({ rowNum, did, data, metrics });
  });
  const hasMetricColumns = columns.some((c) => c.idx != null && colIndex[c.key] !== undefined);
  return { validRows, errors, hasMetricColumns };
}

export default function CostMktImportPopup({ styles, profile, columns, releases, fundedBy, channelKind, brand, costEntries, scopeLabel, onClose, onImported, onAdsPerformUrlsImported, baseCellText, metricLabels }) {
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
    setChanges([]);
    setResult(null);
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const lower = file.name.toLowerCase();
      const isText = /\.(csv|tsv|txt)$/.test(lower);
      let workbook;
      if (isText) {
        // Round 477 — read CSV/TSV as UTF-8 TEXT (strips the BOM Excel adds)
        // instead of raw bytes, so Vietnamese titles/headers survive intact.
        const text = (await file.text()).replace(/^\uFEFF/, "");
        workbook = XLSX.read(text, { type: "string", raw: true });
      } else {
        const buf = await file.arrayBuffer();
        const head = new Uint8Array(buf.slice(0, 4));
        const isZip = head[0] === 0x50 && head[1] === 0x4b;
        if (isZip) {
          // A real .xlsx always has [Content_Types].xml. Apple Numbers files
          // renamed to .xlsx are also zips but hold Index/*.iwa instead.
          const hasContentTypes = new TextDecoder("latin1").decode(new Uint8Array(buf)).includes("[Content_Types].xml");
          if (!hasContentTypes) {
            throw new Error("This looks like an Apple Numbers file that was only renamed to .xlsx. In Numbers choose File → Export To → Excel (or CSV), then upload that file.");
          }
        }
        workbook = XLSX.read(buf, { type: "array" });
      }
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("No sheets found in that file.");
      const rowsOfCells = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
      const p = parseCostMktRows(rowsOfCells, columns);
      const { out, extraErrors } = buildChanges(p);
      setChanges(out);
      setSelected(new Set(out.map((c) => c.id)));
      setParsed({ ...p, errors: [...p.errors, ...extraErrors] });
    } catch (err) {
      setParsed({ validRows: [], errors: [{ rowNum: 0, reason: err?.message || "Couldn't read that file — is it a valid .xlsx or .csv?" }] });
    }
    setBusy(false);
  }

  // Round 479 — review step: instead of blindly rewriting, compare the file
  // against what's saved NOW and list every cell that differs, so the user
  // can accept or skip each one (default: all accepted).
  const [changes, setChanges] = useState([]);
  const [selected, setSelected] = useState(new Set());

  function numEq(x, y) { return x == null || y == null ? x == null && y == null : Number(x) === Number(y); }
  function txtEq(x, y) { return String(x ?? "").trim() === String(y ?? "").trim(); }
  function showVal(v) { return v == null || v === "" ? "(empty)" : String(v); }
  function ovText(o) { return o.booked !== undefined ? `${o.added} / ${o.booked}` : String(o.added); }

  function buildChanges(p) {
    const out = [];
    const extraErrors = [];
    const colByKey = {};
    columns.forEach((c) => { colByKey[c.key] = c; });
    p.validRows.forEach(({ rowNum, did, data, metrics }) => {
      const release = releaseByDid[did];
      if (!release) { extraErrors.push({ rowNum, reason: `DID "${did}" doesn't match any release.` }); return; }
      const existing = costEntries[`${release.id}:${fundedBy}:${channelKind}:${brand}`];
      const base = { releaseId: release.id, did, title: release.title };
      Object.entries(data).forEach(([k, v]) => {
        const col = colByKey[k];
        const cur = k === "report_link" && channelKind !== "tiktok" ? (release.ads_perform_url ?? null) : (existing?.[k] ?? null);
        const same = col?.kind === "number" ? numEq(cur, v) : txtEq(cur, v);
        if (same) return;
        out.push({ ...base, id: `${release.id}|f|${k}`, kind: "field", key: k, label: col?.label || k, from: showVal(cur), to: showVal(v), value: v, isClear: v == null });
      });
      if (p.hasMetricColumns) {
        const prevOv = existing?.metric_overrides || {};
        (metricLabels || []).forEach((label, idx) => {
          const rawM = metrics?.[idx];
          let target = null;
          let toText = "(live value)";
          if (rawM !== undefined) {
            const m = rawM.replace(/,/g, ".").match(/^\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*$/);
            if (!m) { extraErrors.push({ rowNum, reason: `${did}: ${label} "${rawM}" isn't a number (use 5 or 5 / 8)` }); return; }
            const added = Number(m[1]);
            const booked = m[2] !== undefined ? Number(m[2]) : undefined;
            const normalized = booked !== undefined ? `${added} / ${booked}` : String(added);
            if (normalized !== (baseCellText ? baseCellText(release, idx) : "")) {
              target = booked !== undefined ? { added, booked } : { added };
              toText = normalized;
            }
          }
          const cur = prevOv[label] || null;
          if (JSON.stringify(cur) === JSON.stringify(target)) return;
          const baseTxt = baseCellText ? baseCellText(release, idx) : "";
          out.push({ ...base, id: `${release.id}|m|${idx}`, kind: "metric", key: label, label, from: cur ? `${ovText(cur)} (manual)` : `${baseTxt || "(empty)"} (live)`, to: toText, target, isClear: target == null });
        });
      }
    });
    return { out, extraErrors };
  }

  function toggle(id) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function runImport() {
    const picked = changes.filter((c) => selected.has(c.id));
    if (picked.length === 0) return;
    setBusy(true);
    const byRelease = {};
    picked.forEach((c) => { (byRelease[c.releaseId] = byRelease[c.releaseId] || []).push(c); });
    const anyMetric = picked.some((c) => c.kind === "metric");
    const payloads = [];
    const adsPerformUrlByReleaseId = {};
    Object.entries(byRelease).forEach(([releaseId, list]) => {
      const existing = costEntries[`${releaseId}:${fundedBy}:${channelKind}:${brand}`];
      const pl = {
        release_id: releaseId,
        funded_by: fundedBy,
        channel_kind: channelKind,
        brand,
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
        updated_at: new Date().toISOString(),
        updated_by: profile?.id || null,
      };
      const ov = { ...(existing?.metric_overrides || {}) };
      list.forEach((c) => {
        if (c.kind === "field") {
          if (c.key === "report_link" && channelKind !== "tiktok") adsPerformUrlByReleaseId[releaseId] = c.value;
          else pl[c.key] = c.value;
        } else if (c.target == null) delete ov[c.key];
        else ov[c.key] = c.target;
      });
      // Only send metric_overrides when the import touches it (and then on
      // every row, so a batch upsert never nulls it elsewhere) — keeps plain
      // cost imports working before the Round 478 SQL is applied.
      if (anyMetric) pl.metric_overrides = Object.keys(ov).length > 0 ? ov : null;
      // Rows with ONLY an Ads url change don't need a cost-entry write.
      const touchesEntry = list.some((c) => c.kind === "metric" || !(c.key === "report_link" && channelKind !== "tiktok"));
      if (touchesEntry) payloads.push(pl);
    });
    const adsPerformUrlPayloads = Object.entries(adsPerformUrlByReleaseId).map(([release_id, ads_perform_url]) => ({ id: release_id, ads_perform_url }));

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
      setResult({ updated: [], applied: 0, errors: [{ rowNum: 0, reason: `Import failed: ${msg}` }] });
      return;
    }
    const updated = entriesResult.data || [];
    const updatedReleases = releasesResult.data || [];
    setResult({ updated, applied: picked.length, errors: [] });
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
          Scoped to <strong style={{ color: "var(--text)" }}>{scopeLabel}</strong> — every row in the file is compared against what's saved on THIS
          tab/brand (matched by its DID column) and you review each difference — overwrite it or keep the current value — before anything is saved. Post-count cells that differ from the live number become manual values. Releases not in the file are left alone. Use "Export / Template" first to get a file with every release currently on this tab, pre-filled
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
            <input type="file" accept=".xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt" onChange={handleFile} style={{ display: "none" }} disabled={busy} />
          </label>
          {fileName && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{fileName}</span>}
        </div>

        {parsed && !result && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 12, margin: "0 0 8px" }}>
              {parsed.validRows.length} row(s) read from the file; <strong>{changes.length}</strong> value(s) in {new Set(changes.map((c) => c.releaseId)).size} release(s) differ from what's saved now.
              {parsed.errors.length > 0 && <span style={{ color: "#ffca4d" }}> {parsed.errors.length} row(s) have problems and will be skipped.</span>}
            </p>
            {parsed.errors.length > 0 && (
              <div style={{ maxHeight: 100, overflowY: "auto", fontSize: 11, color: "var(--text-faint)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: 8, marginBottom: 8 }}>
                {parsed.errors.map((e, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>Row {e.rowNum}: {e.reason}</div>
                ))}
              </div>
            )}
            {changes.length === 0 && parsed.validRows.length > 0 && (
              <p style={{ fontSize: 12, color: "#81c784" }}>Nothing to change — every value in the file already matches.</p>
            )}
            {changes.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6, fontSize: 11 }}>
                  <button type="button" className={styles.btnSecondary} style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => setSelected(new Set(changes.map((c) => c.id)))}>Overwrite all</button>
                  <button type="button" className={styles.btnSecondary} style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => setSelected(new Set())}>Keep all current</button>
                  <button type="button" className={styles.btnSecondary} style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => setSelected(new Set(changes.filter((c) => !c.isClear).map((c) => c.id)))}>Skip the ones that blank a value</button>
                  <span style={{ color: "var(--text-faint)" }}>{selected.size} of {changes.length} will overwrite</span>
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)" }}>
                  {changes.map((c, i) => (
                    <div key={c.id}>
                      {(i === 0 || changes[i - 1].releaseId !== c.releaseId) && (
                        <div style={{ padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "var(--text)", background: "var(--bg-hover)", borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
                          {c.title} <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>· {c.did}</span>
                        </div>
                      )}
                      <label style={{ display: "grid", gridTemplateColumns: "20px 120px 1fr 16px 1fr", gap: 6, alignItems: "center", padding: "5px 10px", fontSize: 11, cursor: "pointer", opacity: selected.has(c.id) ? 1 : 0.55 }}>
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                        <span style={{ color: "var(--text-faint)" }}>{c.label}</span>
                        <span style={{ wordBreak: "break-all" }} title="saved now">{c.from}</span>
                        <span style={{ color: "var(--text-faint)" }}>→</span>
                        <span style={{ wordBreak: "break-all", color: c.isClear ? "#e57373" : "var(--accent)", fontWeight: 700 }} title="from the file">{c.isClear ? (c.kind === "metric" ? c.to : "(blank)") : c.to}</span>
                      </label>
                    </div>
                  ))}
                </div>
                <button type="button" className={styles.btnPrimary} onClick={runImport} disabled={busy || selected.size === 0} style={{ marginTop: 10 }}>
                  {busy ? "Importing…" : `Overwrite ${selected.size} value(s)`}
                </button>
              </>
            )}
          </div>
        )}

        {result && (
          <div style={{ fontSize: 12 }}>
            <p style={{ color: "#81c784" }}>✓ Overwrote {result.applied ?? 0} value(s) across {result.updated.length} saved row(s).</p>
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
