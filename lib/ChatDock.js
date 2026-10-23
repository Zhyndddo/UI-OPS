"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { canUseChatProto, isChatAdmin, createMeter, sizeOf } from "./chatProto";
import { BOT_NAME, ESCALATE_EMAIL, ESCALATE_COOLDOWN_MS, MENTION_ALIASES, LEGENDS, guideById, searchGuides, matchGuides, isHelperAsk } from "./chatGuides";

// Round 552 — open to every signed-in staff member: topic channels, legends (# @ $ !) and the
// rule-based Helper bot (lib/chatGuides.js). Cost meter + adding channels stay admin-only.
// Round 530 — chat PROTOTYPE, single test account (lib/chatProto.js). Floating
// button -> panel with channels, live messages, #release tag cards, @name tags,
// edit/delete own messages and a built-in COST METER. Nothing runs when the
// panel is closed (no subscription, no polling), and nothing renders for any
// other account. Live mode = Supabase realtime on the open channel only; the
// header toggle switches to 8-second polling so the two can be compared.

const FEED_LIMIT = 50;
const POLL_MS = 8000;
const URL_RE = /(https?:\/\/[^\s]+)/g;

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) + " · " + d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}
function kb(n) { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`; }

function Body({ m }) {
  // Render text with clickable links; tag tokens (#DID / @name) get a pill.
  const tokens = (m.tags || []).map((t) => (t.t === "r" ? `#${t.did}` : t.t === "g" ? `$${t.id}` : `@${t.name}`)).filter(Boolean);
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
          <span key={i} style={{ color: "var(--accent)", fontWeight: 700, background: "var(--bg-hover)", borderRadius: 4, padding: "0 4px" }}>{p.tag}</span>
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
  const [activeId, setActiveId] = useState(null);
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
    setChannels(data || []);
    setActiveId((cur) => cur || (data && data[0] ? data[0].id : null));
  }, [track]);

  useEffect(() => { if (allowed && open) loadChannels(); }, [allowed, open, loadChannels]);

  const resolveCards = useCallback(async (list) => {
    const ids = [...new Set(list.flatMap((m) => (m.tags || []).filter((t) => t.t === "r").map((t) => t.id)))];
    const missing = ids.filter((id) => !cards[id]);
    if (!missing.length) return;
    const { data } = await supabase.from("releases").select("id, did, title, main_artist, release_date, project_type, package_locked").in("id", missing);
    track(data);
    if (data) setCards((c) => { const n = { ...c }; data.forEach((r) => { n[r.id] = r; }); return n; });
  }, [cards, track]);

  const upsertMessages = useCallback((incoming) => {
    setMessages((cur) => {
      const map = new Map(cur.map((m) => [m.id, m]));
      incoming.forEach((m) => map.set(m.id, m));
      return [...map.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    });
    incoming.forEach((m) => { if (!cursor.current || m.updated_at > cursor.current) cursor.current = m.updated_at; });
    resolveCards(incoming);
  }, [resolveCards]);

  // initial load of the open channel
  useEffect(() => {
    if (!allowed || !open || !activeId) return;
    let dead = false;
    cursor.current = null;
    setMessages([]);
    (async () => {
      const { data, error } = await supabase.from("chatx_messages").select("*").eq("channel_id", activeId).order("created_at", { ascending: false }).limit(FEED_LIMIT);
      if (dead) return;
      if (error) { setErr(error.message); return; }
      track(data);
      upsertMessages((data || []).reverse());
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, open, activeId]);

  // live: realtime on the open channel only
  useEffect(() => {
    if (!allowed || !open || !activeId || mode !== "live" || !visible) return undefined;
    const ch = supabase
      .channel(`chatx:${activeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chatx_messages", filter: `channel_id=eq.${activeId}` }, (payload) => {
        meter.current.rtEvents += 1;
        meter.current.rtBytes += sizeOf(payload);
        if (payload.new && payload.new.id) upsertMessages([payload.new]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [allowed, open, activeId, mode, visible, upsertMessages]);

  // poll: only rows changed since the cursor
  useEffect(() => {
    if (!allowed || !open || !activeId || mode !== "poll" || !visible) return undefined;
    const id = setInterval(async () => {
      if (!cursor.current) return;
      const { data } = await supabase.from("chatx_messages").select("*").eq("channel_id", activeId).gt("updated_at", cursor.current).order("created_at");
      track(data);
      if (data && data.length) upsertMessages(data);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [allowed, open, activeId, mode, visible, upsertMessages, track]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, open]);

  // autocomplete for #release, @name and $guide
  useEffect(() => {
    const m = draft.match(/(^|\s)([#@$])([^\s]*)$/);
    if (!m || m[3].length < 2) { setSuggest(null); return undefined; }
    const kind = m[2], q = m[3].replace(/[%,()]/g, "");
    if (kind === "$") {
      const items = searchGuides(q, channels.find((c) => c.id === activeId)?.name).map((g) => ({ id: g.id, gid: g.id, title: g.title, channel: g.channel }));
      setSuggest({ kind, items });
      return undefined;
    }
    const seq = ++suggestSeq.current;
    const t = setTimeout(async () => {
      let data = [];
      if (kind === "#") {
        const r = await supabase.from("releases").select("id, did, title, main_artist").or(`did.ilike.%${q}%,title.ilike.%${q}%`).order("release_date", { ascending: false }).limit(6);
        data = r.data || [];
      } else {
        const r = await supabase.from("profiles").select("id, name").ilike("name", `%${q}%`).limit(6);
        const aliases = MENTION_ALIASES.filter((a) => a.name.startsWith(q.toLowerCase())).map((a) => ({ id: `alias:${a.name}`, name: a.name, alias: a }));
        data = [...aliases, ...(r.data || [])];
      }
      track(data);
      if (seq === suggestSeq.current) setSuggest({ kind, items: data });
    }, 250);
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

  async function profileIdByEmail(email) {
    const { data } = await supabase.from("profiles").select("id").ilike("email", email).limit(1);
    return data && data[0] ? data[0].id : null;
  }
  const tokenOf = (t) => (t.t === "r" ? `#${t.did}` : t.t === "g" ? `$${t.id}` : `@${t.name}`);

  async function botSay(body, tags = []) {
    const { data } = await supabase.from("chatx_messages").insert({ channel_id: activeId, sender_id: null, kind: "bot", sender_name: BOT_NAME, body, tags }).select("*").single();
    if (data) { track(data); upsertMessages([data]); }
  }

  // Helper bot: guide cards if something matches, else say so and ping the app dev (rate-limited).
  async function helperReply(body, channelName) {
    const question = body.replace(/(^|\s)@helper\b/gi, " ").replace(/[#$@]\S+/g, " ").trim();
    if (question.length < 3) { await botSay("Ask me like: “@helper how do I add a smartlink”. Or type $ to browse the how-to guides."); return; }
    const found = matchGuides(question, channelName);
    if (found.length) { await botSay("Here’s what I found:", found.map((g) => ({ t: "g", id: g.id }))); return; }
    let pinged = false;
    try {
      const last = Number(window.localStorage.getItem("chat_help_last") || 0);
      if (Date.now() - last >= ESCALATE_COOLDOWN_MS) {
        const pid = await profileIdByEmail(ESCALATE_EMAIL);
        if (pid && pid !== me.id) {
          await supabase.from("notifications").insert({ profile_id: pid, type: "chat_help", title: `${me.name || "Someone"} needs help in #${channelName}`, body: question.slice(0, 160), link: `/?chat=${activeId}`, created_at: new Date().toISOString() });
          window.localStorage.setItem("chat_help_last", String(Date.now()));
          pinged = true;
        }
      }
    } catch { /* never block the chat on a failed ping */ }
    await botSay(pinged
      ? "I don’t have a guide for that yet. I’ve pinged Zhyn — they’ll answer here."
      : "I don’t have a guide for that yet. Zhyn was pinged a few minutes ago and will see this channel.");
  }

  async function send() {
    const body = draft.trim();
    if (!body || !activeId || !me?.id) return;
    const channelName = channels.find((c) => c.id === activeId)?.name || "";
    const tags = pendingTags.filter((t) => body.includes(tokenOf(t)));
    setDraft(""); setPendingTags([]); setSuggest(null);
    // resolve @alias people (e.g. @zhyn) to real profiles so the bell can reach them
    const resolved = [];
    for (const t of tags) {
      if (t.t === "u" && !t.id && t.email) { resolved.push({ ...t, id: await profileIdByEmail(t.email) }); } else resolved.push(t);
    }
    const saveTags = resolved.map(({ email, ...rest }) => rest);
    const { data, error } = await supabase.from("chatx_messages").insert({ channel_id: activeId, sender_id: me.id, sender_name: me.name || me.email || null, body, tags: saveTags }).select("*").single();
    if (error) { setErr(error.message); setDraft(body); return; }
    track(data);
    upsertMessages([data]);
    // bell for @mentions (never self, never the bot)
    try {
      const ids = [...new Set(saveTags.filter((t) => t.t === "u" && t.id && t.id !== "bot" && t.id !== me.id).map((t) => t.id))].slice(0, 20);
      if (ids.length) {
        await supabase.from("notifications").insert(ids.map((pid) => ({ profile_id: pid, type: "chat_mention", title: `${me.name || "Someone"} mentioned you in #${channelName}`, body: body.slice(0, 160), link: `/?chat=${activeId}`, created_at: new Date().toISOString() })));
      }
    } catch { /* ignore */ }
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
  const activeKind = useMemo(() => channels.find((c) => c.id === activeId)?.kind || "channel", [channels, activeId]);

  if (!allowed) return null;

  const box = { position: "fixed", right: 20, bottom: "calc(var(--bottombar-height) + 16px)", zIndex: 8000 };
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label="Open chat" style={{ ...box, width: 48, height: 48, borderRadius: "50%", border: "none", cursor: "pointer", background: "var(--accent)", color: "var(--accent-on)", fontSize: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
        💬
      </button>
    );
  }

  return (
    <div style={{ ...box, width: "min(760px, calc(100vw - 24px))", height: "min(560px, calc(100vh - var(--topbar-height) - var(--bottombar-height) - 40px))", display: "flex", flexDirection: "column", background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 12, boxShadow: "0 10px 40px rgba(0,0,0,0.5)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
        <strong>Chat</strong>
        <span style={{ color: "var(--text-faint)" }}>· # {activeName}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setShowLegend((v) => !v)} title="What # @ $ ! do" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 999, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>? Legends</button>
        {admin && <button type="button" onClick={() => setMode((x) => (x === "live" ? "poll" : "live"))} title="Switch delivery mode to compare cost" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 999, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>
          {mode === "live" ? "● Live (realtime)" : "◌ Polling 8s"}
        </button>}
        <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" style={{ background: "transparent", border: "none", color: "var(--text)", fontSize: 18, cursor: "pointer" }}>×</button>
      </div>
      {err && <div style={{ background: "var(--error-bg)", color: "var(--error-fg)", fontSize: 12, padding: "6px 12px" }} onClick={() => setErr("")}>{err} (click to dismiss)</div>}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ width: 150, borderRight: "1px solid var(--border)", padding: 8, overflowY: "auto", fontSize: 13 }}>
          {channels.map((c) => (
            <div key={c.id} onClick={() => setActiveId(c.id)} style={{ padding: "5px 8px", borderRadius: 6, cursor: "pointer", background: c.id === activeId ? "var(--bg-hover)" : "transparent", fontWeight: c.id === activeId ? 700 : 400 }}>{c.kind === "guide" ? "📌 " : "# "}{c.name}</div>
          ))}
          {admin && <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
            <input value={newChannel} onChange={(e) => setNewChannel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addChannel()} placeholder="+ channel" style={{ width: "100%", minWidth: 0, background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "4px 6px", fontSize: 12 }} />
          </div>}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 12, fontSize: 13 }}>
            {(showLegend || activeKind === "guide") && (
              <div style={{ marginBottom: 12, border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", background: "var(--bg-input)" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>How this chat works</div>
                {LEGENDS.map((l) => (
                  <div key={l.title} style={{ display: "flex", gap: 8, marginBottom: 5, fontSize: 12 }}>
                    <span style={{ width: 22, textAlign: "center", fontWeight: 800, color: "var(--accent)" }}>{l.sym}</span>
                    <span><b>{l.title}</b> — <span style={{ color: "var(--text-muted)" }}>{l.text}</span></span>
                  </div>
                ))}
              </div>
            )}
            {messages.length === 0 && activeKind !== "guide" && <div style={{ color: "var(--text-faint)" }}>No messages yet. Type <b>#</b> for a release, <b>@</b> for a person, <b>$</b> for a how-to, or ask <b>@helper</b>.</div>}
            {messages.map((x) => {
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
                      <Body m={view} />
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
          <div style={{ position: "relative", borderTop: "1px solid var(--border)", padding: 8 }}>
            {suggest && suggest.items.length > 0 && (
              <div style={{ position: "absolute", bottom: "100%", left: 8, right: 8, background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, overflow: "hidden", zIndex: 2 }}>
                {suggest.items.map((it) => (
                  <div key={it.id} onClick={() => pick(it)} style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid var(--border)" }}>
                    {suggest.kind === "#" ? <><b>{it.title}</b> <span style={{ color: "var(--text-faint)" }}>{it.main_artist} · {it.did}</span></> : suggest.kind === "$" ? <><b>${it.gid}</b> <span style={{ color: "var(--text-faint)" }}>{it.title}{it.channel ? ` · ${it.channel}` : ""}</span></> : <><b>{it.name}</b>{it.alias ? <span style={{ color: "var(--text-faint)" }}> {it.alias.hint}</span> : null}</>}
                  </div>
                ))}
              </div>
            )}
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={2} placeholder={`Message #${activeName} — # release · @ person · $ how-to · ! urgent · Enter sends`} style={{ width: "100%", resize: "none", background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: "inherit" }} />
          </div>
        </div>
      </div>
      {admin && <div style={{ borderTop: "1px solid var(--border)", padding: "6px 12px", fontSize: 11, color: "var(--text-muted)", background: "var(--bg-input)" }}>
        <b>Cost meter</b> (this tab, open {Math.floor(secs / 60)}m{String(secs % 60).padStart(2, "0")}s): {m.requests} requests · {m.rows} rows · {m.rtEvents} realtime events · {kb(totalBytes)} received
        {m.openMs > 20000 && <> — ≈ <b>{kb(perHour)}</b> per open hour; 30 staff × 6 open h/day ≈ <b>{kb(perHour * 180)}</b>/day (when closed it costs nothing)</>}
      </div>}
    </div>
  );
}
