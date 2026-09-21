"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { isAdminOrAbove } from "../../lib/permissions";
import styles from "../shared.module.css";

// Round 408 — item 2 from the original Round 404 request, finally built:
// a searchable, read-only reference list of VCPMC's catalog (title /
// music author / lyrics author / singer). Sidebar label and route are
// deliberately NOT "VCPMC" itself, per the original explicit request
// ("tạo sidebar item, catalog vcpmc (nhưng tên khác)" — a sidebar item
// for it, but under a different name) — see lib/Sidebar.js's nav entry.
//
// ~178k rows (see scripts/import-vcpmc-catalog.js) is far too many to
// load client-side like every other "quick index" search on this app
// does (SearchBox/matchesQuery) — this searches the DB directly instead,
// on title/composer/lyricist, debounced, capped at 100 merged results.
// Genuinely read-only for the DATA itself (no inline edit — VCPMC's own
// catalog isn't this app's to rewrite) — the only writes are additive:
// "+ Add Entry" for something missing, and a per-row "Report" for
// something that looks wrong, which flags the row rather than touching it.
const SEARCH_DEBOUNCE_MS = 300;
const RESULT_LIMIT = 50;

async function searchCatalog(term) {
  const pattern = `%${term.trim()}%`;
  const [{ data: byTitle }, { data: byComposer }, { data: byLyricist }] = await Promise.all([
    supabase.from("vcpmc_catalog").select("*").ilike("title", pattern).order("title").limit(RESULT_LIMIT),
    supabase.from("vcpmc_catalog").select("*").ilike("composer", pattern).order("title").limit(RESULT_LIMIT),
    supabase.from("vcpmc_catalog").select("*").ilike("lyricist", pattern).order("title").limit(RESULT_LIMIT),
  ]);
  const merged = new Map();
  [...(byTitle || []), ...(byComposer || []), ...(byLyricist || [])].forEach((r) => merged.set(r.id, r));
  return [...merged.values()].sort((a, b) => a.title.localeCompare(b.title)).slice(0, 100);
}

export default function RoyaltyCatalogPage() {
  const { profile } = useAuth();
  const canReview = isAdminOrAbove(profile);
  const [tab, setTab] = useState("browse"); // "browse" | "reports"
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const debounceRef = useRef(null);
  const [showAdd, setShowAdd] = useState(false);
  const [reportingId, setReportingId] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("vcpmc_catalog").select("id", { count: "exact", head: true }).then(({ count }) => setTotalCount(count ?? null));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!supabase || !query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const rows = await searchCatalog(query);
      setResults(rows);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function afterAdd(row) {
    setResults((prev) => [row, ...prev]);
    setTotalCount((c) => (c === null ? c : c + 1));
  }

  function afterReport(catalogId) {
    setResults((prev) => prev.map((r) => (r.id === catalogId ? { ...r, status: "flagged" } : r)));
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 860 }}>
          <div className={styles.eyebrow}>// Reference</div>
          <h1 className={styles.title}>Royalty Catalog</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -12, marginBottom: 20 }}>
            VCPMC's registered works — title, music author, lyrics author. Read-only reference; search by any of the
            three. {totalCount !== null ? `${totalCount.toLocaleString()} entries.` : ""}
          </p>

          {canReview && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
              {[["browse", "Browse"], ["reports", "Reports"]].map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} className={`${styles.tabBtn} ${tab === key ? styles.tabBtnActive : ""}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {tab === "browse" ? (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  className={styles.input}
                  style={{ flex: 1, minWidth: 240 }}
                  placeholder="Search title, composer, or lyricist…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.btnPrimary}
                  style={{ whiteSpace: "nowrap" }}
                  onClick={() => setShowAdd(true)}
                >
                  + Add Entry
                </button>
              </div>

              {showAdd && <AddEntryForm profile={profile} onDone={afterAdd} onClose={() => setShowAdd(false)} />}

              {!query.trim() ? (
                <div className={styles.emptyState}>Type to search the catalog.</div>
              ) : searching ? (
                <div className={styles.emptyState}>Searching…</div>
              ) : results.length === 0 ? (
                <div className={styles.emptyState}>No matches — try "+ Add Entry" if this is missing.</div>
              ) : (
                <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Composer</th>
                        <th>Lyricist</th>
                        <th>Singer</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 700 }}>
                            {r.title}
                            {r.status === "flagged" && (
                              <span style={{ marginLeft: 6, fontSize: 10, color: "var(--error-fg, #e05a4e)" }} title="Someone flagged this row as wrong">
                                🚩 Flagged
                              </span>
                            )}
                            {r.source === "manual" && (
                              <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-faint)" }} title="Added from this app, not the original VCPMC export">
                                (added)
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: 12 }}>{r.composer || "—"}</td>
                          <td style={{ fontSize: 12 }}>{r.lyricist || "—"}</td>
                          <td style={{ fontSize: 12 }}>{r.singer || "—"}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <button
                              onClick={() => setReportingId(r.id)}
                              style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", color: "var(--text-faint)", cursor: "pointer", fontSize: 11 }}
                            >
                              Report
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {reportingId && (
                <ReportRowForm
                  profile={profile}
                  catalogId={reportingId}
                  onDone={() => { afterReport(reportingId); setReportingId(null); }}
                  onClose={() => setReportingId(null)}
                />
              )}
            </>
          ) : (
            <ReportsQueue />
          )}
        </div>
      </div>
    </AppShell>
  );
}

// "+ Add Entry" — a small inline form, not a modal-over-modal since the
// popup pattern (see ReportRowForm below) is reserved for the per-row
// Report action, which needs to anchor to a specific already-visible row.
// Anyone signed in can add — same "no real access control, hiding the
// button IS the gate" convention as the rest of this app; there's nothing
// destructive here, just an additive suggestion tagged source: "manual"
// so it's visually distinct from the official import.
function AddEntryForm({ profile, onDone, onClose }) {
  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState("");
  const [lyricist, setLyricist] = useState("");
  const [singer, setSinger] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("vcpmc_catalog")
      .insert({
        title: title.trim(),
        composer: composer.trim() || null,
        lyricist: lyricist.trim() || null,
        singer: singer.trim() || null,
        source: "manual",
        added_by: profile?.id || null,
      })
      .select()
      .single();
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDone(data);
    onClose();
  }

  return (
    <form
      onSubmit={submit}
      style={{ border: "1px solid var(--border-strong)", borderRadius: 8, padding: 14, marginBottom: 16, background: "var(--bg-card)", display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>Add a catalog entry</div>
      <div className={styles.grid2}>
        <input className={styles.input} placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <input className={styles.input} placeholder="Singer" value={singer} onChange={(e) => setSinger(e.target.value)} />
        <input className={styles.input} placeholder="Composer" value={composer} onChange={(e) => setComposer(e.target.value)} />
        <input className={styles.input} placeholder="Lyricist" value={lyricist} onChange={(e) => setLyricist(e.target.value)} />
      </div>
      {error && <div style={{ color: "var(--error-fg)", fontSize: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className={styles.btnPrimary} type="submit" disabled={saving || !title.trim()}>
          {saving ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={onClose} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 16px", color: "var(--text-faint)", cursor: "pointer", fontSize: 12 }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Report a row as wrong — a small popup, not inline in the table row
// itself (rows are dense; a note field wouldn't fit). Writes the report
// AND flips the row's own status to "flagged" so it's visibly marked
// everywhere it shows up from then on, not just in the dev/admin queue.
function ReportRowForm({ profile, catalogId, onDone, onClose }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    const { error: reportErr } = await supabase.from("vcpmc_catalog_reports").insert({
      catalog_id: catalogId,
      reported_by: profile?.id || null,
      note: note.trim(),
    });
    if (reportErr) {
      setSaving(false);
      setError(reportErr.message);
      return;
    }
    const { error: flagErr } = await supabase.from("vcpmc_catalog").update({ status: "flagged" }).eq("id", catalogId);
    setSaving(false);
    if (flagErr) {
      setError(flagErr.message);
      return;
    }
    onDone();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form
        onSubmit={submit}
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, maxWidth: 380, width: "90%", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>What's wrong with this row?</div>
        <textarea
          autoFocus
          className={styles.input}
          style={{ minHeight: 70, resize: "vertical", width: "100%", boxSizing: "border-box" }}
          placeholder="e.g. wrong composer, duplicate, title has a typo…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <div style={{ color: "var(--error-fg)", fontSize: 12, marginTop: 6 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className={styles.btnPrimary} type="submit" disabled={saving || !note.trim()}>
            {saving ? "Sending…" : "Report"}
          </button>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 16px", color: "var(--text-faint)", cursor: "pointer", fontSize: 12 }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// Admin/dev-only queue of open reports — resolving one clears its own
// status AND, if it was the last open report against that catalog row,
// un-flags the row too (checked with a fresh count rather than assumed,
// since more than one person can report the same row).
function ReportsQueue() {
  const { profile } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("vcpmc_catalog_reports")
      .select("*, catalog:vcpmc_catalog(id, title, composer, lyricist), reporter:profiles!vcpmc_catalog_reports_reported_by_fkey(name)")
      .eq("status", "open")
      .order("created_at", { ascending: false });
    setReports(data || []);
    setLoading(false);
  }

  async function resolve(report) {
    await supabase.from("vcpmc_catalog_reports").update({ status: "resolved", resolved_by: profile?.id || null, resolved_at: new Date().toISOString() }).eq("id", report.id);
    const { count } = await supabase.from("vcpmc_catalog_reports").select("id", { count: "exact", head: true }).eq("catalog_id", report.catalog_id).eq("status", "open");
    if (!count) await supabase.from("vcpmc_catalog").update({ status: "active" }).eq("id", report.catalog_id);
    setReports((prev) => prev.filter((r) => r.id !== report.id));
  }

  if (loading) return <div className={styles.emptyState}>Loading…</div>;
  if (reports.length === 0) return <div className={styles.emptyState}>No open reports.</div>;

  return (
    <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
      <table className={styles.table}>
        <thead><tr><th>Row</th><th>Note</th><th>Reported by</th><th>When</th><th></th></tr></thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id}>
              <td style={{ fontSize: 12 }}>{r.catalog?.title || "(deleted)"}<div style={{ color: "var(--text-faint)" }}>{r.catalog?.composer || "—"} / {r.catalog?.lyricist || "—"}</div></td>
              <td style={{ fontSize: 12, maxWidth: 280, whiteSpace: "pre-wrap" }}>{r.note}</td>
              <td style={{ fontSize: 12 }}>{r.reporter?.name || "—"}</td>
              <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString()}</td>
              <td>
                <button
                  onClick={() => resolve(r)}
                  style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", color: "var(--text-faint)", cursor: "pointer", fontSize: 11 }}
                >
                  Resolve
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
