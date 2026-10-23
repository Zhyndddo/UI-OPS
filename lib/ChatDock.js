"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { canUseChatProto, isChatAdmin, createMeter, sizeOf } from "./chatProto";
import { PATCH_NOTES } from "./patchNotes";
import { BOT_NAME, ESCALATE_EMAIL, MENTION_ALIASES, LEGENDS, guideById, searchGuides, matchGuides, isHelperAsk } from "./chatGuides";

// Round 552 — open to every signed-in staff member: topic channels, legends (# @ $ !) and the
// rule-based Helper bot (lib/chatGuides.js). Cost meter + adding channels stay admin-only.
// Round 530 — chat PROTOTYPE, single test account (lib/chatProto.js). Floating
// button -> panel with channels, live messages, #release tag cards, @name tags,
// edit/delete own messages and a built-in COST METER. Nothing runs when the
// panel is closed (no subscription, no polling), and nothing renders for any
// other account. Live mode = Supabase realtime on the open channel only; the
// header toggle switches to 8-second polling so the two can be compared.

const NOTES_ID = "__notes"; // the pinned Patch notes page (not a database channel)
const FEED_LIMIT = 50;
const MENTION_POLL_MS = 60000;
const MENTION_WINDOW_MS = 7 * 24 * 3600 * 1000;
const POLL_MS = 8000;
const URL_RE = /(https?:\/\/[^\s]+)/g;

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) + " · " + d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}
function kb(n) { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`; }

function Body({ m, onPerson }) {
  // Render text with clickable links; tag tokens (#DID / @name) get a pill.
  const tagOf = {};
  (m.tags || []).forEach((t) => { tagOf[t.t === "r" ? `#${t.did}` : t.t === "g" ? `$${t.id}` : `@${t.name}`] = t; });
  const tokens = Object.keys(tagOf);
  const parts = [];
  let rest = m.body;
  let guard = 0;
  while (rest && guard++ < 200) {
    let idx = -1, tok = null;
    tokens.forEach((t) => { const i = rest.indexOf(t); if (i >= 0 && (idx < 0 || i < idx)) { idx = i; tok = t; } });
    if (idx < 0) { parts.push(rest); break; }
    if (idx > 0) parts.push(rest.slice(0, idx));
    parts.push({ tag: tok });
    rest = rest.slice(idx + tok.length);
  }
  return (
    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          p.split(URL_RE).map((s, j) => (j % 2 === 1 ? <a key={`${i}-${j}`} href={s} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{s}</a> : s))
        ) : (
          tagOf[p.tag]?.t === "u" && onPerson
            ? <span key={i} role="button" tabIndex={0} title="Click for options" onClick={() => onPerson(tagOf[p.tag])} onKeyDown={(e) => e.key === "Enter" && onPerson(tagOf[p.tag])} style={{ color: "var(--accent)", fontWeight: 700, background: "var(--bg-hover)", borderRadius: 4, padding: "0 4px", cursor: "pointer", textDecoration: "underline dotted" }}>{p.tag}</span>
            : <span key={i} style={{ color: "var(--accent)", fontWeight: 700, background: "var(--bg-hover)", borderRadius: 4, padding: "0 4px" }}>{p.tag}</span>
        )
      )}
    </span>
  );
}

export default function ChatDock() {
  const { profile, realProfile } = useAuth();
  const router = useRouter();
  const me = realProfile || profile;
  const allowed = canUseChatProto(me);
  const admin = isChatAdmin(me);
  const [showLegend, setShowLegend] = useState(false);

  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState([]);
  const [activeId, setActiveId] = useState(NOTES_ID);
  const chanId = activeId === NOTES_ID ? null : activeId;
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [mentions, setMentions] = useState([]); // [{id, channel_id, created_at}] — messages that tag ME (last 7 days)
  const [seenTick, setSeenTick] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const knownMentions = useRef(new Set());
  const mentionCursor = useRef(null);
  const audioRef = useRef(null);
  const soundRef = useRef(true);
  const zhynIdRef = useRef(null);
  const [person, setPerson] = useState(null); // clicked @name: { tag, team, loading }
  const composing = useRef({ on: false, endedAt: 0 });
  const sendingRef = useRef(false);
  const searchCache = useRef(new Map());
  const peopleRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [cards, setCards] = useState({}); // release id -> row
  const [draft, setDraft] = useState("");
  const [pendingTags, setPendingTags] = useState([]);
  const [suggest, setSuggest] = useState(null); // { kind, items }
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [mode, setMode] = useState("live"); // live | poll
  const [visible, setVisible] = useState(true);
  const [err, setErr] = useState("");
  const [, setTick] = useState(0);
  const [newChannel, setNewChannel] = useState("");
  const meter = useRef(createMeter());
  const cursor = useRef(null);
  const endRef = useRef(null);
  const suggestSeq = useRef(0);

  const track = useCallback((data, rows) => {
    meter.current.requests += 1;
    meter.current.rows += rows ?? (Array.isArray(data) ? data.length : data ? 1 : 0);
    meter.current.bytes += sizeOf(data);
  }, []);

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // open-time clock for the meter (counts only while open AND tab visible)
  useEffect(() => {
    if (!allowed || !open || !visible) return undefined;
    const id = setInterval(() => { meter.current.openMs += 1000; setTick((t) => t + 1); }, 1000);
    return () => clearInterval(id);
  }, [allowed, open, visible]);

  // Bell links look like /?chat=<channelId>: open the chat on that channel (cheap local check).
  useEffect(() => {
    if (!allowed) return undefined;
    const id = setInterval(() => {
      try {
        const u = new URL(window.location.href);
        const ch = u.searchParams.get("chat");
        if (!ch) return;
        u.searchParams.delete("chat");
        window.history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
        setActiveId(ch);
        setOpen(true);
      } catch { /* ignore */ }
    }, 1000);
    return () => clearInterval(id);
  }, [allowed]);

  const loadChannels = useCallback(async () => {
    const { data, error } = await supabase.from("chatx_channels").select("id, name, kind").order("created_at");
    if (error) { setErr(error.message.includes("chatx_channels") ? "Chat tables missing — run add-round530-chat-prototype.sql" : error.message); return; }
    track(data);
    setChannels((data || []).filter((c) => c.kind !== "guide" && c.name !== "Sandbox"));
  }, [track]);

  useEffect(() => { if (allowed && open) loadChannels(); }, [allowed, open, loadChannels]);
  // warm the people list so the first @ is instant
  useEffect(() => {
    if (!allowed || !open || peopleRef.current) return;
    supabase.from("profiles").select("id, name").limit(500).then((r) => { if (r.data) peopleRef.current = r.data; });
  }, [allowed, open]);

  const resolveCards = useCallback(async (list) => {
    const ids = [...new Set(list.flatMap((m) => (m.tags || []).filter((t) => t.t === "r").map((t) => t.id)))];
    const missing = ids.filter((id) => !cards[id]);
    if (!missing.length) return;
    const { data } = await supabase.from("releases").select("id, did, title, main_artist, release_date, project_type, package_locked").in("id", missing);
    track(data);
    if (data) setCards((c) => { const n = { ...c }; data.forEach((r) => { n[r.id] = r; }); return n; });
  }, [cards, track]);

  // ---- mentions of me: badge + sound (no notification rows are written for chat) ----
  useEffect(() => {
    try { const v = window.localStorage.getItem("chat_sound_on"); const on = v !== "0"; setSoundOn(on); soundRef.current = on; } catch { /* default on */ }
  }, []);
  const playPop = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = audioRef.current || (audioRef.current = new Ctx());
      if (ctx.resume) ctx.resume();
      const t = ctx.currentTime;
      [[880, 0], [1318, 0.09]].forEach(([f, d]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.12, t + d + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
        o.connect(g); g.connect(ctx.destination); o.start(t + d); o.stop(t + d + 0.2);
      });
    } catch { /* sound is a nicety */ }
  }, []);
  // rows = messages that tag me (already filtered). silent = first load (no sound).
  const noteMentions = useCallback((rows, silent) => {
    const fresh = rows.filter((r) => r.sender_id !== me?.id && !knownMentions.current.has(r.id));
    rows.forEach((r) => { if (!mentionCursor.current || r.created_at > mentionCursor.current) mentionCursor.current = r.created_at; });
    if (!fresh.length) return;
    fresh.forEach((r) => knownMentions.current.add(r.id));
    setMentions((cur) => [...cur, ...fresh.map((r) => ({ id: r.id, channel_id: r.channel_id, created_at: r.created_at }))]);
    if (!silent && soundRef.current) playPop();
  }, [me?.id, playPop]);

  useEffect(() => {
    if (!allowed || !me?.id) return undefined;
    let dead = false;
    const run = async () => {
      if (document.hidden) return;
      try {
        if (!mentionCursor.current) {
          const since = new Date(Date.now() - MENTION_WINDOW_MS).toISOString();
          const { data } = await supabase.from("chatx_messages").select("id, channel_id, created_at, sender_id").contains("mention_ids", [me.id]).is("deleted_at", null).gt("created_at", since).order("created_at").limit(50);
          if (!dead) { noteMentions(data || [], true); if (!mentionCursor.current) mentionCursor.current = since; }
          return;
        }
        const head = await supabase.from("chatx_messages").select("id", { count: "exact", head: true }).contains("mention_ids", [me.id]).gt("created_at", mentionCursor.current);
        if (dead || !head.count) return;
        const { data } = await supabase.from("chatx_messages").select("id, channel_id, created_at, sender_id").contains("mention_ids", [me.id]).is("deleted_at", null).gt("created_at", mentionCursor.current).order("created_at").limit(50);
        if (!dead && data) noteMentions(data, false);
      } catch { /* badge is best-effort */ }
    };
    run();
    const id = setInterval(run, MENTION_POLL_MS);
    const onVis = () => { if (!document.hidden) run(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { dead = true; clearInterval(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [allowed, me?.id, noteMentions]);

  const seenKey = `chat_mention_seen_${me?.id}`;
  const readSeen = useCallback(() => { try { return JSON.parse(window.localStorage.getItem(seenKey) || "{}"); } catch { return {}; } }, [seenKey]);
  const unseenByChan = useMemo(() => {
    const seen = readSeen();
    const out = {};
    mentions.forEach((m) => { if (m.created_at > (seen[m.channel_id] || "")) out[m.channel_id] = (out[m.channel_id] || 0) + 1; });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentions, seenTick, readSeen]);
  const unseenTotal = Object.values(unseenByChan).reduce((a, b) => a + b, 0);
  // looking at a channel = its mentions are seen (stored on this device only)
  useEffect(() => {
    if (!open || !chanId) return;
    const mine = mentions.filter((m) => m.channel_id === chanId);
    if (!mine.length) return;
    const top = mine.reduce((a, m) => (m.created_at > a ? m.created_at : a), "");
    const seen = readSeen();
    if ((seen[chanId] || "") >= top) return;
    seen[chanId] = top;
    try { window.localStorage.setItem(seenKey, JSON.stringify(seen)); } catch { /* ignore */ }
    setSeenTick((t) => t + 1);
  }, [open, chanId, mentions, readSeen, seenKey]);

  const upsertMessages = useCallback((incoming) => {
    // a live message that tags me counts right away (and plays the sound)
    const tagged = incoming.filter((m) => !m.deleted_at && Array.isArray(m.mention_ids) && m.mention_ids.includes(me?.id));
    if (tagged.length) noteMentions(tagged, false);
    setMessages((cur) => {
      const map = new Map(cur.map((m) => [m.id, m]));
      incoming.forEach((m) => map.set(m.id, m));
      return [...map.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    });
    incoming.forEach((m) => { if (!cursor.current || m.updated_at > cursor.current) cursor.current = m.updated_at; });
    resolveCards(incoming);
  }, [resolveCards, noteMentions, me?.id]);

  // initial load of the open channel
  useEffect(() => {
    if (!allowed || !open || !chanId) return;
    let dead = false;
    cursor.current = null;
    setMessages([]);
    setLoadingMsgs(true);
    (async () => {
      const { data, error } = await supabase.from("chatx_messages").select("*").eq("channel_id", chanId).order("created_at", { ascending: false }).limit(FEED_LIMIT);
      if (dead) return;
      setLoadingMsgs(false);
      if (error) { setErr(error.message); return; }
      track(data);
      upsertMessages((data || []).reverse());
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, open, chanId]);

  // live: realtime on the open channel only
  useEffect(() => {
    if (!allowed || !open || !chanId || mode !== "live" || !visible) return undefined;
    const ch = supabase
      .channel(`chatx:${chanId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chatx_messages", filter: `channel_id=eq.${chanId}` }, (payload) => {
        meter.current.rtEvents += 1;
        meter.current.rtBytes += sizeOf(payload);
        if (payload.new && payload.new.id) upsertMessages([payload.new]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [allowed, open, chanId, mode, visible, upsertMessages]);

  // poll: only rows changed since the cursor
  useEffect(() => {
    if (!allowed || !open || !chanId || mode !== "poll" || !visible) return undefined;
    const id = setInterval(async () => {
      if (!cursor.current) return;
      const { data } = await supabase.from("chatx_messages").select("*").eq("channel_id", chanId).gt("updated_at", cursor.current).order("created_at");
      track(data);
      if (data && data.length) upsertMessages(data);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [allowed, open, chanId, mode, visible, upsertMessages, track]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, open]);

  // autocomplete for #release, @name and $guide
  useEffect(() => {
    const m = draft.match(/(^|\s)([#@$])([^\s]*)$/);
    if (!m || m[3].length < 1) { setSuggest(null); return undefined; }
    const kind = m[2], q = m[3].replace(/[%,()]/g, "");
    if (kind === "$") {
      const items = searchGuides(q, channels.find((c) => c.id === activeId)?.name).map((g) => ({ id: g.id, gid: g.id, title: g.title, channel: g.channel }));
      setSuggest({ kind, items, q });
      setSuggestIdx(0);
      return undefined;
    }
    const seq = ++suggestSeq.current;
    const key = `${kind}:${q.toLowerCase()}`;
    const cached = searchCache.current.get(key);
    if (cached) { setSuggest({ kind, items: cached, q }); setSuggestIdx(0); return undefined; }
    setSuggest({ kind, items: [], loading: true, q });
    const finish = (data) => { searchCache.current.set(key, data); track(data); if (seq === suggestSeq.current) { setSuggest({ kind, items: data, q }); setSuggestIdx(0); } };
    const aliasesFor = () => MENTION_ALIASES.filter((a) => a.name.startsWith(q.toLowerCase())).map((a) => ({ id: `alias:${a.name}`, name: a.name, alias: a }));
    if (kind === "@") {
      // people: loaded once, then filtered in the browser (instant)
      (async () => {
        if (!peopleRef.current) {
          const r = await supabase.from("profiles").select("id, name").limit(500);
          peopleRef.current = r.data || [];
          track(r.data);
        }
        const ql = q.toLowerCase();
        finish([...aliasesFor(), ...peopleRef.current.filter((p) => (p.name || "").toLowerCase().includes(ql)).slice(0, 6)]);
      })();
      return undefined;
    }
    const t = setTimeout(async () => {
      const r = await supabase.from("releases").select("id, did, title, main_artist").or(q.length === 1 ? `did.ilike.${q}%,title.ilike.${q}%` : `did.ilike.%${q}%,title.ilike.%${q}%`).order("release_date", { ascending: false }).limit(6);
      finish(r.data || []);
    }, 180);
    return () => clearTimeout(t);
  }, [draft, track, channels, activeId]);

  function pick(item) {
    const kind = suggest.kind;
    const token = kind === "#" ? `#${item.did}` : kind === "$" ? `$${item.gid}` : `@${item.name}`;
    setDraft((d) => d.replace(/(^|\s)([#@$])([^\s]*)$/, `$1${token} `));
    const tag = kind === "#" ? { t: "r", id: item.id, did: item.did }
      : kind === "$" ? { t: "g", id: item.gid }
      : item.alias ? { t: "u", id: item.alias.bot ? "bot" : null, name: item.name, email: item.alias.email || null }
      : { t: "u", id: item.id, name: item.name };
    setPendingTags((p) => [...p.filter((x) => !(x.t === tag.t && (x.id === tag.id && x.name === tag.name))), tag]);
    if (kind === "#") setCards((c) => ({ ...c, [item.id]: { ...c[item.id], ...item } }));
    setSuggest(null);
  }

  async function openPerson(tag) {
    setPerson({ tag, team: null, loading: tag.id && tag.id !== "bot" });
    if (tag.id && tag.id !== "bot") {
      const { data } = await supabase.from("profiles").select("segment").eq("id", tag.id).maybeSingle();
      setPerson((cur) => (cur && cur.tag === tag ? { ...cur, team: data?.segment || null, loading: false } : cur));
    }
  }
  function replyTo(tag) {
    const token = `@${tag.name}`;
    setDraft((d) => (d.includes(token) ? d : `${d}${d && !/\s$/.test(d) ? " " : ""}${token} `));
    setPendingTags((p) => (p.some((x) => x.t === "u" && x.name === tag.name) ? p : [...p, { t: "u", id: tag.id || null, name: tag.name, email: tag.id ? null : (MENTION_ALIASES.find((a) => a.name === tag.name)?.email || null) }]));
    setPerson(null);
  }

  async function profileIdByEmail(email) {
    const { data } = await supabase.from("profiles").select("id").ilike("email", email).limit(1);
    return data && data[0] ? data[0].id : null;
  }
  const mentionIdsOf = (tags) => [...new Set((tags || []).filter((t) => t.t === "u" && t.id && t.id !== "bot").map((t) => t.id))];
  const tokenOf = (t) => (t.t === "r" ? `#${t.did}` : t.t === "g" ? `$${t.id}` : `@${t.name}`);

  async function botSay(body, tags = []) {
    const { data } = await supabase.from("chatx_messages").insert({ channel_id: chanId, sender_id: null, kind: "bot", sender_name: BOT_NAME, body, tags, mention_ids: mentionIdsOf(tags) }).select("*").single();
    if (data) { track(data); upsertMessages([data]); }
  }

  // Helper bot: guide cards if something matches, else say so and ping the app dev (rate-limited).
  async function helperReply(body, channelName) {
    const question = body.replace(/(^|\s)@helper\b/gi, " ").replace(/[#$@]\S+/g, " ").trim();
    if (question.length < 3) { await botSay("Ask me like: “@helper how do I add a smartlink”. Or type $ to browse the how-to guides."); return; }
    const found = matchGuides(question, channelName);
    if (found.length) { await botSay("Here’s what I found:", found.map((g) => ({ t: "g", id: g.id }))); return; }
    // no bell row: the reply tags Zhyn, which lands on Zhyn's chat badge (and sound)
    let zid = zhynIdRef.current;
    if (!zid) { try { zid = await profileIdByEmail(ESCALATE_EMAIL); zhynIdRef.current = zid; } catch { zid = null; } }
    await botSay(`I don’t have a guide for that yet. @zhyn — ${me.name || "someone"} needs a hand with: “${question.slice(0, 120)}”`, zid ? [{ t: "u", id: zid, name: "zhyn" }] : []);
  }

  async function send() {
    const body = draft.trim();
    if (!body || !chanId || !me?.id || sendingRef.current) return;
    sendingRef.current = true;
    const channelName = channels.find((c) => c.id === chanId)?.name || "";
    const tags = pendingTags.filter((t) => body.includes(tokenOf(t)));
    setDraft(""); setPendingTags([]); setSuggest(null);
    // resolve @alias people (e.g. @zhyn) to real profiles so their chat badge can count it
    const resolved = [];
    for (const t of tags) {
      if (t.t === "u" && !t.id && t.email) { resolved.push({ ...t, id: await profileIdByEmail(t.email) }); } else resolved.push(t);
    }
    const saveTags = resolved.map(({ email, ...rest }) => rest);
    const { data, error } = await supabase.from("chatx_messages").insert({ channel_id: chanId, sender_id: me.id, sender_name: me.name || me.email || null, body, tags: saveTags, mention_ids: mentionIdsOf(saveTags).filter((x) => x !== me.id) }).select("*").single();
    sendingRef.current = false;
    if (error) { setErr(error.message); setDraft(body); return; }
    track(data);
    upsertMessages([data]);
    if (isHelperAsk(body)) { try { await helperReply(body, channelName); } catch (e) { setErr(e.message); } }
  }

  async function saveEdit(m) {
    const body = editText.trim();
    if (!body) return;
    const { data, error } = await supabase.from("chatx_messages").update({ body, edited_at: new Date().toISOString() }).eq("id", m.id).select("*").single();
    if (error) { setErr(error.message); return; }
    track(data); upsertMessages([data]); setEditingId(null);
  }
  async function remove(m) {
    if (!window.confirm("Delete this message?")) return;
    const { data, error } = await supabase.from("chatx_messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id).select("*").single();
    if (error) { setErr(error.message); return; }
    track(data); upsertMessages([data]);
  }
  async function addChannel() {
    const name = newChannel.trim();
    if (!name) return;
    const { data, error } = await supabase.from("chatx_channels").insert({ name, created_by: me?.id }).select("id, name").single();
    if (error) { setErr(error.message); return; }
    track(data); setNewChannel(""); setChannels((c) => [...c, data]); setActiveId(data.id);
  }

  const m = meter.current;
  const secs = Math.max(1, Math.round(m.openMs / 1000));
  const totalBytes = m.bytes + m.rtBytes;
  const perHour = (totalBytes / secs) * 3600;
  const activeName = useMemo(() => channels.find((c) => c.id === activeId)?.name || "", [channels, activeId]);

  if (!allowed) return null;

  const box = { position: "fixed", right: 20, bottom: "calc(var(--bottombar-height) + 16px)", zIndex: 8000 };
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={unseenTotal ? `Open chat — ${unseenTotal} mention${unseenTotal > 1 ? "s" : ""}` : "Open chat"} style={{ ...box, width: 48, height: 48, borderRadius: "50%", border: "none", cursor: "pointer", background: "var(--accent)", color: "var(--accent-on)", fontSize: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
        💬
        {unseenTotal > 0 && <span data-testid="chat-badge" style={{ position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, padding: "0 5px", boxSizing: "border-box", borderRadius: 999, background: "#e5484d", color: "#fff", fontSize: 11, fontWeight: 800, lineHeight: "20px", textAlign: "center", border: "2px solid var(--bg-card)" }}>{unseenTotal > 99 ? "99+" : unseenTotal}</span>}
      </button>
    );
  }

  return (
    <div style={{ ...box, width: "min(760px, calc(100vw - 24px))", height: "min(560px, calc(100vh - var(--topbar-height) - var(--bottombar-height) - 40px))", display: "flex", flexDirection: "column", background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 12, boxShadow: "0 10px 40px rgba(0,0,0,0.5)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
        <strong>Chat</strong>
        <span style={{ color: "var(--text-faint)" }}>· {activeId === NOTES_ID ? "📌 Patch notes" : `# ${activeName}`}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => { const next = !soundOn; setSoundOn(next); soundRef.current = next; try { window.localStorage.setItem("chat_sound_on", next ? "1" : "0"); } catch { /* ignore */ } if (next) playPop(); }} title={soundOn ? "Sound on for messages that tag you (click to mute)" : "Sound muted (click to turn on)"} aria-label="Toggle mention sound" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 999, padding: "3px 8px", fontSize: 12, cursor: "pointer" }}>{soundOn ? "🔔" : "🔕"}</button>
        <button type="button" onClick={() => setShowLegend((v) => !v)} title="What # @ $ ! do" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 999, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>? Legends</button>
        {admin && <button type="button" onClick={() => setMode((x) => (x === "live" ? "poll" : "live"))} title="Switch delivery mode to compare cost" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 999, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>
          {mode === "live" ? "● Live (realtime)" : "◌ Polling 8s"}
        </button>}
        <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" style={{ background: "transparent", border: "none", color: "var(--text)", fontSize: 18, cursor: "pointer" }}>×</button>
      </div>
      {err && <div style={{ background: "var(--error-bg)", color: "var(--error-fg)", fontSize: 12, padding: "6px 12px" }} onClick={() => setErr("")}>{err} (click to dismiss)</div>}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ width: 150, borderRight: "1px solid var(--border)", padding: 8, overflowY: "auto", fontSize: 13 }}>
          <div onClick={() => setActiveId(NOTES_ID)} style={{ padding: "5px 8px", borderRadius: 6, cursor: "pointer", background: activeId === NOTES_ID ? "var(--bg-hover)" : "transparent", fontWeight: activeId === NOTES_ID ? 700 : 400 }}>📌 Patch notes</div>
          {channels.map((c) => (
            <div key={c.id} onClick={() => setActiveId(c.id)} style={{ padding: "5px 8px", borderRadius: 6, cursor: "pointer", background: c.id === activeId ? "var(--bg-hover)" : "transparent", fontWeight: c.id === activeId ? 700 : 400 }}>{c.kind === "guide" ? "📌 " : "# "}{c.name}{unseenByChan[c.id] ? <span style={{ float: "right", background: "#e5484d", color: "#fff", borderRadius: 999, fontSize: 10, fontWeight: 800, padding: "0 6px", lineHeight: "16px" }}>{unseenByChan[c.id]}</span> : null}</div>
          ))}
          {admin && <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
            <input value={newChannel} onChange={(e) => setNewChannel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addChannel()} placeholder="+ channel" style={{ width: "100%", minWidth: 0, background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "4px 6px", fontSize: 12 }} />
          </div>}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 12, fontSize: 13 }}>
            {(showLegend || activeId === NOTES_ID) && (
              <div style={{ marginBottom: 12, border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", background: "var(--bg-input)" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>📌 Legends</div>
                {LEGENDS.map((l) => (
                  <div key={l.title} style={{ display: "flex", gap: 8, marginBottom: 5, fontSize: 12 }}>
                    <span style={{ width: 22, textAlign: "center", fontWeight: 800, color: "var(--accent)" }}>{l.sym}</span>
                    <span><b>{l.title}</b> — <span style={{ color: "var(--text-muted)" }}>{l.text}</span></span>
                  </div>
                ))}
              </div>
            )}
            {activeId === NOTES_ID && PATCH_NOTES.map((n) => (
              <div key={n.round} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700 }}>Round {n.round}{n.date ? <span style={{ color: "var(--text-faint)", fontWeight: 400 }}> · {n.date}</span> : null} — {n.title}</div>
                <ul style={{ margin: "4px 0 0 18px", padding: 0, fontSize: 12, color: "var(--text-muted)" }}>
                  {n.items.map((it, i) => <li key={i} style={{ marginBottom: 2 }}>{it}</li>)}
                </ul>
              </div>
            ))}
            {activeId !== NOTES_ID && loadingMsgs && messages.length === 0 && [0, 1, 2, 3].map((i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div className="uix-skeleton" style={{ height: 10, width: 120, borderRadius: 4, marginBottom: 6 }} />
                <div className="uix-skeleton" style={{ height: 14, width: `${85 - i * 12}%`, borderRadius: 4 }} />
              </div>
            ))}
            {activeId !== NOTES_ID && !loadingMsgs && messages.length === 0 && <div style={{ color: "var(--text-faint)" }}>No messages yet. Type <b>#</b> for a release, <b>@</b> for a person, <b>$</b> for a how-to, or ask <b>@helper</b>.</div>}
            {activeId !== NOTES_ID && messages.map((x) => {
              const mine = !!x.sender_id && x.sender_id === me?.id;
              const isBot = x.kind === "bot";
              const urgent = !isBot && /^!\s*\S/.test(x.body || "");
              const view = urgent ? { ...x, body: x.body.replace(/^!\s*/, "") } : x;
              const relTags = (x.tags || []).filter((t) => t.t === "r");
              const guideTags = (x.tags || []).filter((t) => t.t === "g").map((t) => guideById(t.id)).filter(Boolean);
              return (
                <div key={x.id} style={{ marginBottom: 12, ...(urgent ? { borderLeft: "3px solid #e5484d", paddingLeft: 8 } : null), ...(isBot ? { background: "var(--bg-input)", borderRadius: 8, padding: "6px 8px" } : null) }}>
                  <div style={{ color: "var(--text-faint)", fontSize: 11 }}>{urgent ? "❗ " : ""}{isBot ? `🤖 ${x.sender_name || BOT_NAME}` : mine ? "You" : x.sender_name || "User"} · {fmtTime(x.created_at)}{x.edited_at && !x.deleted_at ? " · (edited)" : ""}</div>
                  {x.deleted_at ? (
                    <div style={{ color: "var(--text-faint)", fontStyle: "italic" }}>message deleted</div>
                  ) : editingId === x.id ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <input value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit(x)} style={{ flex: 1, background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "4px 8px" }} />
                      <button type="button" onClick={() => saveEdit(x)}>Save</button>
                      <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <Body m={view} onPerson={openPerson} />
                      {mine && (
                        <span style={{ marginLeft: 8, fontSize: 11 }}>
                          <a style={{ cursor: "pointer", color: "var(--text-faint)" }} onClick={() => { setEditingId(x.id); setEditText(x.body); }}>edit</a>{" · "}
                          <a style={{ cursor: "pointer", color: "var(--text-faint)" }} onClick={() => remove(x)}>delete</a>
                        </span>
                      )}
                      {guideTags.map((g) => (
                        <div key={g.id} style={{ marginTop: 6, border: "1px solid var(--border-strong)", borderLeft: "3px solid #3ba55d", borderRadius: 8, padding: "6px 10px", background: "var(--bg-card)" }}>
                          <div style={{ fontWeight: 700 }}>📘 {g.title}{g.channel ? <span style={{ color: "var(--text-faint)", fontWeight: 400 }}> · {g.channel}</span> : null}</div>
                          <ol style={{ margin: "4px 0 0 18px", padding: 0, fontSize: 12, color: "var(--text-muted)" }}>
                            {g.steps.map((st, i) => <li key={i} style={{ marginBottom: 2 }}>{st}</li>)}
                          </ol>
                        </div>
                      ))}
                      {relTags.map((t) => {
                        const r = cards[t.id];
                        return (
                          <div key={t.id} onClick={() => router.push(`/releases/${t.id}`)} style={{ marginTop: 6, cursor: "pointer", border: "1px solid var(--border-strong)", borderLeft: "3px solid var(--accent)", borderRadius: 8, padding: "6px 10px", background: "var(--bg-input)" }}>
                            <div style={{ fontWeight: 700 }}>{r?.title || "…"}</div>
                            <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{r ? `${r.main_artist || ""} · ${t.did} · ${r.release_date || "no date"} · ${r.project_type || "no package"}${r.package_locked ? " · locked" : ""}` : t.did}</div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          {activeId === NOTES_ID ? (
            <div style={{ borderTop: "1px solid var(--border)", padding: "8px 12px", fontSize: 12, color: "var(--text-faint)" }}>Read-only notes from the dev team. Pick a channel on the left to chat.</div>
          ) : (
          <div style={{ position: "relative", borderTop: "1px solid var(--border)", padding: 8 }}>
            {person && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "5px 8px", border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--bg-input)", fontSize: 12 }}>
                <span style={{ flex: 1 }}>👤 <b>{person.tag.name}</b>{person.loading ? <span style={{ color: "var(--text-faint)" }}> …</span> : person.team ? <span style={{ color: "var(--text-faint)" }}> · {person.team} team</span> : person.tag.id === "bot" ? <span style={{ color: "var(--text-faint)" }}> · Helper bot</span> : null}</span>
                <button type="button" onClick={() => replyTo(person.tag)} style={{ background: "var(--accent)", color: "var(--accent-on)", border: "none", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Reply @{person.tag.name}</button>
                <button type="button" onClick={() => setPerson(null)} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text)", cursor: "pointer" }}>×</button>
              </div>
            )}
            {suggest && (suggest.items.length > 0 || suggest.loading || suggest.q) && (
              <div style={{ position: "absolute", bottom: "100%", left: 8, right: 8, background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, overflow: "hidden", zIndex: 2 }}>
                {suggest.loading && suggest.items.length === 0 && <div className="uix-skeleton" style={{ padding: "6px 10px", fontSize: 12, color: "var(--text-faint)" }}>Searching…</div>}
                {!suggest.loading && suggest.items.length === 0 && <div style={{ padding: "6px 10px", fontSize: 12, color: "var(--text-faint)" }}>No match for {suggest.kind}{suggest.q} — nothing to tag with that</div>}
                {suggest.items.map((it, ix) => (
                  <div key={it.id} onClick={() => pick(it)} onMouseEnter={() => setSuggestIdx(ix)} style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid var(--border)", background: ix === suggestIdx ? "var(--bg-hover)" : "transparent" }}>
                    {suggest.kind === "#" ? <><b>{it.title}</b> <span style={{ color: "var(--text-faint)" }}>{it.main_artist} · {it.did}</span></> : suggest.kind === "$" ? <><b>${it.gid}</b> <span style={{ color: "var(--text-faint)" }}>{it.title}{it.channel ? ` · ${it.channel}` : ""}</span></> : <><b>{it.name}</b>{it.alias ? <span style={{ color: "var(--text-faint)" }}> {it.alias.hint}</span> : null}</>}
                  </div>
                ))}
              </div>
            )}
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onCompositionStart={() => { composing.current.on = true; }} onCompositionEnd={() => { composing.current.on = false; composing.current.endedAt = Date.now(); }} onKeyDown={(e) => { if (suggest && suggest.items.length > 0 && !composing.current.on) { if (e.key === "ArrowDown") { e.preventDefault(); setSuggestIdx((i) => (i + 1) % suggest.items.length); return; } if (e.key === "ArrowUp") { e.preventDefault(); setSuggestIdx((i) => (i - 1 + suggest.items.length) % suggest.items.length); return; } if ((e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) || e.key === "Tab") { e.preventDefault(); pick(suggest.items[Math.min(suggestIdx, suggest.items.length - 1)]); return; } if (e.key === "Escape") { setSuggest(null); return; } } if (e.key === "Enter" && !e.shiftKey) { if (e.nativeEvent.isComposing || e.keyCode === 229 || composing.current.on || Date.now() - composing.current.endedAt < 60) return; e.preventDefault(); send(); } }} rows={2} placeholder={`Message #${activeName} — # release · @ person · $ how-to · ! urgent · Enter sends`} style={{ width: "100%", resize: "none", background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: "inherit" }} />
          </div>
          )}
        </div>
      </div>
      {admin && <div style={{ borderTop: "1px solid var(--border)", padding: "6px 12px", fontSize: 11, color: "var(--text-muted)", background: "var(--bg-input)" }}>
        <b>Cost meter</b> (this tab, open {Math.floor(secs / 60)}m{String(secs % 60).padStart(2, "0")}s): {m.requests} requests · {m.rows} rows · {m.rtEvents} realtime events · {kb(totalBytes)} received
        {m.openMs > 20000 && <> — ≈ <b>{kb(perHour)}</b> per open hour; 30 staff × 6 open h/day ≈ <b>{kb(perHour * 180)}</b>/day (when closed it costs nothing)</>}
      </div>}
    </div>
  );
}
