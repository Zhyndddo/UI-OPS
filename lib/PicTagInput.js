"use client";

import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const menuRef = useRef(null);
  const ids = value || [];
  const profileById = (id) => profiles.find((p) => p.id === id);
  const sorted = [...profiles].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // Round 679 — click-to-pick multi-choice list (was: type-to-search box). Closes on an outside click.
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => {
      if (anchorRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function toggle(id) {
    onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  function removeTag(id) {
    onChange(ids.filter((x) => x !== id));
  }

  return (
    // Round 679 — stopPropagation: the list is rendered in a portal, and React still bubbles clicks from a portal up the component tree,
    // so picking a PIC used to also click the table row underneath and open its detail popup.
    <div onClick={(e) => e.stopPropagation()}>
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
        <button
          type="button"
          className={styles.input}
          style={{ width: "100%", boxSizing: "border-box", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--text-muted)" }}
          onClick={() => setOpen((o) => !o)}
        >
          <span>{placeholder}</span><span style={{ fontSize: 10 }}>▾</span>
        </button>
        {open && sorted.length > 0 && (
          <FloatingMenu
            anchorRef={anchorRef}
            maxHeight={260}
            style={{ background: "var(--bg-hover)", border: "1px solid #333", borderRadius: 6 }}
          >
            <div ref={menuRef}>
              {sorted.map((p) => {
                const on = ids.includes(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, alignItems: "center", fontWeight: on ? 700 : 400 }}
                  >
                    <span style={{ width: 14 }}>{on ? "☑" : "☐"}</span>{p.name}
                  </div>
                );
              })}
            </div>
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
