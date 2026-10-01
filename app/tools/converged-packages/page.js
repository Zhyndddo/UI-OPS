"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthContext";
import { isAdminOrAbove } from "../../../lib/permissions";
import styles from "../../shared.module.css";

// Round 451 — read-only sweep for the Round 442-followup data cleanup
// (claude/round442-followup-12-releases-converged-package-lines.md). Those
// 12 releases had their package lines backfilled by Round 442's migration
// from an already-shared pre-442 row, so two "independent" packages on the
// same release still show identical Số Lượng/Đơn Giá on one or more lines
// until someone manually re-enters the correct distinct number per tier via
// the Package Builder's "Already in X — edit directly" box (same mechanism
// used for HKH484, see claude/hkh484-docquyen2nam-value-restore.md).
//
// This is NOT a one-time checklist — it re-runs the same comparison live
// against the real tables every time the page loads, so a release drops off
// the list the moment someone actually fixes it, and a category/brand line
// drops off a release's own list independently (no need to clear every line
// on a release at once). Purely read-only: no writes anywhere on this page.
// Same "hide the sidebar link IS the gate" convention as every other
// admin/dev tool in this app (see Sidebar.js's Report/System Log/Package
// Runner comments) — there's no real RLS, see sql/reference/prod_schema_clean.sql.
export default function ConvergedPackagesPage() {
  const { profile } = useAuth();
  const canView = isAdminOrAbove(profile);
  const [loading, setLoading] = useState(true);
  const [releases, setReleases] = useState([]);

  useEffect(() => {
    if (!supabase || !canView) return;
    let cancelled = false;

    async function load() {
      const [{ data: packages }, { data: categories }, { data: rels }] = await Promise.all([
        supabase
          .from("media_booking_packages")
          .select("id, release_id, name, sort_order, media_booking_package_lines(id, category_id, brand, quantity, unit_price, detail)")
          .order("sort_order"),
        supabase.from("package_categories").select("id, name"),
        supabase.from("releases").select("id, did, title").order("did"),
      ]);
      if (cancelled) return;

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
                  packageA: pkgs[i].name,
                  packageB: pkgs[j].name,
                  category: categoryNameById[lineA.category_id] || lineA.category_id,
                  brand: lineA.brand || "—",
                  quantity: lineA.quantity,
                  unitPrice: lineA.unit_price,
                  detailsDiffer: (lineA.detail || "") !== (lineB.detail || ""),
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
    }

    load();
    return () => { cancelled = true; };
  }, [canView]);

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
        <div className={styles.container} style={{ maxWidth: 1000 }}>
          <div className={styles.eyebrow}>// Data Cleanup</div>
          <h1 className={styles.title}>Converged Package Lines</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -12, marginBottom: 20 }}>
            Releases where two or more Media Booking packages still share an identical Số
            Lượng/Đơn Giá on the same Hạng Mục/brand line — left over from Round 442&apos;s
            migration backfill (see <code>claude/round442-followup-12-releases-converged-package-lines.md</code>).
            Each needs a human to re-enter the correct distinct number per package tier via the
            Package Builder&apos;s &quot;Already in X — edit directly&quot; box. This list re-checks the
            live data on every load, so a release/line drops off as soon as it&apos;s actually fixed.
            Read-only — nothing here writes anything.
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
                        <th>Packages</th>
                        <th>Hạng Mục</th>
                        <th>Brand</th>
                        <th>Số Lượng</th>
                        <th>Đơn Giá</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchedLines.map((l, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{l.packageA} ≡ {l.packageB}</td>
                          <td style={{ fontSize: 12 }}>{l.category}</td>
                          <td style={{ fontSize: 12 }}>{l.brand}</td>
                          <td style={{ fontSize: 12 }}>{l.quantity}</td>
                          <td style={{ fontSize: 12 }}>{l.unitPrice != null ? l.unitPrice.toLocaleString() : "—"}</td>
                          <td style={{ fontSize: 11, color: l.detailsDiffer ? "var(--accent)" : "var(--text-faint)" }}>
                            {l.detailsDiffer ? "Chi Tiết already edited but Số Lượng wasn't — check this one first" : ""}
                          </td>
                        </tr>
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
