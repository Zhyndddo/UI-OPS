"use client";

import { useState } from "react";
import Link from "next/link";
import UrlField from "./UrlField";
import { TICKET_ROUTES } from "./teamTypes";

// Shared by the New Release create form and the release detail page, so
// the tri-state Additional Flags don't live in two duplicated copies.
//
// Regrouped per the "re group the current additional request" request —
// the old wrapper title ("Additional Request") is gone from both call
// sites; these four groups' own subheadings are now the only titles.
// Marketing Checklist (including Project Proposal — see below) is rendered
// by each CALLER directly under its own Metadata Checklist section, not
// inside <GateFields> itself, per explicit follow-up feedback: the whole
// group belongs next to Metadata Checklist, not split with Project
// Proposal alone up there and Artist Info/Artist Photo left in the request
// section further down. <GateFields> itself starts with Data Request.
//
// Marketing Checklist — things Marketing tracks about the artist/project
// itself. "Profile Artist" relabeled "Artist Info" per the request; ticking
// it "Yes" reveals a URL field for the artist's portfolio link (see
// URL_GATE_FIELDS below) with a hover tooltip.
export const MARKETING_CHECKLIST_FIELDS = [
  ["gate_artist_profile", "Artist Info"],
  ["gate_artist_photo", "Artist Photo"],
  ["gate_project_proposal", "Project Proposal"],
];

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

// Marketing Request — down to these two, Design first per follow-up
// feedback (order swap — no logic change). gate_goi_ho_tro_truyen_thong is
// read-only (see { readOnly: true } and ReadOnlyGateBadge below): it's a
// continuously-recomputed status, not a manual choice — TBU while the
// release is still in BRIEF & DATA/DEALING, NO once "Chỉ Phát Hành" is
// locked in (until the INT MEDIA follow-up is sent), YES otherwise. See
// the effect in app/releases/[id]/page.js keyed on
// PIPELINE_STAGES/form.project_type/form.int_media_requested. The New
// Release create form has no live project_type yet (every release starts
// in BRIEF & DATA), so it just defaults this to "update" and the detail
// page's effect takes over once a package gets picked.
export const MARKETING_REQUEST_FIELDS = [
  ["gate_design", "Design"],
  ["gate_goi_ho_tro_truyen_thong", "Gói Hỗ Trợ Truyền Thông", { readOnly: true }],
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
  ...DATA_REQUEST_FIELDS,
  ...MARKETING_REQUEST_FIELDS,
  ...LEGAL_REQUEST_FIELDS,
];

const GATE_OPTIONS = ["false", "true", "update"];
const GATE_LABELS = { false: "No", true: "Yes", update: "TBU" };

export const PITCHING_TYPES = [
  ["priority", "Priority"],
  ["spotify", "Spotify"],
  ["apple", "Apple"],
  ["nct", "NCT"],
  ["zing", "Zing"],
];

// Which platforms the Artist Profile ticket needs set up on — "show to
// pick like the pitching field" per explicit request, same checkbox-
// group idiom as PITCHING_TYPES above.
export const ARTIST_PROFILE_PLATFORMS = [
  ["spotify", "Spotify"],
  ["tiktok", "Tiktok"],
  ["apple", "Apple"],
];

// Có Trong Net YouTube's own draft shape — Teaser/Official are a single
// date+time each, Short is a PERIOD (from -> to, date-only, no time) per
// explicit spec, and Mô Tả is free text collected via a small popup (see
// MoTaPopup below) instead of a cramped inline box. Shared by the release
// detail page, the New Release create form, and the bespoke ticket list/
// new pages so the shape never drifts between the four places that read
// or write it.
export const CO_TRONG_NET_DRAFT_DEFAULTS = { teaser: "", official: "", shortFrom: "", shortTo: "", moTa: "" };

// Discovery Mode on Spotify's clip status — single-choice per explicit
// spec ("No clip, Clip uploaded, Clip published"). Exported so the
// bespoke ticket list page (app/tickets/discovery-mode-spotify/page.js)
// uses the exact same option set.
export const DISCOVERY_CLIP_STATUS_OPTIONS = ["No clip", "Clip uploaded", "Clip published"];

// Small reusable "click a button, edit one textarea in a popup" idiom —
// used for Có Trong Net YouTube's Mô Tả per its own explicit spec ("or
// better yet, just add the button Mô tả; click it will open a popup panel
// with only the text box"). Generic enough that the bespoke ticket list/
// new pages reuse it too instead of a second copy.
export function MoTaPopup({ value, onChange, onClose, title = "Mô Tả" }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, width: 420, maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <textarea
          autoFocus
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          style={{ width: "100%", boxSizing: "border-box", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: 10, fontSize: 13, color: "var(--text)", resize: "vertical" }}
        />
      </div>
    </div>
  );
}

// Có Trong Net YouTube's detail panel — same "background card under the
// grid" idiom as Pitching's "Which pitching?" / Artist Profile's platform
// picker above, shown once its gate field is "Yes". draft/onChange follow
// the same (key, value) update signature as onArtistProfileToggle — the
// caller owns the draft state (release detail page's coTrongNetDraft /
// New Release's own local state), this component just renders inputs
// against it.
function CoTrongNetYoutubePanel({ styles, draft, onChange }) {
  const [moTaOpen, setMoTaOpen] = useState(false);
  const d = { ...CO_TRONG_NET_DRAFT_DEFAULTS, ...draft };
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", marginBottom: 8, textTransform: "uppercase" }}>
        Có Trong Net YouTube — Chi Tiết
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 10 }}>
        <div className={styles.field} style={{ marginBottom: 0 }}>
          <label className={styles.fieldLabel}>Teaser</label>
          <input type="datetime-local" className={styles.input} value={d.teaser} onChange={(e) => onChange("teaser", e.target.value)} />
        </div>
        <div className={styles.field} style={{ marginBottom: 0 }}>
          <label className={styles.fieldLabel}>Official</label>
          <input type="datetime-local" className={styles.input} value={d.official} onChange={(e) => onChange("official", e.target.value)} />
        </div>
        <div className={styles.field} style={{ marginBottom: 0 }}>
          <label className={styles.fieldLabel}>Short — Từ Ngày</label>
          <input type="date" className={styles.input} value={d.shortFrom} onChange={(e) => onChange("shortFrom", e.target.value)} />
        </div>
        <div className={styles.field} style={{ marginBottom: 0 }}>
          <label className={styles.fieldLabel}>Short — Đến Ngày</label>
          <input type="date" className={styles.input} value={d.shortTo} onChange={(e) => onChange("shortTo", e.target.value)} />
        </div>
      </div>
      <button type="button" className={styles.btnSmall} onClick={() => setMoTaOpen(true)}>
        {d.moTa ? "✓ Mô Tả (edit)" : "+ Mô Tả"}
      </button>
      {moTaOpen && (
        <MoTaPopup value={d.moTa} onChange={(v) => onChange("moTa", v)} onClose={() => setMoTaOpen(false)} />
      )}
    </div>
  );
}

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

// Which gate fields have a related ticket type (lib/ticketConfigs.js) —
// per the "every request tick gets a related ticket" wave. gate_pitching
// is deliberately NOT here: it already gets its own richer "Which
// pitching?" picker block below the grid (see GateFields below), which now
// also links out to the dedicated /tickets/pitching list. gate_design and
// gate_goi_ho_tro_truyen_thong are also excluded — those already have
// their own established ticket flows (Design ticket, Media Booking +
// magic-link), no action needed there per explicit instruction.
export const GATE_TICKET_TYPES = {
  gate_co_trong_net_youtube: "co_trong_net_youtube",
  gate_pre_order: "pre_order_itunes",
  gate_lyric_musixmatch: "priority_sync_lyric",
  gate_mv_spotify: "mv_spotify",
  gate_discovery_mode_spotify: "discovery_mode_spotify",
  gate_sony_publish: "sony_publish",
  gate_split_share: "split_share",
  gate_phu_luc_mg: "phu_luc_mg",
  gate_phu_luc_publishing: "phu_luc_publishing",
  // Points at the existing "phu_luc" ticket type, NOT a separate
  // "phu_luc_truyen_thong" type — per explicit correction, that was never
  // a real distinct thing, it IS Phụ Lục (just relabeled "Phụ Lục Truyền
  // Thông" for clarity — see TICKET_TYPE_LABELS.phu_luc). This key is
  // used for DISPLAY only (does an existing phu_luc ticket exist? -> show
  // the green "Ticket Sent" link) — deliberately excluded from the
  // generic auto-create-on-Save loop in app/releases/[id]/page.js
  // (same exclusion as gate_sony_publish, different reason): Phụ Lục
  // tickets are created by the pick-package magic-link flow with real
  // required data (Giá Trị Phụ Lục etc.), and this gate field auto-flips
  // "Yes" the moment a package is picked — auto-creating a second, empty
  // placeholder phu_luc ticket alongside the real one would be wrong.
  gate_phu_luc_truyen_thong: "phu_luc",
};

// Display-only status for a mapped gate field once it's "Yes" — mirrors
// the Pitching field's "Send Ticket to Collect Info" button idiom, but
// this one never triggers a write itself. ticketMap is keyed by ticket
// type key (not gate field key) -> the existing ticket row for this
// release, or undefined if none exists yet. ticketMap is optional — the
// New Release create form (no release/DID to attach a ticket to yet)
// passes none, so this renders nothing there.
//
// The actual ticket creation is folded into Save (see saveTab() in
// app/releases/[id]/page.js) — every gate field that's "Yes" gets its
// ticket created (if missing) the moment the release write succeeds, so
// there's no separate manual click here to fall out of sync with an
// unsaved field. Before the first save after ticking "Yes", this shows a
// small "sends on Save" hint instead of a clickable button.
//
// gate_sony_publish is the one exception — it also needs the 4 required
// Metadata Checklist items (Audio/Artwork/Lyric/Metadata doc) filled in
// before it'll actually send on Save (see saveTab()'s sonyPublishReady
// gate), so instead of the generic hint it shows a warning until
// sonyPublishMetaReady is true — same "loops until ready" idea, just
// surfaced so it's obvious why nothing sent yet.
function GateTicketLink({ styles, gateKey, ticketMap, sonyPublishMetaReady }) {
  const ticketType = GATE_TICKET_TYPES[gateKey];
  if (!ticketType || !ticketMap) return null;
  const ticket = ticketMap?.[ticketType];
  if (ticket) {
    return (
      <Link
        href={TICKET_ROUTES[ticketType]}
        className={styles.btnSmall}
        style={{ marginTop: 6, display: "inline-block", borderColor: "#2e7d32", color: "#81c784" }}
      >
        ✓ Ticket Sent — View
      </Link>
    );
  }
  if (gateKey === "gate_sony_publish" && !sonyPublishMetaReady) {
    return (
      <p style={{ color: "var(--warn-fg)", fontSize: 11, marginTop: 6, marginBottom: 0 }}>
        ⚠ Not enough data to upload yet — fill in Audio/Artwork/Lyric/Metadata doc, then Save to send.
      </p>
    );
  }
  // Not "sends on Save" — this one is created by the pick-package
  // magic-link flow, not by Save on this page (see GATE_TICKET_TYPES'
  // comment above).
  if (gateKey === "gate_phu_luc_truyen_thong") {
    return (
      <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 6, marginBottom: 0 }}>
        Sends automatically once the artist locks in a package
      </p>
    );
  }
  return (
    <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 6, marginBottom: 0 }}>
      Ticket sends on Save
    </p>
  );
}

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

export function GateGrid({ styles, fields, form, update, suppressUrlFor, ticketMap, sonyPublishMetaReady }) {
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
            {form[key] === "true" && (
              <GateTicketLink styles={styles} gateKey={key} ticketMap={ticketMap} sonyPublishMetaReady={sonyPublishMetaReady} />
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
export function GateFields({ styles, form, update, pitchingTypes, onPitchingToggle, suppressUrlFor, pitchingInfoTicket, onSendPitchingInfoTicket, ticketMap, sonyPublishMetaReady, artistProfileTypes, onArtistProfileToggle, coTrongNetDraft, onCoTrongNetChange }) {
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
      {/* Marketing Checklist (Artist Info/Artist Photo/Project Proposal)
          is NOT rendered here — each caller renders it directly under its
          own Metadata Checklist section instead, per follow-up feedback. */}
      <div className={styles.subheading} style={{ marginTop: 0 }}>Data Request</div>
      <GateGrid styles={styles} fields={DATA_REQUEST_FIELDS} form={form} update={update} suppressUrlFor={suppressUrlFor} ticketMap={ticketMap} sonyPublishMetaReady={sonyPublishMetaReady} />

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
            {/* "Move Pitching to the ticket system" per explicit request —
                overall status + PIC now live on a dedicated ticket list
                page instead of nowhere. */}
            <div style={{ marginTop: 10 }}>
              <Link href={TICKET_ROUTES.pitching} className={styles.btnSmall}>
                View Pitching Ticket (Status/PIC)
              </Link>
            </div>
          </div>
        ) : (
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginBottom: 12 }}>
            Pitching detail (priority, Spotify/NCT/Zing) is on the Pitching ticket for this release.
          </p>
        )
      )}

      {/* Artist Profile's Spotify/Tiktok/Apple platform picker — "show to
          pick like the pitching field" per explicit request, right after
          Pitching's own block since Artist Profile is also in the Data
          Request grid above. onArtistProfileToggle absent (New Release
          create form doesn't pass it before this round) falls back to no
          picker shown at all, matching Pitching's own onPitchingToggle
          fallback. */}
      {form.gate_artist_profile === "true" && onArtistProfileToggle && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", marginBottom: 8, textTransform: "uppercase" }}>
            Set up on which platforms?
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {ARTIST_PROFILE_PLATFORMS.map(([key, label]) => (
              <label key={key} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={!!artistProfileTypes?.[key]}
                  onChange={(e) => onArtistProfileToggle(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Có Trong Net YouTube's own panel — same placement idiom as
          Pitching's/Artist Profile's blocks above, right after the Data
          Request grid since it's also one of that grid's fields.
          onCoTrongNetChange absent (no caller passing it yet) falls back
          to no panel shown, matching the other optional-prop fallbacks. */}
      {form.gate_co_trong_net_youtube === "true" && onCoTrongNetChange && (
        <CoTrongNetYoutubePanel styles={styles} draft={coTrongNetDraft} onChange={onCoTrongNetChange} />
      )}

      <div className={styles.subheading}>Marketing Request</div>
      <GateGrid styles={styles} fields={MARKETING_REQUEST_FIELDS} form={form} update={update} suppressUrlFor={suppressUrlFor} ticketMap={ticketMap} />

      <div className={styles.subheading}>Legal Request</div>
      <GateGrid styles={styles} fields={LEGAL_REQUEST_FIELDS} form={form} update={update} suppressUrlFor={suppressUrlFor} ticketMap={ticketMap} />

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
