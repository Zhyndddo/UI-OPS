"use client";

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import {
  loadMyActiveSecretMessages, getHiddenSecretMessageIds, hideSecretMessageForProfile,
  describeTarget, allowedSecretMessageTargetTypes, scopedSecretMessageProfiles,
  scopedSecretMessageSubteamChoices, isSecretMessageInAdminScope,
} from "../../lib/secretMessages";
import { ROLES, ROLE_LABELS, canSendSecretMessages, hasUnrestrictedSecretMessageReach } from "../../lib/permissions";
import { TEAMS, TEAM_SUBTEAMS } from "../../lib/teamTypes";
import { MARKETING_SUBTEAM_TAGS } from "../../lib/projectTags";
import styles from "../shared.module.css";

// Round 264/Config's own "hardcoded, not admin-editable" subteam map,
// duplicated here rather than imported from app/config/page.js since that
// file doesn't export it — same source lists (Marketing's own from
// lib/projectTags.js, everyone else's from lib/teamTypes.js) it was always
// built from.
const SUBTEAM_OPTIONS = { Marketing: MARKETING_SUBTEAM_TAGS, ...TEAM_SUBTEAMS };

// Round 269 — the recipient side of Secret Messages: whatever's currently
// targeted at this profile (individual / their segment / their subteam /
// their role / everyone), read-only. No DELETE here on purpose — only dev
// can remove the underlying row, per explicit spec ("save on a secret
// sidebar item for them to read, until dev delete that message"), and
// Round 273 later locked that down to a permanent, un-deletable record.
//
// Round 297 — added a per-recipient HIDE, which is a different thing: once
// you're done with a message, hiding it drops it out of YOUR OWN sidebar
// badge/link and this list, for clarity, without touching the row dev
// still sees. Purely client-side (localStorage, same pattern as the
// existing "seen" list that gates the one-time popup).
//
// Round 306 — this page used to be JUST the read-only inbox above; the
// SEND side lived entirely inside Config → Secret Messages, dev-only. Per
// explicit request this moves onto its own sidebar item and widens sending
// from dev-only to a team-based allowance: any admin can send now, but
// (Legal excepted) only within their own team — see
// lib/permissions.js's canSendSecretMessages/hasUnrestrictedSecretMessageReach
// and lib/secretMessages.js's scoping helpers for exactly what that
// restricts. The page is now two tabs: "Inbox" (unchanged from before) and
// "Send" (only rendered at all for canSendSecretMessages(profile)).
export default function SecretMessagesPage() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const canSend = canSendSecretMessages(profile);
  const [tab, setTab] = useState("inbox");
  // Once we know whether this profile has anything in their inbox, land
  // them on Send by default if they don't (an admin who's only here to
  // send shouldn't have to click past an empty "Nothing here right now.")
  // — but never override a tab they've already clicked into.
  const [tabDefaulted, setTabDefaulted] = useState(false);

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
    const visible = rows.filter((m) => !hidden.includes(m.id));
    setMessages(visible);
    setLoading(false);
    if (!tabDefaulted) {
      setTabDefaulted(true);
      if (visible.length === 0 && canSend) setTab("send");
    }
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

          {canSend && (
            <div style={{ display: "flex", gap: 4, marginTop: 16, marginBottom: 20 }}>
              {[["inbox", "Inbox"], ["send", "Send"]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`${styles.tabBtn} ${tab === key ? styles.tabBtnActive : ""}`}
                  style={{ border: tab === key ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: tab === key ? "rgba(255,107,26,0.1)" : "transparent" }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {tab === "inbox" && (
            <>
              <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
                Only visible to you. Hide one once you're done with it — that only clears it from your own view, it
                stays on record.
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
                          title="Hide from your own list — still on record"
                        >
                          Hide
                        </button>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text)", whiteSpace: "pre-wrap" }}>{m.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "send" && canSend && <SendSecretMessageSection profile={profile} />}
        </div>
      </div>
    </AppShell>
  );
}

// Round 306 — moved here (and rewritten for team scoping) from Config's
// old dev-only SecretMessagesSection. See this file's header comment and
// lib/secretMessages.js's scoping helpers for the full story.
//
// Round 273 — the Delete button was removed entirely, per explicit request
// ("no delete message for secret message from there, incase someone do
// some shady stuff"). `deleted_at` was never wired to remove a row from
// THIS list — it only ever controlled whether the RECIPIENT still sees it.
// Round 299 brought back a non-destructive "Clear for recipient" /
// "Restore" pair built on that same column: recipient stops seeing it,
// this history keeps showing it forever (greyed + tagged). No row is ever
// removed or hidden from an unrestricted sender's view of their own scope.
function SendSecretMessageSection({ profile }) {
  const unrestricted = hasUnrestrictedSecretMessageReach(profile);
  const targetTypes = allowedSecretMessageTargetTypes(profile);
  const [messages, setMessages] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [targetType, setTargetType] = useState(targetTypes[0]);
  const [targetValue, setTargetValue] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: msgs }, { data: profs }] = await Promise.all([
      supabase.from("secret_messages").select("*, sender:profiles!secret_messages_created_by_fkey(name)").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name, email, segment, role").order("name"),
    ]);
    setMessages(msgs || []);
    setProfiles(profs || []);
    setLoading(false);
  }

  async function toggleClearedForRecipient(m) {
    const { error: err } = await supabase
      .from("secret_messages")
      .update({ deleted_at: m.deleted_at ? null : new Date().toISOString() })
      .eq("id", m.id);
    if (!err) load();
  }

  const allProfiles = scopedSecretMessageProfiles(profile, profiles);
  const allSubteamChoices = Object.entries(SUBTEAM_OPTIONS).flatMap(([team, names]) => names.map((n) => ({ team, name: n })));
  const subteamChoices = scopedSecretMessageSubteamChoices(profile, allSubteamChoices);
  // Lookups for scoping the history list below — built once per render
  // from data already loaded anyway (see isSecretMessageInAdminScope's
  // own comment for why 'individual'/'subteam' targets need these to
  // resolve back to a team).
  const profileById = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const subteamTeamByName = Object.fromEntries(allSubteamChoices.map((s) => [s.name, s.team]));
  const visibleMessages = messages.filter((m) => isSecretMessageInAdminScope(profile, m, profileById, subteamTeamByName));

  async function send(e) {
    e.preventDefault();
    if (!message.trim()) return;
    // A scoped admin's "segment" target is always their own team — there's
    // only one valid value, so it's set automatically rather than shown as
    // a single-option dropdown (see the targetType === "segment" branch
    // below).
    const value = targetType === "segment" && !unrestricted ? profile.segment : targetValue;
    if (targetType !== "all" && !value) {
      setError("Pick a target first.");
      return;
    }
    setSending(true);
    setError(null);
    const { error: err } = await supabase.from("secret_messages").insert({
      created_by: profile.id,
      target_type: targetType,
      target_value: targetType === "all" ? null : value,
      message: message.trim(),
    });
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("");
    setTargetValue("");
    load();
  }

  function recipientLabel(m) {
    if (m.target_type === "individual") {
      const p = profiles.find((x) => x.id === m.target_value);
      return p ? `${p.name || p.email} (individual)` : "One person";
    }
    return describeTarget(m);
  }

  const TARGET_TYPE_LABELS = { individual: "Person", segment: "Team", subteam: "Subteam", role: "Role", all: "Everyone" };

  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
        Sends a message that only shows up for its target. It sits on their sidebar and this same page (their
        Inbox tab) until it's cleared.
        {unrestricted
          ? " You can reach anyone — any person, team, subteam, role, or everyone."
          : ` You can reach people, subteams, and the team on your own team (${profile?.segment || "your team"}) only.`}
        {" "}The history below is a permanent record — "Clear for recipient" drops a message off their
        sidebar/list without ever touching the text or removing the row. Always reversible with "Restore".
      </p>

      <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 480, marginBottom: 28 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {targetTypes.map((key) => (
            <button
              type="button"
              key={key}
              onClick={() => { setTargetType(key); setTargetValue(""); }}
              className={`${styles.tabBtn} ${targetType === key ? styles.tabBtnActive : ""}`}
              style={{ border: targetType === key ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: targetType === key ? "rgba(255,107,26,0.1)" : "transparent", fontSize: 12 }}
            >
              {TARGET_TYPE_LABELS[key] || key}
            </button>
          ))}
        </div>

        {targetType === "individual" && (
          <select className={styles.select} value={targetValue} onChange={(e) => setTargetValue(e.target.value)}>
            <option value="">— choose a person —</option>
            {allProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name || p.email}</option>
            ))}
          </select>
        )}
        {targetType === "segment" && (
          unrestricted ? (
            <select className={styles.select} value={targetValue} onChange={(e) => setTargetValue(e.target.value)}>
              <option value="">— choose a team —</option>
              {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Your whole team: {profile?.segment || "—"}.</div>
          )
        )}
        {targetType === "subteam" && (
          <select className={styles.select} value={targetValue} onChange={(e) => setTargetValue(e.target.value)}>
            <option value="">— choose a subteam —</option>
            {subteamChoices.map((s) => <option key={`${s.team}::${s.name}`} value={s.name}>{s.name}{unrestricted ? ` (${s.team})` : ""}</option>)}
          </select>
        )}
        {targetType === "role" && (
          <select className={styles.select} value={targetValue} onChange={(e) => setTargetValue(e.target.value)}>
            <option value="">— choose a role —</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
          </select>
        )}
        {targetType === "all" && (
          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Goes to every signed-in profile.</div>
        )}

        <textarea
          className={styles.input}
          style={{ minHeight: 80, resize: "vertical" }}
          placeholder="Message…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        {error && <div style={{ color: "var(--error-fg)", fontSize: 12 }}>{error}</div>}
        <button className={styles.btnPrimary} type="submit" disabled={sending || !message.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>

      {loading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : visibleMessages.length === 0 ? (
        <div className={styles.emptyState}>No secret messages sent yet.</div>
      ) : (
        <table className={styles.table}>
          <thead><tr><th>Sent</th><th>To</th><th>Message</th><th>From</th><th></th></tr></thead>
          <tbody>
            {visibleMessages.map((m) => (
              <tr key={m.id} style={m.deleted_at ? { opacity: 0.45 } : undefined}>
                <td style={{ whiteSpace: "nowrap", fontSize: 11 }}>{new Date(m.created_at).toLocaleString()}</td>
                <td style={{ fontSize: 12 }}>{recipientLabel(m)}</td>
                <td style={{ fontSize: 12, maxWidth: 320 }}>
                  {m.message}
                  {m.deleted_at && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-faint)" }}>(Cleared for recipient)</span>}
                </td>
                <td style={{ fontSize: 12 }}>{m.sender?.name || "—"}</td>
                <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                  <button
                    onClick={() => toggleClearedForRecipient(m)}
                    style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", color: "var(--text-faint)", cursor: "pointer", fontSize: 11 }}
                  >
                    {m.deleted_at ? "Restore" : "Clear for recipient"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
