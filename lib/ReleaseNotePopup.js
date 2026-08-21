"use client";

import { useState, useEffect } from "react";
import { buildProductNote, buildLinkshareNote, PRODUCT_NOTE_FIELDS, LINKSHARE_TIKTOK_OPTIONS, LINKSHARE_FACEBOOK_OPTIONS, PRIORITY_MODE_WARNING } from "./releaseNotes";
import UrlField from "./UrlField";
import styles from "../app/shared.module.css";

// Shared "Note" / "Linkshare Note" popup — same templates + config fields
// as the release detail page's Pre-release & Note tab (lib/releaseNotes.js),
// reused by both the OPS Upload workstation and the Newrelease Upload
// ticket list so all three places show the exact same generated text and
// never drift out of sync. Editing here writes straight to the release,
// immediately — same convention as everywhere else in this app, no
// separate Save step.
// UrlField is a controlled component (needs a live `value`, not
// `defaultValue`) so it can grow into the multi-line textarea as soon as a
// 2nd URL is typed — but this popup's other fields all write to the DB on
// blur, not on every keystroke. This small wrapper keeps its own buffer
// (seeded from the release prop, reset if the release itself changes) and
// only calls onCommit on blur, matching that same convention.
function UrlFieldWithLocalBuffer({ styles, value, onCommit }) {
  const [buffer, setBuffer] = useState(value || "");
  useEffect(() => setBuffer(value || ""), [value]);
  return <UrlField styles={styles} value={buffer} onChange={setBuffer} onBlur={() => onCommit(buffer)} />;
}

// Round 173 — Generated Note's copy button, per explicit request ("make a
// copy the note field button, click to copy. Apply the button to both
// note"). This one component already renders BOTH note kinds (product via
// buildProductNote, linkshare via buildLinkshareNote — kind picks which),
// so one button here covers both automatically. Falls back to a manual
// select-all if the Clipboard API isn't available (e.g. non-HTTPS/older
// browser) instead of silently doing nothing.
function copyNoteText(text, setCopied) {
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied("error")
    );
  } else {
    setCopied("error");
  }
}

export default function ReleaseNotePopup({ release, kind, onUpdate, onClose }) {
  const isProduct = kind === "product";
  const noteText = isProduct ? buildProductNote(release) : buildLinkshareNote(release);
  const [copied, setCopied] = useState(false);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
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
            {PRODUCT_NOTE_FIELDS.map(([key, label]) => {
              const locked = key === "smartlink" && release.needs_update;
              // Round 155 item 4 — Link Sound TikTok (link_ugc) now accepts
              // multiple URLs, one per line (see lib/UrlField.js) — same
              // component as the release detail page's URL tab, so this
              // Config panel doesn't fall back to a single-line input that
              // can only ever hold/edit the first URL.
              if (key === "link_ugc") {
                return (
                  <div key={key}>
                    <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>{label}</label>
                    <UrlFieldWithLocalBuffer styles={styles} value={release[key]} onCommit={(v) => onUpdate({ [key]: v || null })} />
                  </div>
                );
              }
              return (
                <div key={key}>
                  <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>{label}</label>
                  <input
                    className={styles.input}
                    style={{ width: "100%", padding: "6px 8px", fontSize: 12, boxSizing: "border-box", opacity: locked ? 0.5 : 1, cursor: locked ? "not-allowed" : "text" }}
                    defaultValue={release[key] || ""}
                    disabled={locked}
                    title={locked ? PRIORITY_MODE_WARNING : undefined}
                    onBlur={(e) => !locked && onUpdate({ [key]: e.target.value || null })}
                  />
                  {locked && (
                    <div title={PRIORITY_MODE_WARNING} style={{ fontSize: 10, color: "var(--error-fg, #e57373)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      ⚠ {PRIORITY_MODE_WARNING}
                    </div>
                  )}
                </div>
              );
            })}
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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Generated Note</div>
          <button
            type="button"
            onClick={() => copyNoteText(noteText, setCopied)}
            className={styles.btnSmall}
            style={copied === true ? { borderColor: "#2e7d32", color: "#81c784" } : copied === "error" ? { borderColor: "#c0392b", color: "#e57373" } : undefined}
          >
            {copied === true ? "✓ Copied" : copied === "error" ? "Couldn't copy — select manually" : "Copy"}
          </button>
        </div>
        {/* Round 173 — a long unbroken URL inside the note (no spaces to
            wrap on) was overflowing this box's width instead of wrapping,
            per explicit report ("the link grow beyond the container").
            pre-wrap alone only breaks at whitespace; overflowWrap:
            "anywhere" (+ wordBreak fallback for older engines) lets it
            break mid-URL too, same as every other long-URL cell in this
            app already handles it. */}
        <pre
          style={{
            background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14,
            fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word",
            margin: 0, maxWidth: "100%", boxSizing: "border-box",
          }}
        >
{noteText}
        </pre>
      </div>
    </div>
  );
}
