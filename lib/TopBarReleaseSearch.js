"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabaseClient";

// Round 152 — YouTube-style instant release search, embedded directly IN
// the topbar (not a page below it) when the user is on a release detail
// page — see AppShell.js computing `showReleaseSearch` from the pathname,
// and TopBar.js only rendering this when that's true and not on mobile
// (see TopBar's comment for why mobile is out of scope for now). Picking
// a result jumps straight to that release's OWN detail page — this is a
// "jump to it" control, not a search-results destination page.
export default function TopBarReleaseSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [allReleases, setAllReleases] = useState(null); // null = not fetched yet
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  // Lazy-fetch on first focus rather than on mount of every release detail
  // page visit — most visits never touch the search box, so there's no
  // reason to pay for a full-table release fetch until someone actually
  // opens it. Pruned to just the 5 fields the dropdown matches/displays.
  async function ensureLoaded() {
    if (allReleases !== null || loading) return;
    setLoading(true);
    const { data } = await supabase
      .from("releases")
      .select("id, did, title, main_artist, label")
      .order("release_date", { ascending: false });
    setAllReleases(data || []);
    setLoading(false);
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !allReleases) return [];
    return allReleases
      .filter(
        (r) =>
          (r.title || "").toLowerCase().includes(q) ||
          (r.main_artist || "").toLowerCase().includes(q) ||
          (r.did || "").toLowerCase().includes(q) ||
          (r.label || "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, allReleases]);

  function goTo(id) {
    setOpen(false);
    setQuery("");
    router.push(`/releases/${id}`);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      goTo(results[0].id);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", flex: 1, maxWidth: 420 }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onFocus={() => {
          ensureLoaded();
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        // Delay the close so a result's onClick still registers before the
        // dropdown unmounts — same "mousedown preventDefault" trick on
        // each result below also protects this, belt-and-suspenders.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search releases…"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 14px",
          fontSize: 13,
          fontWeight: 400,
          borderRadius: 8,
          border: "1px solid rgba(0,0,0,0.15)",
          background: "rgba(255,255,255,0.95)",
          color: "#1a1a1a",
          outline: "none",
        }}
      />
      {open && query.trim() && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 6,
            background: "var(--bg-card)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            maxHeight: 360,
            overflowY: "auto",
            zIndex: 400,
          }}
        >
          {loading ? (
            <div style={{ padding: 12, fontSize: 12, color: "var(--text-faint)" }}>Loading…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: "var(--text-faint)" }}>No matches.</div>
          ) : (
            results.map((r) => (
              <div
                key={r.id}
                onMouseDown={(e) => e.preventDefault()} // keeps input focused so onBlur fires after this onClick, not before
                onClick={() => goTo(r.id)}
                style={{ padding: "8px 12px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid var(--border)", color: "var(--text)" }}
              >
                <div style={{ fontWeight: 700 }}>{r.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                  {r.main_artist} · {r.did}
                  {r.label ? ` · ${r.label}` : ""}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
