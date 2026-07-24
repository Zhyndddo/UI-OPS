"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { TEAM_TICKET_TYPES, TICKET_TYPE_LABELS, TICKET_ROUTES, SHARED_TICKET_TYPES, typesForTeam } from "../../lib/teamTypes";
import styles from "../shared.module.css";

const NOTES = {
  newrelease_upload: "Auto-sent when SEND UPLOAD is clicked",
  phu_luc: "Auto-created when an artist locks in a contract type",
  media_booking: "Also where the package builder lives — click a row to open it",
};

export default function TicketsIndex() {
  const router = useRouter();
  const { profile } = useAuth();
  const [counts, setCounts] = useState({});
  const [checkedRedirect, setCheckedRedirect] = useState(false);

  const isDev = profile?.role === "dev";
  const types = profile ? [...new Set([...typesForTeam(TEAM_TICKET_TYPES, profile.segment, isDev), ...SHARED_TICKET_TYPES])] : [];

  // First visit since login shows the picker; after that, landing on
  // /tickets skips straight to whichever type was last looked at — only
  // "which type," not any deeper filter state, per the agreed scope.
  useEffect(() => {
    if (!profile) return;
    const last = window.localStorage.getItem("last_ticket_type");
    if (last && types.includes(last) && TICKET_ROUTES[last]) {
      router.replace(TICKET_ROUTES[last]);
    } else {
      setCheckedRedirect(true);
    }
  }, [profile]);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: tabs } = await supabase.from("ticket_tabs").select("id, key");
      const { data: tix } = await supabase.from("tickets").select("tab_id").is("deleted_at", null);
      const tabById = {};
      (tabs || []).forEach((t) => (tabById[t.id] = t.key));
      const c = {};
      (tix || []).forEach((t) => {
        const key = tabById[t.tab_id];
        if (key) c[key] = (c[key] || 0) + 1;
      });
      setCounts(c);
    })();
  }, []);

  if (!checkedRedirect) {
    return <AppShell><div className={styles.page}><div className={styles.container}>Loading…</div></div></AppShell>;
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>// Ticket System</div>
        <h1 className={styles.title}>Tickets</h1>
        <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 24 }}>
          Showing types relevant to {isDev ? "dev (all teams)" : profile?.segment || "your team"}.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {types.map((key) => (
            <Link
              key={key}
              href={TICKET_ROUTES[key]}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "16px 20px",
                textDecoration: "none",
                color: "var(--text)",
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{TICKET_TYPE_LABELS[key] || key}</div>
                {NOTES[key] && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{NOTES[key]}</div>}
              </div>
              <span style={{ fontSize: 36, fontWeight: 800, color: "var(--accent-soft)", lineHeight: 1, flexShrink: 0 }}>
                {counts[key] ?? 0}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
    </AppShell>
  );
}
