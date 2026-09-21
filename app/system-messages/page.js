"use client";

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { loadMyActiveSystemMessages, getHiddenSystemMessageIds, hideSystemMessageForProfile, getSnoozedSystemMessageIds } from "../../lib/systemMessages";
import styles from "../shared.module.css";

// Round 404 item 3 — the recipient side of System Messages: whatever the
// app has auto-generated for this profile in the last 24h (weekly task
// reminder, a release's critical info changing, the Bổ Sung DATA daily
// digest), read-only, same shape as app/secret-messages/page.js's Inbox
// tab but with no Send side at all — nobody composes these by hand, see
// lib/systemMessages.js's header comment. "Hide" only drops it out of
// THIS profile's own list/badge (localStorage, same convention as Secret
// Messages) — the underlying row stays exactly as-is for dev's separate
// /system-log view (app/system-log/page.js), which ignores expires_at
// entirely and never reads this hidden list.
export default function SystemMessagesPage() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !profile?.id) return;
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [profile?.id]);

  async function load() {
    const rows = await loadMyActiveSystemMessages(supabase, profile);
    const hidden = getHiddenSystemMessageIds(profile.id);
    // Round 406 — also drop anything snoozed via the popup's "Hide until
    // next login" button (lib/Sidebar.js), so this inbox never shows
    // something the sidebar badge is currently hiding — it comes back on
    // its own once the 24h AFK watcher clears the snooze.
    const snoozed = getSnoozedSystemMessageIds(profile.id);
    setMessages(rows.filter((m) => !hidden.includes(m.id) && !snoozed.includes(m.id)));
    setLoading(false);
  }

  function hide(id) {
    if (!profile?.id) return;
    hideSystemMessageForProfile(profile.id, id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 720 }}>
          <div className={styles.eyebrow}>// System</div>
          <h1 className={styles.title}>System Messages</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -12, marginBottom: 20 }}>
            Auto-generated notices — weekly task reminders, a release's info changing after you were assigned, your
            open Bổ Sung DATA tickets. Only visible to you, and clears itself after 24h either way. Hide one once
            you're done with it — that only clears it from your own view.
          </p>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : messages.length === 0 ? (
            <div className={styles.emptyState}>Nothing here right now.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    border: "1px solid var(--border-strong)",
                    borderRadius: 8,
                    padding: 16,
                    background: "var(--bg-card)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                      {new Date(m.created_at).toLocaleString()}
                    </div>
                    <button
                      onClick={() => hide(m.id)}
                      style={{ flexShrink: 0, background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", color: "var(--text-faint)", cursor: "pointer", fontSize: 11 }}
                      title="Hide from your own list"
                    >
                      Hide
                    </button>
                  </div>
                  {m.title && <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>{m.title}</div>}
                  <div style={{ fontSize: 13, color: "var(--text)", whiteSpace: "pre-wrap", marginBottom: m.link ? 10 : 0 }}>{m.body}</div>
                  {m.link && (
                    <a href={m.link} style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
                      View →
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
