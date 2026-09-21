"use client";

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import styles from "../shared.module.css";

// Round 404 item 3 — "Dev still see it in the log": every system_messages
// row ever created, regardless of expires_at (recipients stop seeing a
// row once it expires or they hide it — see lib/systemMessages.js and
// app/system-messages/page.js — dev sees the permanent record here
// instead, same "hide the sidebar link IS the gate" convention as every
// other dev-only page in this app; there's no real RLS, see
// sql/reference/prod_schema_clean.sql). Read-only, no compose/delete —
// this table only ever gets written by the app's own daily generators
// (lib/weeklyTasks.js's reminder, lib/releaseChangeNotify.js,
// lib/boSungDataDigest.js), never by a person.
export default function SystemLogPage() {
  const { profile } = useAuth();
  const isDev = profile?.role === "dev";
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState("");

  useEffect(() => {
    if (!supabase || !isDev) return;
    Promise.all([
      supabase.from("system_messages").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("profiles").select("id, name, email"),
    ]).then(([{ data: msgs }, { data: profs }]) => {
      setRows(msgs || []);
      setProfiles(profs || []);
      setLoading(false);
    });
  }, [isDev]);

  const profileById = Object.fromEntries(profiles.map((p) => [p.id, p]));
  function recipientNames(ids) {
    return (ids || []).map((id) => profileById[id]?.name || profileById[id]?.email || id.slice(0, 8)).join(", ") || "—";
  }

  const kinds = [...new Set(rows.map((r) => r.kind))].sort();
  const visibleRows = kindFilter ? rows.filter((r) => r.kind === kindFilter) : rows;

  if (!isDev) {
    return (
      <AppShell>
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.emptyState}>Dev only.</div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 960 }}>
          <div className={styles.eyebrow}>// Dev</div>
          <h1 className={styles.title}>System Log</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -12, marginBottom: 20 }}>
            Every auto-generated system message ever, most recent 500, regardless of whether recipients have hidden
            it or it's already expired for them.
          </p>

          {kinds.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
              <button
                onClick={() => setKindFilter("")}
                className={`${styles.tabBtn} ${kindFilter === "" ? styles.tabBtnActive : ""}`}
                style={{ border: kindFilter === "" ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: kindFilter === "" ? "rgba(255,107,26,0.1)" : "transparent", fontSize: 12 }}
              >
                All
              </button>
              {kinds.map((k) => (
                <button
                  key={k}
                  onClick={() => setKindFilter(k)}
                  className={`${styles.tabBtn} ${kindFilter === k ? styles.tabBtnActive : ""}`}
                  style={{ border: kindFilter === k ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: kindFilter === k ? "rgba(255,107,26,0.1)" : "transparent", fontSize: 12 }}
                >
                  {k}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : visibleRows.length === 0 ? (
            <div className={styles.emptyState}>Nothing logged yet.</div>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Created</th><th>Kind</th><th>Title / Body</th><th>Recipients</th><th>Expires</th></tr></thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: 11 }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{r.kind}</td>
                    <td style={{ fontSize: 12, maxWidth: 380 }}>
                      {r.title && <div style={{ fontWeight: 700, marginBottom: 2 }}>{r.title}</div>}
                      <div style={{ whiteSpace: "pre-wrap", color: "var(--text-faint)" }}>{r.body}</div>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 220 }}>{recipientNames(r.recipient_profile_ids)}</td>
                    <td style={{ fontSize: 11, whiteSpace: "nowrap", color: new Date(r.expires_at) < new Date() ? "var(--text-faint)" : "var(--text)" }}>
                      {new Date(r.expires_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
