"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import styles from "../shared.module.css";

const BOOKING_PLATFORMS = ["TikTok", "Facebook", "Instagram", "YouTube", "Thread"];
const BOOKING_CHANNEL_TYPES = ["Direct", "Partner"];

function editStateFor(c) {
  return {
    name: c.name || "",
    platform: c.platform || "TikTok",
    channel_type: c.channel_type || "Direct",
    brand: c.brand || "",
    url: c.url || "",
    follower_count: c.follower_count != null ? String(c.follower_count) : "",
    note: c.note || "",
  };
}

export default function BookingChannelsPage() {
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

  useEffect(() => { if (supabase) load(); }, []);

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
    ? channels.filter((c) => `${c.name} ${c.brand || ""} ${c.note || ""}`.toLowerCase().includes(search.trim().toLowerCase()))
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
    const rows = [["Platform", "Hạng Mục", "Brand", "Name", "URL", "Follower Count", "Note"]];
    visibleChannels.forEach((c) => {
      rows.push([c.platform || "", c.channel_type || "", c.brand || "", c.name || "", c.url || "", c.follower_count != null ? c.follower_count : "", c.note || ""]);
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
        </div>

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
                            {c.name} <span style={{ color: "var(--text-faint)", fontSize: 11 }}>({c.channel_type}{c.brand ? ` · ${c.brand}` : ""})</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-faint)", display: "flex", gap: 10, marginTop: 2 }}>
                            {c.follower_count != null && <span>{c.follower_count.toLocaleString()} followers</span>}
                            {c.url && (
                              <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
                                {c.url}
                              </a>
                            )}
                            {c.note && <span>{c.note}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 12, flexShrink: 0, alignItems: "center" }}>
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
