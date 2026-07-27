"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import { getNotDoneCount } from "./notDoneCounts";
import {
  TEAM_TICKET_TYPES, TICKET_TYPE_LABELS, TICKET_ROUTES, SHARED_TICKET_TYPES,
  TEAM_WORKSTATION_TYPES, WORKSTATION_TYPE_LABELS, WORKSTATION_ROUTES,
  typesForTeam,
} from "./teamTypes";
import styles from "../app/shared.module.css";

// Sits at the top of every individual ticket-type / workstation-type page.
// Four jobs: remembers "this is the type I last looked at" (so the index
// page can skip straight past the card picker next time), renders a quick
// tab bar of the OTHER types available to this user's team, offers a way
// back to that card picker whenever, and shows each tab's outstanding
// (not-done) work count — types with no defined "done" rule (Booking,
// Package Price Management, Streaming, Milestone) just show no number.
export default function TypeSwitcher({ kind, current }) {
  const router = useRouter();
  const { profile } = useAuth();
  const isDev = profile?.role === "dev";
  const [counts, setCounts] = useState({});

  useEffect(() => {
    window.localStorage.setItem(`last_${kind}_type`, current);
  }, [kind, current]);

  const isTicket = kind === "ticket";
  const mapping = isTicket ? TEAM_TICKET_TYPES : TEAM_WORKSTATION_TYPES;
  const labels = isTicket ? TICKET_TYPE_LABELS : WORKSTATION_TYPE_LABELS;
  const routes = isTicket ? TICKET_ROUTES : WORKSTATION_ROUTES;
  const indexRoute = isTicket ? "/tickets" : "/workstation";

  let types = typesForTeam(mapping, profile?.segment, isDev);
  if (isTicket) types = [...new Set([...types, ...SHARED_TICKET_TYPES])];

  useEffect(() => {
    if (!profile || types.length === 0) return;
    let cancelled = false;
    types.forEach((key) => {
      getNotDoneCount(kind, key, profile).then((n) => {
        if (!cancelled) setCounts((prev) => ({ ...prev, [key]: n }));
      });
    });
    return () => { cancelled = true; };
  }, [profile, types.join(","), kind]);

  function returnToPicker() {
    window.localStorage.removeItem(`last_${kind}_type`);
    router.push(indexRoute);
  }

  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
      <button
        onClick={returnToPicker}
        title={`Back to the ${isTicket ? "Tickets" : "Workstation"} picker`}
        style={{
          background: "none",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--text-faint)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ← All {isTicket ? "Tickets" : "Workstations"}
      </button>
      {types.length > 1 && types.map((key) => (
        <Link
          key={key}
          href={routes[key]}
          className={`${styles.tabBtn} ${current === key ? styles.tabBtnActive : ""}`}
          style={{ border: "1px solid var(--border)", borderRadius: 6, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {labels[key] || key}
          {counts[key] != null && (
            <span style={{ fontSize: 10, fontWeight: 800, background: counts[key] > 0 ? "var(--accent)" : "var(--bg-hover)", color: counts[key] > 0 ? "var(--accent-on)" : "var(--text-faint)", borderRadius: 10, padding: "1px 6px" }}>
              {counts[key]}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
