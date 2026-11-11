"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

// Round 596 — Ma Sói chat channel. One shared room per day ("Phòng ngày", dead players can read but not type, silenced players can not type,
// closed at night) + a wolf-only room. New messages arrive through Supabase Realtime (table ms_chat; row level security decides who receives
// what). Sending goes through /api/ma-soi (rules + 1 message/second). If Realtime is not connected the box falls back to polling every 8 s.
// The public story cards (bản tin) are mixed into the day feed. Dev accounts also get test tools: bots, chat storm, kill switch.
const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 12 };
const btn = { padding: "8px 14px", fontWeight: 800, borderRadius: 8, border: "none", background: "#ff7a1a", color: "#fff", cursor: "pointer" };
const btnGhost = { padding: "7px 12px", fontWeight: 700, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13 };
const POLL_MS = 8000;

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
}
function norm(r) {   // a row from the API (already shaped) or from a Realtime payload (raw table row)
  return { id: Number(r.id), room: r.room, day: r.day ?? r.day_no, name: r.name, body: r.body, at: r.at || r.created_at, bot: r.bot ?? r.is_bot, playerId: r.player_id || null, me: r.me };
}

// Dev-only test tools (lobby: add bots; running: bots answer / chat storm / kill switch).
export function MaSoiDevTools({ status, chatOn, call, onChanged, lastRate }) {
  const [n, setN] = useState("17");
  const [storm, setStorm] = useState("100");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = async (body, ok) => {
    if (busy) return;
    setBusy(true); setMsg("");
    try { await call(body); setMsg(ok || "Xong."); if (onChanged) await onChanged(); } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  const inp = { width: 54, padding: 4, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "inherit", textAlign: "center" };
  return (
    <div style={{ ...card, borderStyle: "dashed" }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>🧪 Công cụ thử tải (chỉ dev)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 13 }}>
        {status === "lobby" && (
          <>
            <span>Thêm</span><input value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, "").slice(0, 2))} style={inp} inputMode="numeric" /><span>bot</span>
            <button type="button" style={btnGhost} disabled={busy} onClick={() => run({ action: "bots_add", n: parseInt(n, 10) || 1 }, "Đã thêm bot.")}>🤖 Thêm bot</button>
          </>
        )}
        {status === "running" && (
          <>
            <button type="button" style={btnGhost} disabled={busy} onClick={() => run({ action: "bots_turn" }, "Bot đã trả lời lượt này.")}>🤖 Bot trả lời lượt này</button>
            <span>Bão chat</span><input value={storm} onChange={(e) => setStorm(e.target.value.replace(/\D/g, "").slice(0, 3))} style={inp} inputMode="numeric" /><span>tin</span>
            <button type="button" style={btnGhost} disabled={busy} onClick={() => run({ action: "bots_chat", count: parseInt(storm, 10) || 1 }, "Đã bắn bão chat.")}>⚡ Gửi</button>
          </>
        )}
        {status !== "lobby" && (
          <button type="button" style={btnGhost} disabled={busy} onClick={() => run({ action: "chat_toggle", on: !chatOn }, chatOn ? "Đã tắt chat." : "Đã bật chat.")}>{chatOn ? "⛔ Tắt chat (kill switch)" : "✅ Bật chat lại"}</button>
        )}
        {typeof lastRate === "number" && status !== "lobby" && <span style={{ color: "var(--text-faint)" }}>Nhận qua realtime: {lastRate} tin / 10 giây</span>}
      </div>
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: "var(--text-faint)" }}>{msg}</div>}
    </div>
  );
}

export default function MaSoiChat({ gid, status, dayNo, phaseKey, cards, call, dev, onChanged }) {
  const [meta, setMeta] = useState(null);
  const [room, setRoom] = useState("day");
  const [viewDay, setViewDay] = useState(0);
  const [msgs, setMsgs] = useState({});          // id -> message
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [rt, setRt] = useState("…");             // realtime status
  const [rate, setRate] = useState(0);
  const listRef = useRef(null);
  const stick = useRef(true);
  const recv = useRef([]);
  const maxId = useRef(0);
  const dayRef = useRef(0);

  const day = viewDay || dayNo || 1;
  dayRef.current = day;

  const addMsgs = useCallback((rows) => {
    if (!rows.length) return;
    setMsgs((old) => { const next = { ...old }; for (const r of rows) { next[r.id] = { ...(next[r.id] || {}), ...r }; if (r.id > maxId.current) maxId.current = r.id; } return next; });
  }, []);

  const load = useCallback(async (d) => {
    try {
      const j = await call({ action: "chat_load", day: d || undefined });
      if (j && j.game) {
        setMeta(j);
        addMsgs([...(j.day || []), ...(j.wolf || [])].map(norm));
      }
    } catch (e) { setErr(e.message); }
  }, [call, addMsgs]);

  // initial load + reload when the phase changes (rules for typing change with the phase) or another day is picked
  useEffect(() => { load(viewDay || 0); }, [load, gid, phaseKey, status, viewDay]);
  useEffect(() => { setViewDay(0); setRoom("day"); setMsgs({}); maxId.current = 0; }, [gid]);

  // Realtime
  useEffect(() => {
    if (!gid) return undefined;
    const ch = supabase.channel(`ms-chat-${gid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ms_chat", filter: `game_id=eq.${gid}` }, (payload) => {
        const r = norm(payload.new || {});
        if (!r.id) return;
        recv.current.push(Date.now());
        addMsgs([r]);
      })
      .subscribe((s) => { setRt(s === "SUBSCRIBED" ? "live" : s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED" ? "poll" : "…"); });
    return () => { supabase.removeChannel(ch); };
  }, [gid, addMsgs]);

  // rate counter (dev) + polling fallback when Realtime is not live
  useEffect(() => {
    const t = setInterval(() => { const now = Date.now(); recv.current = recv.current.filter((x) => now - x < 10000); setRate(recv.current.length); }, 2000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (rt === "live" || !gid) return undefined;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        for (const rm of meta?.wolf ? ["day", "wolf"] : ["day"]) {
          const rows = await call({ action: "chat_list", room: rm, day: dayRef.current, after: maxId.current });
          if (Array.isArray(rows)) addMsgs(rows.map(norm));
        }
      } catch (e) { /* ignore; next tick */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [rt, gid, meta?.wolf, call, addMsgs]);

  const myId = meta?.me_id || null;
  const feed = useMemo(() => {
    const rows = Object.values(msgs).filter((m) => m.room === room && m.day === day).map((m) => ({ ...m, me: m.me ?? (myId && m.playerId === myId), t: new Date(m.at).getTime(), kind: "msg" }));
    if (room === "day") {
      for (const c of cards || []) {
        if (c.kind !== "story" && c.kind !== "final") continue;
        const m = /Ngày (\d+)/.exec(c.title || "");
        const d = m ? parseInt(m[1], 10) : c.kind === "final" ? dayNo : 0;
        if (d === day) rows.push({ id: `c${c.id}`, kind: "card", title: c.title, body: c.body, at: c.at, t: new Date(c.at).getTime() });
      }
    }
    rows.sort((a, b) => a.t - b.t || String(a.id).localeCompare(String(b.id)));
    return rows;
  }, [msgs, room, day, cards, myId, dayNo]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [feed.length, room, day]);

  const canType = room === "day" ? meta?.can_day && day === dayNo : meta?.can_wolf && day === dayNo;
  const why = room === "day" ? meta?.why_day : meta?.why_wolf;

  async function send() {
    const body = text.trim();
    if (!body || sending || !canType) return;
    setSending(true); setErr("");
    try {
      const j = await call({ action: "chat_send", room, body });
      if (j && j.id && rt !== "live") { /* the poll will pick it up; show it at once */ addMsgs([{ id: Number(j.id), room, day: dayNo, name: "Bạn", body, at: new Date().toISOString(), me: true }]); }
      setText("");
    } catch (e) { setErr(e.message); }
    setSending(false);
  }

  if (!gid || !meta || !meta.joined) return dev ? <MaSoiDevTools status={status} chatOn={meta ? meta.chat_on : true} call={call} onChanged={onChanged} lastRate={rate} /> : null;
  const days = Array.from({ length: Math.max(1, dayNo || 1) }, (_, i) => i + 1);
  const tab = (k, label) => (
    <button type="button" onClick={() => setRoom(k)} style={{ ...btnGhost, ...(room === k ? { background: "#ff7a1a", color: "#fff", borderColor: "#ff7a1a" } : {}) }}>{label}</button>
  );
  return (
    <>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {tab("day", "💬 Phòng ngày")}
            {meta.wolf && tab("wolf", "🐺 Phòng sói")}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
            <select value={day} onChange={(e) => { const d = parseInt(e.target.value, 10); setViewDay(d === dayNo ? 0 : d); }} aria-label="Chọn ngày"
              style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "inherit" }}>
              {days.map((d) => <option key={d} value={d}>Ngày {d}</option>)}
            </select>
            <span title={rt === "live" ? "Tin nhắn đến tức thì (Realtime)" : "Realtime chưa kết nối — đang kiểm tra mỗi 8 giây"} style={{ color: rt === "live" ? "#3ecf8e" : "var(--text-faint)" }}>{rt === "live" ? "● trực tiếp" : "○ 8 giây/lần"}</span>
          </div>
        </div>
        {room === "wolf" && <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 6 }}>Chỉ bầy sói thấy phòng này — dân làng không đọc được.</div>}
        {room === "day" && <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 6 }}>Mỗi ngày một phòng. Chat mở ban ngày cho người còn sống; ban đêm chỉ đọc. Tin nhắn tự xoá sau 3 ngày.</div>}
        <div ref={listRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
          style={{ height: 300, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: 8, background: "var(--bg)" }}>
          {feed.length === 0 && <div style={{ fontSize: 13, color: "var(--text-faint)" }}>{room === "day" ? "Chưa ai nói gì trong ngày này." : "Phòng sói còn trống."}</div>}
          {feed.map((m) => m.kind === "card" ? (
            <div key={m.id} style={{ margin: "8px 0", padding: "8px 10px", borderLeft: "4px solid #ff7a1a", background: "rgba(255,122,26,0.07)", borderRadius: 6, fontSize: 13 }}>
              <div style={{ fontWeight: 800 }}>{m.title}</div>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 150, overflowY: "auto", marginTop: 4 }}>{m.body}</div>
            </div>
          ) : (
            <div key={m.id} style={{ margin: "5px 0", fontSize: 13.5, lineHeight: 1.45, textAlign: m.me ? "right" : "left" }}>
              <span style={{ display: "inline-block", maxWidth: "88%", textAlign: "left", background: m.me ? "rgba(255,122,26,0.16)" : "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "5px 9px" }}>
                <b style={{ fontSize: 12 }}>{m.me ? "Bạn" : m.name}{m.bot ? " 🤖" : ""}</b> <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{fmtTime(m.at)}</span>
                <div style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{m.body}</div>
              </span>
            </div>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} disabled={!canType || sending} maxLength={300}
            placeholder={canType ? (room === "wolf" ? "Nhắn cho bầy sói…" : "Nói gì đó với cả làng…") : (day !== dayNo ? "Đang xem ngày cũ — chỉ đọc." : why || "Chưa thể nhắn lúc này.")}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "inherit" }} />
          <button type="submit" style={{ ...btn, opacity: canType && text.trim() ? 1 : 0.5 }} disabled={!canType || sending || !text.trim()}>Gửi</button>
        </form>
        {err && <div style={{ fontSize: 12.5, color: "#ff9a9a", marginTop: 6 }}>{err}</div>}
      </div>
      {dev && <MaSoiDevTools status={status} chatOn={meta.chat_on} call={call} onChanged={() => { load(viewDay || 0); return onChanged && onChanged(); }} lastRate={rate} />}
    </>
  );
}
