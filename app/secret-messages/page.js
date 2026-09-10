"use client";

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { loadMyActiveSecretMessages, getHiddenSecretMessageIds, hideSecretMessageForProfile } from "../../lib/secretMessages";
import styles from "../shared.module.css";

// Round 269 — the recipient side of Secret Messages: whatever's currently
// targeted at this profile (individual / their segment / their subteam /
// their role / everyone), read-only. No DELETE here on purpose — only dev
// can remove the underlying row (Config → Secret Messages), per explicit
// spec ("save on a secret sidebar item for them to read, until dev delete
// that message"), and Round 273 later locked that down to a permanent,
// un-deletable record.
//
// Round 297 — added a per-recipient HIDE, which is a different thing: once
// you're done with a message, hiding it drops it out of YOUR OWN sidebar
// badge/link and this list, for clarity, without touching the row dev
// still sees on Config → Secret Messages. Purely client-side (localStorage,
// same pattern as the existing "seen" list that gates the one-time popup)
// — per explicit request ("it should be deletable or hide so that when the
// secrets stuff is done, we can hide it for clarity").
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
    const hidden = getHiddenSecretMessageIds(profile.id);
    setMessages(rows.filter((m) => !hidden.includes(m.id)));
    setLoading(false);
  }

  function hide(id) {
    if (!profile?.id) return;
    hideSecretMessageForProfile(profile.id, id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 720 }}>
          <div className={styles.eyebrow}>// Secret</div>
          <h1 className={styles.title}>Secret Messages</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
            Only visible to you. Hide one once you're done with it — that only clears it from your own view, it
            stays on record for dev.
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
                      {m.sender?.name || "Dev"} · {new Date(m.created_at).toLocaleString()}
                    </div>
                    <button
                      onClick={() => hide(m.id)}
                      style={{ flexShrink: 0, background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", color: "var(--text-faint)", cursor: "pointer", fontSize: 11 }}
                      title="Hide from your own list — dev still sees it on record"
                    >
                      Hide
                    </button>
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
