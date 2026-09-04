"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

// Round 86 item 1 — same live-search-combobox pattern as
// lib/RelatedDidField.js (search-as-you-type, click a match to fill),
// just searching `profiles` by name instead of `releases` by title/DID.
// Deliberately fetches EVERY profile with no team filter (not
// filterProfilesByTeam, which unconditionally drops dev-role profiles —
// this field needs to be able to reference dev accounts too, e.g. the
// default "Zhyn" target below), per explicit request ("allow to search
// reference from all team"). The field stores/displays the profile's
// NAME (a plain string on the ticket, same as before this field
// switched from a free-typed email) — not a profile_id foreign key, so
// it stays consistent with every other free-text ticket field and needs
// no schema change.
// onCommit (optional) fires only on a real "done editing" moment — clicking
// a match, or blurring the input — separate from onChange, which fires on
// every keystroke for live filtering. NewTicketPage doesn't pass onCommit
// (its onChange just updates in-memory form state, so per-keystroke calls
// are free); TicketListPage's inline row-editing does pass it, since its
// onUpdateField writes to Supabase on every call — without this split,
// free-typing here would fire a write per character.
export default function ProfileSearchField({ styles, value, onChange, onCommit, placeholder }) {
  const [profiles, setProfiles] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("profiles")
      .select("id, name, segment, role")
      .order("name")
      .then(({ data }) => setProfiles(data || []));
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const query = value || "";
  const matches = query.trim()
    ? profiles.filter((p) => `${p.name} ${p.segment || ""}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : profiles.slice(0, 8);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        className={styles.input}
        value={query}
        placeholder={placeholder || "Search a name…"}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => { if (onCommit) onCommit(e.target.value); }}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            zIndex: 300,
            background: "var(--bg-card)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {matches.map((p) => (
            <div
              key={p.id}
              // onMouseDown (not onClick) + preventDefault so this fires
              // BEFORE the input's onBlur — otherwise blur commits the
              // stale typed-partial text first, and this selection would
              // never get its own onCommit call.
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(p.name);
                if (onCommit) onCommit(p.name);
                setOpen(false);
              }}
              style={{ padding: "8px 8px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontWeight: 700, color: "var(--text)" }}>{p.name}</div>
              <div style={{ color: "var(--text-faint)" }}>{p.segment || "—"}{p.role === "dev" ? " · dev" : ""}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
