"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";

// In-app notification bell — Config item 5a. Polls every 30s (matching
// AuthContext's existing polling convention) rather than a realtime
// subscription, since this app has no other realtime usage yet and 30s is
// plenty responsive for "a ticket landed on your team." Fed by the
// notify_on_ticket_insert / notify_on_ticket_complete triggers in
// add-notifications.sql — this component only ever reads, never decides
// who gets notified (that's server-side, so it fires the same whether the
// change came from this app or a direct SQL edit).
//
// Redesigned into a bigger two-column panel: a left sidebar categorizes
// every notification by the workstation/team it actually belongs to
// (read off the linked ticket's tab — executor_team + label), so someone
// with a wide spread of notifications (dev/admin viewing everything, or
// someone on multiple teams) can jump straight to "Marketing" or
// "OPS · Media Booking" instead of scrolling one long flat list. A
// notification with no linked ticket (none currently fire that way, but
// nothing guarantees that stays true) falls into "General".
export default function NotificationBell() {
  const router = useRouter();
  const { profile } = useAuth(); // effective (possibly "view as") profile — notifications for whoever's UI they're seeing
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("all"); // "all" | `${team}||${label}`

  useEffect(() => {
    if (!supabase || !profile?.id) return;
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [profile?.id]);

  async function load() {
    // Nested select pulls the linked ticket's tab (key/label/executor_team)
    // in the same round trip — that's the only place team/workstation
    // actually lives; notifications itself only stores ticket_id.
    const { data } = await supabase
      .from("notifications")
      .select("*, tickets(tab_id, ticket_tabs(key, label, executor_team))")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems(data || []);
  }

  function categoryOf(n) {
    const tab = n.tickets?.ticket_tabs;
    return { team: tab?.executor_team || "General", label: tab?.label || null };
  }

  const categories = useMemo(() => {
    const map = new Map(); // key -> { team, label, count, unread }
    for (const n of items) {
      const { team, label } = categoryOf(n);
      const key = `${team}||${label || ""}`;
      const entry = map.get(key) || { key, team, label, count: 0, unread: 0 };
      entry.count += 1;
      if (!n.read_at) entry.unread += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => a.team.localeCompare(b.team) || (a.label || "").localeCompare(b.label || ""));
  }, [items]);

  const filteredItems = useMemo(() => {
    if (category === "all") return items;
    return items.filter((n) => {
      const { team, label } = categoryOf(n);
      return `${team}||${label || ""}` === category;
    });
  }, [items, category]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  async function markRead(n) {
    if (n.read_at) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
  }

  async function markAllRead() {
    const unread = items.filter((n) => !n.read_at);
    if (unread.length === 0) return;
    setItems((prev) => prev.map((x) => (x.read_at ? x : { ...x, read_at: new Date().toISOString() })));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unread.map((n) => n.id));
  }

  function openNotification(n) {
    markRead(n);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  if (!profile) return null;

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{ cursor: "pointer", position: "relative", padding: "0 4px" }}
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute", top: -4, right: -2, background: "#e0392c", color: "#fff",
              borderRadius: 10, fontSize: 9, fontWeight: 800, padding: "1px 5px", lineHeight: 1.4,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </div>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "100%", right: 0, zIndex: 210, marginTop: 8,
            background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8,
            width: 640, maxWidth: "90vw", height: 460, display: "flex", overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          {/* Left sidebar — workstation/team categories */}
          <div style={{ width: 190, flexShrink: 0, borderRight: "1px solid var(--border)", overflowY: "auto", background: "rgba(255,255,255,0.02)" }}>
            <div style={{ padding: "10px 12px", fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>
              Categories
            </div>
            <CategoryRow
              label="All"
              count={items.length}
              unread={unreadCount}
              active={category === "all"}
              onClick={() => setCategory("all")}
            />
            {categories.map((c) => (
              <CategoryRow
                key={c.key}
                label={c.label ? `${c.team} · ${c.label}` : c.team}
                count={c.count}
                unread={c.unread}
                active={category === c.key}
                onClick={() => setCategory(c.key)}
              />
            ))}
          </div>

          {/* Right side — notification list for the selected category */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 10, cursor: "pointer" }}>
                  Mark all read
                </button>
              )}
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              {filteredItems.length === 0 ? (
                <div style={{ padding: 20, fontSize: 12, color: "var(--text-faint)", textAlign: "center" }}>No notifications here.</div>
              ) : (
                filteredItems.map((n) => {
                  const { team, label } = categoryOf(n);
                  return (
                    <div
                      key={n.id}
                      onClick={() => openNotification(n)}
                      style={{
                        padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                        background: n.read_at ? "transparent" : "rgba(255,107,26,0.06)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                        <div style={{ fontSize: 12, fontWeight: n.read_at ? 400 : 700, color: "var(--text)" }}>{n.title}</div>
                        <div style={{ fontSize: 9, color: "var(--text-dim)", flexShrink: 0, whiteSpace: "nowrap" }}>
                          {label ? `${team} · ${label}` : team}
                        </div>
                      </div>
                      {n.body && <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 2 }}>{n.body}</div>}
                      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{new Date(n.created_at).toLocaleString()}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryRow({ label, count, unread, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
        padding: "8px 12px", cursor: "pointer", fontSize: 11,
        background: active ? "rgba(255,107,26,0.12)" : "transparent",
        color: active ? "var(--accent)" : "var(--text)",
        fontWeight: active ? 700 : 400,
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        {unread > 0 && (
          <span style={{ background: "#e0392c", color: "#fff", borderRadius: 8, fontSize: 9, fontWeight: 800, padding: "1px 5px" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        <span style={{ color: "var(--text-dim)" }}>{count}</span>
      </span>
    </div>
  );
}
