"use client";

// Round 414 — rework of the release detail page's "Artist Profile Verify"
// popup, per explicit spec. Replaces the old version (previously inline in
// lib/GateFields.js as a private ArtistProfileVerifyPopup function): one
// flat artist checklist + one shared "set up on which platforms" draft
// applied to every checked artist at once. That's gone — every artist now
// gets their own small form, and platform is a per-artist multi-select.
//
// Shell: a "card picker" — click a card, it becomes the main panel; the
// other card minimizes to a small tab on the left, click it to switch
// back. Two cards:
//   1. Artist Verification — two collapsible sections (collapsed by
//      default): a. Verification, b. NEW Profile. Under each, one row per
//      artist tag on this release that does NOT already have a ticket of
//      that EXACT request type (hidden entirely once one exists — not
//      shown-and-disabled like before, since "only artist profile that
//      hasn't had a ticket of same type yet can show up here"). Each row
//      is its own mini-form: platforms (multiple choice, scoped to what
//      that type allows) + that type's own fields.
//   2. Profile Management — NOT built this round (Phase 2: the 5
//      management actions need their own per-platform repeating-field
//      widgets, a real Add Song gate, and a hard-block merge name-match
//      rule — all confirmed but not yet built, see
//      claude/artist-profile-open-items.md). Placeholder card so the
//      shell/switcher is ready for it.
//
// State ownership: this component is a pure renderer over `draft` (owned
// by the caller — app/releases/[id]/page.js or app/new-release/page.js,
// same split every other gate-triggered draft on this page already uses).
// Nothing here talks to Supabase directly; actual ticket creation still
// happens at the page's own Save/Create time, same as before — this popup
// only decides WHAT would be created.

import { useState } from "react";
import {
  ARTIST_VERIFY_CARD_TYPES,
  REQUEST_TYPES,
  requestTypeLabel,
  fieldsForType,
  platformOptionsForType,
  emptyArtistVerifyDraftRow,
  artistVerifyKey,
  YOUTUBE_PLATFORM_NOTE,
  ALL_PLATFORMS,
  validateManagementFields,
} from "./artistProfileRequestTypes";
import ArtistProfileFieldGroup from "./ArtistProfileFieldGroup";

const CARDS = [
  { key: "verification", label: "Artist Verification" },
  { key: "management", label: "Profile Management" },
];

export default function ArtistProfileVerifyPopup({
  styles,
  artistTags,
  draft,
  onDraftChange,
  existingKeys,
  managementPlatforms,
  onManagementPlatformsChange,
  managementDraft,
  onManagementDraftChange,
  onClose,
}) {
  const [activeCard, setActiveCard] = useState("verification");

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
          width: "min(760px, calc(100vw - 32px))",
          maxHeight: "85vh",
          overflow: "hidden",
          background: "var(--bg-card)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
          display: "flex",
        }}
      >
        {/* Left tab strip — only the card(s) NOT currently open show up
            here, per "the other card will minimize to a tab on the left
            side... click to switch between." */}
        <div style={{ width: 40, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16, gap: 8, background: "var(--bg)" }}>
          {CARDS.filter((c) => c.key !== activeCard).map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveCard(c.key)}
              title={c.label}
              style={{
                writingMode: "vertical-rl",
                textOrientation: "mixed",
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "10px 6px",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-faint)",
                cursor: "pointer",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0, padding: 20, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ff6b1a", textTransform: "uppercase" }}>
              {CARDS.find((c) => c.key === activeCard)?.label}
            </div>
            <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>
              ×
            </button>
          </div>

          {activeCard === "verification" ? (
            <ArtistVerificationCard styles={styles} artistTags={artistTags} draft={draft} onDraftChange={onDraftChange} existingKeys={existingKeys} />
          ) : (
            <ProfileManagementCard
              styles={styles}
              platforms={managementPlatforms}
              onPlatformsChange={onManagementPlatformsChange}
              draft={managementDraft}
              onDraftChange={onManagementDraftChange}
            />
          )}
        </div>
      </div>
    </>
  );
}

function ArtistVerificationCard({ styles, artistTags, draft, onDraftChange, existingKeys }) {
  if (artistTags.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
        No Main/Feature Artist tags on this release yet — add at least one artist tag above before sending Artist Profile tickets.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {ARTIST_VERIFY_CARD_TYPES.map((type) => (
        <CollapsibleSection key={type} title={requestTypeLabel(type)}>
          <ArtistTypeList styles={styles} type={type} artistTags={artistTags} draft={draft} onDraftChange={onDraftChange} existingKeys={existingKeys} />
        </CollapsibleSection>
      ))}
    </div>
  );
}

// "each tab is collapsable, collapse at default" — both Verification and
// NEW Profile start closed; opening one doesn't close the other, they're
// independent (unlike the card switcher above, which is one-at-a-time).
function CollapsibleSection({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", textAlign: "left", background: "var(--bg)", border: "none", padding: "10px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <span>{title}</span>
        <span style={{ color: "var(--text-faint)" }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div style={{ padding: 12 }}>{children}</div>}
    </div>
  );
}

function ArtistTypeList({ styles, type, artistTags, draft, onDraftChange, existingKeys }) {
  const eligible = artistTags.filter((name) => !existingKeys.has(artistVerifyKey(name, type)));
  const skipped = artistTags.length - eligible.length;
  if (eligible.length === 0) {
    return <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Every artist tag on this release already has a {requestTypeLabel(type)} ticket.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {skipped > 0 && (
        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
          {skipped} artist(s) already have a {requestTypeLabel(type)} ticket — not shown here.
        </div>
      )}
      {eligible.map((name) => (
        <ArtistRow key={name} styles={styles} type={type} name={name} row={draft?.[type]?.[name] || emptyArtistVerifyDraftRow(type)} onDraftChange={onDraftChange} />
      ))}
    </div>
  );
}

function ArtistRow({ styles, type, name, row, onDraftChange }) {
  const platformOptions = platformOptionsForType(type);
  const fields = fieldsForType(type).filter((f) => f.key !== "artistName");

  function togglePlatform(key, checked) {
    const next = checked ? [...new Set([...(row.platforms || []), key])] : (row.platforms || []).filter((k) => k !== key);
    onDraftChange(type, name, { platforms: next });
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10 }}>
      <label className={styles.checkboxRow} style={{ fontWeight: 700 }}>
        <input type="checkbox" checked={!!row.checked} onChange={(e) => onDraftChange(type, name, { checked: e.target.checked })} />
        {name}
      </label>

      {row.checked && (
        <div style={{ marginTop: 8, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 4 }}>Platform</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {platformOptions.map(([key, label]) => (
                <label key={key} className={styles.checkboxRow} style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={(row.platforms || []).includes(key)} onChange={(e) => togglePlatform(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
            {/* Round 414 — "add tooltips bellow youtube" */}
            {platformOptions.some(([k]) => k === "youtube") && (
              <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4 }}>{YOUTUBE_PLATFORM_NOTE}</div>
            )}
          </div>

          {fields.map((f) => (
            <div key={f.key}>
              <label style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>
                {f.label} {f.required && <span style={{ color: "#e57373" }}>*</span>}
              </label>
              <input
                type="text"
                className={styles.input}
                style={{ width: "100%", boxSizing: "border-box", fontSize: 12 }}
                value={row[f.key] || ""}
                onChange={(e) => onDraftChange(type, name, { [f.key]: e.target.value })}
              />
            </div>
          ))}

          {(!row.platforms || row.platforms.length === 0 || fields.some((f) => f.required && !(row[f.key] || "").trim())) && (
            <div style={{ fontSize: 10, color: "#ffca4d" }}>Pick at least one platform and fill in every required field to send this one.</div>
          )}
        </div>
      )}
    </div>
  );
}

// Round 415 (Phase 2) — Profile Management: a single shared platform
// picker (all 7 platforms, multiple choice) feeds all 5 actions below it,
// per spec ("first pick platform, then under it is collapsable options").
// Each action is its own collapsible section (collapsed by default, same
// as Verification/NEW Profile above), with its own checked/include toggle
// — checking it is what makes it count toward Save, same "checked rows
// only" tolerance ArtistRow above uses. Each checked+valid action becomes
// its OWN ticket on Save (see app/releases/[id]/page.js's saveTab), fully
// independent of the other 4 and of Artist Verification's 2.
const MANAGEMENT_TYPES = REQUEST_TYPES.filter((t) => t.group === "management");

function ProfileManagementCard({ styles, platforms, onPlatformsChange, draft, onDraftChange }) {
  const ticked = platforms || [];

  function togglePlatform(key, checked) {
    onPlatformsChange(checked ? [...new Set([...ticked, key])] : ticked.filter((k) => k !== key));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>Nền Tảng</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {ALL_PLATFORMS.map(([key, label]) => (
            <label key={key} className={styles.checkboxRow} style={{ fontSize: 12 }}>
              <input type="checkbox" checked={ticked.includes(key)} onChange={(e) => togglePlatform(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
        {ticked.includes("youtube") && <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4 }}>{YOUTUBE_PLATFORM_NOTE}</div>}
      </div>

      {ticked.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Chọn ít nhất 1 nền tảng ở trên để bắt đầu.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {MANAGEMENT_TYPES.map((t) => (
            <CollapsibleSection key={t.key} title={t.label}>
              <ManagementActionForm styles={styles} type={t.key} platforms={ticked} row={draft?.[t.key] || {}} onDraftChange={onDraftChange} />
            </CollapsibleSection>
          ))}
        </div>
      )}
    </div>
  );
}

function ManagementActionForm({ styles, type, platforms, row, onDraftChange }) {
  const isTransfer = type === "transfer";
  const validation = row.checked ? validateManagementFields(type, platforms, row) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label className={styles.checkboxRow} style={{ fontWeight: 700 }}>
        <input type="checkbox" checked={!!row.checked} onChange={(e) => onDraftChange(type, { checked: e.target.checked })} />
        Include this action
      </label>

      {row.checked && (
        <div style={{ paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          {isTransfer ? (
            <div>
              <label style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>
                Tên Nghệ Danh Mới <span style={{ color: "#e57373" }}>*</span>
              </label>
              <input
                type="text"
                className={styles.input}
                style={{ width: "100%", boxSizing: "border-box", fontSize: 12 }}
                defaultValue={row.newStageName || ""}
                onBlur={(e) => onDraftChange(type, { newStageName: e.target.value })}
              />
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>
                Tên Nghệ Sĩ <span style={{ color: "#e57373" }}>*</span>
              </label>
              <input
                type="text"
                className={styles.input}
                style={{ width: "100%", boxSizing: "border-box", fontSize: 12 }}
                defaultValue={row.artistName || ""}
                onBlur={(e) => onDraftChange(type, { artistName: e.target.value })}
              />
            </div>
          )}

          <ArtistProfileFieldGroup
            styles={styles}
            type={type}
            platforms={platforms}
            values={row}
            onChange={(key, value) => onDraftChange(type, { [key]: value })}
          />

          {validation && !validation.ok && (
            <div style={{ fontSize: 11, color: validation.blocked ? "#e57373" : "#ffca4d", background: validation.blocked ? "rgba(229,115,115,0.1)" : "rgba(255,202,77,0.1)", border: `1px solid ${validation.blocked ? "#5a2a2a" : "#5a4a1a"}`, borderRadius: 6, padding: "8px 10px" }}>
              {validation.blocked ? "⛔ " : "⚠ "}
              {validation.reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
