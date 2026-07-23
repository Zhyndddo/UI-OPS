"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "./AuthContext";
import {
  TEAM_TICKET_TYPES, TICKET_TYPE_LABELS, TICKET_ROUTES, SHARED_TICKET_TYPES,
  TEAM_WORKSTATION_TYPES, WORKSTATION_TYPE_LABELS, WORKSTATION_ROUTES,
  typesForTeam,
} from "./teamTypes";
import styles from "../app/shared.module.css";

// Sits at the top of every individual ticket-type / workstation-type page.
// Two jobs: remembers "this is the type I last looked at" (so the index
// page can skip straight past the card picker next time), and renders a
// quick tab bar of the OTHER types available to this user's team, so
// switching doesn't mean going back to the picker every time.
export default function TypeSwitcher({ kind, current }) {
  const { profile } = useAuth();
  const isDev = profile?.role === "dev";

  useEffect(() => {
    window.localStorage.setItem(`last_${kind}_type`, current);
  }, [kind, current]);

  const isTicket = kind === "ticket";
  const mapping = isTicket ? TEAM_TICKET_TYPES : TEAM_WORKSTATION_TYPES;
  const labels = isTicket ? TICKET_TYPE_LABELS : WORKSTATION_TYPE_LABELS;
  const routes = isTicket ? TICKET_ROUTES : WORKSTATION_ROUTES;

  let types = typesForTeam(mapping, profile?.segment, isDev);
  if (isTicket) types = [...new Set([...types, ...SHARED_TICKET_TYPES])];

  if (types.length <= 1) return null; // nothing to switch to

  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
      {types.map((key) => (
        <Link
          key={key}
          href={routes[key]}
          className={`${styles.tabBtn} ${current === key ? styles.tabBtnActive : ""}`}
          style={{ border: "1px solid var(--border)", borderRadius: 6, textDecoration: "none" }}
        >
          {labels[key] || key}
        </Link>
      ))}
    </div>
  );
}
