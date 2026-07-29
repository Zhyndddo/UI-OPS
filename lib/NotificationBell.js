"use client";

import { useEffect, useState } from "react";
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
export default function NotificationBell() {
  const router = useRouter();
  const { profile } = useAuth(); // effective (possibly "view as") profile — notifications for whoever's UI they're seeing
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!supabase || !profile?.id) return;
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [profile?.id]);

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems(data || []);
  }

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
            width: 320, maxHeight: 420, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 10, cursor: "pointer" }}>
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: 20, fontSize: 12, color: "var(--text-faint)", textAlign: "center" }}>No notifications yet.</div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                onClick={() => openNotification(n)}
                style={{
                  padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                  background: n.read_at ? "transparent" : "rgba(255,107,26,0.06)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: n.read_at ? 400 : 700, color: "var(--text)", marginBottom: 2 }}>{n.title}</div>
                {n.body && <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 2 }}>{n.body}</div>}
                <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
