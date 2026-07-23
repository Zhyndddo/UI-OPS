import Link from "next/link";
import AppShell from "../../lib/AppShell";
import styles from "../shared.module.css";

const WORKSTATIONS = [
  { href: "/booking", label: "Booking", note: "3-round × platform matrix, Direct/Partner gated on Phụ Lục" },
  { href: "/workstation/confirm", label: "Confirm", note: "Cross-platform correctness checks + Smartlink verification, two phases" },
  { href: "/workstation/pre-release", label: "Pre-release", note: "CANVAS, Artist Pick, Musixmatch, NCT Lyric" },
  { href: "/workstation/package", label: "Package", note: "Itemized package building + magic link generation" },
  { href: "/workstation/pitching", label: "Pitching", note: "Queue of active Pitching tickets, edited in one place" },
];

export default function WorkstationIndex() {
  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title}>Workstation</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 24 }}>
            Ongoing, ticket-less work — tracked by a PIC owner per column, not a Received/Started/Completed
            lifecycle. See Tickets for anything that needs an explicit request/response cycle instead.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {WORKSTATIONS.map((w) => (
              <Link
                key={w.href}
                href={w.href}
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
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{w.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{w.note}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
