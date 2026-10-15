"use client";

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { useIsMobile } from "../../lib/useIsMobile";
import { isAdminOrAbove } from "../../lib/permissions";
import {
  TOOL_DIRECTORY_SETTING_KEY,
  DEFAULT_TOOL_DIRECTORY,
  mergeToolDirectory,
  TEAM_LABELS,
  DIRECTORY_TEAMS,
  makeBucketKey,
  makeToolKey,
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
  // Round 518 — per-tool URL edit: dev anywhere; admin only on their own
  // team's tabs (profile.segment === bucket.team). Everyone else just sees
  // the tool names as links.
  const canEditBucket = (bucket) => isDev || (isAdminOrAbove(profile) && !!profile?.segment && profile.segment === bucket.team);

  const [directory, setDirectory] = useState(DEFAULT_TOOL_DIRECTORY);
  const [artistLinks, setArtistLinks] = useState({ spotify: "", apple: "", discoveryMode: "", linkfire: "" });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Round 413 — fixed team list (see DIRECTORY_TEAMS's comment) instead of
  // derived from whichever buckets happen to exist — AR/Marketing/Legal
  // now show up as real tabs even with zero page groups yet.
  const teams = DIRECTORY_TEAMS;
  const [activeTeam, setActiveTeam] = useState(null);
  const [newGroupLabel, setNewGroupLabel] = useState("");

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
    if (!activeTeam) setActiveTeam(DIRECTORY_TEAMS[0]);
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

  // Round 413 — "add new tools via a vanilla new button that redirect to
  // the url i edit in the tool tables until i hardcode it in with
  // behavior": a plain {key, label, url} tool, blank url, editable
  // immediately via the same ToolCard input updateTool already writes
  // through — no code change needed to add one. If a tool later needs
  // real behavior (like Pitching's Zing generator above), that's still a
  // code change — adding a `generator` key to this same object, same as
  // the hardcoded ones — but the URL stays editable either way, per the
  // explicit ask.
  function addTool(bucketKey) {
    const label = "New Tool";
    setDirectory((prev) => ({
      ...prev,
      [bucketKey]: { ...prev[bucketKey], tools: [...prev[bucketKey].tools, { key: makeToolKey(label), label, url: "" }] },
    }));
  }

  function removeTool(bucketKey, toolKey) {
    setDirectory((prev) => ({
      ...prev,
      [bucketKey]: { ...prev[bucketKey], tools: prev[bucketKey].tools.filter((t) => t.key !== toolKey) },
    }));
  }

  // Round 518 — saves ONE tool's URL. Re-reads the saved row first and only
  // patches that tool, so two people editing different tools at once don't
  // overwrite each other with a stale whole-directory copy.
  async function saveToolUrl(bucketKey, toolKey, url) {
    const clean = (url || "").trim();
    const { data: dirRow } = await supabase.from("app_settings").select("value").eq("key", TOOL_DIRECTORY_SETTING_KEY).maybeSingle();
    const fresh = mergeToolDirectory(dirRow?.value, MILESTONE_CHART_LINKS);
    if (!fresh[bucketKey]) return false;
    fresh[bucketKey] = {
      ...fresh[bucketKey],
      tools: fresh[bucketKey].tools.map((t) => (t.key === toolKey ? { ...t, url: clean } : t)),
    };
    const { error } = await supabase.from("app_settings").upsert({ key: TOOL_DIRECTORY_SETTING_KEY, value: fresh });
    if (error) return false;
    setDirectory(fresh);
    return true;
  }

  async function saveArtistLink(field, url) {
    const clean = (url || "").trim();
    const { data: row } = await supabase.from("app_settings").select("value").eq("key", "artist_profile_links").maybeSingle();
    const next = { spotify: "", apple: "", discoveryMode: "", linkfire: "", ...(row?.value || {}), [field]: clean };
    const { error } = await supabase.from("app_settings").upsert({ key: "artist_profile_links", value: next });
    if (error) return false;
    setArtistLinks((p) => ({ ...p, [field]: clean }));
    return true;
  }

  // Round 413 — lets a dev create a brand-new page group (bucket) under any
  // team, not just edit the hardcoded OPS ones — this is what makes AR/
  // Marketing/Legal actually usable instead of just showing an empty tab.
  // route is left blank: TOOLS_BUTTON_ROUTES (lib/toolDirectory.js) is a
  // separate hardcoded map for the per-page topbar button, and wiring a
  // brand-new bucket into THAT still needs a real code change (which route
  // it should show on) — an ad hoc bucket is reachable from this directory
  // page only, which is exactly what was asked for here.
  function addPageGroup(team) {
    const label = newGroupLabel.trim();
    if (!label) return;
    const key = makeBucketKey(label);
    setDirectory((prev) => ({ ...prev, [key]: { team, pageLabel: label, route: null, tools: [] } }));
    setNewGroupLabel("");
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
                  <button className={styles.btnSmall} onClick={() => setEditing(true)}>⚙ Manage tools (dev)</button>
                )}
              </div>
            )}
          </div>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 16 }}>
            Click a tool to open it in a new tab. Devs can edit any link; admins can edit their own team's links (✎).
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

              {bucketsForTeam.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 20 }}>No page groups yet for this team.</div>
              )}

              {bucketsForTeam.map(([bucketKey, bucket]) => {
                const canEdit = canEditBucket(bucket);
                return (
                  <div key={bucketKey} style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>{bucket.pageLabel}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
                      {bucket.tools.length === 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No tools listed yet.</div>
                      )}
                      {bucket.tools.map((tool) => (
                        editing ? (
                          <ToolCard
                            key={tool.key || tool.label}
                            tool={tool}
                            editing={editing}
                            onChange={(patch) => updateTool(bucketKey, tool.key, patch)}
                            onRemove={() => removeTool(bucketKey, tool.key)}
                          />
                        ) : (
                          <ToolChip
                            key={tool.key || tool.label}
                            tool={tool}
                            canEdit={canEdit}
                            onSaveUrl={(url) => saveToolUrl(bucketKey, tool.key, url)}
                          />
                        )
                      ))}
                      {bucketKey === "artistProfile" && (
                        <>
                          {[
                            ["spotify", "Spotify for Artists"],
                            ["apple", "Apple Music for Artists"],
                            ["discoveryMode", "Discovery Mode Clip Tool"],
                            ["linkfire", "Short Links Tool (Booking Board / Media Booking)"],
                          ].map(([field, label]) =>
                            editing ? (
                              <LegacyLinkCard key={field} label={label} value={artistLinks[field]} editing={editing} onChange={(v) => setArtistLinks((p) => ({ ...p, [field]: v }))} />
                            ) : (
                              <ToolChip
                                key={field}
                                tool={{ key: field, label, url: artistLinks[field] }}
                                canEdit={canEdit}
                                onSaveUrl={(url) => saveArtistLink(field, url)}
                              />
                            )
                          )}
                        </>
                      )}
                      {editing && (
                        <button className={styles.btnSmall} style={{ alignSelf: "flex-start" }} onClick={() => addTool(bucketKey)}>+ Add Tool</button>
                      )}
                    </div>
                  </div>
                );
              })}

              {editing && (
                <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className={styles.input}
                    style={{ fontSize: 12, maxWidth: 240 }}
                    placeholder="New page group name…"
                    value={newGroupLabel}
                    onChange={(e) => setNewGroupLabel(e.target.value)}
                  />
                  <button className={styles.btnSmall} onClick={() => addPageGroup(activeTeam)} disabled={!newGroupLabel.trim()}>+ Add Page Group</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// Round 518 — the simple view: just the tool name, click opens the link in a
// new tab. Generators (Zing, New Release Preview) keep their own cards since
// they aren't links. When the viewer may edit, a small ✎ next to the name
// swaps it for a URL input (Save/Cancel) — one tool at a time.
function ToolChip({ tool, canEdit, onSaveUrl }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [popupOpen, setPopupOpen] = useState(false);
  if (tool.generator === "zingPitchNote" || tool.generator === "newReleasePreviewNote") {
    return (
      <>
        <button onClick={() => setPopupOpen(true)} style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", minWidth: 150, fontSize: 12, fontWeight: 700, color: "var(--accent)", background: "transparent", cursor: "pointer" }}>
          {tool.label}
        </button>
        {popupOpen && (
          <ToolPopup title={tool.label} onClose={() => setPopupOpen(false)}>
            {tool.generator === "zingPitchNote" ? <ZingPitchPanel /> : <NewReleasePreviewPanel />}
          </ToolPopup>
        )}
      </>
    );
  }

  async function commit() {
    setSaving(true);
    setErr("");
    const ok = await onSaveUrl(draft);
    setSaving(false);
    if (ok) setEditing(false);
    else setErr("Couldn't save — try again.");
  }

  if (editing) {
    return (
      <div style={{ border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", minWidth: 280 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{tool.label}</div>
        <input className={styles.input} style={{ fontSize: 11, width: "100%" }} value={draft} autoFocus placeholder="https://…" onChange={(e) => setDraft(e.target.value)} />
        {err && <div style={{ fontSize: 11, color: "var(--danger, #e5484d)", marginTop: 4 }}>{err}</div>}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button className={styles.btnPrimary} style={{ fontSize: 11, padding: "3px 10px" }} onClick={commit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          <button className={styles.btnSmall} onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
        </div>
      </div>
    );
  }

  const pill = {
    display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 10,
    border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", minWidth: 150,
    fontSize: 12, fontWeight: 700, textDecoration: "none", color: "var(--accent)",
    background: "transparent", cursor: tool.url ? "pointer" : "default",
  };
  const editBtn = canEdit ? (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDraft(tool.url || ""); setErr(""); setEditing(true); }}
      aria-label={`Edit ${tool.label} link`}
      style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}
    >
      ✎
    </button>
  ) : null;
  // Whole card is the link (opens in a new tab). No link yet -> greyed, inert.
  return tool.url ? (
    <a href={tool.url} target="_blank" rel="noreferrer" style={pill}>
      <span>{tool.label}</span>
      {editBtn}
    </a>
  ) : (
    <div style={{ ...pill, color: "var(--text-faint)", opacity: 0.7 }}>
      <span>{tool.label}</span>
      {editBtn}
    </div>
  );
}

function ToolCard({ tool, editing, onChange, onRemove }) {
  if (tool.generator) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", minWidth: 220, fontSize: 12, fontWeight: 700 }}>
        {tool.label} <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>(generator — not editable here)</span>
      </div>
    );
  }
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", minWidth: 220, position: "relative" }}>
      {editing && onRemove && (
        <button
          onClick={onRemove}
          title="Remove this tool"
          style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", color: "var(--text-faint)", fontSize: 13, cursor: "pointer", lineHeight: 1 }}
        >
          ✕
        </button>
      )}
      {/* Round 413 — label is now editable too (was URL-only), so a "+ Add
          Tool" row (which starts as a bare "New Tool" placeholder) can
          actually be renamed without touching code. */}
      {editing ? (
        <input className={styles.input} style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, paddingRight: 20 }} value={tool.label || ""} onChange={(e) => onChange({ label: e.target.value })} placeholder="Tool name…" />
      ) : (
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{tool.label}</div>
      )}
      {editing ? (
        <input className={styles.input} style={{ fontSize: 11 }} value={tool.url || ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://…" />
      ) : tool.url ? (
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{tool.url}</span>
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
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{value}</span>
      ) : (
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Team is still confirming — blank for now</span>
      )}
    </div>
  );
}

// Pitching's "Zing" tool — batch text generator (see lib/zingPitchNote.js
// for the formula it ports). Paste a list of DIDs, one per line, matching
// the sheet's C62:C91 hand-picked-DID-list mechanic.
function ZingPitchPanel() {
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
    <div>
      {(
        <div>
          <textarea
            className={styles.input}
            style={{ width: "100%", minHeight: 160, fontSize: 13 }}
            placeholder="Paste DIDs, one per line…"
            value={didText}
            onChange={(e) => setDidText(e.target.value)}
          />
          <button className={styles.btnSmall} style={{ marginTop: 6 }} onClick={generate} disabled={loading}>
            {loading ? "Generating…" : "Generate note"}
          </button>
          {note && (
            <div style={{ marginTop: 8 }}>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, maxHeight: 320, overflowY: "auto", background: "var(--bg-hover)", padding: 8, borderRadius: 6 }}>{note}</pre>
              <button className={styles.btnSmall} onClick={() => navigator.clipboard?.writeText(note)}>Copy</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Round 155 item 3 — "New release pre-view" tool, grouped under New
// Release Setup per explicit request. Pick a release via search,
// generates the LINK AUDIO / Landing page / per-platform-link text block
// (see lib/newReleasePreviewNote.js). Round 229 — now a real generator
// entry in the upload bucket (like Pitching's Zing tool) instead of a
// special-cased render, so the same button also shows up on New Release
// Setup's own topbar tool row (lib/ToolsButton.js's NewReleasePreviewButton).
function NewReleasePreviewPanel() {
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
    <div>
      {(
        <div style={{ position: "relative" }}>
          <input
            className={styles.input}
            style={{ width: "100%", fontSize: 13 }}
            placeholder="Search a release…"
            value={query}
            onChange={(e) => search(e.target.value)}
          />
          {loading && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Searching…</div>}
          {results.length > 0 && (
            <div style={{ border: "1px solid var(--border-strong)", borderRadius: 6, marginTop: 4, maxHeight: 220, overflowY: "auto" }}>
              {results.map((r) => (
                <div key={r.id} onClick={() => pick(r)} style={{ padding: "8px 10px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--border)" }}>
                  {r.title} — {r.main_artist} <span style={{ color: "var(--text-faint)" }}>({r.did})</span>
                </div>
              ))}
            </div>
          )}
          {note && (
            <div style={{ marginTop: 8 }}>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, maxHeight: 360, overflowY: "auto", background: "var(--bg-hover)", padding: 8, borderRadius: 6 }}>{note}</pre>
              <button className={styles.btnSmall} onClick={() => navigator.clipboard?.writeText(note)}>Copy</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Round 519 — shared modal for the generator tools (Zing, New Release
// Preview): same functions as before, in a bigger centred panel instead of
// a tiny inline expander. Closes on ✕, Escape, or a click on the backdrop.
function ToolPopup({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg-card, var(--bg))", border: "1px solid var(--border-strong)", borderRadius: 12, width: "min(760px, 100%)", maxHeight: "85vh", overflowY: "auto", padding: "18px 22px", boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
