"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { TEAM_WORKSTATION_TYPES, WORKSTATION_TYPE_LABELS, WORKSTATION_ROUTES, typesForTeam } from "../../lib/teamTypes";
import { getNotDoneCount } from "../../lib/notDoneCounts";
import styles from "../shared.module.css";

const NOTES = {
  booking: "3-round × platform matrix, Direct/Partner gated on Phụ Lục",
  upload: "UPC, Link LBM, Link Share, Smartlink — every release SEND UPLOAD has touched",
  confirm: "Cross-platform correctness checks + Smartlink verification, two phases",
  pre_release: "CANVAS, Artist Pick, Musixmatch, NCT Lyric",
  pitching: "Queue of active Pitching tickets, edited in one place",
  stream: "Today Check, Monthly, Bổ Sung — real per-platform stream metrics",
  milestone: "Chart rank tracking — IN/REMAIN/RETURN/OUT + streaks",
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

  // Round 73 — per explicit request, this card grid now shows the
  // NOT-DONE count per workstation (lib/notDoneCounts.js's
  // workstationNotDoneCount — the exact same rule each workstation page
  // already uses for its own "outstanding work" logic), instead of the
  // raw release/upload-requested totals this used to show — those were
  // "how many releases exist at all," not "how much is left to do."
  // booking, package_price, stream, and milestone have no defined
  // "done" concept (same as before) — getNotDoneCount returns null for
  // those, and the card shows a dash instead of a number.
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const keys = ["booking", "upload", "confirm", "pre_release", "pitching", "stream", "milestone", "package_price"];
      const results = await Promise.all(
        keys.map(async (key) => [key, await getNotDoneCount("workstation", key)])
      );
      setCounts(Object.fromEntries(results));
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
            lifecycle. See Tickets for anything that needs an explicit request/response cycle instead.{" "}
            {isDev ? "Grouped by team — you see everyone's." : `Showing types relevant to ${profile?.segment || "your team"}.`}
          </p>

          {isDev ? (
            Object.entries(TEAM_WORKSTATION_TYPES).map(([team, teamTypes]) => (
              <TeamSection key={team} team={team} types={teamTypes} counts={counts} />
            ))
          ) : types.length === 0 ? (
            <div className={styles.emptyState}>No workstations assigned to your team yet.</div>
          ) : (
            <CardGrid types={types} counts={counts} />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function TeamSection({ team, types, counts }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>{team}</div>
      <CardGrid types={types} counts={counts} />
    </div>
  );
}

function CardGrid({ types, counts }) {
  return (
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
          {/* Round 73 — null means "no not-done rule defined" (booking,
              package_price, stream, milestone) — dash instead of a
              misleading 0. */}
          <span style={{ fontSize: 36, fontWeight: 800, color: "var(--accent-soft)", lineHeight: 1, flexShrink: 0 }}>
            {counts[key] != null ? counts[key] : "—"}
          </span>
        </Link>
      ))}
    </div>
  );
}
