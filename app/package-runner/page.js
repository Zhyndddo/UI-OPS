"use client";

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { canRunPackageSimulator, isDev } from "../../lib/permissions";
import { runOne } from "../../lib/packageSimulator";
import styles from "../shared.module.css";

// Round 58 — Package Runner. Fast-tracks a release straight to a locked
// package, replicating exactly what app/pick-package/[token]/page.js's
// confirmChoice() does when an artist picks a package on the real
// artist-facing magic link — same 3 writes (project_type, package_locked,
// package_total_value), same "auto-create the Phụ Lục ticket if this was
// still in the BRIEF & DATA/DEALING pipeline stage" side effect — just
// triggered directly by Marketing/dev instead of waiting on the artist to
// click through a link. Built for the specific case that came up: a
// release gets evaluated and is going to be Chỉ Phát Hành regardless, so
// there's no reason to wait on the magic-link round trip.
//
// Chỉ Phát Hành (and the other non-built-package contract types) are
// "simple" picks — no release_package_items get seeded, matching
// confirmChoice's own behavior (a real itemized package only exists when
// Marketing has already built one via the Package Builder popup for that
// specific release — this tool never invents one).
//
// Scope: dev only (see canRunPackageSimulator in lib/permissions.js — round
// 77 narrowed this from "admin on Marketing, or dev" to dev-only per
// explicit request).

function emptyRow() {
  return { did: "", legacyDid: "", contractType: "Chỉ Phát Hành" };
}

// Round 77 — runOne moved to lib/packageSimulator.js so the release detail
// page's new "SEND INT SUPPORT PACKAGE" / "ONLY PH" buttons (see
// app/releases/[id]/page.js's Package Actions section) can call the exact
// same commit logic instead of a second, possibly-drifting copy. Both the
// single-row form and the CSV batch loop below still call the exact same
// function either way.

export default function PackageRunnerPage() {
  const { profile } = useAuth();
  const canRun = canRunPackageSimulator(profile);
  const canDev = isDev(profile);

  const [contractTypes, setContractTypes] = useState(["Chỉ Phát Hành"]);
  const [row, setRow] = useState(emptyRow());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [overwriteConfirm, setOverwriteConfirm] = useState(false);

  const [mode, setMode] = useState("single"); // "single" | "batch" — batch is dev-only
  const [csvText, setCsvText] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResults, setBatchResults] = useState(null);

  useEffect(() => {
    if (!supabase || !canDev) return;
    supabase
      .from("lookup_options")
      .select("value, label")
      .eq("category", "contract_type")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data && data.length) setContractTypes(data.map((r) => r.value));
      });
  }, [canDev]);

  if (!canRun) {
    return (
      <AppShell>
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.eyebrow}>// Package Runner</div>
            <h1 className={styles.title}>Package Runner</h1>
            <div className={styles.emptyState}>Not available for your role.</div>
          </div>
        </div>
      </AppShell>
    );
  }

  async function handleRun() {
    if (running) return;
    setRunning(true);
    setResult(null);
    const r = await runOne(
      { did: row.did, legacyDid: canDev ? row.legacyDid : "", contractType: canDev ? row.contractType : "Chỉ Phát Hành" },
      { allowOverwrite: canDev && overwriteConfirm }
    );
    setResult(r);
    setRunning(false);
    setOverwriteConfirm(false);
    if (r.ok) setRow(emptyRow());
  }

  // CSV columns: did, legacy_did, contract_type — legacy_did and
  // contract_type are both optional per row (contract_type defaults to
  // Chỉ Phát Hành, the common case). Dev-only — see canDev gating on the
  // Batch tab itself.
  async function handleBatchRun() {
    if (batchRunning || !csvText.trim()) return;
    setBatchRunning(true);
    setBatchResults(null);
    const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
    const header = lines[0].toLowerCase().includes("did") ? lines[0].split(",").map((h) => h.trim().toLowerCase()) : null;
    const dataLines = header ? lines.slice(1) : lines;
    const didIdx = header ? header.indexOf("did") : 0;
    const legacyIdx = header ? header.indexOf("legacy_did") : 1;
    const typeIdx = header ? header.indexOf("contract_type") : 2;

    const results = [];
    for (const line of dataLines) {
      const cells = line.split(",").map((c) => c.trim());
      const did = cells[didIdx] || "";
      const legacyDid = legacyIdx >= 0 ? cells[legacyIdx] || "" : "";
      const contractType = (typeIdx >= 0 ? cells[typeIdx] : "") || "Chỉ Phát Hành";
      // eslint-disable-next-line no-await-in-loop
      const r = await runOne({ did, legacyDid, contractType }, { allowOverwrite: false });
      results.push(r);
    }
    setBatchResults(results);
    setBatchRunning(false);
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Package Runner</div>
          <h1 className={styles.title}>Package Runner</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20, maxWidth: 720 }}>
            Fast-tracks a release straight to a locked package, without waiting on the artist-facing magic link —
            for releases Marketing has already evaluated (most often: going to be Chỉ Phát Hành regardless).
            Runs the exact same commit the artist's own "Confirm" button does, so nothing downstream breaks: the
            release is locked, and a Phụ Lục ticket is created automatically if this release was still sitting in
            the BRIEF &amp; DATA/DEALING pipeline stage.
          </p>

          {canDev && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
              {[["single", "Single Release"], ["batch", "Batch (CSV)"]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={`${styles.tabBtn} ${mode === key ? styles.tabBtnActive : ""}`}
                  style={{ border: "1px solid var(--border)", borderRadius: 6 }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {mode === "single" ? (
            <div style={{ maxWidth: 420 }}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  DID <span className={styles.required}>*</span>
                </label>
                <input
                  className={styles.input}
                  value={row.did}
                  onChange={(e) => setRow((r) => ({ ...r, did: e.target.value }))}
                  placeholder="e.g. NTNTP-0142"
                />
              </div>

              {canDev && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Legacy DID (dev only, optional)</label>
                  <input
                    className={styles.input}
                    value={row.legacyDid}
                    onChange={(e) => setRow((r) => ({ ...r, legacyDid: e.target.value }))}
                    placeholder="Only used if the release has no legacy_id yet"
                  />
                </div>
              )}

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Package</label>
                {canDev ? (
                  <select
                    className={styles.select}
                    value={row.contractType}
                    onChange={(e) => setRow((r) => ({ ...r, contractType: e.target.value }))}
                  >
                    {contractTypes.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className={styles.input} value="Chỉ Phát Hành" disabled />
                )}
              </div>

              {result && !result.ok && result.release?.package_locked && canDev && (
                <label className={styles.checkboxRow} style={{ marginBottom: 16 }}>
                  <input type="checkbox" checked={overwriteConfirm} onChange={(e) => setOverwriteConfirm(e.target.checked)} />
                  Overwrite the existing locked package anyway
                </label>
              )}

              <button className={styles.btnPrimary} onClick={handleRun} disabled={running || !row.did.trim()}>
                {running ? "Running…" : "Run"}
              </button>

              {result && (
                <div className={result.ok ? styles.successBox : styles.errorBox} style={{ marginTop: 16 }}>
                  {result.ok ? (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        {result.release?.title} · {result.release?.main_artist}
                      </div>
                      Locked as <b>{result.release?.project_type}</b>.
                      {result.phuLucCreated && " Phụ Lục ticket created."}
                    </>
                  ) : (
                    <>
                      <b>{result.did}</b>: {result.reason}
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 10 }}>
                One row per release. Header optional. Columns: <code>did, legacy_did, contract_type</code> —{" "}
                <code>legacy_did</code> and <code>contract_type</code> are both optional per row (
                <code>contract_type</code> defaults to Chỉ Phát Hành when left blank). Rows whose release already
                has a locked package are skipped, not overwritten — re-run them one at a time in Single Release if
                you actually want to override.
              </p>
              <textarea
                className={styles.textarea}
                style={{ minHeight: 160, fontFamily: "monospace", fontSize: 12 }}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={"did,legacy_did,contract_type\nNTNTP-0142,,Chỉ Phát Hành\nABCXYZ-0091,LEGACY-991,Không Độc Quyền"}
              />
              <button className={styles.btnPrimary} style={{ marginTop: 12 }} onClick={handleBatchRun} disabled={batchRunning || !csvText.trim()}>
                {batchRunning ? "Running…" : "Run Batch"}
              </button>

              {batchResults && (
                <table className={styles.table} style={{ marginTop: 16 }}>
                  <thead>
                    <tr>
                      <th>DID</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchResults.map((r, i) => (
                      <tr key={i}>
                        <td>{r.did || "—"}</td>
                        <td style={{ color: r.ok ? "var(--success-fg)" : "var(--warn-fg)" }}>
                          {r.ok ? `Locked as ${r.release?.project_type}${r.phuLucCreated ? " · Phụ Lục created" : ""}` : r.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {batchResults && (
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>
                  {batchResults.filter((r) => r.ok).length} succeeded, {batchResults.filter((r) => !r.ok).length} skipped/failed.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
