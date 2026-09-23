"use client";

// Round 415 (Phase 2) — shared field renderer for Profile Management's 5
// action types. Renders every field fieldsForType(type) lists EXCEPT the
// "identity" fields (artistName / newStageName) — those aren't per-
// platform and callers (lib/ArtistProfileVerifyPopup.js) render them
// separately, right above this, same as Round 414's ArtistRow does for
// Verification/NEW Profile's artistName.
//
// `platforms` is the shared, top-level multi-select picked once for the
// whole Profile Management card (spec: "first pick platform... then
// under it is collapsable options" — one picker feeds all 5 actions, not
// a picker per action). A `perPlatform: true` field renders one input per
// ticked platform, storing `{ [platformKey]: value }` under that field's
// key. A `gatedBy` field only shows its per-platform input once that
// platform's gate field reads "Yes" — Add Song's real per-platform gate
// (Round 415, supersedes the old informational-only note).
//
// onChange(key, fullNewValue) — same "caller owns the draft" split every
// other draft on this page uses; this component computes the full next
// value (including the per-platform merge) and hands it up whole, so the
// caller can just spread it into its draft state.

import { platformOptionsForType, fieldsForType } from "./artistProfileRequestTypes";

const IDENTITY_KEYS = new Set(["artistName", "newStageName"]);

export default function ArtistProfileFieldGroup({ styles, type, platforms, values, onChange }) {
  const fields = fieldsForType(type).filter((f) => !IDENTITY_KEYS.has(f.key));
  const platformLabel = Object.fromEntries(platformOptionsForType(type));
  const tickedPlatforms = (platforms || []).filter((p) => platformLabel[p]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {fields.map((f) => {
        if (!f.perPlatform) {
          return (
            <div key={f.key}>
              <label style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>
                {f.label} {f.required && <span style={{ color: "#e57373" }}>*</span>}
              </label>
              <FieldInput styles={styles} f={f} value={values?.[f.key] || ""} onChange={(v) => onChange(f.key, v)} />
              {f.tooltip && <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3 }}>{f.tooltip}</div>}
            </div>
          );
        }

        const fv = values?.[f.key] || {};
        const gateValues = f.gatedBy ? values?.[f.gatedBy] || {} : null;

        return (
          <div key={f.key}>
            <label style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>
              {f.label} {f.required && <span style={{ color: "#e57373" }}>*</span>}
            </label>
            {f.tooltip && <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 4 }}>{f.tooltip}</div>}
            {tickedPlatforms.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Chọn nền tảng ở trên trước.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {tickedPlatforms.map((p) => {
                  if (f.gatedBy) {
                    const gateAnswer = gateValues[p] || "";
                    if (gateAnswer === "No") {
                      return (
                        <div key={p} style={{ fontSize: 11, color: "#ffca4d", background: "rgba(255,202,77,0.1)", border: "1px solid #5a4a1a", borderRadius: 6, padding: "6px 8px" }}>
                          {platformLabel[p]}: chưa có profile/tab nhạc — cần tạo NEW profile ở mục Artist Verification trước.
                        </div>
                      );
                    }
                    if (gateAnswer !== "Yes") {
                      return (
                        <div key={p} style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          {platformLabel[p]}: chọn Có/Không ở trên để nhập thông tin này.
                        </div>
                      );
                    }
                  }
                  return (
                    <div key={p} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ fontSize: 11, color: "var(--text-faint)", width: 90, flexShrink: 0, paddingTop: 6 }}>{platformLabel[p]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <FieldInput
                          styles={styles}
                          f={f}
                          value={fv[p] || ""}
                          onChange={(v) => onChange(f.key, { ...fv, [p]: v })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({ styles, f, value, onChange }) {
  if (f.type === "select") {
    return (
      <select className={styles.select} style={{ width: "100%", boxSizing: "border-box", fontSize: 12 }} value={value} onChange={(e) => onChange(e.target.value)}>
        {(f.options || ["", "Yes", "No"]).map((o) => (
          <option key={o} value={o}>{o || f.label}</option>
        ))}
      </select>
    );
  }
  if (f.multiline) {
    return (
      <textarea
        className={styles.textarea}
        style={{ width: "100%", boxSizing: "border-box", minHeight: 60, fontSize: 12 }}
        defaultValue={value}
        onBlur={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      type="text"
      className={styles.input}
      style={{ width: "100%", boxSizing: "border-box", fontSize: 12 }}
      defaultValue={value}
      onBlur={(e) => onChange(e.target.value)}
    />
  );
}
