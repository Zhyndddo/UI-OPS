"use client";

// Round 172 — the ticket list (app/tickets/artist-profile/page.js) moved
// from a wide always-editable table to a mobile-friendly card list; tapping
// a card opens this popup with the same editable fields the table cells
// used to hold (platform, artist name/transfer names, Chi Tiết fields,
// note, PIC, deadline, status). All writes are the exact same calls the
// list page's inline handlers used to make (updateTicketData/updatePic/
// updateStatus, passed down from the caller) — this popup owns no Supabase
// calls of its own, it's a different rendering of the same row.

import { fmtDate, statusColor } from "./helpers";
import { requestTypeLabel, fieldsForType, platformOptionsForType, ALL_PLATFORMS, isLegacyTicket } from "./artistProfileRequestTypes";

export default function ArtistProfileEditPopup({ styles, ticket, tab, profiles, isExecutorView, onUpdateData, onUpdatePic, onUpdateStatus, onClose }) {
  const legacy = isLegacyTicket(ticket);
  const requestType = legacy ? null : ticket.data.requestType;
  const platformOptions = legacy ? ALL_PLATFORMS : platformOptionsForType(requestType);
  const color = statusColor(ticket.status);
  const fields = legacy ? [] : fieldsForType(requestType).filter((f) => f.key !== "artistName" && f.key !== "oldStageName" && f.key !== "newStageName");

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 399, background: "rgba(0,0,0,0.5)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 400,
          width: "min(520px, calc(100vw - 32px))",
          maxHeight: "85vh",
          overflowY: "auto",
          background: "var(--bg-card)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          padding: 20,
          boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>
            {legacy ? (
              <>
                NEW Profile <span style={{ fontSize: 10, color: "var(--text-faint)" }}>(legacy)</span>
              </>
            ) : (
              requestTypeLabel(requestType)
            )}
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Nền Tảng</label>
            <select
              className={styles.select}
              style={{ width: "100%", boxSizing: "border-box" }}
              value={ticket.data?.platform || ""}
              onChange={(e) => onUpdateData({ platform: e.target.value })}
            >
              <option value="">—</option>
              {platformOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>

          {!legacy && requestType === "transfer" ? (
            <>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Nghệ Danh Cũ</label>
                <input className={styles.input} style={{ width: "100%", boxSizing: "border-box" }} defaultValue={ticket.data?.oldStageName || ""} onBlur={(e) => onUpdateData({ oldStageName: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Nghệ Danh Mới</label>
                <input className={styles.input} style={{ width: "100%", boxSizing: "border-box" }} defaultValue={ticket.data?.newStageName || ""} onBlur={(e) => onUpdateData({ newStageName: e.target.value })} />
              </div>
            </>
          ) : (
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Nghệ Sĩ / Nghệ Danh</label>
              <input className={styles.input} style={{ width: "100%", boxSizing: "border-box" }} defaultValue={ticket.data?.artistName || ""} onBlur={(e) => onUpdateData({ artistName: e.target.value })} />
            </div>
          )}

          {legacy ? (
            <>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Email</label>
                <input className={styles.input} style={{ width: "100%", boxSizing: "border-box" }} defaultValue={ticket.data?.email || ""} onBlur={(e) => onUpdateData({ email: e.target.value })} />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Bài gần nhất: {ticket.data?.latestSong || "—"}</div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Spotify URL</label>
                <input className={styles.input} style={{ width: "100%", boxSizing: "border-box" }} defaultValue={ticket.data?.spotifyUrl || ""} onBlur={(e) => onUpdateData({ spotifyUrl: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Apple URL</label>
                <input className={styles.input} style={{ width: "100%", boxSizing: "border-box" }} defaultValue={ticket.data?.appleUrl || ""} onBlur={(e) => onUpdateData({ appleUrl: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Facebook URL</label>
                <input className={styles.input} style={{ width: "100%", boxSizing: "border-box" }} defaultValue={ticket.data?.fbUrl || ""} onBlur={(e) => onUpdateData({ fbUrl: e.target.value })} />
              </div>
            </>
          ) : (
            fields.map((f) => {
              if (f.key === "latestSong") {
                return (
                  <div key={f.key} style={{ fontSize: 11, color: "var(--text-faint)" }}>
                    Bài gần nhất: {ticket.data?.latestSong || "—"}
                  </div>
                );
              }
              return (
                <div key={f.key}>
                  <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>{f.label}</label>
                  {f.type === "select" ? (
                    <select className={styles.select} style={{ width: "100%", boxSizing: "border-box" }} value={ticket.data?.[f.key] || ""} onChange={(e) => onUpdateData({ [f.key]: e.target.value })}>
                      {(f.options || ["", "Yes", "No"]).map((o) => <option key={o} value={o}>{o || f.label}</option>)}
                    </select>
                  ) : f.multiline ? (
                    <textarea className={styles.textarea} style={{ width: "100%", boxSizing: "border-box", minHeight: 70 }} defaultValue={ticket.data?.[f.key] || ""} onBlur={(e) => onUpdateData({ [f.key]: e.target.value })} />
                  ) : (
                    <input className={styles.input} style={{ width: "100%", boxSizing: "border-box" }} defaultValue={ticket.data?.[f.key] || ""} onBlur={(e) => onUpdateData({ [f.key]: e.target.value })} />
                  )}
                </div>
              );
            })
          )}

          <div>
            <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Note</label>
            <input className={styles.input} style={{ width: "100%", boxSizing: "border-box" }} defaultValue={ticket.data?.note || ""} onBlur={(e) => onUpdateData({ note: e.target.value })} />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>PIC</label>
            {isExecutorView ? (
              <select className={styles.select} style={{ width: "100%", boxSizing: "border-box" }} value={ticket.pic_profile_id || ""} onChange={(e) => onUpdatePic(e.target.value)}>
                <option value="">— Unassigned —</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: 12 }}>{ticket.profiles?.name || "—"}</span>
            )}
          </div>

          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Deadline: {fmtDate(ticket.deadline)}</div>

          <div>
            <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Status</label>
            {isExecutorView ? (
              <select
                value={ticket.status}
                onChange={(e) => onUpdateStatus(e.target.value)}
                style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}
              >
                {tab?.status_options.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{ticket.status}</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
