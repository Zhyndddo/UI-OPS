"use client";

import UrlField from "./UrlField";

// Shared by the New Release create form and the release detail page, so
// the tri-state Additional Flags don't live in two duplicated copies.
//
// Split into two labeled clusters per the "Chia lại thành 2 nhóm CHECKLIST
// & REQUEST" request — Marketing Checklist (things Marketing tracks about
// the artist/project itself) vs Marketing Request (things AR is asking
// Marketing to actually do). `gate_publishing` (the old standalone
// "Publishing" field) is REMOVED here — it was a duplicate of the
// `is_publish` boolean that used to live in OverviewTab's "Other
// Checklist" (see app/releases/[id]/page.js), and neither name showed up
// in the requested Marketing Request list — only "Phụ Lục Publishing"
// did, which is its own new field below. If "Publishing" on its own (not
// the Phụ Lục variant) is still needed somewhere, say so and it can come
// back as one field instead of two.
export const MARKETING_CHECKLIST_FIELDS = [
  ["gate_artist_profile", "Profile Artist"],
  ["gate_artist_photo", "Artist Photo"],
  ["gate_project_proposal", "Project Proposal"],
];

// Regrouped per the latest request — Marketing Request itself is down to
// just these two; Data Request and Legal Request (below) used to be
// fields IN this list and are now section headers of their own, each with
// their own field group.
export const MARKETING_REQUEST_FIELDS = [
  ["gate_pitching", "Pitching"],
  ["gate_goi_ho_tro_truyen_thong", "Gói Hỗ Trợ Truyền Thông"],
];

// "Data Request" used to be its own field (gate_data_request) sitting
// inside Marketing Request — it's now a GROUP label instead, holding these
// five. gate_data_request itself is a real, live column (set on the
// New Release create form, used the same as every other gate field) —
// NOT deleted, just no longer shown as its own toggle here since the
// regroup didn't ask for it to stay as one. Say if it should come back as
// a field (inside this group or elsewhere) — it still has real data.
export const DATA_REQUEST_FIELDS = [
  ["gate_lyric_musixmatch", "Priority Sync Lyric"],
  ["gate_mv_spotify", "Music Video on Spotify"],
  ["gate_discovery_mode_spotify", "Discovery Mode on Spotify"],
  ["gate_sony_publish", "Sony Publish"],
  ["gate_split_share", "Splitshare"],
];

// "Legal Request" is now a GROUP label the same way — gate_phu_luc_truyen_thong
// is read-only here (see the { readOnly: true } third element and
// ReadOnlyGateBadge below): it's auto-set to "true" the moment a release
// leaves BRIEF & DATA/DEALING with something other than "Chỉ Phát Hành"
// (see the effect in app/releases/[id]/page.js keyed on
// PIPELINE_STAGES/gate_phu_luc_truyen_thong), so letting someone hand-pick
// it here would just get silently overwritten by that same effect the
// next time the release's stage changes — showing it as a live status
// instead of a choice avoids that confusion.
export const LEGAL_REQUEST_FIELDS = [
  ["gate_phu_luc_mg", "Phụ Lục MG"],
  ["gate_phu_luc_truyen_thong", "Phụ Lục Truyền Thông", { readOnly: true }],
  ["gate_phu_luc_publishing", "Phụ Lục Publishing"],
];

// gate_legal_request (the field, distinct from the new "Legal Request"
// group above) and gate_design/gate_co_trong_net_youtube/gate_pre_order
// weren't mentioned in the latest regroup request at all — kept here,
// under Marketing Request, rather than guessed into one of the new groups
// (gate_legal_request sitting right next to a group ALSO called "Legal
// Request" would be confusing either way). Say where these four should
// actually land.
export const MARKETING_REQUEST_EXTRA_FIELDS = [
  ["gate_legal_request", "Legal Request"],
  ["gate_design", "Design"],
  ["gate_co_trong_net_youtube", "Có Trong Net YouTube"],
  ["gate_pre_order", "Pre-order"],
];

// Kept for any code still importing the old flat list.
export const GATE_FIELDS = [
  ...MARKETING_CHECKLIST_FIELDS,
  ...MARKETING_REQUEST_FIELDS,
  ["gate_data_request", "Data Request"],
  ...DATA_REQUEST_FIELDS,
  ...LEGAL_REQUEST_FIELDS.map(([k, l]) => [k, l]),
  ...MARKETING_REQUEST_EXTRA_FIELDS,
];

const GATE_OPTIONS = ["false", "true", "update"];
const GATE_LABELS = { false: "No", true: "Yes", update: "TBU" };

export const PITCHING_TYPES = [
  ["priority", "Priority"],
  ["spotify", "Spotify"],
  ["nct", "NCT"],
  ["zing", "Zing"],
];

// "Thể Loại" options revealed once Design is set to Yes — best-guess
// mapping from "bấm yes thì thêm Thể loại vô MV Lyrics, Music Video,
// Visualize" onto the Design gate specifically, since Design tickets are
// the thing on this page conceptually closest to "content type." Flag if
// this should hang off a different toggle instead.
export const DESIGN_CONTENT_TYPES = ["Lyrics", "Music Video", "Visualize"];

// Same visual language as GateToggle, but a plain 2-state Yes/No — used
// for genuine booleans (Metadata Checklist, DSP Pitching/ISRC) instead of
// a native checkbox.
export function BoolToggle({ value, onChange }) {
  return (
    <div style={{ display: "flex", border: "1px solid var(--border-strong)", borderRadius: 6, overflow: "hidden" }}>
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
            color: value === v ? "#0a0a0a" : "var(--text-muted)",
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
    <div style={{ display: "flex", border: "1px solid var(--border-strong)", borderRadius: 6, overflow: "hidden" }}>
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
            color: value === o ? "#0a0a0a" : "var(--text-muted)",
          }}
        >
          {GATE_LABELS[o]}
        </button>
      ))}
    </div>
  );
}

// Which gate fields also carry a URL — ticking "Yes" reveals a URL input
// right there, and once a URL exists, a small icon-link appears next to
// the toggle to open it in a new tab. That same URL also lives on the URL
// tab, editable from either place.
const URL_GATE_FIELDS = {
  gate_artist_photo: "artist_photo_url",
  gate_project_proposal: "project_proposal_url",
  gate_pre_order: "link_preorder", // reuses the existing URL field — Pre-order already had its own column
};

// Plain status display for a gate field that isn't meant to be hand-picked
// (see gate_phu_luc_truyen_thong's comment above) — same tri-state colors
// as the real toggle, just not a button.
function ReadOnlyGateBadge({ value }) {
  const v = value || "false";
  const bg = v === "true" ? "var(--success-bg)" : v === "update" ? "var(--warn-bg)" : "var(--bg-hover)";
  const fg = v === "true" ? "var(--success-fg)" : v === "update" ? "var(--warn-fg)" : "var(--text-faint)";
  return (
    <div style={{ padding: "8px 10px", fontSize: 12, fontWeight: 700, borderRadius: 6, background: bg, color: fg, border: "1px solid var(--border)", textAlign: "center" }}>
      {GATE_LABELS[v]}
    </div>
  );
}

function GateGrid({ styles, fields, form, update, suppressUrlFor }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
      {fields.map(([key, label, opts]) => {
        const urlField = suppressUrlFor?.includes(key) ? null : URL_GATE_FIELDS[key];
        return (
          <div key={key} className={styles.field} style={{ marginBottom: 0 }}>
            <label className={styles.fieldLabel}>{label}</label>
            {opts?.readOnly ? (
              <ReadOnlyGateBadge value={form[key]} />
            ) : (
              <GateToggle value={form[key] || "false"} onChange={(v) => update(key, v)} />
            )}
            {urlField && form[key] === "true" && (
              <div style={{ marginTop: 6 }}>
                <UrlField styles={styles} value={form[urlField]} onChange={(v) => update(urlField, v)} rows={2} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Tri-state gate fields — Yes (do it) / No (don't need to) / TBU (to be
// updated later). pitchingTypes/onPitchingToggle are only passed
// where a picker makes sense (create form: local state, saved on submit;
// detail page: the real ticket, saved immediately per checkbox) — when
// absent, ticking Pitching "Yes" just cross-links to the Pitching ticket
// instead of showing a picker.
export function GateFields({ styles, form, update, pitchingTypes, onPitchingToggle, suppressUrlFor, pitchingInfoTicket, onSendPitchingInfoTicket }) {
  const entries = form.split_share_entries || [];
  const designTypes = form.design_content_types || [];

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

  function toggleDesignType(t) {
    const next = designTypes.includes(t) ? designTypes.filter((x) => x !== t) : [...designTypes, t];
    update("design_content_types", next);
  }

  return (
    <div>
      <div className={styles.subheading} style={{ marginTop: 0 }}>Marketing Checklist</div>
      <GateGrid styles={styles} fields={MARKETING_CHECKLIST_FIELDS} form={form} update={update} suppressUrlFor={suppressUrlFor} />

      <div className={styles.subheading}>Marketing Request</div>
      <GateGrid styles={styles} fields={MARKETING_REQUEST_FIELDS} form={form} update={update} suppressUrlFor={suppressUrlFor} />
      {/* Unlisted in the latest regroup request — see the comment on
          MARKETING_REQUEST_EXTRA_FIELDS. Kept visible here rather than
          silently dropped. */}
      <GateGrid styles={styles} fields={MARKETING_REQUEST_EXTRA_FIELDS} form={form} update={update} suppressUrlFor={suppressUrlFor} />

      <div className={styles.subheading}>Data Request</div>
      <GateGrid styles={styles} fields={DATA_REQUEST_FIELDS} form={form} update={update} suppressUrlFor={suppressUrlFor} />

      <div className={styles.subheading}>Legal Request</div>
      <GateGrid styles={styles} fields={LEGAL_REQUEST_FIELDS} form={form} update={update} suppressUrlFor={suppressUrlFor} />

      {form.gate_pitching === "true" && (
        onPitchingToggle ? (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", marginBottom: 8, textTransform: "uppercase" }}>
              Which pitching?
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {PITCHING_TYPES.map(([key, label]) => (
                <label key={key} className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={!!pitchingTypes?.[key]}
                    onChange={(e) => onPitchingToggle(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {pitchingTypes?.priority && onSendPitchingInfoTicket && (
              <button
                type="button"
                className={styles.btnSmall}
                disabled={!!pitchingInfoTicket}
                onClick={onSendPitchingInfoTicket}
                style={{
                  marginTop: 10,
                  borderColor: pitchingInfoTicket ? "#2e7d32" : undefined,
                  color: pitchingInfoTicket ? "#81c784" : undefined,
                  cursor: pitchingInfoTicket ? "default" : "pointer",
                }}
              >
                {pitchingInfoTicket ? "✓ Pitching Info Ticket Sent" : "Send Ticket to Collect Info"}
              </button>
            )}
          </div>
        ) : (
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginBottom: 12 }}>
            Pitching detail (priority, Spotify/NCT/Zing) is on the Pitching ticket for this release.
          </p>
        )
      )}

      {form.gate_design === "true" && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", marginBottom: 8, textTransform: "uppercase" }}>
            Thể Loại
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {DESIGN_CONTENT_TYPES.map((t) => (
              <label key={t} className={styles.checkboxRow}>
                <input type="checkbox" checked={designTypes.includes(t)} onChange={() => toggleDesignType(t)} />
                {t}
              </label>
            ))}
          </div>
        </div>
      )}

      {form.gate_split_share === "true" && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginTop: 8 }}>
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

      <p style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 12 }}>
        Ticking any field here is meant to add a line to the Tasklist tab — not wired up yet.
      </p>
    </div>
  );
}
