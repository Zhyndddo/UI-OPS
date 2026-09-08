"use client";

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { loadMyActiveSecretMessages } from "../../lib/secretMessages";
import styles from "../shared.module.css";

// Round 269 — the recipient side of Secret Messages: whatever's currently
// targeted at this profile (individual / their segment / their subteam /
// their role / everyone), read-only. No delete here on purpose — only dev
// can remove a message (Config → Secret Messages), per explicit spec
// ("save on a secret sidebar item for them to read, until dev delete that
// message"). Sidebar.js only shows the nav link to this page at all when
// this profile has at least one active message — see its own polling.
export default function SecretMessagesPage() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !profile?.id) return;
    load();
    // Matches NotificationBell's existing 30s polling convention — a
    // message that gets deleted by dev while this page is open will drop
    // off within 30s rather than needing a manual refresh.
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [profile?.id]);

  async function load() {
    const rows = await loadMyActiveSecretMessages(supabase, profile);
    setMessages(rows);
    setLoading(false);
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 720 }}>
          <div className={styles.eyebrow}>// Secret</div>
          <h1 className={styles.title}>Secret Messages</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
            Only visible to you. Stays here until it's removed.
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
                  <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8 }}>
                    {m.sender?.name || "Dev"} · {new Date(m.created_at).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text)", whiteSpace: "pre-wrap" }}>{m.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
