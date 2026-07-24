"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import styles from "../shared.module.css";

const BOOKING_PLATFORMS = ["TikTok", "Facebook", "Instagram", "YouTube"];
const BOOKING_CHANNEL_TYPES = ["Direct", "Partner"];

export default function BookingChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("TikTok");
  const [channelType, setChannelType] = useState("Direct");
  const [loading, setLoading] = useState(true);

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
    await supabase.from("booking_channels").insert({ name: name.trim(), platform, channel_type: channelType, sort_order: maxSort + 1 });
    setName("");
    load();
  }

  async function remove(c) {
    await supabase.from("booking_channels").delete().eq("id", c.id);
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
            <label className={styles.fieldLabel}>Channel Type</label>
            <select className={styles.select} value={channelType} onChange={(e) => setChannelType(e.target.value)}>
              {BOOKING_CHANNEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 180 }}>
            <label className={styles.fieldLabel}>Channel Name</label>
            <input className={styles.input} placeholder="e.g. ENVI" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className={styles.btnPrimary} type="submit">+ Add</button>
        </form>

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : channels.length === 0 ? (
          <div className={styles.emptyState}>No channels yet.</div>
        ) : (
          BOOKING_PLATFORMS.map((p) => {
            const group = channels.filter((c) => c.platform === p);
            if (group.length === 0) return null;
            return (
              <div key={p} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>{p}</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {group.map((c) => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 14px" }}>
                      <span>{c.name} <span style={{ color: "var(--text-faint)", fontSize: 11 }}>({c.channel_type})</span></span>
                      <button onClick={() => remove(c)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 14 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
    </AppShell>
  );
}
