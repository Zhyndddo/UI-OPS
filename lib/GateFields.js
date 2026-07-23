"use client";

// Shared by the New Release create form and the release detail page, so
// the tri-state Additional Flags don't live in two duplicated copies.
export const GATE_FIELDS = [
  ["gate_pitching", "Pitching"],
  ["gate_publishing", "Publishing"],
  ["gate_goi_ho_tro_truyen_thong", "Gói Hỗ Trợ Truyền Thông"],
  ["gate_split_share", "Split Share"],
  ["gate_lyric_musixmatch", "Lyric Musixmatch"],
  ["gate_design", "Design"],
  ["gate_co_trong_net_youtube", "Có Trong Net YouTube"],
];
const GATE_OPTIONS = ["false", "true", "update"];
const GATE_LABELS = { false: "No", true: "Yes", update: "Update" };

export const PITCHING_TYPES = [
  ["priority", "Priority"],
  ["spotify", "Spotify"],
  ["nct", "NCT"],
  ["zing", "Zing"],
];

// Same visual language as GateToggle, but a plain 2-state Yes/No — used
// for genuine booleans (Metadata Checklist, DSP Pitching/ISRC) instead of
// a native checkbox.
export function BoolToggle({ value, onChange }) {
  return (
    <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden" }}>
      {[false, true].map((v) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            background: value === v ? "#ff6b1a" : "transparent",
            color: value === v ? "#0a0a0a" : "#ccc",
          }}
        >
          {v ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

export function GateToggle({ value, onChange }) {
  return (
    <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden" }}>
      {GATE_OPTIONS.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            background: value === o ? "#ff6b1a" : "transparent",
            color: value === o ? "#0a0a0a" : "#ccc",
          }}
        >
          {GATE_LABELS[o]}
        </button>
      ))}
    </div>
  );
}

// Tri-state gate fields — Yes (do it) / No (don't need to) / Update (will
// decide yes/no later). pitchingTypes/setPitchingTypes are only passed by
// the create form — when present, ticking Pitching "Yes" reveals the real
// 4-type picker (Priority/Spotify/NCT/Zing) that becomes the actual
// Pitching ticket on submit. The detail page doesn't pass these, since by
// then the ticket already exists — it just cross-links there instead.
export function GateFields({ styles, form, update, pitchingTypes, setPitchingTypes }) {
  const entries = form.split_share_entries || [];

  function updateEntry(i, key, value) {
    const next = entries.map((e, idx) => (idx === i ? { ...e, [key]: value } : e));
    update("split_share_entries", next);
  }
  function addEntry() {
    update("split_share_entries", [...entries, { percentage: "", shared_label: "", scope: "only_new_release" }]);
  }
  function removeEntry(i) {
    update("split_share_entries", entries.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
        {GATE_FIELDS.map(([key, label]) => (
          <div key={key} className={styles.field} style={{ marginBottom: 0 }}>
            <label className={styles.fieldLabel}>{label}</label>
            <GateToggle value={form[key] || "false"} onChange={(v) => update(key, v)} />
          </div>
        ))}
      </div>

      {form.gate_pitching === "true" && (
        setPitchingTypes ? (
          <div style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", marginBottom: 8, textTransform: "uppercase" }}>
              Which pitching?
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {PITCHING_TYPES.map(([key, label]) => (
                <label key={key} className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={!!pitchingTypes[key]}
                    onChange={(e) => setPitchingTypes((p) => ({ ...p, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p style={{ color: "#666", fontSize: 11, marginTop: 8, marginBottom: 0 }}>
              Creates a Pitching ticket once the release is created.
            </p>
          </div>
        ) : (
          <p style={{ color: "#666", fontSize: 11, marginBottom: 12 }}>
            Pitching detail (priority, Spotify/NCT/Zing) is on the Pitching ticket for this release.
          </p>
        )
      )}

      {form.gate_split_share === "true" && (
        <div style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 12, marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", marginBottom: 8, textTransform: "uppercase" }}>
            Split Share
          </div>
          {entries.map((entry, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className={styles.field} style={{ marginBottom: 0, width: 90 }}>
                <label className={styles.fieldLabel}>%</label>
                <input className={styles.input} value={entry.percentage} onChange={(e) => updateEntry(i, "percentage", e.target.value)} />
              </div>
              <div className={styles.field} style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
                <label className={styles.fieldLabel}>Shared Label</label>
                <input className={styles.input} value={entry.shared_label} onChange={(e) => updateEntry(i, "shared_label", e.target.value)} />
              </div>
              <div className={styles.field} style={{ marginBottom: 0, minWidth: 180 }}>
                <label className={styles.fieldLabel}>Scope</label>
                <select className={styles.select} value={entry.scope} onChange={(e) => updateEntry(i, "scope", e.target.value)}>
                  <option value="only_new_release">Only New Release</option>
                  <option value="include_derivative">Include Derivative</option>
                </select>
              </div>
              <button className={styles.btnSmall} style={{ borderColor: "#c0392b", color: "#e57373" }} onClick={() => removeEntry(i)}>
                Remove
              </button>
            </div>
          ))}
          <button className={styles.btnSmall} onClick={addEntry}>+ Add Label</button>
          {entries.some((e) => e.scope === "include_derivative") && (
            <p style={{ color: "#ffca4d", fontSize: 11, marginTop: 8 }}>
              ⚠ At least one entry includes derivative works — the Phái Sinh ticket system should be flagged
              that related derivative products need uploading. Not automated yet; flag manually for now.
            </p>
          )}
        </div>
      )}

      <p style={{ color: "#555", fontSize: 11, marginTop: 12 }}>
        Ticking any field here is meant to add a line to the Tasklist tab — not wired up yet.
      </p>
    </div>
  );
}
