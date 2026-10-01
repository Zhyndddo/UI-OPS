"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthContext";
import { isAdminOrAbove } from "../../../lib/permissions";
import styles from "../../shared.module.css";

// Round 451 — live sweep + inline fix for the Round 442-followup data
// cleanup (claude/round442-followup-12-releases-converged-package-lines.md).
// Those 12 releases had their package lines backfilled by Round 442's
// migration from an already-shared pre-442 row, so two "independent"
// packages on the same release still show identical Số Lượng/Đơn Giá on one
// or more lines until someone manually re-enters the correct distinct
// number per tier.
//
// Round 451 follow-up (same day, per explicit request — "can we do
// something for them but manual check") — added inline edit+save for each
// package's own Số Lượng/Đơn Giá directly on this page, so there's no
// detour to the Package Builder for this specific cleanup. This is
// deliberately NOT an auto-fix: there is no recoverable "true" original
// value in history for these 12 releases (confirmed in the investigation
// doc above — the convergence predates every retained backup), so nothing
// here guesses a number. Each package's field starts pre-filled with its
// own CURRENT (converged) value and only changes when a human types a new
// one and clicks Save on that package's row — the other package's row is
// untouched until someone separately edits and saves it too. Saving
// recomputes `amount` the same way updateLine() does in
// app/tickets/media-booking/page.js, then re-runs the sweep so the line
// drops off the list the moment it's no longer converged.
//
// Same "hide the sidebar link IS the gate" convention as every other
// admin/dev tool in this app (see Sidebar.js's Report/System Log/Package
// Runner comments) — there's no real RLS, see sql/reference/prod_schema_clean.sql.
export default function ConvergedPackagesPage() {
  const { profile } = useAuth();
  const canView = isAdminOrAbove(profile);
  const [loading, setLoading] = useState(true);
  const [releases, setReleases] = useState([]);

  const load = useCallback(async () => {
    if (!supabase || !canView) return;
    const [{ data: packages }, { data: categories }, { data: rels }] = await Promise.all([
      supabase
        .from("media_booking_packages")
        .select(
          "id, release_id, name, sort_order, media_booking_package_lines(id, category_id, brand, quantity, unit_price, detail, is_package_priced, package_count)"
        )
        .order("sort_order"),
      supabase.from("package_categories").select("id, name"),
      supabase.from("releases").select("id, did, title").order("did"),
    ]);

    const categoryNameById = Object.fromEntries((categories || []).map((c) => [c.id, c.name]));
    const releaseById = Object.fromEntries((rels || []).map((r) => [r.id, r]));

    // Group packages by release, keep only releases with 2+ packages —
    // same scope as the original backup-forensics sweep.
    const packagesByRelease = {};
    (packages || []).forEach((p) => {
      (packagesByRelease[p.release_id] ||= []).push(p);
    });

    const results = [];
    for (const [releaseId, pkgs] of Object.entries(packagesByRelease)) {
      if (pkgs.length < 2) continue;
      const release = releaseById[releaseId];
      if (!release) continue;

      const matchedLines = [];
      const seenKeys = new Set();
      for (let i = 0; i < pkgs.length; i++) {
        for (let j = i + 1; j < pkgs.length; j++) {
          const linesA = new Map(
            (pkgs[i].media_booking_package_lines || [])
              .filter((l) => l.quantity != null)
              .map((l) => [`${l.category_id}::${l.brand || ""}`, l])
          );
          const linesB = new Map(
            (pkgs[j].media_booking_package_lines || [])
              .filter((l) => l.quantity != null)
              .map((l) => [`${l.category_id}::${l.brand || ""}`, l])
          );
          for (const [key, lineA] of linesA) {
            const lineB = linesB.get(key);
            if (!lineB) continue;
            if (lineA.quantity === lineB.quantity && (lineA.unit_price ?? null) === (lineB.unit_price ?? null)) {
              const dedupeKey = `${pkgs[i].id}::${pkgs[j].id}::${key}`;
              if (seenKeys.has(dedupeKey)) continue;
              seenKeys.add(dedupeKey);
              matchedLines.push({
                key: dedupeKey,
                category: categoryNameById[lineA.category_id] || lineA.category_id,
                brand: lineA.brand || "—",
                detailsDiffer: (lineA.detail || "") !== (lineB.detail || ""),
                sides: [
                  { packageName: pkgs[i].name, line: lineA },
                  { packageName: pkgs[j].name, line: lineB },
                ],
              });
            }
          }
        }
      }

      if (matchedLines.length > 0) {
        results.push({ release, packageCount: pkgs.length, matchedLines });
      }
    }

    results.sort((a, b) => (a.release.did || "").localeCompare(b.release.did || ""));
    setReleases(results);
    setLoading(false);
  }, [canView]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canView) {
    return (
      <AppShell>
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.emptyState}>Admins only.</div>
          </div>
        </div>
      </AppShell>
    );
  }

  const totalLines = releases.reduce((sum, r) => sum + r.matchedLines.length, 0);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1080 }}>
          <div className={styles.eyebrow}>// Data Cleanup</div>
          <h1 className={styles.title}>Converged Package Lines</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -12, marginBottom: 20 }}>
            Releases where two or more Media Booking packages still share an identical Số
            Lượng/Đơn Giá on the same Hạng Mục/brand line — left over from Round 442&apos;s
            migration backfill (see <code>claude/round442-followup-12-releases-converged-package-lines.md</code>).
            There&apos;s no recoverable original value for these — type in the correct number per
            package below and save it directly (same effect as the Package Builder&apos;s &quot;Already
            in X — edit directly&quot; box). This list re-checks the live data after every save, so a
            line drops off the moment the two packages actually differ.
          </p>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : releases.length === 0 ? (
            <div className={styles.emptyState}>
              Nothing converged right now — every release with 2+ packages has distinct lines. 🎉
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 16 }}>
                {releases.length} release{releases.length === 1 ? "" : "s"}, {totalLines} still-converged line
                {totalLines === 1 ? "" : "s"}.
              </div>

              {releases.map(({ release, packageCount, matchedLines }) => (
                <div
                  key={release.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "16px 18px",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    <div>
                      <Link href={`/releases/${release.id}`} style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "none", fontSize: 14 }}>
                        {release.did}
                      </Link>
                      <span style={{ marginLeft: 10, fontSize: 13, color: "var(--text)" }}>{release.title}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{packageCount} packages</span>
                  </div>

                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Package</th>
                        <th>Hạng Mục</th>
                        <th>Brand</th>
                        <th>Số Lượng</th>
                        <th>Đơn Giá</th>
                        <th></th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchedLines.map((m) => (
                        <ConvergedLineRows key={m.key} match={m} onSaved={load} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// Same amount formula as computeLineAmount() in
// app/tickets/media-booking/page.js — kept in sync deliberately rather than
// imported, since that file doesn't export it.
function computeLineAmount(line) {
  if (line.unit_price == null) return null;
  const qty = line.is_package_priced ? line.package_count : line.quantity;
  if (qty == null) return null;
  return line.unit_price * qty;
}

// Two editable rows (one per package) for a single converged Hạng
// Mục/brand pair. Each row is independent: editing and saving package A's
// row does not touch package B's row at all. Starts pre-filled with each
// package's own current (still-converged) value — nothing is guessed.
function ConvergedLineRows({ match, onSaved }) {
  return (
    <>
      {match.sides.map((side, idx) => (
        <ConvergedLineRow
          key={side.line.id}
          packageName={side.packageName}
          line={side.line}
          category={match.category}
          brand={match.brand}
          note={
            idx === 0 && match.detailsDiffer
              ? "Chi Tiết already edited but Số Lượng wasn't — check this one first"
              : ""
          }
          isFirstOfPair={idx === 0}
          onSaved={onSaved}
        />
      ))}
    </>
  );
}

function ConvergedLineRow({ packageName, line, category, brand, note, isFirstOfPair, onSaved }) {
  const [quantity, setQuantity] = useState(line.quantity ?? "");
  const [unitPrice, setUnitPrice] = useState(line.unit_price ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = String(quantity) !== String(line.quantity ?? "") || String(unitPrice) !== String(line.unit_price ?? "");

  async function handleSave() {
    if (!supabase) return;
    setSaving(true);
    setSaved(false);
    const patch = {
      quantity: quantity === "" ? null : Number(quantity),
      unit_price: unitPrice === "" ? null : Number(unitPrice),
    };
    const amount = computeLineAmount({ ...line, ...patch });
    await supabase
      .from("media_booking_package_lines")
      .update({ ...patch, amount })
      .eq("id", line.id);
    setSaving(false);
    setSaved(true);
    await onSaved();
  }

  return (
    <tr style={{ borderTop: isFirstOfPair ? "2px solid var(--border)" : "none" }}>
      <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{packageName}</td>
      <td style={{ fontSize: 12 }}>{isFirstOfPair ? category : ""}</td>
      <td style={{ fontSize: 12 }}>{isFirstOfPair ? brand : ""}</td>
      <td>
        <input
          type="number"
          value={quantity}
          onChange={(e) => { setQuantity(e.target.value); setSaved(false); }}
          style={{
            width: 80, fontSize: 12, padding: "4px 6px", borderRadius: 5,
            border: "1px solid var(--border-strong)", background: "var(--bg-card)", color: "var(--text)",
          }}
        />
      </td>
      <td>
        <input
          type="number"
          value={unitPrice}
          onChange={(e) => { setUnitPrice(e.target.value); setSaved(false); }}
          style={{
            width: 100, fontSize: 12, padding: "4px 6px", borderRadius: 5,
            border: "1px solid var(--border-strong)", background: "var(--bg-card)", color: "var(--text)",
          }}
        />
      </td>
      <td>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          style={{
            fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 5,
            border: "none", cursor: dirty && !saving ? "pointer" : "default",
            background: dirty ? "var(--accent)" : "var(--border)",
            color: dirty ? "var(--accent-on)" : "var(--text-faint)",
          }}
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </td>
      <td style={{ fontSize: 11, color: "var(--accent)" }}>{note}</td>
    </tr>
  );
}
