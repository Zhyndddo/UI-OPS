"use client";

import { useState } from "react";
import Link from "next/link";
import UrlField from "./UrlField";
import { TICKET_ROUTES } from "./teamTypes";
import YoutubeAdsPopupButton from "./YoutubeAdsPopupButton";

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
//
// Round 97 — "Artist Profile Verify" added, as the REAL gate for creating
// Artist Profile ticket(s). "Artist Info" (MARKETING_CHECKLIST_FIELDS,
// above) used to double as both a marketing note field (the portfolio URL
// popup) AND the ticket-creation trigger — per explicit correction, those
// are two different things: Artist Info stays marketing-only (still just
// the portfolio link), and this new field is the one that actually gates
// sending an Artist Profile ticket. Ticking it "Yes" reveals
// ArtistProfileVerifyPanel below the grid, where AR picks which of the
// release's own Main/Feature Artist tags to send a ticket for (one ticket
// per picked artist, not one shared ticket — see saveTab()/performInsert()
// for the create logic).
export const DATA_REQUEST_FIELDS = [
  ["gate_pitching", "Pitching"],
  ["gate_artist_profile_verify", "Artist Profile Verify"],
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
// Round 86 item 4 — "Publishing" added back per explicit request, as a
// genuinely distinct field from "Phụ Lục Publishing" right above (the
// round-72 standalone Publishing ticket type — see
// app/tickets/publishing/page.js — not the earlier gate_publishing that
// was retired for duplicating Phụ Lục Publishing; this is a fresh use of
// that same DB column, now backing a different, real ticket type).
export const LEGAL_REQUEST_FIELDS = [
  ["gate_split_share", "Splitshare"],
  ["gate_phu_luc_mg", "Phụ Lục MG"],
  ["gate_phu_luc_publishing", "Phụ Lục Publishing"],
  ["gate_phu_luc_truyen_thong", "Phụ Lục Truyền Thông", { readOnly: true }],
  ["gate_publishing", "Publishing"],
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

// Round 106 item 5 — merged from the old 5 (priority/spotify/apple/nct/
// zing) down to 4, per explicit request: "Priority" now covers both
// Priority Spotify AND Priority Apple (same template as before, one
// checkbox instead of two), "Spotify Banner" is new, "Spotify S4A" is a
// rename of the old plain "spotify" key (no data-shape change — same
// ticket.data key), and "Domestic" is NCT+Zing merged into a single
// top-level flag (was 2 separate checkboxes here even though the
// Workstation already visually grouped them into one tab — see
// add-round106b-pitching-merge.sql for the ticket.data migration:
// priority = old priority OR old apple; domestic = old nct OR old zing).
// Per explicit confirmation, this top-level picker is ONLY these 4 —
// every deeper mechanic (per-platform status/PIC, the Domestic "Có Gói"
// checklist, the Pitching-only PIC list) lives exclusively in
// app/workstation/pitching/page.js, not here.
export const PITCHING_TYPES = [
  ["priority", "Priority"],
  ["spotifyBanner", "Spotify Banner"],
  ["spotifyS4a", "Spotify S4A"],
  ["domestic", "Domestic"],
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
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, maxWidth: 420, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
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

// Round 173 — shared overlay+box shell, per explicit request to move
// EVERY tick's additional input into a popup (not just Artist Profile
// Verify from round 172), showing only a compact summary of the current
// choices inline under the tick itself. Pulled out of
// ArtistProfileVerifyPopup (round 172's one-off version) so every panel
// below reuses the exact same overlay/positioning/close-button instead of
// re-typing it per field. z-index matches that original: 399 for the
// overlay, 400 for the box.
export function GatePopupShell({ title, onClose, width = 480, children }) {
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
          width: `min(${width}px, calc(100vw - 32px))`,
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
          <div style={{ fontSize: 13, fontWeight: 700, color: "#ff6b1a", textTransform: "uppercase" }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// A tick's inline "current choice(s)" summary line + "Edit →" button,
// shown UNDER the toggle once it's "Yes" — the popup itself only opens on
// click. Every panel below is (summary line, trigger button) + (popup
// content), same split as round 172's Artist Profile Verify.
export function GatePanelTrigger({ styles, summary, onOpen, label = "Edit →" }) {
  return (
    <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{summary}</div>
      <button type="button" className={styles.btnSmall} onClick={onOpen}>{label}</button>
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
// Round 92 — 2 additions, both per explicit request:
//   1. onSend/sent — ticket creation for this gate moved OFF the generic
//      "auto-creates the moment Save succeeds" pattern (still true for
//      every other gate field) onto a real manual button here, same idiom
//      as the page's own "SEND UPLOAD" button — ticking Yes should show
//      something to click, not quietly create a ticket next time Save
//      happens. onSend absent (New Release create form doesn't pass one —
//      that form only submits once, so there's no ongoing "next Save"
//      moment for this button to replace) falls back to no button shown,
//      matching every other optional-prop fallback in this file.
//   2. youtubeAdsUrl/youtubeBookingNote(+onChange*) — the small icon+popup
//      (YoutubeAdsPopupButton) next to this panel's own title, for the
//      YouTube URL Operation/the label returns once set up, and AR's own
//      booking request/note for Marketing. Same 2 fields also show on
//      Booking Board's YouTube Ads column popup and the Media Booking
//      ticket (see YoutubeAdsFields — this popup is just this page's own
//      wrapper around the same shared component).
function CoTrongNetYoutubePanel({ styles, draft, onChange, onSend, sent, youtubeAdsUrl, youtubeBookingNote, onChangeYoutubeAdsUrl, onChangeYoutubeBookingNote, onClose }) {
  const [moTaOpen, setMoTaOpen] = useState(false);
  const d = { ...CO_TRONG_NET_DRAFT_DEFAULTS, ...draft };
  return (
    <GatePopupShell title="Có Trong Net YouTube — Chi Tiết" onClose={onClose} width={520}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 8 }}>
        {onChangeYoutubeAdsUrl && (
          <YoutubeAdsPopupButton
            styles={styles}
            url={youtubeAdsUrl}
            bookingNote={youtubeBookingNote}
            onChangeUrl={onChangeYoutubeAdsUrl}
            onChangeBookingNote={onChangeYoutubeBookingNote}
            label="YouTube Ads — URL & Booking"
          />
        )}
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
      {onSend && (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className={styles.btnSmall}
            disabled={sent}
            onClick={onSend}
            style={sent
              ? { borderColor: "#2e7d32", color: "#81c784", cursor: "default" }
              : { borderColor: "#ff6b1a", color: "#ff9d5c", fontWeight: 800 }}
          >
            {sent ? "✓ YOUTUBE TICKET SENT" : "SET UP YOUTUBE"}
          </button>
        </div>
      )}
    </GatePopupShell>
  );
}

// Compact inline summary of the Có Trong Net YouTube draft, shown under
// the tick instead of the panel itself.
function coTrongNetSummary(draft) {
  const d = { ...CO_TRONG_NET_DRAFT_DEFAULTS, ...draft };
  const parts = [];
  if (d.teaser) parts.push(`Teaser ${d.teaser.replace("T", " ")}`);
  if (d.official) parts.push(`Official ${d.official.replace("T", " ")}`);
  if (d.shortFrom || d.shortTo) parts.push(`Short ${d.shortFrom || "?"} → ${d.shortTo || "?"}`);
  if (d.moTa) parts.push("Mô Tả set");
  return parts.length > 0 ? parts.join(" · ") : "Nothing filled in yet.";
}

// Round 97 — Artist Profile Verify's own panel, same "background card
// under the grid" idiom as the two above. Lists this release's own Main +
// Feature Artist tags (deduped) as checkboxes — AR picks which artist(s)
// to actually send an Artist Profile ticket for, since a ticket is
// shaped around ONE artist (Tên Nghệ Sĩ/Email/Spotify.../etc.), not the
// whole release. An artist that already has a ticket for this release
// shows a "✓ ticket already sent" badge and its checkbox is locked on
// (can't un-request something already sent from here — that's now the
// ticket's own job on /tickets/artist-profile). The Spotify/Tiktok/Apple
// "set up on" picker is unchanged from before, just moved under this
// panel — it applies to whichever NEW ticket(s) get created on Save/
// Create, same shared draft as before.
//
// artistTags/selected/onToggleArtist/existingByArtist are all owned by the
// caller (release detail page's state, or New Release's local state) —
// this component only renders against them, same pattern as every other
// panel in this file.
// Round 172 — was always-inline; per explicit request this collapses into a
// popup (trigger button lives where the panel used to render, see
// <GateFields>'s own state further down) so the release detail page reads
// as one screen instead of an ever-growing scroll of sections, and so it's
// usable on mobile without a wall of checkboxes always taking up space. The
// body/logic is UNCHANGED — same checkbox list, same "existing ticket sent"
// disabled state, same platform picker — only the always-visible wrapper
// became an overlay+box (same convention as lib/ArtistDetailPopup.js:
// fixed overlay z-index 399, centered box z-index 400).
function ArtistProfileVerifyPopup({ styles, artistTags, selected, onToggleArtist, platformTypes, onPlatformToggle, existingByArtist, onClose }) {
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
          width: "min(480px, calc(100vw - 32px))",
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
          <div style={{ fontSize: 13, fontWeight: 700, color: "#ff6b1a", textTransform: "uppercase" }}>Artist Profile Verify</div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {artistTags.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
            No Main/Feature Artist tags on this release yet — add at least one artist tag above (Main Artist / Feature Artist) before picking who to send an Artist Profile ticket for.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", marginBottom: 8, textTransform: "uppercase" }}>
              Send Artist Profile ticket for which artist(s)?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              {artistTags.map((name) => {
                const existing = existingByArtist?.[name];
                return (
                  <label key={name} className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={!!existing || selected.includes(name)}
                      disabled={!!existing}
                      onChange={(e) => onToggleArtist(name, e.target.checked)}
                    />
                    {name}
                    {existing && <span style={{ marginLeft: 8, fontSize: 10, color: "#7ee6a8", fontWeight: 700 }}>✓ ticket already sent</span>}
                  </label>
                );
              })}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
              Set up on which platforms?
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {ARTIST_PROFILE_PLATFORMS.map(([key, label]) => (
                <label key={key} className={styles.checkboxRow}>
                  <input type="checkbox" checked={!!platformTypes?.[key]} onChange={(e) => onPlatformToggle(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 10, marginBottom: 0 }}>
              Ticket(s) for the checked artist(s) above send the moment you hit Save/Create — the platforms picked here apply to whichever ones don't already have a ticket.
            </p>
          </>
        )}
      </div>
    </>
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

// Round 86 item 4 — same "ticking Yes reveals an inline field" idiom as
// URL_GATE_FIELDS above, but a plain text value instead of a URL. Publishing's
// real ticket (app/tickets/publishing/new/page.js) requires "Giá Trị
// Publishing" — a value the generic blank-ticket auto-create pattern every
// other Legal Request field uses has nowhere to collect. This field lets
// AR fill that value in right here; once it's non-blank, Save auto-creates
// the real Publishing ticket carrying it (see the bespoke block in
// app/releases/[id]/page.js's saveTab(), mirroring gate_sony_publish's
// "loop until ready" gating) — until then, ticking "Yes" alone just saves
// the flag with no ticket, same as before a value is supplied.
const TEXT_GATE_FIELDS = {
  gate_publishing: { field: "publishing_gia_tri", label: "Giá Trị Publishing" },
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
  // Round 86 item 4 — Publishing (round-72 standalone type, distinct from
  // Phụ Lục Publishing right above). Unlike every other entry here,
  // Publishing tickets are matched by data.releaseId === the release's own
  // id (its real UUID/PK), NOT its did — see app/tickets/publishing/
  // page.js. Also excluded from the generic auto-create-on-Save loop
  // (same exclusion mechanism as gate_sony_publish) since its real ticket
  // requires a "Giá Trị Publishing" value the generic blank-ticket pattern
  // has no field for — see TEXT_GATE_FIELDS above and the bespoke
  // publishingReady block in app/releases/[id]/page.js's saveTab().
  gate_publishing: "publishing",
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
  if (gateKey === "gate_publishing") {
    return (
      <p style={{ color: "var(--warn-fg)", fontSize: 11, marginTop: 6, marginBottom: 0 }}>
        ⚠ Fill in Giá Trị Publishing above, then Save to send.
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
  // Round 92 — also not "sends on Save" anymore, per explicit request:
  // Có Trong Net YouTube's panel (CoTrongNetYoutubePanel, rendered right
  // below this grid) now has its own real "SET UP YOUTUBE" button instead.
  // Silent here (rather than a second, now-inaccurate hint) since that
  // panel already covers it.
  if (gateKey === "gate_co_trong_net_youtube") {
    return null;
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

// Round 173 — URL/text gate fields used to reveal their input inline the
// moment the tick went "Yes." Per explicit request ("every tick... that
// has additional input... live in a popup, show the current choices under
// the tick"), that input now lives behind a popup — `openField` tracks
// which single field's popup is open (fields are rendered as a grid of
// independent toggles, so only one popup at a time makes sense here, same
// as every other panel in this file).
function urlGateSummary(value) {
  if (!value) return "No URL yet.";
  return value.length > 46 ? `${value.slice(0, 46)}…` : value;
}

export function GateGrid({ styles, fields, form, update, suppressUrlFor, ticketMap, sonyPublishMetaReady }) {
  const [openField, setOpenField] = useState(null);
  const openUrlField = openField && !suppressUrlFor?.includes(openField) ? URL_GATE_FIELDS[openField] : null;
  const openTextField = openField ? TEXT_GATE_FIELDS[openField] : null;
  const openLabel = openField && fields.find((f) => f[0] === openField)?.[1];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
      {fields.map(([key, label, opts]) => {
        const urlField = suppressUrlFor?.includes(key) ? null : URL_GATE_FIELDS[key];
        const textField = TEXT_GATE_FIELDS[key];
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
              <GatePanelTrigger styles={styles} summary={urlGateSummary(form[urlField])} onOpen={() => setOpenField(key)} label={form[urlField] ? "Edit →" : "+ Add URL"} />
            )}
            {textField && form[key] === "true" && (
              <GatePanelTrigger styles={styles} summary={form[textField.field] || "Not set yet."} onOpen={() => setOpenField(key)} label={form[textField.field] ? "Edit →" : `+ ${textField.label}`} />
            )}
            {form[key] === "true" && (
              <GateTicketLink styles={styles} gateKey={key} ticketMap={ticketMap} sonyPublishMetaReady={sonyPublishMetaReady} />
            )}
          </div>
        );
      })}

      {openUrlField && (
        <GatePopupShell title={openLabel} onClose={() => setOpenField(null)} width={440}>
          <UrlField
            styles={styles}
            value={form[openUrlField]}
            onChange={(v) => update(openUrlField, v)}
            rows={3}
            placeholder={openField === "gate_artist_profile" ? "Add artist portfolio link" : undefined}
          />
        </GatePopupShell>
      )}

      {openTextField && (
        <GatePopupShell title={openLabel} onClose={() => setOpenField(null)} width={440}>
          <input
            className={styles.input}
            style={{ width: "100%", boxSizing: "border-box" }}
            autoFocus
            value={form[openTextField.field] || ""}
            onChange={(e) => update(openTextField.field, e.target.value)}
            placeholder={openTextField.label}
          />
        </GatePopupShell>
      )}
    </div>
  );
}

// Tri-state gate fields — Yes (do it) / No (don't need to) / TBU (to be
// updated later). pitchingTypes/onPitchingToggle are only passed
// where a picker makes sense (create form: local state, saved on submit;
// detail page: the real ticket, saved immediately per checkbox) — when
// absent, ticking Pitching "Yes" just cross-links to the Pitching ticket
// instead of showing a picker.
export function GateFields({ styles, form, update, pitchingTypes, onPitchingToggle, suppressUrlFor, pitchingInfoTicket, onSendPitchingInfoTicket, ticketMap, sonyPublishMetaReady, artistProfileTypes, onArtistProfileToggle, artistProfileArtistTags, artistProfileSelected, onToggleArtistProfileArtist, artistProfileExistingByArtist, coTrongNetDraft, onCoTrongNetChange, onSendCoTrongNetYoutube, coTrongNetSent, youtubeAdsUrl, youtubeBookingNote, onChangeYoutubeAdsUrl, onChangeYoutubeBookingNote, publishingHdLocked }) {
  // Round 172 — trigger state for the Artist Profile Verify popup (see
  // ArtistProfileVerifyPopup above). Round 173 — same treatment extended
  // to every other tick with additional input: Pitching, Có Trong Net
  // YouTube, Design (Thể Loại), Split Share.
  const [showArtistProfilePopup, setShowArtistProfilePopup] = useState(false);
  const [showPitchingPopup, setShowPitchingPopup] = useState(false);
  const [showCoTrongNetPopup, setShowCoTrongNetPopup] = useState(false);
  const [showDesignPopup, setShowDesignPopup] = useState(false);
  const [showSplitSharePopup, setShowSplitSharePopup] = useState(false);
  const entries = form.split_share_entries || [];
  const designTypes = form.design_content_types || [];

  // Round 87 item 6 — once this release's label has its Hợp Đồng
  // Publishing done, Phụ Lục Publishing is no longer needed (the
  // label-level contract already covers every future product, no
  // per-release addendum required) — force it read-only here the same way
  // gate_phu_luc_truyen_thong already is above, instead of touching
  // LEGAL_REQUEST_FIELDS itself (that flag is static; this one depends on
  // the release's own label). The caller is responsible for also forcing
  // form.gate_phu_luc_publishing to "false" — this only controls display.
  const legalRequestFields = publishingHdLocked
    ? LEGAL_REQUEST_FIELDS.map((f) => (f[0] === "gate_phu_luc_publishing" ? [f[0], f[1], { ...(f[2] || {}), readOnly: true }] : f))
    : LEGAL_REQUEST_FIELDS;

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
          <>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
                {PITCHING_TYPES.filter(([key]) => pitchingTypes?.[key]).map(([, label]) => label).join(", ") || "None picked yet."}
              </div>
              <button type="button" className={styles.btnSmall} onClick={() => setShowPitchingPopup(true)}>
                Which pitching? →
              </button>
            </div>
            {showPitchingPopup && (
              <GatePopupShell title="Which pitching?" onClose={() => setShowPitchingPopup(false)} width={440}>
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
              </GatePopupShell>
            )}
          </>
        ) : (
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginBottom: 12 }}>
            Pitching detail (priority, Spotify/NCT/Zing) is on the Pitching ticket for this release.
          </p>
        )
      )}

      {/* Round 97 — replaces the old gate_artist_profile-gated platform
          picker. Artist Profile Verify is now the real ticket-creation
          gate (Artist Info/gate_artist_profile is marketing-only from
          here on — just the portfolio URL popup). onToggleArtistProfileArtist
          absent falls back to no panel shown, matching every other
          optional-prop fallback in this file (e.g. onArtistProfileToggle
          used to, onCoTrongNetChange still does). */}
      {form.gate_artist_profile_verify === "true" && onToggleArtistProfileArtist && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
            {(artistProfileArtistTags || []).length === 0
              ? "No Main/Feature Artist tags yet — add one above first."
              : (artistProfileSelected || []).length > 0
              ? `${(artistProfileSelected || []).length} artist(s) selected for Artist Profile ticket(s).`
              : "Pick which artist(s) to send an Artist Profile ticket for."}
          </div>
          <button type="button" className={styles.btnSmall} onClick={() => setShowArtistProfilePopup(true)}>
            Artist Profile Verify →
          </button>
        </div>
      )}
      {showArtistProfilePopup && onToggleArtistProfileArtist && (
        <ArtistProfileVerifyPopup
          styles={styles}
          artistTags={artistProfileArtistTags || []}
          selected={artistProfileSelected || []}
          onToggleArtist={onToggleArtistProfileArtist}
          platformTypes={artistProfileTypes}
          onPlatformToggle={onArtistProfileToggle}
          existingByArtist={artistProfileExistingByArtist}
          onClose={() => setShowArtistProfilePopup(false)}
        />
      )}

      {/* Có Trong Net YouTube's own panel — same placement idiom as
          Pitching's/Artist Profile's blocks above, right after the Data
          Request grid since it's also one of that grid's fields.
          onCoTrongNetChange absent (no caller passing it yet) falls back
          to no panel shown, matching the other optional-prop fallbacks. */}
      {form.gate_co_trong_net_youtube === "true" && onCoTrongNetChange && (
        <>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{coTrongNetSummary(coTrongNetDraft)}</div>
            <button type="button" className={styles.btnSmall} onClick={() => setShowCoTrongNetPopup(true)}>
              Có Trong Net YouTube — Chi Tiết →
            </button>
          </div>
          {showCoTrongNetPopup && (
            <CoTrongNetYoutubePanel
              styles={styles}
              draft={coTrongNetDraft}
              onChange={onCoTrongNetChange}
              onSend={onSendCoTrongNetYoutube}
              sent={coTrongNetSent}
              youtubeAdsUrl={youtubeAdsUrl}
              youtubeBookingNote={youtubeBookingNote}
              onChangeYoutubeAdsUrl={onChangeYoutubeAdsUrl}
              onChangeYoutubeBookingNote={onChangeYoutubeBookingNote}
              onClose={() => setShowCoTrongNetPopup(false)}
            />
          )}
        </>
      )}

      <div className={styles.subheading}>Marketing Request</div>
      <GateGrid styles={styles} fields={MARKETING_REQUEST_FIELDS} form={form} update={update} suppressUrlFor={suppressUrlFor} ticketMap={ticketMap} />

      <div className={styles.subheading}>Legal Request</div>
      <GateGrid styles={styles} fields={legalRequestFields} form={form} update={update} suppressUrlFor={suppressUrlFor} ticketMap={ticketMap} />

      {form.gate_design === "true" && (
        <>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{designTypes.length > 0 ? designTypes.join(", ") : "None picked yet."}</div>
            <button type="button" className={styles.btnSmall} onClick={() => setShowDesignPopup(true)}>Thể Loại →</button>
          </div>
          {showDesignPopup && (
            <GatePopupShell title="Thể Loại" onClose={() => setShowDesignPopup(false)} width={380}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {DESIGN_CONTENT_TYPES.map((t) => (
                  <label key={t} className={styles.checkboxRow}>
                    <input type="checkbox" checked={designTypes.includes(t)} onChange={() => toggleDesignType(t)} />
                    {t}
                  </label>
                ))}
              </div>
            </GatePopupShell>
          )}
        </>
      )}

      {form.gate_split_share === "true" && (
        <>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
              {entries.length === 0
                ? "No entries yet."
                : entries.map((e) => `${e.shared_label || "—"} (${e.percentage || "?"}%)`).join(", ")}
            </div>
            <button type="button" className={styles.btnSmall} onClick={() => setShowSplitSharePopup(true)}>Split Share →</button>
          </div>
          {showSplitSharePopup && (
            <GatePopupShell title="Split Share" onClose={() => setShowSplitSharePopup(false)} width={560}>
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
            </GatePopupShell>
          )}
        </>
      )}

      <p style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 12 }}>
        Ticking any field here is meant to add a line to the Tasklist tab — not wired up yet.
      </p>
    </div>
  );
}
