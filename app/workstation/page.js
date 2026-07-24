"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { TEAM_WORKSTATION_TYPES, WORKSTATION_TYPE_LABELS, WORKSTATION_ROUTES, typesForTeam } from "../../lib/teamTypes";
import styles from "../shared.module.css";

const NOTES = {
  booking: "3-round × platform matrix, Direct/Partner gated on Phụ Lục",
  upload: "UPC, Link LBM, Link Share, Smartlink — every release SEND UPLOAD has touched",
  confirm: "Cross-platform correctness checks + Smartlink verification, two phases",
  pre_release: "CANVAS, Artist Pick, Musixmatch, NCT Lyric",
  pitching: "Queue of active Pitching tickets, edited in one place",
  package_price: "Not built yet",
};

export default function WorkstationIndex() {
  const router = useRouter();
  const { profile } = useAuth();
  const [checkedRedirect, setCheckedRedirect] = useState(false);
  const [counts, setCounts] = useState({});

  const isDev = profile?.role === "dev";
  const types = profile ? typesForTeam(TEAM_WORKSTATION_TYPES, profile.segment, isDev) : [];

  // Same rule as Tickets: first visit shows the picker, after that it
  // skips straight to whichever workstation was last looked at.
  useEffect(() => {
    if (!profile) return;
    const last = window.localStorage.getItem("last_workstation_type");
    if (last && types.includes(last) && WORKSTATION_ROUTES[last]) {
      router.replace(WORKSTATION_ROUTES[last]);
    } else {
      setCheckedRedirect(true);
    }
  }, [profile]);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { count: releaseCount } = await supabase.from("releases").select("id", { count: "exact", head: true });
      const { count: uploadCount } = await supabase.from("releases").select("id", { count: "exact", head: true }).eq("requested", true);
      const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "pitching").single();
      let pitchingCount = 0;
      if (tab) {
        const { data: tickets } = await supabase.from("tickets").select("data").eq("tab_id", tab.id).is("deleted_at", null);
        const dids = [...new Set((tickets || []).map((t) => t.data?.releaseId).filter(Boolean))];
        if (dids.length > 0) {
          const { data: rels } = await supabase.from("releases").select("did, upc").in("did", dids);
          pitchingCount = (rels || []).filter((r) => r.upc).length;
        }
      }
      setCounts({
        booking: releaseCount ?? 0,
        upload: uploadCount ?? 0,
        confirm: releaseCount ?? 0,
        pre_release: releaseCount ?? 0,
        pitching: pitchingCount,
        package_price: 0,
      });
    })();
  }, []);

  if (!checkedRedirect) {
    return <AppShell><div className={styles.page}><div className={styles.container}>Loading…</div></div></AppShell>;
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title}>Workstation</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 24 }}>
            Ongoing, ticket-less work — tracked by a PIC owner per column, not a Received/Started/Completed
            lifecycle. See Tickets for anything that needs an explicit request/response cycle instead.
            Showing types relevant to {isDev ? "dev (all teams)" : profile?.segment || "your team"}.
          </p>

          {types.length === 0 ? (
            <div className={styles.emptyState}>No workstations assigned to your team yet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              {types.map((key) => (
                <Link
                  key={key}
                  href={WORKSTATION_ROUTES[key]}
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
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{WORKSTATION_TYPE_LABELS[key]}</div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{NOTES[key]}</div>
                  </div>
                  <span style={{ fontSize: 36, fontWeight: 800, color: "var(--accent-soft)", lineHeight: 1, flexShrink: 0 }}>
                    {counts[key] ?? 0}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
