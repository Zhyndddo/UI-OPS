"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import styles from "../shared.module.css";

const TICKET_TYPES = [
  { key: "newrelease_upload", href: "/tickets/newrelease-upload", label: "Newrelease Upload", note: "Auto-sent when SEND UPLOAD is clicked" },
  { key: "phu_luc", href: "/tickets/phu-luc", label: "Phụ Lục", note: "Auto-created when an artist locks in a contract type" },
  { key: "design", href: "/tickets/design", label: "Design" },
  { key: "phai_sinh", href: "/tickets/phai-sinh", label: "Phái Sinh" },
  { key: "media_booking", href: "/tickets/media-booking", label: "Media Booking" },
  { key: "manual_claim", href: "/tickets/manual-claim", label: "Manual Claim" },
  { key: "report_conflict", href: "/tickets/report-conflict", label: "Report Conflict" },
  { key: "artist_profile", href: "/tickets/artist-profile", label: "Artist Profile" },
  { key: "stream_update", href: "/tickets/stream-update", label: "Stream Update" },
  { key: "khac", href: "/tickets/khac", label: "Khác" },
];

export default function TicketsIndex() {
  const [counts, setCounts] = useState({});

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

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>// Ticket System</div>
        <h1 className={styles.title}>Tickets</h1>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {TICKET_TYPES.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              style={{
                display: "block",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 16,
                textDecoration: "none",
                color: "var(--text)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{t.label}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--accent-soft)",
                    background: "var(--bg-hover)",
                    borderRadius: 10,
                    padding: "1px 8px",
                  }}
                >
                  {counts[t.key] ?? 0}
                </span>
              </div>
              {t.note && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{t.note}</div>}
            </Link>
          ))}
        </div>
      </div>
    </div>
    </AppShell>
  );
}
