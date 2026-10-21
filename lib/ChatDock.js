"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { canUseChatProto, createMeter, sizeOf } from "./chatProto";

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
  const tokens = (m.tags || []).map((t) => (t.t === "r" ? `#${t.did}` : `@${t.name}`)).filter(Boolean);
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

  const loadChannels = useCallback(async () => {
    const { data, error } = await supabase.from("chatx_channels").select("id, name").order("created_at");
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

  // autocomplete for #release and @name
  useEffect(() => {
    const m = draft.match(/(^|\s)([#@])([^\s]*)$/);
    if (!m || m[3].length < 2) { setSuggest(null); return undefined; }
    const kind = m[2], q = m[3].replace(/[%,()]/g, "");
    const seq = ++suggestSeq.current;
    const t = setTimeout(async () => {
      let data = [];
      if (kind === "#") {
        const r = await supabase.from("releases").select("id, did, title, main_artist").or(`did.ilike.%${q}%,title.ilike.%${q}%`).order("release_date", { ascending: false }).limit(6);
        data = r.data || [];
      } else {
        const r = await supabase.from("profiles").select("id, name").ilike("name", `%${q}%`).limit(6);
        data = r.data || [];
      }
      track(data);
      if (seq === suggestSeq.current) setSuggest({ kind, items: data });
    }, 250);
    return () => clearTimeout(t);
  }, [draft, track]);

  function pick(item) {
    const isRel = suggest.kind === "#";
    const token = isRel ? `#${item.did}` : `@${item.name}`;
    setDraft((d) => d.replace(/(^|\s)([#@])([^\s]*)$/, `$1${token} `));
    setPendingTags((p) => [...p.filter((x) => !(x.t === (isRel ? "r" : "u") && x.id === item.id)), isRel ? { t: "r", id: item.id, did: item.did } : { t: "u", id: item.id, name: item.name }]);
    if (isRel) setCards((c) => ({ ...c, [item.id]: { ...c[item.id], ...item } }));
    setSuggest(null);
  }

  async function send() {
    const body = draft.trim();
    if (!body || !activeId || !me?.id) return;
    const tags = pendingTags.filter((t) => body.includes(t.t === "r" ? `#${t.did}` : `@${t.name}`));
    setDraft(""); setPendingTags([]); setSuggest(null);
    const { data, error } = await supabase.from("chatx_messages").insert({ channel_id: activeId, sender_id: me.id, body, tags }).select("*").single();
    if (error) { setErr(error.message); setDraft(body); return; }
    track(data);
    upsertMessages([data]);
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
      <button type="button" onClick={() => setOpen(true)} aria-label="Open chat prototype" style={{ ...box, width: 48, height: 48, borderRadius: "50%", border: "none", cursor: "pointer", background: "var(--accent)", color: "var(--accent-on)", fontSize: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
        💬
      </button>
    );
  }

  return (
    <div style={{ ...box, width: "min(760px, calc(100vw - 24px))", height: "min(560px, calc(100vh - var(--topbar-height) - var(--bottombar-height) - 40px))", display: "flex", flexDirection: "column", background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 12, boxShadow: "0 10px 40px rgba(0,0,0,0.5)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
        <strong>Chat prototype</strong>
        <span style={{ color: "var(--text-faint)" }}>· # {activeName}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setMode((x) => (x === "live" ? "poll" : "live"))} title="Switch delivery mode to compare cost" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 999, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>
          {mode === "live" ? "● Live (realtime)" : "◌ Polling 8s"}
        </button>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" style={{ background: "transparent", border: "none", color: "var(--text)", fontSize: 18, cursor: "pointer" }}>×</button>
      </div>
      {err && <div style={{ background: "var(--error-bg)", color: "var(--error-fg)", fontSize: 12, padding: "6px 12px" }} onClick={() => setErr("")}>{err} (click to dismiss)</div>}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ width: 150, borderRight: "1px solid var(--border)", padding: 8, overflowY: "auto", fontSize: 13 }}>
          {channels.map((c) => (
            <div key={c.id} onClick={() => setActiveId(c.id)} style={{ padding: "5px 8px", borderRadius: 6, cursor: "pointer", background: c.id === activeId ? "var(--bg-hover)" : "transparent", fontWeight: c.id === activeId ? 700 : 400 }}># {c.name}</div>
          ))}
          <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
            <input value={newChannel} onChange={(e) => setNewChannel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addChannel()} placeholder="+ channel" style={{ width: "100%", minWidth: 0, background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "4px 6px", fontSize: 12 }} />
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 12, fontSize: 13 }}>
            {messages.length === 0 && <div style={{ color: "var(--text-faint)" }}>No messages yet. Try typing <b>#</b> and part of a DID or song title, or <b>@</b> and a name.</div>}
            {messages.map((x) => {
              const mine = x.sender_id === me?.id;
              const relTags = (x.tags || []).filter((t) => t.t === "r");
              return (
                <div key={x.id} style={{ marginBottom: 12 }}>
                  <div style={{ color: "var(--text-faint)", fontSize: 11 }}>{mine ? "You" : "User"} · {fmtTime(x.created_at)}{x.edited_at && !x.deleted_at ? " · (edited)" : ""}</div>
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
                      <Body m={x} />
                      {mine && (
                        <span style={{ marginLeft: 8, fontSize: 11 }}>
                          <a style={{ cursor: "pointer", color: "var(--text-faint)" }} onClick={() => { setEditingId(x.id); setEditText(x.body); }}>edit</a>{" · "}
                          <a style={{ cursor: "pointer", color: "var(--text-faint)" }} onClick={() => remove(x)}>delete</a>
                        </span>
                      )}
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
                    {suggest.kind === "#" ? <><b>{it.title}</b> <span style={{ color: "var(--text-faint)" }}>{it.main_artist} · {it.did}</span></> : <b>{it.name}</b>}
                  </div>
                ))}
              </div>
            )}
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={2} placeholder={`Message #${activeName} — # tags a release, @ tags a person, Enter sends`} style={{ width: "100%", resize: "none", background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: "inherit" }} />
          </div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid var(--border)", padding: "6px 12px", fontSize: 11, color: "var(--text-muted)", background: "var(--bg-input)" }}>
        <b>Cost meter</b> (this tab, open {Math.floor(secs / 60)}m{String(secs % 60).padStart(2, "0")}s): {m.requests} requests · {m.rows} rows · {m.rtEvents} realtime events · {kb(totalBytes)} received
        {m.openMs > 20000 && <> — ≈ <b>{kb(perHour)}</b> per open hour; 30 staff × 6 open h/day ≈ <b>{kb(perHour * 180)}</b>/day (when closed it costs nothing)</>}
      </div>
    </div>
  );
}
