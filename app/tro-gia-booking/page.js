"use client";

import AppShell from "../../lib/AppShell";
import styles from "../shared.module.css";

// Round 82 item 2 — plain read-only content page, no DB call at all
// (same pattern as app/reference/page.js). Content transcribed verbatim
// from the delivered "tro gia booking.xlsx" (Sheet1, A1:B4).
const ITEMS = [
  {
    title: "TRỢ GIÁ BOOKING TIKTOK CHANNEL",
    desc: "HỖ TRỢ 10% - 70% CHI PHÍ TRUYỀN THÔNG\n(KHÔNG GIỚI HẠN SỐ LẦN HỖ TRỢ)",
    href: "https://docs.google.com/spreadsheets/d/1Jyuy_QjrDAk3ToG70Ql4O-6w2WMwVPi5IFRJJjWh9JQ/edit?gid=388080288#gid=388080288",
  },
  {
    title: "TRỢ GIÁ BOOKING MẪU CAPCUT (CHỈ XUẤT MẪU)",
    desc: "HỖ TRỢ 50%/MẪU CAPCUT\n(KHÔNG GIỚI HẠN SỐ LẦN HỖ TRỢ)",
    href: "https://docs.google.com/spreadsheets/d/1Jyuy_QjrDAk3ToG70Ql4O-6w2WMwVPi5IFRJJjWh9JQ/edit?gid=1000267329#gid=1000267329",
  },
  {
    title: "RATE CARD ADS VIEENT",
    desc: "Báo giá quảng cáo các nền tảng: Youtube, Facebook, Tiktok",
    href: "https://docs.google.com/spreadsheets/d/1vC-T1Vst4O0CtexP5LSJ2MGGWNQST72xK_vLCcrRJhM/edit?gid=0#gid=0",
  },
];

export default function TroGiaBookingPage() {
  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Reference</div>
          <h1 className={styles.title}>Trợ giá booking</h1>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
            {ITEMS.map((it) => (
              <div
                key={it.title}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{it.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-faint)", whiteSpace: "pre-wrap", marginBottom: 10 }}>{it.desc}</div>
                <a href={it.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent)" }}>
                  Open Sheet ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
