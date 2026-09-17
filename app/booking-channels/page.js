"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import UrlField from "../../lib/UrlField";
import { CHANNEL_REFERENCE_INTRO_KEY, readChannelReferenceIntro, serializeChannelReferenceIntro } from "../../lib/channelReferenceIntro";
import { isValidSlugFormat } from "../../lib/shortLinks";
import styles from "../shared.module.css";

const BOOKING_PLATFORMS = ["TikTok", "Facebook", "Instagram", "YouTube", "Thread"];
const BOOKING_CHANNEL_TYPES = ["Direct", "Partner"];

function editStateFor(c) {
  return {
    name: c.name || "",
    platform: c.platform || "TikTok",
    channel_type: c.channel_type || "Direct",
    brand: c.brand || "",
    // Round 311 — channel_group: the reference sheet's own row-header
    // grouping (e.g. "VPOP - COMMUNITY", "VIEENT - SOCIAL"), finer-grained
    // than brand (brand alone can't tell "VPOP - COMMUNITY" apart from
    // "VPOP - TIKTOK" — both are brand 'VPOP'). Free-text like brand, not
    // a fixed dropdown — new groups may come up later.
    channel_group: c.channel_group || "",
    url: c.url || "",
    follower_count: c.follower_count != null ? String(c.follower_count) : "",
    note: c.note || "",
  };
}

// Round 311 — Group totals: count + follower sum per channel_group, per
// explicit request. Computed off whatever's currently on screen
// (visibleChannels — respects the search box and Direct/Partner filter),
// same "numbers match what's visible" convention as the Direct/Partner
// StatCards above. A channel with no follower_count (e.g. the
// Distribution Support compilation link) still counts toward the group's
// channel count, just not its follower sum.
function groupTotals(visibleChannels) {
  const byGroup = {};
  visibleChannels.forEach((c) => {
    const g = c.channel_group || "— No Group —";
    if (!byGroup[g]) byGroup[g] = { count: 0, followers: 0 };
    byGroup[g].count += 1;
    byGroup[g].followers += c.follower_count || 0;
  });
  return Object.entries(byGroup).sort(([a], [b]) => (a === "— No Group —" ? 1 : b === "— No Group —" ? -1 : a.localeCompare(b)));
}

export default function BookingChannelsPage() {
  const { profile } = useAuth();
  const [channels, setChannels] = useState([]);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("TikTok");
  const [channelType, setChannelType] = useState("Direct");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [typeFilter, setTypeFilter] = useState(null); // "Direct" | "Partner" | null
  const [refreshing, setRefreshing] = useState(null); // null | "all" | a channel id
  const [refreshResult, setRefreshResult] = useState(null);
  // Round 305 — self-service token minting for the public TikTok channel
  // reference magic link (app/channels/[token]) — see
  // sql/pending/add-round305-channel-reference-share-links.sql for why
  // this is its own table rather than a magic_links row. Keeps every
  // token ever minted (no delete here) so "who has a working link" stays
  // answerable later; revoking one (not built into this UI yet — a plain
  // `update ... set revoked_at = now()` in the SQL editor works today) is
  // the way to kill a leaked link without a code deploy.
  const [mintingLink, setMintingLink] = useState(false);
  const [mintedLinkUrl, setMintedLinkUrl] = useState(null);
  // Round 362 — "become this... permanently as a custom unique page...
  // no rewrite or redirect": instead of aliasing the random token through
  // the short-links minter, this lets the token ITSELF be a memorable
  // string (e.g. "vsounder"), so /channels/vsounder IS the real,
  // permanent URL — no indirection, nothing to redirect or rewrite.
  const [customToken, setCustomToken] = useState("");
  const [customTokenSaving, setCustomTokenSaving] = useState(false);
  const [customTokenError, setCustomTokenError] = useState(null);
  // Round 317 — the magic link's configurable intro text block (see
  // lib/channelReferenceIntro.js's header for why this is one shared
  // global_settings row rather than a new table). `introDraft` holds the
  // in-progress edit; `introSaved` is what's actually live on the magic
  // link right now, so "Save" can be disabled when there's nothing new
  // to push.
  // Round 339 — sheetUrl added: a public Google Sheet URL whose one tab
  // gets embedded as a native table on the magic link (see
  // lib/channelReferenceIntro.js's header for the full spec).
  const [introDraft, setIntroDraft] = useState({ title: "", text: "", canvaUrl: "", sheetUrl: "" });
  const [introSaved, setIntroSaved] = useState({ title: "", text: "", canvaUrl: "", sheetUrl: "" });
  const [introSaving, setIntroSaving] = useState(false);
  // Round 328 — was a <details>/<summary> disclosure sitting on its own as
  // an odd thin bar; per explicit request, moved into the same button row
  // as Export CSV / Refresh / Share Link, toggling a panel below instead.
  const [introPanelOpen, setIntroPanelOpen] = useState(false);
  const [introSaveError, setIntroSaveError] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    load();
    readChannelReferenceIntro(supabase).then((v) => { setIntroDraft(v); setIntroSaved(v); });
  }, []);

  // Round 56 — item 3: pulls real subscriber counts from YouTube's
  // official Data API v3 (server-side route, needs YOUTUBE_API_KEY set in
  // Vercel — see DATA_FIXES.md). channelIds omitted = refresh every
  // YouTube row with a URL; passed = just that one row (the per-row ↻).
  // TikTok/Instagram/Facebook aren't offered here — those platforms don't
  // expose follower counts for arbitrary channels through any official,
  // non-OAuth route (see the route file's header comment for why).
  async function refreshYoutubeStats(channelIds) {
    setRefreshing(channelIds ? channelIds[0] : "all");
    setRefreshResult(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    try {
      const res = await fetch("/api/refresh-youtube-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(channelIds ? { channelIds } : {}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Refresh failed");
      setRefreshResult(body);
      await load();
    } catch (err) {
      setRefreshResult({ error: err.message });
    }
    setRefreshing(null);
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("booking_channels").select("*").order("platform").order("channel_type").order("sort_order");
    setChannels(data || []);
    setLoading(false);
  }

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const siblings = channels.filter((c) => c.platform === platform && c.channel_type === channelType);
    if (siblings.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) return;
    const maxSort = Math.max(-1, ...siblings.map((c) => c.sort_order));
    await supabase.from("booking_channels").insert({ name: name.trim(), platform, channel_type: channelType, url: url.trim() || null, sort_order: maxSort + 1 });
    setName("");
    setUrl("");
    load();
  }

  // Imported reference channels (~140 from the "LIST KÊNH VIEENT & ENVI"
  // sheet) made this list too long to scan by eye — filters by name,
  // brand, or note, same as the Add Link popup's own search.
  const searchedChannels = search.trim()
    ? channels.filter((c) => `${c.name} ${c.brand || ""} ${c.channel_group || ""} ${c.note || ""}`.toLowerCase().includes(search.trim().toLowerCase()))
    : channels;

  // Hạng Mục counter/filter row — same click-to-filter pattern as the New
  // Release dashboard's stat cards (StatCard below), counted off the
  // search-filtered set so the numbers stay consistent with what's on
  // screen.
  const typeCounts = { Direct: 0, Partner: 0 };
  searchedChannels.forEach((c) => { if (typeCounts[c.channel_type] !== undefined) typeCounts[c.channel_type]++; });

  const visibleChannels = typeFilter ? searchedChannels.filter((c) => c.channel_type === typeFilter) : searchedChannels;

  async function remove(c) {
    await supabase.from("booking_channels").delete().eq("id", c.id);
    load();
  }

  // Exports whatever's currently on screen (respects the search filter,
  // same convention as the Booking Board's own "⇩ Export CSV" button) —
  // "Platform" and "Brand" keep their column names, "Channel Type" is
  // exported as "Hạng Mục" to match the relabeled UI, even though the
  // underlying field/column is still channel_type.
  function exportCsv() {
    const rows = [["Platform", "Hạng Mục", "Brand", "Group", "Name", "URL", "Follower Count", "Note"]];
    visibleChannels.forEach((c) => {
      rows.push([c.platform || "", c.channel_type || "", c.brand || "", c.channel_group || "", c.name || "", c.url || "", c.follower_count != null ? c.follower_count : "", c.note || ""]);
    });
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }); // BOM so Excel opens Vietnamese text correctly
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "booking-channels.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Round 305 originally minted a brand-new row on every click — Round
  // 311 correction, per explicit request ("locked the url channel list
  // token, 1 token for this lifetime cycle or until i specifically tell
  // you to change"): this is now get-or-create. It looks for the oldest
  // still-active (non-revoked) token first and reuses it; only inserts a
  // new row when none exists yet. Repeat clicks now return the SAME link
  // every time instead of minting a fresh one — "revoke this one, get a
  // new one" still works exactly as before (a plain `update ... set
  // revoked_at = now()` in the SQL editor), it just isn't the default
  // click behavior anymore. Builds the URL off window.location.origin
  // (not a hardcoded domain) so this works unchanged whether it's clicked
  // on the production app or a Vercel preview deploy — see
  // preview-setup.md's branch→preview-URL flow.
  async function mintShareLink() {
    setMintingLink(true);
    setMintedLinkUrl(null);
    const { data: existing } = await supabase
      .from("channel_reference_share_links")
      .select("*")
      .is("revoked_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing) {
      setMintingLink(false);
      setMintedLinkUrl(`${window.location.origin}/channels/${existing.token}`);
      return;
    }
    const { data, error } = await supabase
      .from("channel_reference_share_links")
      .insert({ created_by: profile?.email || profile?.name || null })
      .select()
      .single();
    setMintingLink(false);
    if (error || !data) {
      setRefreshResult({ error: "Couldn't create a share link — try again." });
      return;
    }
    setMintedLinkUrl(`${window.location.origin}/channels/${data.token}`);
  }

  // Round 362 — renames the current active share link's token to a
  // custom, memorable value (or creates the first-ever link directly
  // with that value, if none exists yet) — same get-or-create shape as
  // mintShareLink above, just writing a chosen token instead of letting
  // the table default one in. This is a real rename: the OLD random-hex
  // URL stops working the moment this saves (the token column only ever
  // holds one value), which matches "become this... permanently" rather
  // than adding a second alias for the same link. The table's own
  // `unique` constraint on token (sql/pending/add-round305-channel-
  // reference-share-links.sql) is the real guarantee against two links
  // ever sharing a slug; the 23505 handling below just turns that into a
  // readable message.
  async function setCustomShareToken() {
    setCustomTokenError(null);
    const normalized = customToken.trim().toLowerCase();
    if (!isValidSlugFormat(normalized)) {
      setCustomTokenError("Use lowercase letters, numbers, and hyphens only (no leading/trailing hyphen), 2-64 characters.");
      return;
    }
    setCustomTokenSaving(true);
    const { data: existing } = await supabase
      .from("channel_reference_share_links")
      .select("*")
      .is("revoked_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let error;
    if (existing) {
      ({ error } = await supabase.from("channel_reference_share_links").update({ token: normalized }).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("channel_reference_share_links").insert({ created_by: profile?.email || profile?.name || null, token: normalized }));
    }
    setCustomTokenSaving(false);
    if (error) {
      setCustomTokenError(error.code === "23505" ? `"${normalized}" is already in use by another link.` : "Couldn't save — try again.");
      return;
    }
    setMintedLinkUrl(`${window.location.origin}/channels/${normalized}`);
    setCustomToken("");
  }

  // Round 317 — saves the magic link's intro block. Round 327 added
  // `title`. Round 339 added `sheetUrl`. Blank title/text/canvaUrl/
  // sheetUrl all just clear that field's value rather than refusing to
  // save — "remove it" is a legitimate edit, not an error.
  //
  // Round 329 — BUG FIX: was upserting the raw { title, text, canvaUrl }
  // object straight into global_settings.value, but that column is plain
  // `text` in production, not jsonb (see lib/channelReferenceIntro.js's
  // header) — nothing ever actually round-tripped, so the magic link
  // never showed what got "saved" here. Now serialized the same way
  // every other global_settings setting in this app already does
  // (JSON.stringify on write, JSON.parse on read).
  async function saveIntro() {
    setIntroSaving(true);
    setIntroSaveError(null);
    const value = {
      title: introDraft.title.trim(),
      text: introDraft.text.trim(),
      canvaUrl: introDraft.canvaUrl.trim(),
      sheetUrl: introDraft.sheetUrl.trim(),
    };
    const { error } = await supabase
      .from("global_settings")
      .upsert({ key: CHANNEL_REFERENCE_INTRO_KEY, value: serializeChannelReferenceIntro(value), updated_at: new Date().toISOString() }, { onConflict: "key" });
    setIntroSaving(false);
    if (!error) setIntroSaved(value);
    else setIntroSaveError(error.message);
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditValues(editStateFor(c));
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues(null);
    setSaveError(null);
  }

  function updateEditField(field, value) {
    setEditValues((prev) => ({ ...prev, [field]: value }));
  }

  // Every field on the row is now editable, including platform and
  // channel_type (previously fixed at creation). Changing either can
  // collide with the table's unique(name, platform, channel_type)
  // constraint (e.g. renaming into a name that already exists under the
  // new platform/type) — caught and shown inline rather than failing
  // silently or creating a duplicate.
  async function saveEdit(id) {
    const followerCount = editValues.follower_count.trim() === "" ? null : Math.round(Number(editValues.follower_count));
    if (editValues.follower_count.trim() !== "" && Number.isNaN(followerCount)) {
      setSaveError("Follower count must be a number.");
      return;
    }
    const payload = {
      name: editValues.name.trim(),
      platform: editValues.platform,
      channel_type: editValues.channel_type,
      brand: editValues.brand.trim() || null,
      channel_group: editValues.channel_group.trim() || null,
      url: editValues.url.trim() || null,
      follower_count: followerCount,
      note: editValues.note.trim() || null,
    };
    if (!payload.name) {
      setSaveError("Name can't be blank.");
      return;
    }
    const { error } = await supabase.from("booking_channels").update(payload).eq("id", id);
    if (error) {
      setSaveError(error.message.includes("duplicate") || error.message.includes("unique")
        ? "A channel with this name + platform + channel type already exists."
        : error.message);
      return;
    }
    setEditingId(null);
    setEditValues(null);
    setSaveError(null);
    load();
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>// Reference Table</div>
        <h1 className={styles.title}>Booking Channels</h1>
        <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
          Real channel/page handles per platform + Direct/Partner — lets the Booking popup offer a pick-list
          instead of free-typing the channel name every time.
        </p>

        <form onSubmit={add} style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 140 }}>
            <label className={styles.fieldLabel}>Platform</label>
            <select className={styles.select} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {BOOKING_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 120 }}>
            <label className={styles.fieldLabel}>Hạng Mục</label>
            <select className={styles.select} value={channelType} onChange={(e) => setChannelType(e.target.value)}>
              {BOOKING_CHANNEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 180 }}>
            <label className={styles.fieldLabel}>Channel Name</label>
            <input className={styles.input} placeholder="e.g. ENVI" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 220 }}>
            <label className={styles.fieldLabel}>URL (optional)</label>
            <input className={styles.input} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <button className={styles.btnPrimary} type="submit">+ Add</button>
        </form>

        <div className={styles.statRow} style={{ marginBottom: 20, maxWidth: 400 }}>
          <StatCard
            label="Direct"
            value={typeCounts.Direct}
            active={typeFilter === "Direct"}
            onClick={() => setTypeFilter((f) => (f === "Direct" ? null : "Direct"))}
            onClear={() => setTypeFilter(null)}
          />
          <StatCard
            label="Partner"
            value={typeCounts.Partner}
            active={typeFilter === "Partner"}
            onClick={() => setTypeFilter((f) => (f === "Partner" ? null : "Partner"))}
            onClear={() => setTypeFilter(null)}
          />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap" }}>
          <div className={styles.field} style={{ maxWidth: 320, marginBottom: 0, flex: 1 }}>
            <input
              className={styles.input}
              placeholder="Search by name, brand, or tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="button" className={styles.btnSecondary} onClick={exportCsv} disabled={visibleChannels.length === 0}>
            ⇩ Export CSV
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => refreshYoutubeStats()}
            disabled={refreshing !== null}
            title="Pulls real subscriber counts from YouTube's Data API for every YouTube row with a URL. Needs YOUTUBE_API_KEY set on the server — see DATA_FIXES.md."
          >
            {refreshing === "all" ? "Refreshing…" : "↻ Refresh YouTube Stats"}
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={mintShareLink}
            disabled={mintingLink}
            title="Read-only public link showing the channel list grouped by section — one stable link, reused on every click (see this button's onClick comment)."
          >
            {mintingLink ? "Creating…" : "🔗 Share Link"}
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setIntroPanelOpen((o) => !o)}
            title="Title, intro text, Canva embed, and Google Sheet preview shown at the top of the public Channel Reference link."
          >
            ✎ Magic Link Intro {introSaved.title || introSaved.text || introSaved.canvaUrl || introSaved.sheetUrl ? "" : "(not set)"}
          </button>
        </div>

        {mintedLinkUrl && (
          <div className={styles.errorBox} style={{ marginBottom: 12, background: "var(--bg-hover)", borderColor: "var(--border-strong)", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>Share link:</span>
            <a href={mintedLinkUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>{mintedLinkUrl}</a>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => navigator.clipboard?.writeText(mintedLinkUrl)}
              style={{ padding: "2px 10px", fontSize: 12 }}
            >
              Copy
            </button>
          </div>
        )}

        {/* Round 362 — "become this... permanently as a custom unique
            page... no rewrite or redirect": sets the share link's own
            token to a memorable string, so /channels/<that string> IS
            the real URL, not an alias pointing at one. Shown regardless
            of whether a link has been minted yet — this can create the
            first-ever link directly with a custom token too. */}
        <div className={styles.errorBox} style={{ marginBottom: 16, background: "var(--bg-hover)", borderColor: "var(--border-strong)", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>Custom link:</span>
          <span style={{ color: "var(--text-faint)" }}>/channels/</span>
          <input
            className={styles.input}
            value={customToken}
            onChange={(e) => setCustomToken(e.target.value)}
            placeholder="vsounder"
            style={{ width: 160 }}
          />
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={setCustomShareToken}
            disabled={customTokenSaving || !customToken.trim()}
            title="Renames the current share link's token to this value — the old link stops working the moment this saves."
          >
            {customTokenSaving ? "Saving…" : mintedLinkUrl ? "Rename link to this" : "Use as the link"}
          </button>
          {customTokenError && <span style={{ color: "var(--danger, #ff6b6b)", fontSize: 12 }}>{customTokenError}</span>}
        </div>

        {/* Round 317 — the magic link's intro text block, per explicit
            team request. Round 328 — toggled from the "✎ Magic Link Intro"
            button above (was a standalone <details> disclosure) so it
            reads as one of the row's actions instead of its own bar. */}
        {introPanelOpen && (
        <div style={{ marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8, padding: "14px" }}>
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 0, marginBottom: 10 }}>
            Shown at the top of the public Channel Reference link (/channels/…), in this order: title, then intro
            text, then the Canva embed, then the Google Sheet preview, then the channel list (unchanged, below).
            Leave any field blank to leave that part off the link.
          </p>
          <div className={styles.field} style={{ marginBottom: 10, maxWidth: 420 }}>
            <label className={styles.fieldLabel}>Title</label>
            <input
              className={styles.input}
              placeholder="vd: VSOUNDER — Channel Reference"
              value={introDraft.title}
              onChange={(e) => setIntroDraft((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>
          <div className={styles.field} style={{ marginBottom: 10 }}>
            <label className={styles.fieldLabel}>Intro Text</label>
            <textarea
              className={styles.input}
              style={{ minHeight: 90, resize: "vertical", width: "100%", boxSizing: "border-box" }}
              placeholder="vd: Trực thuộc hệ sinh thái VIEENT, VSOUNDER sở hữu…"
              value={introDraft.text}
              onChange={(e) => setIntroDraft((prev) => ({ ...prev, text: e.target.value }))}
            />
          </div>
          <div className={styles.field} style={{ marginBottom: 10, maxWidth: 420 }}>
            <label className={styles.fieldLabel}>Canva Embed URL</label>
            <UrlField
              value={introDraft.canvaUrl}
              onChange={(v) => setIntroDraft((prev) => ({ ...prev, canvaUrl: v }))}
              styles={styles}
              placeholder="https://www.canva.com/design/…"
              wide
            />
            <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4 }}>
              A Canva share/view link renders live on the magic link. Any other URL shows as a plain "open" link
              instead (most non-Canva sites block being embedded).
            </p>
          </div>
          <div className={styles.field} style={{ marginBottom: 10, maxWidth: 420 }}>
            <label className={styles.fieldLabel}>Google Sheet URL</label>
            <UrlField
              value={introDraft.sheetUrl}
              onChange={(v) => setIntroDraft((prev) => ({ ...prev, sheetUrl: v }))}
              styles={styles}
              placeholder="https://docs.google.com/spreadsheets/d/…/edit?gid=…"
              wide
            />
            <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4 }}>
              Paste the normal edit link to one tab (the "overall" sheet) — that tab shows as a table on the magic
              link, and the same link doubles as the "view full sheet" click-through. The sheet must be shared as
              "Anyone with the link" (view access), and only this one, currently-saved link is ever fetched.
            </p>
          </div>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={saveIntro}
            disabled={
              introSaving ||
              (introDraft.title === introSaved.title &&
                introDraft.text === introSaved.text &&
                introDraft.canvaUrl === introSaved.canvaUrl &&
                introDraft.sheetUrl === introSaved.sheetUrl)
            }
          >
            {introSaving ? "Saving…" : "Save Intro"}
          </button>
          {introSaveError && (
            <span style={{ color: "var(--error-fg, #ff9d9d)", fontSize: 12, marginLeft: 10 }}>{introSaveError}</span>
          )}
        </div>
        )}

        {refreshResult && (
          <div className={styles.errorBox} style={{ marginBottom: 16, background: refreshResult.error ? undefined : "var(--bg-hover)", borderColor: refreshResult.error ? undefined : "var(--border-strong)", color: refreshResult.error ? undefined : "var(--text-muted)" }}>
            {refreshResult.error ? (
              refreshResult.error
            ) : (
              <>
                Updated {refreshResult.updated?.length || 0}
                {refreshResult.skipped?.length > 0 && `, skipped ${refreshResult.skipped.length} (couldn't resolve URL)`}
                {refreshResult.errors?.length > 0 && `, ${refreshResult.errors.length} error(s): ${refreshResult.errors.map((e) => `${e.name} — ${e.reason}`).join("; ")}`}
                .
              </>
            )}
            <button type="button" onClick={() => setRefreshResult(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", marginLeft: 10, textDecoration: "underline", fontSize: 11 }}>Dismiss</button>
          </div>
        )}

        {/* Round 311 — Group totals, per explicit request ("for each
            group, count up the quantity of channel, and sum for the
            followers of all channels in the group"). Off visibleChannels
            so it tracks the search box / Direct/Partner filter above. */}
        {!loading && visibleChannels.length > 0 && (
          <div style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {groupTotals(visibleChannels).map(([group, t]) => (
              <div
                key={group}
                style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "var(--text-muted)", background: "var(--bg-card)" }}
              >
                <span style={{ fontWeight: 700, color: "var(--text)" }}>{group}</span>
                {" — "}{t.count} channel{t.count === 1 ? "" : "s"} · {t.followers.toLocaleString()} followers
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : visibleChannels.length === 0 ? (
          <div className={styles.emptyState}>{channels.length === 0 ? "No channels yet." : "No channels match that search/filter."}</div>
        ) : (
          // Grouped by Brand first, then by Platform within each brand —
          // per explicit request (was Platform-only before). Channels with
          // no brand set land in a "— No Brand —" bucket at the end so
          // they're not silently dropped from the list.
          Object.entries(
            visibleChannels.reduce((acc, c) => {
              const b = c.brand || "— No Brand —";
              (acc[b] = acc[b] || []).push(c);
              return acc;
            }, {})
          )
            .sort(([a], [b]) => (a === "— No Brand —" ? 1 : b === "— No Brand —" ? -1 : a.localeCompare(b)))
            .map(([brand, brandChannels]) => (
          <div key={brand} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
              {brand} <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>({brandChannels.length})</span>
            </div>
          {BOOKING_PLATFORMS.map((p) => {
            const group = brandChannels.filter((c) => c.platform === p);
            if (group.length === 0) return null;
            return (
              <div key={p} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>{p} ({group.length})</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {group.map((c) => {
                    const isEditing = editingId === c.id;
                    if (isEditing) {
                      return (
                        <div key={c.id} style={{ background: "var(--bg-card)", border: "1px solid var(--accent)", borderRadius: 6, padding: "10px 14px" }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                            <div className={styles.field} style={{ marginBottom: 0, minWidth: 160 }}>
                              <label className={styles.fieldLabel}>Name</label>
                              <input className={styles.input} value={editValues.name} onChange={(e) => updateEditField("name", e.target.value)} />
                            </div>
                            <div className={styles.field} style={{ marginBottom: 0, minWidth: 120 }}>
                              <label className={styles.fieldLabel}>Platform</label>
                              <select className={styles.select} value={editValues.platform} onChange={(e) => updateEditField("platform", e.target.value)}>
                                {BOOKING_PLATFORMS.map((pl) => <option key={pl} value={pl}>{pl}</option>)}
                              </select>
                            </div>
                            <div className={styles.field} style={{ marginBottom: 0, minWidth: 120 }}>
                              <label className={styles.fieldLabel}>Hạng Mục</label>
                              <select className={styles.select} value={editValues.channel_type} onChange={(e) => updateEditField("channel_type", e.target.value)}>
                                {BOOKING_CHANNEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <div className={styles.field} style={{ marginBottom: 0, minWidth: 160 }}>
                              <label className={styles.fieldLabel}>Brand</label>
                              <input className={styles.input} value={editValues.brand} onChange={(e) => updateEditField("brand", e.target.value)} placeholder="e.g. VPOP" />
                            </div>
                            <div className={styles.field} style={{ marginBottom: 0, minWidth: 180 }}>
                              <label className={styles.fieldLabel}>Group</label>
                              <input className={styles.input} value={editValues.channel_group} onChange={(e) => updateEditField("channel_group", e.target.value)} placeholder="e.g. VPOP - COMMUNITY" />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                            <div className={styles.field} style={{ marginBottom: 0, minWidth: 260, flex: 1 }}>
                              <label className={styles.fieldLabel}>URL</label>
                              <input className={styles.input} value={editValues.url} onChange={(e) => updateEditField("url", e.target.value)} placeholder="https://…" />
                            </div>
                            <div className={styles.field} style={{ marginBottom: 0, minWidth: 120 }}>
                              <label className={styles.fieldLabel}>Followers</label>
                              <input className={styles.input} value={editValues.follower_count} onChange={(e) => updateEditField("follower_count", e.target.value)} placeholder="e.g. 39500" />
                            </div>
                            <div className={styles.field} style={{ marginBottom: 0, minWidth: 160, flex: 1 }}>
                              <label className={styles.fieldLabel}>Note</label>
                              <input className={styles.input} value={editValues.note} onChange={(e) => updateEditField("note", e.target.value)} />
                            </div>
                          </div>
                          {saveError && <div style={{ color: "#ff6b6b", fontSize: 11, marginBottom: 8 }}>{saveError}</div>}
                          <div style={{ display: "flex", gap: 8 }}>
                            <button className={styles.btnPrimary} onClick={() => saveEdit(c.id)}>Save</button>
                            <button className={styles.btnSmall} onClick={cancelEdit}>Cancel</button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 14px", gap: 10 }}>
                        <div style={{ overflow: "hidden" }}>
                          <div>
                            {c.name} <span style={{ color: "var(--text-faint)", fontSize: 11 }}>({c.channel_type}{c.brand ? ` · ${c.brand}` : ""}{c.channel_group ? ` · ${c.channel_group}` : ""})</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-faint)", display: "flex", gap: 10, marginTop: 2 }}>
                            {c.follower_count != null && (
                              <span>
                                {c.follower_count.toLocaleString()} followers
                                {c.stats_synced_at && ` (synced ${new Date(c.stats_synced_at).toLocaleDateString("vi-VN")})`}
                              </span>
                            )}
                            {c.url && (
                              <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
                                {c.url}
                              </a>
                            )}
                            {c.note && <span>{c.note}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 12, flexShrink: 0, alignItems: "center" }}>
                          {c.platform === "YouTube" && c.url && (
                            <button
                              onClick={() => refreshYoutubeStats([c.id])}
                              disabled={refreshing !== null}
                              title="Refresh this channel's subscriber count from YouTube"
                              style={{ background: "none", border: "none", color: "var(--accent-soft)", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}
                            >
                              {refreshing === c.id ? "…" : "↻"}
                            </button>
                          )}
                          <button onClick={() => startEdit(c)} style={{ background: "none", border: "none", color: "var(--accent-soft)", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>Edit</button>
                          <button onClick={() => remove(c)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 14 }}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          </div>
            ))
        )}
      </div>
    </div>
    </AppShell>
  );
}

function StatCard({ label, value, active, onClick, onClear }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        cursor: "pointer",
        background: active ? "rgba(255,107,26,0.08)" : undefined,
        border: active ? "1px solid var(--accent)" : undefined,
        borderRadius: active ? 8 : undefined,
      }}
      className={active ? undefined : styles.statCard}
    >
      {active && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          style={{ position: "absolute", top: 6, right: 6, background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 12, padding: 0 }}
        >
          ✕
        </button>
      )}
      <div className={styles.statLabel} style={active ? { padding: "16px 16px 0" } : undefined}>{label}</div>
      <div className={styles.statValue} style={active ? { padding: "0 16px 16px" } : undefined}>{value}</div>
    </div>
  );
}
