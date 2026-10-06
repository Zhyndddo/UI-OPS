"use client";

import { useRef, useState } from "react";
import FloatingMenu from "./FloatingMenu";

// Round 279 — PIC as TAGS (multiple PICs per row) instead of one single
// <select>, same pattern as lib/ArtistTagInput.js for Main/Feature Artist.
// Reference-list-only (like ArtistTagInput) — picks from the `profiles`
// list the caller already fetched/filtered (same filterProfilesByTeam
// scoping every PIC <select> already used), no free-typing a new person in
// and no QuickCreate — profiles come from Config → Team, not from here.
//
// value/onChange work in profile IDs (not names) — names aren't guaranteed
// unique, and every existing PIC field already keyed off profile.id, so
// this keeps that same contract for whatever a caller does with the array
// (e.g. writing pic_profile_ids AND mirroring pic_profile_id = ids[0] ||
// null for backward compatibility — see the Round 279 SQL migration).
export default function PicTagInput({ styles, value, onChange, profiles, placeholder = "Add PIC…" }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const ids = value || [];
  const profileById = (id) => profiles.find((p) => p.id === id);

  const matches = search.trim()
    ? profiles.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()) && !ids.includes(p.id)).slice(0, 8)
    : profiles.filter((p) => !ids.includes(p.id)).slice(0, 8);

  function addTag(id) {
    if (!id || ids.includes(id)) return;
    onChange([...ids, id]);
    setSearch("");
    setOpen(false);
  }

  function removeTag(id) {
    onChange(ids.filter((x) => x !== id));
  }

  return (
    <div>
      {ids.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {ids.map((id) => {
            const p = profileById(id);
            return (
              <span
                key={id}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, background: "var(--bg-hover)",
                  border: "1px solid var(--border)", borderRadius: 999, padding: "3px 6px 3px 10px", fontSize: 12,
                }}
              >
                {p?.name || "— removed profile —"}
                <button
                  type="button"
                  onClick={() => removeTag(id)}
                  title={`Remove ${p?.name || "this PIC"}`}
                  style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div ref={anchorRef} style={{ position: "relative" }}>
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
          <FloatingMenu
            anchorRef={anchorRef}
            maxHeight={200}
            style={{ background: "var(--bg-hover)", border: "1px solid #333", borderRadius: 6 }}
          >
            {matches.map((p) => (
              <div
                key={p.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addTag(p.id)}
                style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--border)" }}
              >
                {p.name}
              </div>
            ))}
          </FloatingMenu>
        )}
      </div>
    </div>
  );
}

// Round 466 — read-only display for a ticket's PIC list (multi-PIC aware,
// falls back to the legacy single pic_profile_id). Used where a non-executor
// sees names instead of the tag editor.
export function picIdsOfTicket(t) {
  if (t?.pic_profile_ids && t.pic_profile_ids.length > 0) return t.pic_profile_ids;
  return t?.pic_profile_id ? [t.pic_profile_id] : [];
}
export function picNamesOf(t, profiles) {
  const names = picIdsOfTicket(t).map((id) => (profiles || []).find((p) => p.id === id)?.name).filter(Boolean);
  return names.length > 0 ? names.join(", ") : (t?.profiles?.name || "—");
}
