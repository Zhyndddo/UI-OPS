"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
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
// with a wide spread of notifications (dev/admin viewing everything, since
// fanout_notification includes every dev on every team's fanout) can jump
// straight to "Marketing" or "OPS · Media Booking" instead of scrolling
// one long flat list. A notification with no linked ticket falls into
// "General".
//
// Multi-select — a click toggles one row's checkbox, shift-click selects
// the whole visible range from the last-clicked row to this one (standard
// file-manager convention), so clearing a big backlog doesn't mean
// clicking into every single notification one at a time.
export default function NotificationBell() {
  const router = useRouter();
  const { profile, realProfile } = useAuth(); // effective (possibly "view as") profile — notifications for whoever's UI they're seeing
  // Round 468 — dev accounts no longer auto-receive every team's notifications
  // (see sql/pending/add-round468-dev-notify-opt-in.sql). This is the opt-in:
  // only real devs see it, and only once profiles.notify_all_teams exists
  // (undefined = SQL not run yet, so the checkbox stays hidden rather than
  // writing to a column that isn't there). State is local so the tick shows
  // instantly; a reload re-reads the saved value.
  const canOptInAll = realProfile?.role === "dev" && realProfile.notify_all_teams !== undefined;
  const [allTeams, setAllTeams] = useState(!!realProfile?.notify_all_teams);
  const [allTeamsErr, setAllTeamsErr] = useState("");
  useEffect(() => { setAllTeams(!!realProfile?.notify_all_teams); }, [realProfile?.notify_all_teams]);
  const [items, setItems] = useState([]);
  const [unreadTotal, setUnreadTotal] = useState(0); // exact server count, not capped at the loaded 100
  const [scope, setScope] = useState("all"); // "all" | "me" | "team"
  // Round 470 — arrival cues. seenIdsRef is null until the first load, which
  // only establishes the baseline (so opening the app never toasts the whole
  // existing list); after that, any unread row with an id we haven't seen is
  // "new" and triggers the cues. Prefs live in refs too because load() runs
  // from a long-lived interval closure that would otherwise see stale state.
  const seenIdsRef = useRef(null);
  const [toasts, setToasts] = useState([]); // { id, title, body, link, ticket_id }
  const [pulse, setPulse] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [desktopOn, setDesktopOn] = useState(false);
  const [alertErr, setAlertErr] = useState("");
  const soundOnRef = useRef(false);
  const desktopOnRef = useRef(false);
  const audioRef = useRef(null);
  const openRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("all"); // "all" | `${team}||${label}`
  const [selected, setSelected] = useState(() => new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState(null);
  // Click-outside-to-close — the panel previously only closed via the bell
  // toggle or openNotification's navigate-away, so it stayed open and
  // covered the page until you clicked the bell again. containerRef wraps
  // both the bell trigger and the panel (see the outer position:relative
  // div below), so a click anywhere else in the document — not just a
  // dedicated backdrop — closes it, same convention most other dropdowns in
  // the app use (e.g. the requester-team <select>s' native close-on-
  // outside-click). mousedown (not click) so this fires before whatever's
  // under the click handles its own click, matching the usual pattern for
  // this kind of dismiss-on-outside-interaction.
  const containerRef = useRef(null);

  useEffect(() => {
    if (!supabase || !profile?.id) return;
    load();
    // Round 470 — 15s (was 30s) and an immediate re-check whenever the tab
    // becomes visible/focused again, so coming back to the app shows what
    // landed while you were away without waiting for the next tick.
    const interval = setInterval(load, 15000);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [profile?.id]);

  // Saved per-person alert preferences (this browser only; localStorage can be
  // blocked, so every access is wrapped).
  useEffect(() => {
    if (!profile?.id) return;
    try {
      const snd = window.localStorage.getItem(`vieent_notify_sound_${profile.id}`) === "1";
      const dsk = window.localStorage.getItem(`vieent_notify_desktop_${profile.id}`) === "1" && typeof Notification !== "undefined" && Notification.permission === "granted";
      setSoundOn(snd); soundOnRef.current = snd;
      setDesktopOn(dsk); desktopOnRef.current = dsk;
    } catch {}
  }, [profile?.id]);

  // Tab title carries the unread count, so a background tab shows it too.
  // Re-applied every 2s because page navigation resets document.title.
  useEffect(() => {
    const strip = (t) => t.replace(/^\(\d+\+?\)\s*/, "");
    function apply() {
      const base = strip(document.title);
      const label = unreadTotal > 0 ? `(${unreadTotal > 99 ? "99+" : unreadTotal}) ${base}` : base;
      if (document.title !== label) document.title = label;
    }
    apply();
    const t = setInterval(apply, 2000);
    return () => { clearInterval(t); document.title = strip(document.title); };
  }, [unreadTotal]);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  async function load() {
    // Nested select pulls the linked ticket's tab (key/label/executor_team)
    // in the same round trip — that's the only place team/workstation
    // actually lives; notifications itself only stores ticket_id.
    // Round 469 — the badge used to count unread inside only these latest 100
    // rows, so anyone with a backlog saw a permanent "9+". The exact unread
    // total now comes from its own head-count query (uses the partial index
    // from sql/pending/add-round469-*.sql); the list still shows the latest
    // 100. pic ids ride along so "For me" can tell a ticket assigned to this
    // person from one broadcast to their team.
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from("notifications")
        .select("*, tickets(tab_id, pic_profile_id, pic_profile_ids, ticket_tabs(key, label, executor_team))")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("profile_id", profile.id).is("read_at", null),
    ]);
    setItems(data || []);
    setUnreadTotal(count ?? (data || []).filter((n) => !n.read_at).length);
    handleArrivals(data || []);
  }

  // Round 470 — fires the cues for rows that appeared since the last load.
  function handleArrivals(rows) {
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(rows.map((n) => n.id));
      return;
    }
    const fresh = rows.filter((n) => !n.read_at && !seenIdsRef.current.has(n.id));
    rows.forEach((n) => seenIdsRef.current.add(n.id));
    if (fresh.length === 0) return;
    // Assignments first — "this is yours" matters more than a team broadcast.
    const ordered = [...fresh].sort((a, b) => (b.type === "ticket_assigned" ? 1 : 0) - (a.type === "ticket_assigned" ? 1 : 0));
    const shown = ordered.slice(0, 3).map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, ticket_id: n.ticket_id }));
    if (ordered.length > 3) {
      shown.push({ id: `more-${Date.now()}`, title: `+${ordered.length - 3} more new notifications`, body: "Open the bell to see them.", link: null, ticket_id: null });
    }
    setToasts((prev) => [...shown, ...prev].slice(0, 4));
    setPulse(true);
    setTimeout(() => setPulse(false), 4000);
    if (soundOnRef.current) playChime();
    if (desktopOnRef.current && typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      ordered.slice(0, 3).forEach((n) => {
        try {
          const nt = new Notification(n.title, { body: n.body || "", tag: n.id });
          nt.onclick = () => { window.focus(); openRef.current?.(n); nt.close(); };
        } catch {}
      });
    }
  }

  function playChime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioRef.current) audioRef.current = new Ctx();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {}
  }

  function saveAlertPref(key, on) {
    try { window.localStorage.setItem(`${key}_${profile.id}`, on ? "1" : "0"); } catch {}
  }

  function toggleSound(next) {
    setSoundOn(next); soundOnRef.current = next;
    saveAlertPref("vieent_notify_sound", next);
    if (next) playChime(); // preview — also satisfies the browser's "needs a click first" audio rule
  }

  async function toggleDesktop(next) {
    setAlertErr("");
    if (next) {
      if (typeof Notification === "undefined") {
        setAlertErr("This browser doesn't support desktop notifications.");
        return;
      }
      let perm = Notification.permission;
      if (perm === "default") perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setAlertErr(perm === "denied" ? "Blocked by the browser — allow notifications for this site in the address bar, then tick this again." : "Permission wasn't given.");
        setDesktopOn(false); desktopOnRef.current = false;
        saveAlertPref("vieent_notify_desktop", false);
        return;
      }
    }
    setDesktopOn(next); desktopOnRef.current = next;
    saveAlertPref("vieent_notify_desktop", next);
  }

  // "For me" = a ticket assigned to this person (the dedicated type, or their
  // id is on the ticket's PIC list). Everything else is a team broadcast.
  function isForMe(n) {
    if (n.type === "ticket_assigned") return true;
    const t = n.tickets;
    if (!t) return false;
    const ids = t.pic_profile_ids && t.pic_profile_ids.length > 0 ? t.pic_profile_ids : (t.pic_profile_id ? [t.pic_profile_id] : []);
    return ids.includes(profile?.id);
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
    const scoped = scope === "me" ? items.filter((n) => isForMe(n)) : scope === "team" ? items.filter((n) => !isForMe(n)) : items;
    if (category === "all") return scoped;
    return scoped.filter((n) => {
      const { team, label } = categoryOf(n);
      return `${team}||${label || ""}` === category;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, category, scope, profile?.id]);

  // Switching category (or the list itself changing) invalidates any
  // in-progress range-select anchor and the current selection, since the
  // indices it was based on no longer line up with what's visible.
  useEffect(() => {
    setSelected(new Set());
    setLastClickedIndex(null);
  }, [category]);

  const unreadCount = unreadTotal;
  const unreadForMe = items.filter((n) => !n.read_at && isForMe(n)).length;
  const unreadTeam = items.filter((n) => !n.read_at && !isForMe(n)).length;
  const selectedCount = selected.size;

  async function markRead(n) {
    if (n.read_at) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    setUnreadTotal((c) => Math.max(0, c - 1));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
  }

  async function toggleAllTeams(next) {
    setAllTeams(next);
    setAllTeamsErr("");
    const { data, error } = await supabase.from("profiles").update({ notify_all_teams: next }).eq("id", realProfile.id).select("notify_all_teams");
    // An RLS block returns no error and no rows — treat that as a failure too.
    if (error || !data || data.length === 0) {
      setAllTeams(!next);
      setAllTeamsErr("Couldn't save that setting — ask an admin to change it in Config → Team.");
    }
  }

  // Round 469 — clears EVERY unread row for this person on the server, not just
  // the latest 100 that happen to be loaded (which made a big backlog impossible
  // to clear from the UI). Optimistic local update first, then reload for truth.
  async function markAllRead() {
    if (unreadTotal === 0) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((x) => (x.read_at ? x : { ...x, read_at: now })));
    setUnreadTotal(0);
    await supabase.from("notifications").update({ read_at: now }).eq("profile_id", profile.id).is("read_at", null);
    load();
  }

  async function markSelectedRead() {
    if (selected.size === 0) return;
    const ids = [...selected];
    const newlyRead = items.filter((x) => selected.has(x.id) && !x.read_at).length;
    setUnreadTotal((c) => Math.max(0, c - newlyRead));
    setItems((prev) => prev.map((x) => (selected.has(x.id) && !x.read_at ? { ...x, read_at: new Date().toISOString() } : x)));
    setSelected(new Set());
    setLastClickedIndex(null);
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  }

  function toggleSelect(n, index, shiftKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedIndex != null) {
        const [from, to] = lastClickedIndex < index ? [lastClickedIndex, index] : [index, lastClickedIndex];
        for (let i = from; i <= to; i++) {
          const item = filteredItems[i];
          if (item) next.add(item.id);
        }
      } else if (next.has(n.id)) {
        next.delete(n.id);
      } else {
        next.add(n.id);
      }
      return next;
    });
    setLastClickedIndex(index);
  }

  function openNotification(n) {
    markRead(n);
    setOpen(false);
    if (n.link) {
      // Round 469 — land on the exact ticket, not the tab's whole list.
      // TicketListPage and Media Booking read ?ticket=<id>; other pages ignore it.
      const withTicket = n.ticket_id && n.link.startsWith("/tickets/") && !n.link.includes("?") ? `${n.link}?ticket=${n.ticket_id}` : n.link;
      router.push(withTicket);
    }
  }

  openRef.current = openNotification;

  if (!profile) return null;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        // Round 254 — bigger real hit box (padding), offset by an equal
        // negative margin so it doesn't push neighboring TopBar elements
        // around or grow visually — see the fuller explanation in
        // TopBar.js where this trigger is used. position stays relative
        // so the unread-count badge below still anchors correctly.
        style={{ cursor: "pointer", position: "relative", padding: "10px 10px", margin: "-10px -10px" }}
        title="Notifications"
      >
        <style>{`
          @keyframes bellPulse { 0%,100% { transform: scale(1) rotate(0); } 20% { transform: scale(1.3) rotate(-14deg); } 40% { transform: scale(1.3) rotate(14deg); } 60% { transform: scale(1.2) rotate(-8deg); } 80% { transform: scale(1.2) rotate(8deg); } }
          @keyframes badgeFlash { 0%,100% { box-shadow: 0 0 0 0 rgba(224,57,44,0.8); } 50% { box-shadow: 0 0 0 9px rgba(224,57,44,0); } }
          @keyframes toastIn { from { transform: translateX(28px); opacity: 0; } to { transform: none; opacity: 1; } }
        `}</style>
        <span style={{ display: "inline-block", animation: pulse ? "bellPulse 0.9s ease-in-out 3" : undefined }}>🔔</span>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute", top: -4, right: -2, background: "#e0392c", color: "#fff",
              borderRadius: 10, fontSize: 9, fontWeight: 800, padding: "1px 5px", lineHeight: 1.4,
              animation: pulse ? "badgeFlash 1s ease-out 4" : undefined,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "100%", right: 0, zIndex: 210, marginTop: 8,
            background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8,
            // Round 453 followup — bumped up from 640x460 per explicit
            // request ("make it bigger, the panel"); still capped to the
            // viewport (maxWidth/maxHeight) so it doesn't overflow on a
            // smaller screen.
            width: 860, maxWidth: "92vw", height: 600, maxHeight: "80vh", display: "flex", overflow: "hidden",
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0, gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>Notifications</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {selectedCount > 0 && (
                  <>
                    <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{selectedCount} selected</span>
                    <button onClick={markSelectedRead} style={{ background: "none", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 4, padding: "3px 8px", fontSize: 10, cursor: "pointer" }}>
                      Mark selected read
                    </button>
                  </>
                )}
                {unreadCount > 0 && (
                  <button onClick={markAllRead} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 10, cursor: "pointer" }}>
                    Mark all read
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              {[["all", "All", unreadCount], ["me", "For me", unreadForMe], ["team", "My team", unreadTeam]].map(([key, label, n]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScope(key)}
                  style={{
                    background: scope === key ? "rgba(255,107,26,0.12)" : "transparent",
                    border: scope === key ? "1px solid var(--accent)" : "1px solid var(--border)",
                    color: scope === key ? "var(--accent)" : "var(--text-faint)",
                    borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  {label}{n > 0 ? ` · ${n}` : ""}
                </button>
              ))}
            </div>
            <div style={{ padding: "6px 14px", fontSize: 11, color: "var(--text-faint)", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
              <span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 10 }}>Alert me</span>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={soundOn} onChange={(e) => toggleSound(e.target.checked)} />
                Sound
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={desktopOn} onChange={(e) => toggleDesktop(e.target.checked)} />
                Desktop pop-ups when this tab is in the background
              </label>
              {alertErr && <span style={{ color: "var(--error-fg)", flexBasis: "100%" }}>{alertErr}</span>}
            </div>
            {canOptInAll && (
              <div style={{ padding: "6px 14px", fontSize: 11, color: "var(--text-faint)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={allTeams} onChange={(e) => toggleAllTeams(e.target.checked)} />
                  Also receive every team&apos;s notifications (dev only — off by default, your own team&apos;s always come through)
                </label>
                {allTeamsErr && <div style={{ color: "var(--error-fg)", marginTop: 4 }}>{allTeamsErr}</div>}
              </div>
            )}
            {filteredItems.length > 0 && (
              <div style={{ padding: "4px 14px", fontSize: 9, color: "var(--text-dim)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                Click a checkbox to select, shift-click another to select the range between them.
              </div>
            )}

            <div style={{ overflowY: "auto", flex: 1 }}>
              {filteredItems.length === 0 ? (
                <div style={{ padding: 20, fontSize: 12, color: "var(--text-faint)", textAlign: "center" }}>No notifications here.</div>
              ) : (
                filteredItems.map((n, index) => {
                  const { team, label } = categoryOf(n);
                  const isSelected = selected.has(n.id);
                  return (
                    <div
                      key={n.id}
                      onClick={() => openNotification(n)}
                      style={{
                        display: "flex", gap: 8, padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                        background: isSelected ? "rgba(255,107,26,0.14)" : n.read_at ? "transparent" : "rgba(255,107,26,0.06)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(n, index, e.shiftKey); }}
                        onChange={() => {}}
                        style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                          <div style={{ fontSize: 12, fontWeight: n.read_at ? 400 : 700, color: "var(--text)" }}>{n.title}</div>
                          <div style={{ fontSize: 9, color: "var(--text-dim)", flexShrink: 0, whiteSpace: "nowrap" }}>
                            {label ? `${team} · ${label}` : team}
                          </div>
                        </div>
                        {n.body && <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 2 }}>{n.body}</div>}
                        <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{new Date(n.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
      {typeof document !== "undefined" && toasts.length > 0 && createPortal(
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 6000, display: "flex", flexDirection: "column", gap: 8, width: 340, maxWidth: "92vw" }}>
          {toasts.map((t) => (
            <ArrivalToast
              key={t.id}
              toast={t}
              onOpen={() => { setToasts((prev) => prev.filter((x) => x.id !== t.id)); if (t.link) openNotification(t); else setOpen(true); }}
              onDismiss={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            />
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// Round 470 — one arrival card. Auto-hides after 12s; never blocks the page.
function ArrivalToast({ toast, onOpen, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 12000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      style={{
        background: "var(--bg-card)", border: "1px solid var(--accent)", borderLeft: "4px solid var(--accent)", borderRadius: 8,
        padding: "10px 12px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", animation: "toastIn 0.25s ease-out",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{toast.title}</div>
        <button type="button" onClick={onDismiss} title="Dismiss" style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
      </div>
      {toast.body && <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>{toast.body}</div>}
      <button type="button" onClick={onOpen} style={{ marginTop: 8, background: "var(--accent)", border: "none", color: "#fff", borderRadius: 4, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
        {toast.link ? "Open" : "Show"}
      </button>
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
