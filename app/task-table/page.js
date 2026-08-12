"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { TICKET_TYPE_LABELS, TICKET_ROUTES, WORKSTATION_TYPE_LABELS, WORKSTATION_ROUTES } from "../../lib/teamTypes";
import styles from "../shared.module.css";

// Round 82 item 1 — read-only compiled overview: one row per workstation
// and one row per ticket type, with a row count that links straight to
// that task's own page. "batch_phai_sinh" excluded — retired/merged into
// phai_sinh (see lib/teamTypes.js's comment), its route just redirects
// there rather than being a real task of its own.
const TICKET_KEYS = Object.keys(TICKET_ROUTES).filter((k) => k !== "batch_phai_sinh");
const WORKSTATION_KEYS = Object.keys(WORKSTATION_ROUTES);

async function countTicket(key) {
  const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", key).single();
  if (!tab) return null;
  const { count } = await supabase.from("tickets").select("id", { count: "exact", head: true }).eq("tab_id", tab.id).is("deleted_at", null);
  return count ?? 0;
}

// No shared "count" concept across workstations — each is its own bespoke
// list backed by a different table/filter (matches each workstation
// page's own load() query exactly). package_price is a real placeholder
// page with no data behind it yet (app/workstation/package-price/page.js)
// — counts 0 rather than throwing on a table that doesn't exist.
async function countWorkstation(key) {
  switch (key) {
    case "booking":
    case "confirm":
    case "pre_release":
    case "stream": {
      const { count } = await supabase.from("releases").select("id", { count: "exact", head: true });
      return count ?? 0;
    }
    case "upload": {
      const { count } = await supabase.from("releases").select("id", { count: "exact", head: true }).eq("requested", true);
      return count ?? 0;
    }
    case "pitching": {
      const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "pitching").single();
      if (!tab) return 0;
      const { count } = await supabase.from("tickets").select("id", { count: "exact", head: true }).eq("tab_id", tab.id).is("deleted_at", null);
      return count ?? 0;
    }
    case "milestone": {
      const { count } = await supabase.from("milestone_chart_entries").select("id", { count: "exact", head: true });
      return count ?? 0;
    }
    case "package_price":
      return 0;
    default:
      return null;
  }
}

export default function TaskTablePage() {
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const [ticketResults, wsResults] = await Promise.all([
        Promise.all(TICKET_KEYS.map(async (k) => [`ticket:${k}`, await countTicket(k)])),
        Promise.all(WORKSTATION_KEYS.map(async (k) => [`workstation:${k}`, await countWorkstation(k)])),
      ]);
      setCounts(Object.fromEntries([...ticketResults, ...wsResults]));
      setLoading(false);
    })();
  }, []);

  const rows = [
    ...WORKSTATION_KEYS.map((k) => ({ id: `workstation:${k}`, name: `${WORKSTATION_TYPE_LABELS[k] || k} — Workstation`, href: WORKSTATION_ROUTES[k] })),
    ...TICKET_KEYS.map((k) => ({ id: `ticket:${k}`, name: `${TICKET_TYPE_LABELS[k] || k} — Ticket`, href: TICKET_ROUTES[k] })),
  ];

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Overview</div>
          <h1 className={styles.title}>Task Table</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 24 }}>
            Every workstation and ticket type, one row each — click the row count to open that task's own page.
          </p>

          <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
          <table className={styles.table} style={{ maxWidth: 640 }}>
            <thead>
              <tr>
                <th>Task Name</th>
                <th>Rows</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>
                    <Link href={r.href} className={styles.rowLink}>
                      {loading ? "…" : counts[r.id] != null ? counts[r.id] : "—"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
