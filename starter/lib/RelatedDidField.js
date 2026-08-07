"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

// A plain text input that doubles as a live-search combobox against New
// Release — used by Phái Sinh's "Related DID" field. Typing filters
// matching releases by title/artist/DID as you go (no separate search
// icon/popup like ReleasePicker); clicking a match fills the field with
// that release's bare DID. The field stays a normal editable text input
// after that, so re-searching is just "select the text and type again" —
// editing re-opens the dropdown with fresh matches, picking another
// suggestion overwrites it again.
export default function RelatedDidField({ styles, value, onChange }) {
  const [releases, setReleases] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("releases")
      .select("id, did, title, main_artist, label")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data }) => setReleases(data || []));
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
    ? releases
        .filter((r) => `${r.title} ${r.main_artist} ${r.did}`.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 8)
    : releases.slice(0, 8);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        className={styles.input}
        value={query}
        placeholder="Type a product name or paste a DID…"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
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
          {matches.map((r) => (
            <div
              key={r.id}
              onClick={() => { onChange(r.did); setOpen(false); }}
              style={{ padding: "8px 8px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontWeight: 700, color: "var(--text)" }}>{r.title}</div>
              <div style={{ color: "var(--text-faint)" }}>{r.main_artist} · {r.label || "—"} · {r.did}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
