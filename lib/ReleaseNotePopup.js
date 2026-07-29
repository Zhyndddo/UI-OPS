"use client";

import { buildProductNote, buildLinkshareNote, PRODUCT_NOTE_FIELDS, LINKSHARE_TIKTOK_OPTIONS, LINKSHARE_FACEBOOK_OPTIONS } from "./releaseNotes";
import styles from "../app/shared.module.css";

// Shared "Note" / "Linkshare Note" popup — same templates + config fields
// as the release detail page's Pre-release & Note tab (lib/releaseNotes.js),
// reused by both the OPS Upload workstation and the Newrelease Upload
// ticket list so all three places show the exact same generated text and
// never drift out of sync. Editing here writes straight to the release,
// immediately — same convention as everywhere else in this app, no
// separate Save step.
export default function ReleaseNotePopup({ release, kind, onUpdate, onClose }) {
  const isProduct = kind === "product";
  const noteText = isProduct ? buildProductNote(release) : buildLinkshareNote(release);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, width: 480, maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div className={styles.eyebrow}>// {isProduct ? "Note" : "Linkshare Note"}</div>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{release.title}</h3>
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release.main_artist} · {release.did}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>Config</div>
        {isProduct ? (
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {PRODUCT_NOTE_FIELDS.map(([key, label]) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>{label}</label>
                <input
                  className={styles.input}
                  style={{ width: "100%", padding: "6px 8px", fontSize: 12, boxSizing: "border-box" }}
                  defaultValue={release[key] || ""}
                  onBlur={(e) => onUpdate({ [key]: e.target.value || null })}
                />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Tiktok Release Timing</label>
              <select
                className={styles.select}
                value={release.linkshare_tiktok_timing || ""}
                onChange={(e) => onUpdate({ linkshare_tiktok_timing: e.target.value || null })}
              >
                <option value="">—</option>
                {LINKSHARE_TIKTOK_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Facebook Release Timing</label>
              <select
                className={styles.select}
                value={release.linkshare_facebook_timing || ""}
                onChange={(e) => onUpdate({ linkshare_facebook_timing: e.target.value || null })}
              >
                <option value="">—</option>
                {LINKSHARE_FACEBOOK_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Link Drive</label>
              <input
                className={styles.input}
                style={{ width: "100%", padding: "6px 8px", fontSize: 12, boxSizing: "border-box" }}
                defaultValue={release.drive_link || ""}
                onBlur={(e) => onUpdate({ drive_link: e.target.value || null })}
              />
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>Generated Note</div>
        <pre style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 14, fontSize: 12, color: "#ccc", whiteSpace: "pre-wrap", margin: 0 }}>
{noteText}
        </pre>
      </div>
    </div>
  );
}
