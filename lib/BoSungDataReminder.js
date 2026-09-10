"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { missingMetaKeys, META_ITEMS } from "./metadataChecklist";

// Round 280 — daily reminder popup for outstanding Bổ Sung DATA rows, per
// explicit spec: "this reminder has a small tick that said no remind
// today, and set a counter for 24 hours, after that, keep send a reminder
// pop up for every rows that they have in the ticket (until they tick that
// stop reminding check)." Mounted once in lib/AppShell.js so it can show
// up regardless of which page an AR member is on.
//
// AR team only (matches "the AR team to double check which hasn't done").
// Shows ONCE per browser session (sessionStorage flag) rather than on
// every single page navigation, which the literal spec doesn't rule out
// but would be genuinely unusable — this is the one interpretive call
// made here; easy to loosen if a session-level popup isn't frequent
// enough. Ticking "Don't remind me today" writes profiles.
// bo_sung_data_snooze_until = now + 24h (sql/pending/add-round280-bo-sung-
// data-snooze.sql); the popup stays suppressed for that profile — across
// sessions and devices, since it's a DB column, not local storage — until
// that timestamp passes, then resumes showing once per session as before.
const SESSION_FLAG = "bsdReminderShown";

export default function BoSungDataReminder() {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [dontRemind, setDontRemind] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase || !profile?.id || profile.segment !== "AR") return;
    // Already shown this session — don't re-check/re-show on every nav.
    try {
      if (sessionStorage.getItem(SESSION_FLAG)) return;
    } catch {
      // sessionStorage unavailable (rare) — fall through and just check
      // every mount instead of failing closed.
    }
    // Still within a snooze window this profile set earlier.
    if (profile.bo_sung_data_snooze_until && new Date(profile.bo_sung_data_snooze_until) > new Date()) return;

    (async () => {
      const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "bo_sung_data").single();
      if (!tab) return;
      const { data: tickets } = await supabase
        .from("tickets")
        .select("id, data, status")
        .eq("tab_id", tab.id)
        .is("deleted_at", null)
        .neq("status", "COMPLETE")
        .contains("pic_profile_ids", [profile.id]);
      if (!tickets || tickets.length === 0) return;

      const dids = [...new Set(tickets.map((t) => t.data?.releaseId).filter(Boolean))];
      const { data: rels } = dids.length > 0
        ? await supabase.from("releases").select("id, did, title, main_artist, meta_audio, meta_artwork, meta_working_files, meta_lyric, meta_mv, meta_doc").in("did", dids)
        : { data: [] };
      const relMap = {};
      (rels || []).forEach((r) => (relMap[r.did] = r));

      const outstanding = tickets
        .map((t) => ({ ticket: t, release: relMap[t.data?.releaseId] }))
        .filter(({ release }) => missingMetaKeys(release).length > 0);
      if (outstanding.length === 0) return;

      setRows(outstanding);
      setShow(true);
      try { sessionStorage.setItem(SESSION_FLAG, "1"); } catch { /* ignore */ }
    })();
  }, [profile?.id, profile?.segment, profile?.bo_sung_data_snooze_until]);

  async function handleClose() {
    if (dontRemind && profile?.id) {
      setSaving(true);
      const snoozeUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("profiles").update({ bo_sung_data_snooze_until: snoozeUntil }).eq("id", profile.id);
      setSaving(false);
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
      <div style={{ width: "min(480px, calc(100vw - 32px))", maxHeight: "80vh", overflowY: "auto", background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Bổ Sung DATA — still outstanding</div>
        <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 14 }}>
          {rows.length} release{rows.length === 1 ? "" : "s"} tagged to you still {rows.length === 1 ? "needs" : "need"} data filled in.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {rows.map(({ ticket, release }) => (
            <div key={ticket.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{release?.title || ticket.data?.title || "—"}</div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>{release?.main_artist || ticket.data?.artist || ""}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {missingMetaKeys(release).map((key) => (
                  <span key={key} style={{ fontSize: 10, fontWeight: 700, border: "1px solid var(--error-fg)", color: "var(--error-fg)", borderRadius: 999, padding: "2px 8px" }}>
                    {META_ITEMS.find((m) => m.key === key)?.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={dontRemind} onChange={(e) => setDontRemind(e.target.checked)} />
          Don't remind me again today
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Link href="/tickets/bo-sung-data" onClick={handleClose} style={{ fontSize: 12, padding: "8px 16px", border: "1px solid var(--border-strong)", borderRadius: 6, textDecoration: "none", color: "var(--text)" }}>
            View list
          </Link>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            style={{ background: "var(--accent)", border: "none", borderRadius: 6, padding: "8px 16px", color: "var(--accent-on)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
          >
            {saving ? "Saving…" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
