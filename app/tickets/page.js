"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { TEAM_TICKET_TYPES, TICKET_TYPE_LABELS, TICKET_ROUTES, SHARED_TICKET_TYPES, typesForTeam } from "../../lib/teamTypes";
import { getNotDoneCount } from "../../lib/notDoneCounts";
import styles from "../shared.module.css";

const NOTES = {
  newrelease_upload: "Auto-sent when SEND UPLOAD is clicked",
  phu_luc: "Auto-created when an artist locks in a contract type",
  media_booking: "Also where the package builder lives — click a row to open it",
  stream_update: "The real numbers live in the Streaming workstation — this is just the request",
  pitching_info: "Auto-sent when Priority Pitching or Spotify is checked at New Release creation",
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

  // Round 58 fix (superseded by round 73) — this used to pull EVERY
  // non-deleted ticket's tab_id in one plain select() and bucket-count
  // them client-side, which silently broke past Supabase/PostgREST's
  // default 1000-row cap; fixed then with a per-tab { count: "exact",
  // head: true } query. Round 73 — per explicit request, this card grid
  // now shows the NOT-DONE count (same rule as the small badge next to
  // each tab in TypeSwitcher, see lib/notDoneCounts.js) instead of the
  // raw total-ever-created count — a type sitting at a big number here
  // used to just mean "lots of history," not "lots to do."
  useEffect(() => {
    if (!supabase || !profile) return;
    (async () => {
      const allTypes = [...new Set([...Object.values(TEAM_TICKET_TYPES).flat(), ...SHARED_TICKET_TYPES])];
      const results = await Promise.all(
        allTypes.map(async (key) => [key, await getNotDoneCount("ticket", key, profile)])
      );
      setCounts(Object.fromEntries(results));
    })();
  }, [profile]);

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
          {isDev ? "Grouped by team — you see everyone's." : `Showing types relevant to ${profile?.segment || "your team"}.`}
        </p>

        {isDev ? (
          <>
            {Object.entries(TEAM_TICKET_TYPES).map(([team, teamTypes]) => (
              <TeamSection key={team} team={team} types={teamTypes} counts={counts} />
            ))}
            <TeamSection team="Shared" types={SHARED_TICKET_TYPES} counts={counts} />
          </>
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
          {/* Round 73 — null means "not loaded yet" or "no not-done rule
              defined for this type" (see getNotDoneCount) — show a dash
              instead of a misleading 0 in either case. */}
          <span style={{ fontSize: 36, fontWeight: 800, color: "var(--accent-soft)", lineHeight: 1, flexShrink: 0 }}>
            {counts[key] != null ? counts[key] : "—"}
          </span>
        </Link>
      ))}
    </div>
  );
}
