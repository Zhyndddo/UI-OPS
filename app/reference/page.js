"use client";

import Link from "next/link";
import AppShell from "../../lib/AppShell";
import styles from "../shared.module.css";

const REFS = [
  { href: "/artists", label: "Artist List", note: "Nghệ Danh, Label, platform URLs — drives artist→label autofill" },
  { href: "/labels", label: "Label List", note: "Label Name, Hợp Tác, Phân Loại, ..." },
  { href: "/booking-channels", label: "Booking Channels", note: "Real channel/page handles per platform — powers the Booking popup's pick-list" },
];

export default function ReferencePage() {
  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Reference</div>
          <h1 className={styles.title}>Reference Tables</h1>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {REFS.map((r) => (
              <Link
                key={r.href}
                href={r.href}
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
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{r.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.note}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
