"use client";

import { useState } from "react";
import QuickCreate from "./QuickCreate";
import ArtistDetailPopup from "./ArtistDetailPopup";

// Round 97 — Main/Feature Artist as TAGS (multiple artists per field)
// instead of one free-text box. Reason: a product can have more than one
// main or feature artist, and a single free-text field makes that
// impossible to filter/query reliably in SQL (main_artist_tags/
// feature_artist_tags are real text[] columns with a GIN index instead).
//
// Reference-list-only per explicit request — this box only searches and
// picks from the existing artists table, no free-typing a brand-new name
// directly into it. Adding a genuinely new artist goes through the "+"
// QuickCreate button next to it (same quick-create-artist popover already
// used elsewhere on the New Release form), which inserts into the artists
// reference table first and then immediately adds it as a tag here.
export default function ArtistTagInput({ styles, value, onChange, artists, placeholder, onArtistCreated }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  // Round 100 — which tag's full-record edit popup (if any) is open.
  // Round 103 — holds just the tag NAME now (a plain string), not a
  // pre-resolved artists-table row — ArtistDetailPopup resolves/creates the
  // real row itself, so this button no longer depends on finding an exact
  // match in the `artists` list first (see ArtistDetailPopup's Round 103
  // comment for why that lookup could silently fail). `null` = closed.
  const [editingArtist, setEditingArtist] = useState(null);
  const tags = value || [];

  const matches = search.trim()
    ? artists.filter((a) => a.stage_name.toLowerCase().includes(search.trim().toLowerCase()) && !tags.includes(a.stage_name)).slice(0, 8)
    : [];

  function addTag(name) {
    if (!name || tags.includes(name)) return;
    onChange([...tags, name]);
    setSearch("");
    setOpen(false);
  }

  function removeTag(name) {
    onChange(tags.filter((t) => t !== name));
  }

  return (
    <div>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {tags.map((t) => (
            <span
              key={t}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, background: "var(--bg-hover)",
                border: "1px solid var(--border)", borderRadius: 999, padding: "3px 6px 3px 10px", fontSize: 12,
              }}
            >
              {t}
              <button
                type="button"
                // Round 103 — always opens now (was resolving against the
                // `artists` list first and silently doing nothing on a
                // miss, which read as this button being unclickable).
                // ArtistDetailPopup does its own resolve-or-create by name.
                onClick={() => setEditingArtist(t)}
                title={`Edit ${t}'s reference record`}
                style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 2px" }}
              >
                ⋮
              </button>
              <button
                type="button"
                onClick={() => removeTag(t)}
                title={`Remove ${t}`}
                style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            className={styles.input}
            style={{ width: "100%", boxSizing: "border-box" }}
            placeholder={placeholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {open && matches.length > 0 && (
            <div
              style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                background: "var(--bg-hover)", border: "1px solid #333", borderRadius: 6,
                marginTop: 4, maxHeight: 200, overflowY: "auto",
              }}
            >
              {matches.map((a) => (
                <div
                  key={a.stage_name}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(a.stage_name)}
                  style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--border)" }}
                >
                  {a.stage_name}
                  {a.labels?.label_name && <span style={{ color: "var(--text-faint)", marginLeft: 8 }}>— {a.labels.label_name}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <QuickCreate
          kind="artist"
          onCreated={(newArtist) => {
            onArtistCreated?.(newArtist);
            addTag(newArtist.stage_name);
          }}
        />
      </div>

      {editingArtist && (
        <ArtistDetailPopup
          styles={styles}
          artistName={editingArtist}
          onClose={() => setEditingArtist(null)}
        />
      )}
    </div>
  );
}
