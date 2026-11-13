"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import styles from "./TeachersDayDecor.module.css";

// Round 594 — the three chalkboard panels of the Teachers' Day thank-you notes (data: sql/pending/add-round594-thank-notes.sql).
//   ThankCompose : pick a person, write up to 280 characters, tick "Gửi ẩn danh" if wanted. Also lists what you sent.
//   ThankInbox   : notes sent to ME (private). Opening it marks them read.
//   ThankBoard   : on 20/11 the blackboard with EVERY note of the year, no names at all.
const MAX = 280;
// Round 605 — the finished blackboard itself can be thanked: a note "to the board" (no single receiver; it shows up on the 20/11 board like the rest)
const BOARD = { id: "__board__", name: "Bảng tri ân chung 🌼", segment: "gửi cả bảng — hiện trên bảng 20/11" };
const fmt = (d) => new Date(d).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" });

function Frame({ title, onClose, children, wide }) {
  return (
    <div className={styles.panelBackdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`${styles.board} ${wide ? styles.boardWide : ""}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.boardClose} onClick={onClose} aria-label="Đóng">×</button>
        <div className={styles.boardTitle}>{title}</div>
        {children}
      </div>
    </div>
  );
}

export function ThankCompose({ profile, onClose, onSent }) {
  const [people, setPeople] = useState(null);
  const [q, setQ] = useState("");
  const [to, setTo] = useState(null);
  const [body, setBody] = useState("");
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(null);
  const [showSent, setShowSent] = useState(false);

  useEffect(() => {
    let off = false;
    supabase.from("profiles").select("id, name, role, segment").order("name").limit(500).then(({ data }) => { if (!off) setPeople(data || []); });
    return () => { off = true; };
  }, []);
  const loadSent = useCallback(async () => { const { data } = await supabase.rpc("thank_sent"); setSent(data || []); }, []);
  useEffect(() => { loadSent(); }, [loadSent]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pool = (people || []).filter((p) => p.name && p.id !== profile?.id);
    const found = (s ? pool.filter((p) => p.name.toLowerCase().includes(s)) : pool).slice(0, 8);
    return (!s || "bảng tri ân chung cả tập thể".includes(s) || "bang tri an chung ca tap the".includes(s)) ? [BOARD, ...found] : found;
  }, [people, q, profile]);

  async function send() {
    if (!to || !body.trim() || busy) return;
    setBusy(true); setErr(""); setMsg("");
    const { error } = await supabase.from("thank_notes").insert({ from_profile: profile.id, to_profile: to.id === BOARD.id ? null : to.id, to_board: to.id === BOARD.id, body: body.trim().slice(0, MAX), anonymous: anon, from_name: anon ? null : (profile.name || null) });
    setBusy(false);
    if (error) { setErr(/row-level security/i.test(error.message) ? "Bạn đã gửi tối đa 30 lời trong 24 giờ." : /does not exist|schema cache/i.test(error.message) ? "Chưa chạy SQL add-round594-thank-notes.sql." : error.message); return; }
    setMsg(`Đã gửi cho ${to.name} ✿`); setBody(""); setTo(null); setQ("");
    loadSent(); if (onSent) onSent();
  }

  return (
    <Frame title="Gửi lời tri ân ✎" onClose={onClose}>
      <div className={styles.boardLabel}>Gửi tới</div>
      {to ? (
        <div className={styles.pick}>{to.name} <button type="button" className={styles.linkBtn} onClick={() => setTo(null)}>đổi</button></div>
      ) : (
        <>
          <input className={styles.chalkInput} placeholder="Tìm tên…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className={styles.pickList}>
            {people === null ? <span className={styles.boardHint}>Đang tải…</span> : list.length === 0 ? <span className={styles.boardHint}>Không thấy ai.</span> : list.map((p) => (
              <button key={p.id} type="button" className={styles.pickItem} onClick={() => setTo(p)}>{p.name}{p.segment ? <span className={styles.pickSeg}> · {p.segment}</span> : null}</button>
            ))}
          </div>
        </>
      )}
      <div className={styles.boardLabel}>Lời cảm ơn <span className={styles.count}>{body.length}/{MAX}</span></div>
      <textarea className={styles.chalkInput} rows={4} maxLength={MAX} placeholder="Cảm ơn thầy/cô/anh/chị vì…" value={body} onChange={(e) => setBody(e.target.value)} />
      <label className={styles.anonRow}><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Gửi ẩn danh (người nhận không thấy tên bạn)</label>
      {err && <div className={styles.boardErr}>{err}</div>}
      {msg && <div className={styles.boardOk}>{msg}</div>}
      <div className={styles.boardActions}>
        <button type="button" className={styles.chalkBtn} disabled={!to || !body.trim() || busy} onClick={send}>{busy ? "Đang gửi…" : "Gửi ✿"}</button>
        <button type="button" className={styles.linkBtn} onClick={() => setShowSent((v) => !v)}>Đã gửi ({sent ? sent.length : 0}) {showSent ? "▴" : "▾"}</button>
      </div>
      {showSent && (
        <div className={styles.sentList}>
          {(sent || []).map((n) => <div key={n.id} className={styles.sentRow}><b>{n.to_name || "—"}</b>{n.anonymous ? " (ẩn danh)" : ""} · {fmt(n.created_at)}<div>{n.body}</div></div>)}
          {sent && sent.length === 0 && <span className={styles.boardHint}>Chưa gửi lời nào.</span>}
        </div>
      )}
    </Frame>
  );
}

export function ThankInbox({ onClose, onRead }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let off = false;
    (async () => {
      const { data, error } = await supabase.from("thank_notes").select("id, body, anonymous, from_name, created_at, read_at").order("created_at", { ascending: false }).limit(100);
      if (off) return;
      if (error) { setErr(error.message); setRows([]); return; }
      setRows(data || []);
      const unread = (data || []).filter((r) => !r.read_at).map((r) => r.id);
      if (unread.length) { await supabase.from("thank_notes").update({ read_at: new Date().toISOString() }).in("id", unread); if (onRead) onRead(); }
    })();
    return () => { off = true; };
  }, [onRead]);
  return (
    <Frame title="Hộp thư tri ân 💌" onClose={onClose}>
      {err && <div className={styles.boardErr}>{err}</div>}
      {rows === null ? <span className={styles.boardHint}>Đang tải…</span> : rows.length === 0 ? <span className={styles.boardHint}>Chưa có lời tri ân nào gửi tới bạn.</span> : rows.map((r) => (
        <div key={r.id} className={`${styles.noteCard} ${!r.read_at ? styles.noteNew : ""}`}>
          <div className={styles.noteBody}>{r.body}</div>
          <div className={styles.noteFrom}>— {r.anonymous || !r.from_name ? "một người ẩn danh" : r.from_name} · {fmt(r.created_at)}</div>
        </div>
      ))}
    </Frame>
  );
}

export function ThankBoard({ onClose, boardDay }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let off = false;
    supabase.rpc("thank_board").then(({ data, error }) => { if (off) return; if (error) setErr(error.message); setRows(data || []); });
    return () => { off = true; };
  }, []);
  return (
    <Frame title="Bảng tri ân 20/11 🌼" onClose={onClose} wide>
      {err && <div className={styles.boardErr}>{err}</div>}
      {rows === null ? <span className={styles.boardHint}>Đang tải…</span> : rows.length === 0 ? <span className={styles.boardHint}>Bảng tri ân sẽ nở hoa khi có những lời cảm ơn đầu tiên ✿</span> : (
        <div className={styles.bloomCols}>
          {rows.map((r, i) => (
            <div key={r.id} className={styles.bloomCard} style={{ animationDelay: `${Math.min(i, 40) * 90}ms`, "--tilt": `${((i * 37) % 7) - 3}deg` }}>
              <span className={styles.bloomFlower} aria-hidden="true">{["🌼", "✿", "❀", "🌸"][i % 4]}</span>
              {r.body}
            </div>
          ))}
        </div>
      )}
    </Frame>
  );
}
