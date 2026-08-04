"use client";

import UrlField from "./UrlField";

// Shared by the New Release create form and the release detail page, so
// the tri-state Additional Flags don't live in two duplicated copies.
//
// Regrouped per the "re group the current additional request" request —
// the old wrapper title ("Additional Request") is gone from both call
// sites; these four groups' own subheadings (rendered inside GateFields
// below) are now the only titles. Project Proposal moved OUT of this file's
// grid entirely — it renders right under each caller's own Metadata
// Checklist via the exported GateGrid/PROJECT_PROPOSAL_FIELD, to keep
// checklist-y things separate from request-y things.
//
// Marketing Checklist — things Marketing tracks about the artist/project
// itself. "Profile Artist" relabeled "Artist Info" per the request; ticking
// it "Yes" reveals a URL field for the artist's portfolio link (see
// URL_GATE_FIELDS below) with a hover tooltip.
export const MARKETING_CHECKLIST_FIELDS = [
  ["gate_artist_profile", "Artist Info"],
  ["gate_artist_photo", "Artist Photo"],
];

// Rendered separately, directly under each caller's Metadata Checklist —
// not part of any GateGrid call inside GateFields itself. Exported as its
// own single-field list so both callers can feed it straight into GateGrid.
export const PROJECT_PROPOSAL_FIELD = [["gate_project_proposal", "Project Proposal"]];

// Data Request — Pitching now leads this group (its own "which pitching?"
// picker renders directly under this grid, right below the Pitching field,
// instead of at the very bottom of the whole component like before).
export const DATA_REQUEST_FIELDS = [
  ["gate_pitching", "Pitching"],
  ["gate_co_trong_net_youtube", "Có Trong Net YouTube"],
  ["gate_pre_order", "Pre-order Itunes"],
  ["gate_lyric_musixmatch", "Priority Sync Lyric"],
  ["gate_mv_spotify", "Music Video on Spotify"],
  ["gate_discovery_mode_spotify", "Discovery Mode on Spotify"],
  ["gate_sony_publish", "Sony Publish"],
];

// Marketing Request — down to these two. gate_goi_ho_tro_truyen_thong is
// now read-only (see { readOnly: true } and ReadOnlyGateBadge below):
// it's a continuously-recomputed status, not a manual choice — TBU while
// the release is still in BRIEF & DATA/DEALING, NO once "Chỉ Phát Hành" is
// locked in (until the INT MEDIA follow-up is sent), YES otherwise. See
// the effect in app/releases/[id]/page.js keyed on
// PIPELINE_STAGES/form.project_type/form.int_media_requested. The New
// Release create form has no live project_type yet (every release starts
// in BRIEF & DATA), so it just defaults this to "update" and the detail
// page's effect takes over once a package gets picked.
export const MARKETING_REQUEST_FIELDS = [
  ["gate_goi_ho_tro_truyen_thong", "Gói Hỗ Trợ Truyền Thông", { readOnly: true }],
  ["gate_design", "Design"],
];

// Legal Request — Splitshare moved in here per the regroup (out of Data
// Request); gate_phu_luc_truyen_thong stays read-only for the same reason
// as before (auto-flipped by the effect in app/releases/[id]/page.js the
// moment a release leaves BRIEF & DATA/DEALING with a non-"Chỉ Phát Hành"
// package — hand-picking it here would just get silently overwritten).
export const LEGAL_REQUEST_FIELDS = [
  ["gate_split_share", "Splitshare"],
  ["gate_phu_luc_mg", "Phụ Lục MG"],
  ["gate_phu_luc_publishing", "Phụ Lục Publishing"],
  ["gate_phu_luc_truyen_thong", "Phụ Lục Truyền Thông", { readOnly: true }],
];

// gate_legal_request (the old standalone field, distinct from the "Legal
// Request" GROUP above) is removed per the regroup's explicit "unused and
// remove field" list — dropped from EMPTY_FORM in app/new-release/page.js
// too. gate_data_request (the old standalone "Data Request" field) was
// already not rendered anywhere before this round and stays that way —
// it's a real column, just not a toggle in any group.

// Kept for any code still importing the old flat list.
export const GATE_FIELDS = [
  ...MARKETING_CHECKLIST_FIELDS,
  ...PROJECT_PROPOSAL_FIELD,
  ...DATA_REQUEST_FIELDS,
  ...MARKETING_REQUEST_FIELDS,
  ...LEGAL_REQUEST_FIELDS,
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
  gate_artist_profile: "artist_portfolio_url",
  gate_artist_photo: "artist_photo_url",
  gate_project_proposal: "project_proposal_url",
  gate_pre_order: "link_preorder", // reuses the existing URL field — Pre-order already had its own column
};

// Hover tooltip shown on the field label for a handful of fields where the
// name alone doesn't make it obvious what's being asked for — currently
// just Artist Info's portfolio link, per the explicit "show tooltips" ask.
const FIELD_TOOLTIPS = {
  gate_artist_profile: "Add artist portfolio link",
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

export function GateGrid({ styles, fields, form, update, suppressUrlFor }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
      {fields.map(([key, label, opts]) => {
        const urlField = suppressUrlFor?.includes(key) ? null : URL_GATE_FIELDS[key];
        const tooltip = FIELD_TOOLTIPS[key];
        return (
          <div key={key} className={styles.field} style={{ marginBottom: 0 }}>
            <label className={styles.fieldLabel} title={tooltip}>
              {label}
              {tooltip && <span style={{ color: "var(--text-faint)", fontWeight: 400 }}> ⓘ</span>}
            </label>
            {opts?.readOnly ? (
              <ReadOnlyGateBadge value={form[key]} />
            ) : (
              <GateToggle value={form[key] || "false"} onChange={(v) => update(key, v)} />
            )}
            {urlField && form[key] === "true" && (
              <div style={{ marginTop: 6 }}>
                <UrlField
                  styles={styles}
                  value={form[urlField]}
                  onChange={(v) => update(urlField, v)}
                  rows={2}
                  placeholder={key === "gate_artist_profile" ? "Add artist portfolio link" : undefined}
                />
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

      <div className={styles.subheading}>Data Request</div>
      <GateGrid styles={styles} fields={DATA_REQUEST_FIELDS} form={form} update={update} suppressUrlFor={suppressUrlFor} />

      {/* Pitching detail popup — moved to directly under the Data Request
          grid (Pitching is that grid's first field) instead of the very
          bottom of the whole component, per the regroup request. */}
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

      <div className={styles.subheading}>Marketing Request</div>
      <GateGrid styles={styles} fields={MARKETING_REQUEST_FIELDS} form={form} update={update} suppressUrlFor={suppressUrlFor} />

      <div className={styles.subheading}>Legal Request</div>
      <GateGrid styles={styles} fields={LEGAL_REQUEST_FIELDS} form={form} update={update} suppressUrlFor={suppressUrlFor} />

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
