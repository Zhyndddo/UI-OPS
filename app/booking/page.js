"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate } from "../../lib/helpers";
import TypeSwitcher from "../../lib/TypeSwitcher";
import styles from "../shared.module.css";

const PLATFORMS = ["TikTok", "Facebook", "Instagram", "YouTube"];
const ROUNDS = ["INT", "Đợt 1", "Đợt 2"];
const STATUS_FILTERS = ["Tất cả", "Chưa BK", "Đã gửi", "Done"];
const STATUS_MAP = { "Chưa BK": "Chưa Booking", "Đã gửi": "Đã Gửi", Done: "Done" };
const STATUS_COLOR = {
  "Chưa Booking": "#666",
  "Đã Gửi": "#ffca4d",
  Done: "#7ee6a8",
};

export default function BookingBoard() {
  const [releases, setReleases] = useState([]);
  const [entries, setEntries] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [round, setRound] = useState("INT"); // 'INT' | 'Đợt 1' | 'Đợt 2' — the 3 round tabs
  const [channelType, setChannelType] = useState("Direct"); // 'Direct' | 'Partner' — this is the one that gates on Phụ Lục, not round
  const [statusFilter, setStatusFilter] = useState("Tất cả");
  const [expandedCell, setExpandedCell] = useState(null); // `${releaseId}:${platform}` or null

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: rels } = await supabase
      .from("releases")
      .select("id, did, title, main_artist, release_date, link_phu_luc, phu_luc_ngay_gui, phu_luc_ngay_ky")
      .order("release_date", { ascending: false });
    const { data: ents } = await supabase.from("media_booking_entries").select("*");
    const { data: chans } = await supabase.from("booking_channels").select("*").order("sort_order");
    setReleases(rels || []);
    setEntries(ents || []);
    setChannels(chans || []);
    setLoading(false);
  }

  // Mirrors phu_luc_status() in schema.sql
  function phuLucStatus(r) {
    if (r.link_phu_luc && r.phu_luc_ngay_ky) return "Đã Ký";
    if (r.link_phu_luc && r.phu_luc_ngay_gui) return "Chờ Ký";
    if (r.link_phu_luc) return "Đã Soạn";
    return "Chưa Soạn";
  }

  // Round and channel_type are independent — both filters apply together.
  const roundEntries = useMemo(() => {
    return entries.filter((e) => e.booking_round === round && e.channel_type === channelType);
  }, [entries, round, channelType]);

  const filteredReleases = useMemo(() => {
    return releases.filter((r) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (![r.title, r.main_artist, r.did].some((f) => (f || "").toLowerCase().includes(q))) return false;
      }
      if (month && r.release_date) {
        if (!r.release_date.startsWith(month)) return false;
      }
      if (statusFilter !== "Tất cả") {
        const wanted = STATUS_MAP[statusFilter];
        const relEntries = roundEntries.filter((e) => e.release_id === r.id);
        const hasStatus = relEntries.some((e) => e.status === wanted);
        if (!hasStatus && !(wanted === "Chưa Booking" && relEntries.length === 0)) return false;
      }
      return true;
    });
  }, [releases, search, month, statusFilter, roundEntries]);

  const stats = useMemo(() => {
    const total = releases.length;
    let done = 0, sent = 0, notBooked = 0;
    releases.forEach((r) => {
      const relEntries = roundEntries.filter((e) => e.release_id === r.id);
      if (relEntries.length === 0) { notBooked++; return; }
      if (relEntries.every((e) => e.status === "Done")) done++;
      else if (relEntries.some((e) => e.status === "Đã Gửi" || e.status === "Done")) sent++;
      else notBooked++;
    });
    return { total, done, sent, notBooked };
  }, [releases, roundEntries]);

  async function addEntry(releaseId, platform, channelName, link) {
    if (!link.trim()) return;
    const { data, error } = await supabase
      .from("media_booking_entries")
      .insert({ release_id: releaseId, booking_round: round, platform, channel_type: channelType, channel_name: channelName || null, link, status: "Chưa Booking" })
      .select()
      .single();
    if (!error && data) setEntries((prev) => [...prev, data]);
  }

  async function cycleStatus(entry) {
    const order = ["Chưa Booking", "Đã Gửi", "Done"];
    const next = order[(order.indexOf(entry.status) + 1) % order.length];
    await supabase.from("media_booking_entries").update({ status: next }).eq("id", entry.id);
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: next } : e)));
  }

  function exportCsv() {
    const rows = [["DID", "Title", "Artist", ...PLATFORMS.flatMap((p) => [`${p} Links`, `${p} Status Summary`])]];
    filteredReleases.forEach((r) => {
      const row = [r.did || "", r.title, r.main_artist];
      PLATFORMS.forEach((platform) => {
        const cellEntries = roundEntries.filter((e) => e.release_id === r.id && e.platform === platform);
        row.push(cellEntries.map((e) => e.link).join(" | "));
        row.push(cellEntries.map((e) => e.status).join(" | "));
      });
      rows.push(row);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "booking-board.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 1300 }}>
        <TypeSwitcher kind="workstation" current="booking" />
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Booking Tracker</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>Booking Board</h1>
          </div>
          <button className={styles.btnSecondary} onClick={exportCsv}>⇩ Export CSV</button>
        </div>

        <div className={styles.statRow} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Tổng Releases</div>
            <div className={styles.statValue}>{stats.total}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Done</div>
            <div className={styles.statValue} style={{ color: "#7ee6a8" }}>{stats.done}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Sent</div>
            <div className={styles.statValue} style={{ color: "#ffca4d" }}>{stats.sent}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Chưa Booking</div>
            <div className={styles.statValue} style={{ color: "#888" }}>{stats.notBooked}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <input
            className={styles.input}
            style={{ width: 240 }}
            placeholder="Tìm tên bài, nghệ sĩ, DID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            type="month"
            className={styles.input}
            style={{ width: 160 }}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden" }}>
            {ROUNDS.map((r) => (
              <button
                key={r}
                onClick={() => setRound(r)}
                style={{
                  padding: "9px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  background: round === r ? "#ff6b1a" : "transparent",
                  color: round === r ? "#0a0a0a" : "#ccc",
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden" }}>
            {["Direct", "Partner"].map((c) => (
              <button
                key={c}
                onClick={() => setChannelType(c)}
                style={{
                  padding: "9px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  background: channelType === c ? "#ff6b1a" : "transparent",
                  color: channelType === c ? "#0a0a0a" : "#ccc",
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden" }}>
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: "9px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  background: statusFilter === s ? "#ff6b1a" : "transparent",
                  color: statusFilter === s ? "#0a0a0a" : "#ccc",
                }}
              >
                {s}
              </button>
            ))}
          </div>
          {(search || month || statusFilter !== "Tất cả") && (
            <button
              className={styles.btnSmall}
              style={{ borderColor: "#c0392b", color: "#e57373" }}
              onClick={() => { setSearch(""); setMonth(""); setStatusFilter("Tất cả"); }}
            >
              ✕ Clear
            </button>
          )}
        </div>

        {channelType === "Partner" && (
          <div className={styles.errorBox} style={{ background: "#1a1a1a", borderColor: "#5a4a1a", color: "#ffca4d", marginBottom: 16 }}>
            ⚠ Partner booking should wait for releases whose Phụ Lục isn't signed yet — check the badge next to each release below. Not a hard block yet, just a heads up.
          </div>
        )}

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : filteredReleases.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#1c1c1c", letterSpacing: 4 }}>EMPTY</div>
            <div style={{ color: "#555", marginTop: -12 }}>Không tìm thấy</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
          <table className={styles.table} style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>Release</th>
                {PLATFORMS.map((p) => (
                  <th key={p} style={{ textAlign: "center" }}>{p}<div style={{ fontWeight: 400, color: "#666", fontSize: 10 }}>{round} · {channelType}</div></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredReleases.map((r) => (
                <tr key={r.id}>
                  <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>
                    <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                    <div style={{ fontSize: 11, color: "#666" }}>{r.main_artist} · {r.did} · {fmtDate(r.release_date)}</div>
                    {channelType === "Partner" && (
                      <span
                        className={styles.statusBadge}
                        style={{
                          marginTop: 4,
                          display: "inline-block",
                          background: phuLucStatus(r) === "Đã Ký" ? "rgba(76,175,80,0.15)" : "rgba(244,67,54,0.15)",
                          color: phuLucStatus(r) === "Đã Ký" ? "#7ee6a8" : "#ff8a80",
                        }}
                      >
                        Phụ Lục: {phuLucStatus(r)}
                      </span>
                    )}
                  </td>
                  {PLATFORMS.map((platform) => (
                    <PlatformCell
                      key={platform}
                      releaseId={r.id}
                      platform={platform}
                      entries={roundEntries.filter((e) => e.release_id === r.id && e.platform === platform)}
                      expanded={expandedCell === `${r.id}:${platform}`}
                      onToggle={() => setExpandedCell(expandedCell === `${r.id}:${platform}` ? null : `${r.id}:${platform}`)}
                      onAdd={(channelName, link) => addEntry(r.id, platform, channelName, link)}
                      onCycleStatus={cycleStatus}
                      channelOptions={channels.filter((c) => c.platform === platform && c.channel_type === channelType)}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
    </AppShell>
  );
}

function PlatformCell({ releaseId, platform, entries, expanded, onToggle, onAdd, onCycleStatus, channelOptions }) {
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [pickedChannel, setPickedChannel] = useState(null); // null = step 1 (picking), set = step 2 (url input)
  const [link, setLink] = useState("");
  const done = entries.filter((e) => e.status === "Done").length;
  const sent = entries.filter((e) => e.status === "Đã Gửi").length;
  const all = entries.length;

  function openPopup() {
    setPickedChannel(null);
    setLink("");
    setShowAddPopup(true);
  }

  function submitAdd() {
    onAdd(pickedChannel, link);
    setShowAddPopup(false);
  }

  return (
    <td style={{ verticalAlign: "top", minWidth: 160, position: "relative" }}>
      <div
        onClick={onToggle}
        style={{ cursor: "pointer", fontSize: 11, textAlign: "center", color: "#999" }}
        title={entries.map((e) => `${e.channel_name ? e.channel_name + ": " : ""}${e.status}: ${e.link}`).join("\n")}
      >
        <span style={{ color: "#7ee6a8" }}>✓{done}</span>
        {" · "}
        <span style={{ color: "#ffca4d" }}>↑{sent}</span>
        {" · "}
        <span>{all}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 6, background: "#141414", border: "1px solid #262626", borderRadius: 6, padding: 8 }}>
          {entries.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, marginBottom: 4, gap: 6 }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>
                {e.channel_name && <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{e.channel_name}: </span>}
                <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ color: "#ccc" }}>
                  {e.link}
                </a>
              </div>
              <button
                onClick={() => onCycleStatus(e)}
                style={{ background: "none", border: "none", cursor: "pointer", color: STATUS_COLOR[e.status], fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}
              >
                {e.status}
              </button>
            </div>
          ))}
          <button className={styles.btnSmall} style={{ marginTop: 4, width: "100%" }} onClick={openPopup}>
            + Add Link
          </button>
        </div>
      )}

      {showAddPopup && (
        <>
          <div onClick={() => setShowAddPopup(false)} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: 0, left: "100%", marginLeft: 6, zIndex: 300, width: 260,
              background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            {pickedChannel === null ? (
              // Step 1 — pick which channel this link belongs to
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 8 }}>
                  Which channel? — {platform}
                </div>
                {channelOptions.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8 }}>
                    No channels configured for this platform yet — add one in Config → Booking Channels.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
                    {channelOptions.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setPickedChannel(c.name)}
                        style={{ textAlign: "left", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "var(--text)", cursor: "pointer" }}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              // Step 2 — channel confirmed on the left, URL input on the right
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 8 }}>
                  Add Link
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div>
                    <label style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Channel</label>
                    <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", fontSize: 12, color: "#ff9d5c", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {pickedChannel}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>URL</label>
                    <input
                      autoFocus
                      className={styles.input}
                      style={{ padding: "6px 8px", fontSize: 12 }}
                      placeholder="https://…"
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button className={styles.btnSmall} onClick={() => setPickedChannel(null)} style={{ flex: 1 }}>← Back</button>
                  <button className={styles.btnPrimary} onClick={submitAdd} style={{ flex: 1, padding: "7px 0", fontSize: 12 }}>Add</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </td>
  );
}
