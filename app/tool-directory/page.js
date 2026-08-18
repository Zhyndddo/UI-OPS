"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { useIsMobile } from "../../lib/useIsMobile";
import {
  TOOL_DIRECTORY_SETTING_KEY,
  DEFAULT_TOOL_DIRECTORY,
  mergeToolDirectory,
  TEAM_LABELS,
} from "../../lib/toolDirectory";
import { MILESTONE_CHART_LINKS } from "../../lib/milestoneChartLinks";
import { buildZingPitchNote } from "../../lib/zingPitchNote";
import { buildNewReleasePreviewNote } from "../../lib/newReleasePreviewNote";
import styles from "../shared.module.css";

// Round 155 item 1 — the compiled external-tools directory: team-per-tab,
// tools grouped by page within each tab. View-only for everyone; editing
// (adding/renaming/re-urling a tool) is dev-only. Desktop only, per
// explicit request — mobile users still see the sidebar link (lib/
// Sidebar.js's NAV), they just land on a "desktop only" notice here
// instead of the real content.
export default function ToolDirectoryPage() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const isDev = profile?.role === "dev";

  const [directory, setDirectory] = useState(DEFAULT_TOOL_DIRECTORY);
  const [artistLinks, setArtistLinks] = useState({ spotify: "", apple: "", discoveryMode: "", linkfire: "" });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const teams = useMemo(() => [...new Set(Object.values(DEFAULT_TOOL_DIRECTORY).map((b) => b.team))], []);
  const [activeTeam, setActiveTeam] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: dirRow }, { data: artistRow }] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", TOOL_DIRECTORY_SETTING_KEY).maybeSingle(),
      supabase.from("app_settings").select("value").eq("key", "artist_profile_links").maybeSingle(),
    ]);
    setDirectory(mergeToolDirectory(dirRow?.value, MILESTONE_CHART_LINKS));
    setArtistLinks({
      spotify: artistRow?.value?.spotify || "",
      apple: artistRow?.value?.apple || "",
      discoveryMode: artistRow?.value?.discoveryMode || "",
      linkfire: artistRow?.value?.linkfire || "",
    });
    if (!activeTeam) setActiveTeam([...new Set(Object.values(DEFAULT_TOOL_DIRECTORY).map((b) => b.team))][0]);
    setLoading(false);
  }

  function updateTool(bucketKey, toolKey, patch) {
    setDirectory((prev) => ({
      ...prev,
      [bucketKey]: {
        ...prev[bucketKey],
        tools: prev[bucketKey].tools.map((t) => (t.key === toolKey ? { ...t, ...patch } : t)),
      },
    }));
  }

  async function save() {
    setSaving(true);
    await Promise.all([
      supabase.from("app_settings").upsert({ key: TOOL_DIRECTORY_SETTING_KEY, value: directory }),
      supabase.from("app_settings").upsert({ key: "artist_profile_links", value: artistLinks }),
    ]);
    setSaving(false);
    setEditing(false);
  }

  if (isMobile) {
    return (
      <AppShell>
        <div className={styles.page}>
          <div className={styles.container}>
            <div className={styles.eyebrow}>// Tools</div>
            <h1 className={styles.title}>Tools</h1>
            <div className={styles.emptyState}>
              The Tools Directory is desktop only for now — open this page on a bigger screen to see the compiled tool list.
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const bucketsForTeam = Object.entries(directory).filter(([, b]) => b.team === activeTeam);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Tools</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <h1 className={styles.title}>Tools Directory</h1>
            {isDev && (
              <div>
                {editing ? (
                  <>
                    <button className={styles.btnSmall} onClick={() => { setEditing(false); load(); }} style={{ marginRight: 8 }}>Cancel</button>
                    <button className={styles.btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                  </>
                ) : (
                  <button className={styles.btnSmall} onClick={() => setEditing(true)}>✎ Edit (dev)</button>
                )}
              </div>
            )}
          </div>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 16 }}>
            View-only reference of external tools each team uses, compiled by page. Editing is reserved to dev.
          </p>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
                {teams.map((t) => (
                  <button
                    key={t}
                    className={`${styles.tabBtn} ${activeTeam === t ? styles.tabBtnActive : ""}`}
                    onClick={() => setActiveTeam(t)}
                  >
                    {TEAM_LABELS[t] || t}
                  </button>
                ))}
              </div>

              {bucketsForTeam.map(([bucketKey, bucket]) => (
                <div key={bucketKey} style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>{bucket.pageLabel}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {bucket.tools.length === 0 && (
                      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No tools listed yet.</div>
                    )}
                    {bucket.tools.map((tool) => (
                      <ToolCard
                        key={tool.key || tool.label}
                        tool={tool}
                        editing={editing}
                        onChange={(patch) => updateTool(bucketKey, tool.key, patch)}
                      />
                    ))}
                    {bucketKey === "artistProfile" && (
                      <>
                        <LegacyLinkCard label="Spotify for Artists" value={artistLinks.spotify} editing={editing} onChange={(v) => setArtistLinks((p) => ({ ...p, spotify: v }))} />
                        <LegacyLinkCard label="Apple Music for Artists" value={artistLinks.apple} editing={editing} onChange={(v) => setArtistLinks((p) => ({ ...p, apple: v }))} />
                        <LegacyLinkCard label="Discovery Mode Clip Tool" value={artistLinks.discoveryMode} editing={editing} onChange={(v) => setArtistLinks((p) => ({ ...p, discoveryMode: v }))} />
                      </>
                    )}
                    {bucketKey === "upload" && (
                      <NewReleasePreviewCard />
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ToolCard({ tool, editing, onChange }) {
  if (tool.generator === "zingPitchNote") {
    return <ZingPitchCard tool={tool} />;
  }
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", minWidth: 220 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{tool.label}</div>
      {editing ? (
        <input className={styles.input} style={{ fontSize: 11 }} value={tool.url || ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" />
      ) : tool.url ? (
        <a href={tool.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--accent)" }}>Open ↗</a>
      ) : (
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>No link yet</span>
      )}
    </div>
  );
}

function LegacyLinkCard({ label, value, editing, onChange }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", minWidth: 220 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {editing ? (
        <input className={styles.input} style={{ fontSize: 11 }} value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" />
      ) : value ? (
        <a href={value} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--accent)" }}>Open ↗</a>
      ) : (
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Team is still confirming — blank for now</span>
      )}
    </div>
  );
}

// Pitching's "Zing" tool — batch text generator (see lib/zingPitchNote.js
// for the formula it ports). Paste a list of DIDs, one per line, matching
// the sheet's C62:C91 hand-picked-DID-list mechanic.
function ZingPitchCard({ tool }) {
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
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", minWidth: 260 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{tool.label}</div>
      <button className={styles.btnSmall} onClick={() => setOpen((o) => !o)}>{open ? "▾" : "▸"} Generate</button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <textarea
            className={styles.input}
            style={{ width: "100%", minHeight: 60, fontSize: 11 }}
            placeholder="Paste DIDs, one per line…"
            value={didText}
            onChange={(e) => setDidText(e.target.value)}
          />
          <button className={styles.btnSmall} style={{ marginTop: 6 }} onClick={generate} disabled={loading}>
            {loading ? "Generating…" : "Generate note"}
          </button>
          {note && (
            <div style={{ marginTop: 8 }}>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "var(--bg-hover)", padding: 8, borderRadius: 6 }}>{note}</pre>
              <button className={styles.btnSmall} onClick={() => navigator.clipboard?.writeText(note)}>Copy</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Item 3 — "New release pre-view" tool, grouped under New Release Setup
// per explicit request. Pick a release via search, generates the
// LINK AUDIO / Landing page / per-platform-link text block (see lib/
// newReleasePreviewNote.js).
function NewReleasePreviewCard() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(q) {
    setQuery(q);
    setPicked(null);
    setNote("");
    if (!q.trim() || !supabase) { setResults([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("releases")
      .select("id, did, title, main_artist, feature_artist, smartlink")
      .or(`title.ilike.%${q}%,main_artist.ilike.%${q}%,did.ilike.%${q}%`)
      .limit(8);
    setResults(data || []);
    setLoading(false);
  }

  function pick(r) {
    setPicked(r);
    setResults([]);
    setQuery(`${r.title} — ${r.main_artist}`);
    setNote(buildNewReleasePreviewNote(r));
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", minWidth: 280 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>New release pre-view</div>
      <button className={styles.btnSmall} onClick={() => setOpen((o) => !o)}>{open ? "▾" : "▸"} Generate</button>
      {open && (
        <div style={{ marginTop: 8, position: "relative" }}>
          <input
            className={styles.input}
            style={{ width: "100%", fontSize: 11 }}
            placeholder="Search a release…"
            value={query}
            onChange={(e) => search(e.target.value)}
          />
          {loading && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Searching…</div>}
          {results.length > 0 && (
            <div style={{ border: "1px solid var(--border-strong)", borderRadius: 6, marginTop: 4, maxHeight: 180, overflowY: "auto" }}>
              {results.map((r) => (
                <div key={r.id} onClick={() => pick(r)} style={{ padding: "6px 8px", fontSize: 11, cursor: "pointer", borderBottom: "1px solid var(--border)" }}>
                  {r.title} — {r.main_artist} <span style={{ color: "var(--text-faint)" }}>({r.did})</span>
                </div>
              ))}
            </div>
          )}
          {note && (
            <div style={{ marginTop: 8 }}>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "var(--bg-hover)", padding: 8, borderRadius: 6 }}>{note}</pre>
              <button className={styles.btnSmall} onClick={() => navigator.clipboard?.writeText(note)}>Copy</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
