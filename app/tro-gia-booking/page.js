"use client";

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { TRO_GIA_BOOKING_SETTING_KEY, DEFAULT_TRO_GIA_BOOKING_ITEMS, parseTroGiaBookingItems } from "../../lib/troGiaBooking";
import styles from "../shared.module.css";

// Round 82 item 2 — plain read-only content page. Round 84 — no longer a
// hardcoded copy: now reads the same global_settings row Config → Trợ Giá
// Booking edits and the magic link's own Trợ Giá Booking section reads,
// so all 3 places show identical content (see lib/troGiaBooking.js).
export default function TroGiaBookingPage() {
  const [items, setItems] = useState(DEFAULT_TRO_GIA_BOOKING_ITEMS);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("global_settings").select("value").eq("key", TRO_GIA_BOOKING_SETTING_KEY).maybeSingle()
      .then(({ data }) => setItems(parseTroGiaBookingItems(data?.value)));
  }, []);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Reference</div>
          <h1 className={styles.title}>Trợ giá booking</h1>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
            {items.map((it, i) => (
              <div
                key={i}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{it.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-faint)", whiteSpace: "pre-wrap", marginBottom: 10 }}>{it.desc}</div>
                {it.href && (
                  <a href={it.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent)" }}>
                    Open Sheet ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
