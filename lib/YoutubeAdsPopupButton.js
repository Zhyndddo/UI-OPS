"use client";

import { useState } from "react";
import YoutubeAdsFields from "./YoutubeAdsFields";

// Round 92 — small icon + popup wrapper around YoutubeAdsFields, used on
// the release detail page's Có Trong Net YouTube panel. Dimmed gray when
// both fields are empty, accent-colored once either has something — same
// on/off convention as the © Copyright icon (New Release Setup) and the
// 📝 Note icon (Booking Board).
export default function YoutubeAdsPopupButton({ styles, url, bookingNote, onChangeUrl, onChangeBookingNote, label }) {
  const [open, setOpen] = useState(false);
  const hasData = !!(url || "").trim() || !!(bookingNote || "").trim();

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={hasData ? "View/edit YouTube URL & Booking request" : "Add YouTube URL & Booking request"}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 0, color: hasData ? "var(--accent-soft)" : "var(--text-faint)", verticalAlign: "middle" }}
      >
        ▶️
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 300, width: 260,
              background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)", textAlign: "left", fontWeight: 400, textTransform: "none",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 8 }}>
              {label || "YouTube Ads — URL & Booking"}
            </div>
            <YoutubeAdsFields styles={styles} url={url} bookingNote={bookingNote} onChangeUrl={onChangeUrl} onChangeBookingNote={onChangeBookingNote} compact />
            <button type="button" className={styles.btnSmall} style={{ marginTop: 8, width: "100%" }} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </>
      )}
    </span>
  );
}
