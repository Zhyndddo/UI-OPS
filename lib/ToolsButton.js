"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { TOOL_DIRECTORY_SETTING_KEY, DEFAULT_TOOL_DIRECTORY, mergeToolDirectory } from "./toolDirectory";
import { MILESTONE_CHART_LINKS } from "./milestoneChartLinks";
import { buildZingPitchNote } from "./zingPitchNote";

// Round 155 item 1 (follow-up 1b) — each tool for the current page renders
// as its OWN button directly in the topbar, per explicit request ("each
// tool is a button on its own, instead of the current icon for all
// tools") — replaces the earlier single "🔗 Tools" icon that opened a
// dropdown listing every tool. Fetches the directory once on mount (this
// component only exists on pages that have a bucket at all — see
// lib/toolDirectory.js's TOOLS_BUTTON_ROUTES), same "don't gate it behind
// an extra click" idea, just applied to the whole row instead of one icon.
export default function ToolsButton({ pageKey }) {
  const [bucket, setBucket] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      if (supabase) {
        const { data } = await supabase.from("app_settings").select("value").eq("key", TOOL_DIRECTORY_SETTING_KEY).maybeSingle();
        const merged = mergeToolDirectory(data?.value, MILESTONE_CHART_LINKS);
        if (!cancelled) setBucket(merged[pageKey] || DEFAULT_TOOL_DIRECTORY[pageKey] || { tools: [] });
      } else if (!cancelled) {
        setBucket(DEFAULT_TOOL_DIRECTORY[pageKey] || { tools: [] });
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [pageKey]);

  if (loading || !bucket || bucket.tools.length === 0) return null;

  const btnStyle = {
    background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
    color: "var(--accent-on)", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700,
    cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {bucket.tools.map((t) =>
        t.generator === "zingPitchNote" ? (
          <ZingPitchButton key={t.key || t.label} tool={t} btnStyle={btnStyle} />
        ) : t.url ? (
          <a key={t.key || t.label} href={t.url} target="_blank" rel="noreferrer" style={btnStyle}>
            🔗 {t.label}
          </a>
        ) : (
          <span key={t.key || t.label} style={{ ...btnStyle, opacity: 0.5, cursor: "default" }} title="No link yet">
            🔗 {t.label}
          </span>
        )
      )}
    </div>
  );
}

// Zing is a generator, not a plain link — its own button opens a small
// popup anchored to itself (the same paste-DIDs-and-generate flow as the
// Tools Directory page's ZingPitchCard), rather than navigating anywhere.
function ZingPitchButton({ tool, btnStyle }) {
  const [open, setOpen] = useState(false);
  const [didText, setDidText] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    const dids = didText.split("\n").map((s) => s.trim()).filter(Boolean);
    setLoading(true);
    let releases = [];
    if (dids.length && supabase) {
      const { data } = await supabase.from("releases").select("title, main_artist, release_date, release_time, link_share, did").in("did", dids);
      releases = data || [];
    }
    setNote(buildZingPitchNote(releases));
    setLoading(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} style={btnStyle}>
        🔗 {tool.label}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 400,
            background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)", width: 260, padding: 10,
          }}
        >
          <textarea
            style={{ width: "100%", minHeight: 50, fontSize: 11, boxSizing: "border-box" }}
            placeholder="Paste DIDs, one per line…"
            value={didText}
            onChange={(e) => setDidText(e.target.value)}
          />
          <button onClick={generate} disabled={loading} style={{ fontSize: 11, marginTop: 4 }}>{loading ? "Generating…" : "Generate"}</button>
          {note && (
            <>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 10, background: "var(--bg-hover)", padding: 6, borderRadius: 4, marginTop: 6, color: "var(--text-muted)" }}>{note}</pre>
              <button onClick={() => navigator.clipboard?.writeText(note)} style={{ fontSize: 11 }}>Copy</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
