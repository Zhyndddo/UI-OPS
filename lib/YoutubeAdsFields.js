"use client";

// Round 92 — Có Trong Net YouTube's follow-through, once ticked: Operation
// or the label sets up YouTube Ads for the release and returns the real
// YouTube URL; AR can attach a booking request/note for Marketing before
// or alongside it. Both fields live on the release itself
// (youtube_ads_url, youtube_ads_booking_note) so the exact same 2 fields
// can show up wherever someone in that flow needs them — the release
// detail page (Có Trong Net YouTube panel, via YoutubeAdsPopupButton),
// Booking Board's YouTube Ads column popup, and the Media Booking ticket
// (next to Feed Back Từ Đối Tác) — without 3 separate copies of the same
// 2 inputs.
//
// Deliberately uncontrolled (defaultValue + onBlur, not value + onChange)
// — every call site either writes straight to Supabase (Booking Board,
// the ticket) or a locally-staged form (release detail page), and neither
// wants a network/state round trip on every keystroke. onBlur fires once,
// after typing stops, same idiom Booking Board's own text fields already
// use elsewhere in this app.
export default function YoutubeAdsFields({ styles, url, bookingNote, onChangeUrl, onChangeBookingNote, compact }) {
  return (
    <div style={{ display: "grid", gap: compact ? 6 : 10 }}>
      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", display: "block", marginBottom: 3 }}>
          YouTube URL
        </label>
        <input
          className={styles.input}
          style={{ width: "100%", boxSizing: "border-box" }}
          defaultValue={url || ""}
          onBlur={(e) => onChangeUrl(e.target.value)}
          placeholder="https://youtube.com/…"
        />
      </div>
      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", display: "block", marginBottom: 3 }}>
          Booking (request/note for Marketing)
        </label>
        <textarea
          className={styles.input}
          style={{ width: "100%", boxSizing: "border-box", minHeight: compact ? 50 : 60, resize: "vertical", fontFamily: "inherit" }}
          defaultValue={bookingNote || ""}
          onBlur={(e) => onChangeBookingNote(e.target.value)}
          placeholder="Booking request/notes for Marketing…"
        />
      </div>
    </div>
  );
}
