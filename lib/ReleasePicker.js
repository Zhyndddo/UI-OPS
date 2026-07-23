"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Reusable across any ticket form — a small button that opens a search
// popup over New Release (by title, artist, or DID directly). Picking one
// calls onSelect(release) so the caller decides which fields to fill from
// it; this component doesn't know or care what form it's attached to.
export default function ReleasePicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [releases, setReleases] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !supabase || releases.length > 0) return;
    supabase
      .from("releases")
      .select("id, did, title, main_artist, label, release_date")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setReleases(data || []));
  }, [open]);

  const matches = search.trim()
    ? releases.filter((r) => `${r.title} ${r.main_artist} ${r.did}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 12)
    : releases.slice(0, 12);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Fill from an existing New Release"
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 15,
          color: "var(--text-faint)",
          padding: 2,
        }}
      >
        🔍
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 4,
              zIndex: 300,
              width: 320,
              background: "var(--bg-card)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              padding: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            <input
              autoFocus
              placeholder="Search title, artist, or paste a DID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-input)",
                border: "1px solid var(--border-strong)",
                borderRadius: 6,
                padding: "7px 10px",
                fontSize: 13,
                color: "var(--text)",
                marginBottom: 8,
                boxSizing: "border-box",
              }}
            />
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {matches.length === 0 ? (
                <div style={{ color: "var(--text-faint)", fontSize: 12, padding: "8px 4px" }}>No matches.</div>
              ) : (
                matches.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => { onSelect(r); setOpen(false); setSearch(""); }}
                    style={{
                      padding: "8px 8px",
                      fontSize: 12,
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>{r.title}</div>
                    <div style={{ color: "var(--text-faint)" }}>{r.main_artist} · {r.label || "—"} · {r.did}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
