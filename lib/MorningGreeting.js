"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { isExecutorSegment, TICKET_ROUTES } from "./teamTypes";
import { createSystemMessage, hasSystemMessageToday } from "./systemMessages";

// Round 471 — two things in one file, both about "don't let new work sit":
//
//  1. MORNING GREETING: the first time someone opens the app each (GMT+7)
//     day, a small panel says hello and lists what is waiting — tickets
//     assigned to them, how many were newly assigned in the last 24h, and
//     tickets in their team that still have no PIC. Modeled on the AR-only
//     Bổ Sung DATA reminder (lib/BoSungDataReminder.js) but for everyone,
//     and once per DAY (not per session). Shows nothing when there is
//     nothing to show.
//
//  2. UNASSIGNED NAG: after the greeting, if their team still has tickets
//     with no PIC for more than NAG_AFTER_HOURS, one System Message (the
//     existing sidebar badge + popup channel, lib/systemMessages.js) is
//     created per person per day. Checked on load and every 2 hours while
//     the app stays open.
//
// "Open" uses the same definition the Task Table uses (generic terminal
// statuses, plus the Report Conflict and Design vocabularies) and the same
// 2026-07-01 cutoff, so the numbers here match what people see there.

const TASK_CUTOFF = "2026-07-01";
const NAG_AFTER_HOURS = 8;
const NAG_RECHECK_MS = 2 * 60 * 60 * 1000;
const DAY_KEY = "vieent_morning_greet_";
const SESSION_CHECKED = "vieentGreetChecked";
const SESSION_SHOWN_AT = "vieentGreetShownAt";

const TERMINAL_EXECUTOR = ["COMPLETE", "CANCELED", "REFUND"];
const TERMINAL_REPORT_CONFLICT = ["Hoàn thành", "Từ chối", "Hủy"];
const TERMINAL_DESIGN = ["COMPLETE", "CANCEL"];
function isOpen(typeKey, status) {
  if (typeKey === "report_conflict") return !TERMINAL_REPORT_CONFLICT.includes(status);
  if (typeKey === "design") return !TERMINAL_DESIGN.includes(status);
  return !TERMINAL_EXECUTOR.includes(status);
}

// "Today" in GMT+7, same convention as hasSystemMessageToday.
function todayKey() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function greetedToday(profileId) {
  try { return window.localStorage.getItem(DAY_KEY + profileId) === todayKey(); } catch { return false; }
}
function markGreeted(profileId) {
  try { window.localStorage.setItem(DAY_KEY + profileId, todayKey()); } catch { /* ignore */ }
}

function waitText(ms) {
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "under an hour";
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)} days`;
}

function routeFor(key) {
  return TICKET_ROUTES[key] || `/tickets/${String(key).replace(/_/g, "-")}`;
}

async function loadTabs() {
  const { data } = await supabase.from("ticket_tabs").select("id, key, label, executor_team, status_options");
  return data || [];
}

// Tickets in this person's team's tabs that nobody has been tagged on yet.
async function loadUnassigned(profile, tabs) {
  const empty = { total: 0, oldestMs: 0, olderCount: 0, byTab: [] };
  if (!profile?.segment) return empty;
  const teamTabs = tabs.filter((t) => t.executor_team && isExecutorSegment(profile.segment, t.executor_team));
  if (teamTabs.length === 0) return empty;
  const tabById = {};
  teamTabs.forEach((t) => (tabById[t.id] = t));
  const { data } = await supabase
    .from("tickets")
    .select("id, tab_id, status, created_at, pic_profile_id, pic_profile_ids")
    .in("tab_id", teamTabs.map((t) => t.id))
    .is("deleted_at", null)
    .is("pic_profile_id", null)
    .gte("created_at", TASK_CUTOFF)
    .limit(1000);
  const now = Date.now();
  const byTab = new Map();
  let total = 0, oldestMs = 0, olderCount = 0;
  (data || []).forEach((t) => {
    const tab = tabById[t.tab_id];
    if (!tab) return;
    if (t.pic_profile_ids && t.pic_profile_ids.length > 0) return;
    // "Needs a PIC" = still in the tab's first status (REQUESTED / REQUEST / …)
    if (t.status !== (tab.status_options || [])[0]) return;
    if (!isOpen(tab.key, t.status)) return;
    const age = now - new Date(t.created_at).getTime();
    total += 1;
    oldestMs = Math.max(oldestMs, age);
    if (age > NAG_AFTER_HOURS * 3600000) olderCount += 1;
    const e = byTab.get(tab.key) || { key: tab.key, label: tab.label, count: 0 };
    e.count += 1;
    byTab.set(tab.key, e);
  });
  return { total, oldestMs, olderCount, byTab: [...byTab.values()].sort((a, b) => b.count - a.count) };
}

async function loadMyWork(profile, tabs) {
  const tabById = {};
  tabs.forEach((t) => (tabById[t.id] = t));
  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const [{ data: mine }, { count: assigned24h }] = await Promise.all([
    supabase
      .from("tickets")
      .select("id, tab_id, status")
      .or(`pic_profile_id.eq.${profile.id},pic_profile_ids.cs.{${profile.id}}`)
      .is("deleted_at", null)
      .gte("created_at", TASK_CUTOFF)
      .limit(1000),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .eq("type", "ticket_assigned")
      .gte("created_at", since),
  ]);
  const byTab = new Map();
  let total = 0;
  (mine || []).forEach((t) => {
    const tab = tabById[t.tab_id];
    if (!tab || !isOpen(tab.key, t.status)) return;
    total += 1;
    const e = byTab.get(tab.key) || { key: tab.key, label: tab.label, count: 0 };
    e.count += 1;
    byTab.set(tab.key, e);
  });
  return { total, assigned24h: assigned24h || 0, byTab: [...byTab.values()].sort((a, b) => b.count - a.count) };
}

export default function MorningGreeting() {
  const { profile } = useAuth();
  const [show, setShow] = useState(false);
  const [data, setData] = useState(null);

  // 1 — the greeting
  useEffect(() => {
    if (!supabase || !profile?.id) return;
    if (greetedToday(profile.id)) return;
    try { if (sessionStorage.getItem(SESSION_CHECKED) === profile.id) return; } catch { /* ignore */ }
    let cancelled = false;
    (async () => {
      try {
        const tabs = await loadTabs();
        const [mine, unassigned] = await Promise.all([loadMyWork(profile, tabs), loadUnassigned(profile, tabs)]);
        if (cancelled) return;
        try { sessionStorage.setItem(SESSION_CHECKED, profile.id); } catch { /* ignore */ }
        if (mine.total === 0 && mine.assigned24h === 0 && unassigned.total === 0) return;
        markGreeted(profile.id); // marked when SHOWN, so a refresh doesn't show it twice
        try { sessionStorage.setItem(SESSION_SHOWN_AT, String(Date.now())); } catch { /* ignore */ }
        setData({ mine, unassigned });
        setShow(true);
      } catch (e) {
        console.error("MorningGreeting load failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id, profile?.segment]);

  // 2 — the unassigned nag
  useEffect(() => {
    if (!supabase || !profile?.id || !profile?.segment) return;
    let cancelled = false;
    async function check() {
      if (cancelled || !greetedToday(profile.id)) return; // the greeting covers the first look of the day
      let shownAt = 0;
      try { shownAt = Number(sessionStorage.getItem(SESSION_SHOWN_AT) || 0); } catch { /* ignore */ }
      if (shownAt && Date.now() - shownAt < NAG_RECHECK_MS) return; // just greeted in this tab — don't double up
      try {
        const tabs = await loadTabs();
        const unassigned = await loadUnassigned(profile, tabs);
        if (cancelled || unassigned.olderCount === 0) return;
        const already = await hasSystemMessageToday(supabase, { kind: "unassigned_ticket_nag", profileId: profile.id });
        if (already || cancelled) return;
        const top = unassigned.byTab.slice(0, 4).map((t) => `• ${t.label}: ${t.count}`).join("\n");
        await createSystemMessage(supabase, {
          kind: "unassigned_ticket_nag",
          title: `${unassigned.olderCount} ticket${unassigned.olderCount > 1 ? "s" : ""} in ${profile.segment} still ${unassigned.olderCount > 1 ? "have" : "has"} no PIC`,
          body: `Waiting more than ${NAG_AFTER_HOURS}h (oldest ${waitText(unassigned.oldestMs)}).\n${top}`,
          link: routeFor(unassigned.byTab[0]?.key),
          recipientProfileIds: [profile.id],
          source: { kind: "unassigned_ticket_nag", tabs: unassigned.byTab.map((t) => t.key) },
          hoursValid: 12,
        });
      } catch (e) {
        console.error("Unassigned nag failed:", e);
      }
    }
    check();
    const interval = setInterval(check, NAG_RECHECK_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [profile?.id, profile?.segment]);

  if (!show || !data) return null;
  const hour = new Date(Date.now() + 7 * 3600000).getUTCHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const { mine, unassigned } = data;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 998, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
      <div style={{ width: "min(480px, calc(100vw - 32px))", maxHeight: "80vh", overflowY: "auto", background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{hello}{profile?.name ? `, ${profile.name}` : ""}</div>
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 14px" }}>Here is what is waiting for you today.</p>

        {(mine.total > 0 || mine.assigned24h > 0) && (
          <Section
            title={`Assigned to you — ${mine.total} open`}
            note={mine.assigned24h > 0 ? `${mine.assigned24h} newly assigned in the last 24 hours` : null}
            rows={mine.byTab}
            onNavigate={() => setShow(false)}
          />
        )}
        {unassigned.total > 0 && (
          <Section
            title={`Waiting for a PIC in ${profile?.segment || "your team"} — ${unassigned.total}`}
            note={`Oldest has been waiting ${waitText(unassigned.oldestMs)}. Open one and tag yourself or a teammate.`}
            rows={unassigned.byTab}
            onNavigate={() => setShow(false)}
          />
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          <Link href="/task-table" onClick={() => setShow(false)} style={{ border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
            Open Task Table
          </Link>
          <button type="button" onClick={() => setShow(false)} style={{ background: "var(--accent)", border: "none", color: "#fff", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, note, rows, onNavigate }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
      {note && <div style={{ fontSize: 11, color: "var(--text-faint)", margin: "2px 0 6px" }}>{note}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
        {rows.slice(0, 8).map((r) => (
          <Link
            key={r.key}
            href={routeFor(r.key)}
            onClick={onNavigate}
            style={{ fontSize: 11, fontWeight: 700, border: "1px solid var(--border-strong)", color: "var(--text)", borderRadius: 999, padding: "2px 10px", textDecoration: "none" }}
          >
            {r.label} · {r.count}
          </Link>
        ))}
      </div>
    </div>
  );
}
