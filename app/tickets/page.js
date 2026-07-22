import Link from "next/link";
import AppShell from "../../lib/AppShell";
import styles from "../shared.module.css";

const TICKET_TYPES = [
  { href: "/tickets/newrelease-upload", label: "Newrelease Upload", note: "Auto-sent when SEND UPLOAD is clicked" },
  { href: "/tickets/phu-luc", label: "Phụ Lục", note: "Auto-created when an artist locks in a contract type" },
  { href: "/tickets/design", label: "Design" },
  { href: "/tickets/phai-sinh", label: "Phái Sinh" },
  { href: "/tickets/media-booking", label: "Media Booking" },
  { href: "/tickets/manual-claim", label: "Manual Claim" },
  { href: "/tickets/report-conflict", label: "Report Conflict" },
  { href: "/tickets/artist-profile", label: "Artist Profile" },
  { href: "/tickets/stream-update", label: "Stream Update" },
  { href: "/tickets/khac", label: "Khác" },
];

export default function TicketsIndex() {
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
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t.label}</div>
              {t.note && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{t.note}</div>}
            </Link>
          ))}
        </div>
      </div>
    </div>
    </AppShell>
  );
}
