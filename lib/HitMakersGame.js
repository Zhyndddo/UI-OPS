"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "./hmSound";
import HitMakersAvatarPad from "./HitMakersAvatarPad";

// Round 620/622 — Hit Makers: the whole game screen (used by the staff page /hit-makers and the guest page /hit-makers/guest).
// `call(body)` is supplied by the page: it POSTs to /api/hit-makers with the right identity (login token or guest token) and returns the JSON.
// State is polled every 2.5 s; every click returns the fresh state in the same reply.
// Round 622: shake-to-roll dice + sounds, doodle avatars as tokens (big for the player whose turn it is), hop (≤ 6 squares) / zip (7+) movement.
const GROUP = { 1: "#8b6b4e", 2: "#7fd3e8", 3: "#f08fc0", 4: "#f5a04a", 5: "#e5534b", 6: "#f2d34f", 7: "#4fc58b", 8: "#3a4fb8" };
const PCOL = ["#ffc857", "#7fd3e8", "#ff7ab6", "#7be0a0", "#b79cff", "#ff9b5e"];
const LEVELS = ["", "Single", "EP", "Album", "Tour"];
const ICON = { start: "🏆", jail: "📄", rest: "🎤", gojail: "🚫", plat: "📡", util: "🎚️", news: "⚡", deal: "✍️" };
const HOP_MAX = 6;
const money = (n) => `${Number(n || 0).toLocaleString("vi-VN")} MD`;
const r6 = () => 1 + Math.floor(Math.random() * 6);

function cellOf(i) {
  if (i === 0) return [9, 9];
  if (i <= 8) return [9 - i, 9];
  if (i === 9) return [0, 9];
  if (i <= 17) return [0, 18 - i];
  if (i === 18) return [0, 0];
  if (i <= 26) return [i - 18, 0];
  if (i === 27) return [9, 0];
  return [9, i - 27];
}
const sideOf = (c, r) => (r === 9 && c > 0 && c < 9 ? "b" : c === 0 && r > 0 && r < 9 ? "l" : r === 0 && c > 0 && c < 9 ? "t" : c === 9 && r > 0 && r < 9 ? "r" : "x");

// ---------- dice: hold the dice, shake with the mouse / finger, let go to roll ----------
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function Die({ v, size, rot }) {
  return (
    <div style={{ width: size, height: size, background: "#fff", borderRadius: size * 0.18, display: "grid", gridTemplate: "repeat(3,1fr)/repeat(3,1fr)", padding: size * 0.12, boxShadow: "0 4px 10px #0009, inset 0 -3px 0 #ddd", transform: `rotate(${rot}deg)` }}>
      {Array.from({ length: 9 }).map((_, i) => <span key={i} style={{ width: "72%", height: "72%", alignSelf: "center", justifySelf: "center", borderRadius: "50%", background: (PIPS[v] || []).includes(i) ? "#1a1530" : "transparent" }} />)}
    </div>
  );
}

function DiceRoller({ dice, rollNo, canRoll, onRoll }) {
  const [faces, setFaces] = useState([1, 1]);
  const [hold, setHold] = useState(false);
  const [tumble, setTumble] = useState(false);
  const [off, setOff] = useState({ x: 0, y: 0, r: 0 });
  const tum = useRef(null), endT = useRef(null), seen = useRef(rollNo), latest = useRef(dice);
  const start = useRef({ x: 0, y: 0 }), lastPt = useRef({ x: 0, y: 0 }), heldAt = useRef(0), lastRattle = useRef(0), dist = useRef(0);
  latest.current = dice;

  const begin = () => { if (tum.current) return; setTumble(true); tum.current = setInterval(() => { setFaces([r6(), r6()]); sfx.rattle(); }, 85); };
  const finish = (ms) => {
    if (endT.current) return;
    endT.current = setTimeout(() => {
      clearInterval(tum.current); tum.current = null; endT.current = null; setTumble(false);
      const d = latest.current || []; setFaces(d.length === 2 ? d : [1, 1]); sfx.land();
    }, ms);
  };
  useEffect(() => { if (rollNo !== seen.current) { seen.current = rollNo; begin(); finish(650); } });   // any player's roll plays the animation on every screen
  useEffect(() => { if (!tumble && !hold && dice && dice.length === 2) setFaces(dice); }, [dice, tumble, hold]);
  useEffect(() => () => { clearInterval(tum.current); clearTimeout(endT.current); }, []);
  useEffect(() => {
    if (!hold) return undefined;
    const t = setInterval(() => setFaces([r6(), r6()]), 90);
    return () => clearInterval(t);
  }, [hold]);

  const down = (e) => {
    if (!canRoll || tumble) return;
    sfx.unlock(); e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY }; lastPt.current = start.current; heldAt.current = Date.now(); dist.current = 0; setHold(true); sfx.rattle();
  };
  const move = (e) => {
    if (!hold) return;
    const d = Math.hypot(e.clientX - lastPt.current.x, e.clientY - lastPt.current.y); dist.current += d; lastPt.current = { x: e.clientX, y: e.clientY };
    const clamp = (v) => Math.max(-26, Math.min(26, v));
    setOff({ x: clamp((e.clientX - start.current.x) * 0.4), y: clamp((e.clientY - start.current.y) * 0.4), r: (Math.random() - 0.5) * Math.min(40, d * 2) });
    if (d > 4 && Date.now() - lastRattle.current > 80) { lastRattle.current = Date.now(); sfx.rattle(); }
  };
  const up = () => {
    if (!hold) return;
    setHold(false); setOff({ x: 0, y: 0, r: 0 });
    begin();
    Promise.resolve(onRoll()).then(() => finish(650), () => finish(200));
  };
  const px = typeof window !== "undefined" ? Math.max(46, Math.min(76, window.innerWidth * 0.074)) : 64;
  return (
    <div style={{ textAlign: "center" }}>
      <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { setHold(false); setOff({ x: 0, y: 0, r: 0 }); }}
        title={canRoll ? "Giữ, lắc rồi thả để tung" : ""}
        style={{ display: "inline-flex", gap: 14, padding: 10, borderRadius: 16, touchAction: "none", userSelect: "none", cursor: canRoll && !tumble ? (hold ? "grabbing" : "grab") : "default",
          background: canRoll ? "rgba(255,200,87,.12)" : "transparent", outline: canRoll && !hold ? "2px dashed #ffc857" : "none",
          transform: `translate(${off.x}px, ${off.y}px) rotate(${off.r / 4}deg)`, transition: hold ? "none" : "transform .18s" }}>
        <Die v={faces[0]} size={px} rot={tumble || hold ? (faces[0] * 37) % 40 - 20 : 0} />
        <Die v={faces[1]} size={px} rot={tumble || hold ? (faces[1] * 53) % 40 - 20 : 0} />
      </div>
      {canRoll && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{hold ? "Lắc đi… rồi thả ra!" : "Giữ vào xúc xắc, lắc chuột rồi thả để tung"}</div>}
    </div>
  );
}

// ---------- avatar token ----------
function Avatar({ p, src, size, color, big }) {
  const letter = (p?.name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: "26%", overflow: "hidden", background: color, border: `${big ? 3 : 2}px solid ${big ? "#fff" : color}`, boxShadow: big ? "0 0 0 3px " + color + ", 0 6px 14px #000a" : "0 2px 6px #000a", display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1530", fontWeight: 800, fontSize: size * 0.5 }}>
      {src ? <img src={src} alt="" width={size} height={size} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : letter}
    </div>
  );
}

export default function HitMakersGame({ call, mode = "staff", onGone }) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [alias, setAlias] = useState("");
  const [target, setTarget] = useState("2035");
  const [copied, setCopied] = useState("");
  const [muted, setMuted] = useState(false);
  const [avs, setAvs] = useState({});
  const [savingAv, setSavingAv] = useState(false);
  const [savedAv, setSavedAv] = useState(false);
  const [rects, setRects] = useState({ m: {}, bw: 0 });
  const [shown, setShown] = useState({});
  const busyRef = useRef(false), fetchingAv = useRef(false), boardRef = useRef(null), cellEls = useRef({});
  const prevPos = useRef({}), timers = useRef({}), evSeen = useRef(null), wasMyTurn = useRef(false);

  useEffect(() => { setMuted(sfx.isMuted()); }, []);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    try { const j = await call({ action: "state" }); setSt(j); setErr(""); } catch (e) { if (e.status === 401 && onGone) onGone(); else setErr(e.message || "Lỗi mạng"); }
  }, [call, onGone]);
  useEffect(() => { refresh(); const t = setInterval(() => { if (!document.hidden) refresh(); }, 2500); return () => clearInterval(t); }, [refresh]);

  const run = async (body) => {
    if (busyRef.current) return null;
    busyRef.current = true; setBusy(true); setErr("");
    let j = null;
    try { j = await call(body); if (j.state) setSt(j.state); } catch (e) { setErr(e.message || "Lỗi"); }
    busyRef.current = false; setBusy(false);
    return j;
  };
  const act = (kind, arg) => run({ action: "act", kind, arg });

  const players = st?.players || [];
  const board = st?.board || [];
  const g = st?.game || {};
  const status = st?.status;

  // ---- avatars: the page polls only a short hash per player and downloads the pictures when a hash changes ----
  useEffect(() => {
    if (fetchingAv.current || !players.some((p) => p.av && avs[p.id]?.h !== p.av)) return;
    fetchingAv.current = true;
    call({ action: "avatars" }).then((j) => setAvs(j.map || {})).catch(() => {}).finally(() => { fetchingAv.current = false; });
  }, [players, avs, call]);

  // ---- measure the board squares so the token layer can sit exactly on them ----
  const measure = useCallback(() => {
    const b = boardRef.current; if (!b) return;
    const m = {};
    Object.entries(cellEls.current).forEach(([sp, el]) => { if (el) m[sp] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }; });
    setRects({ m, bw: b.clientWidth });
  }, []);
  useEffect(() => {
    if (!boardRef.current) return undefined;
    measure();
    let ro = null;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(measure); ro.observe(boardRef.current); }
    window.addEventListener("resize", measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure, board.length, status]);

  // ---- movement: ≤ 6 squares = hop square by square, 7+ (or a card jump) = zip straight there ----
  const posSig = players.map((p) => `${p.id}:${p.pos}:${p.bankrupt ? 1 : 0}`).join("|");
  useEffect(() => {
    players.forEach((p) => {
      const old = prevPos.current[p.id];
      prevPos.current[p.id] = p.pos;
      if (old === undefined) { setShown((s) => ({ ...s, [p.id]: { sq: p.pos, mode: "none", k: 0 } })); return; }
      if (old === p.pos) return;
      clearTimeout(timers.current[p.id]);
      const fwd = (p.pos - old + 36) % 36;
      if (fwd >= 1 && fwd <= HOP_MAX) {
        let i = 0;
        const step = () => {
          i += 1; sfx.hop();
          setShown((s) => ({ ...s, [p.id]: { sq: (old + i) % 36, mode: "hop", k: ((s[p.id]?.k) || 0) + 1 } }));
          timers.current[p.id] = setTimeout(i < fwd ? step : () => setShown((s) => ({ ...s, [p.id]: { ...s[p.id], mode: "none" } })), i < fwd ? 190 : 260);
        };
        step();
      } else {
        sfx.zip();
        setShown((s) => ({ ...s, [p.id]: { sq: p.pos, mode: "zip", k: ((s[p.id]?.k) || 0) + 1 } }));
        timers.current[p.id] = setTimeout(() => setShown((s) => ({ ...s, [p.id]: { ...s[p.id], mode: "none" } })), 480);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posSig]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  // ---- sounds for what happens at the table ----
  useEffect(() => {
    const evs = st?.events || []; const lastId = evs.length ? evs[evs.length - 1].id : 0;
    if (evSeen.current === null) { evSeen.current = lastId; return; }
    const fresh = evs.filter((e) => e.id > evSeen.current); evSeen.current = Math.max(evSeen.current, lastId);
    fresh.forEach((e) => {
      const b = e.body || "";
      if (b.includes("bước sang năm")) sfx.year();
      else if (b.includes("tiền thuê")) sfx.coin();
      else if (b.includes(" ký ")) sfx.buy();
      else if ((b.includes("bị đưa tới Gỡ nhạc")) || b.includes("phá sản")) sfx.jail();
    });
  }, [st?.events]);
  const myTurnNow = status === "running" && g.cur === st?.me;
  useEffect(() => { if (myTurnNow && !wasMyTurn.current) sfx.turn(); wasMyTurn.current = myTurnNow; }, [myTurnNow]);

  const toggleMute = () => { const v = !muted; sfx.setMuted(v); setMuted(v); if (!v) sfx.unlock(); };
  const saveAvatar = async (data) => {
    if (!data) { setErr("Ảnh quá lớn — hãy vẽ đơn giản hơn."); return; }
    setSavingAv(true); setErr("");
    try { await call({ action: "avatar", data }); setSavedAv(true); refresh(); } catch (e) { setErr(e.message || "Không lưu được"); }
    setSavingAv(false);
  };

  if (!st) return <div style={S.wrap}>{err ? <div style={S.err}>{err}</div> : <div style={{ opacity: 0.7 }}>Đang tải…</div>}</div>;

  const staff = mode === "staff";
  // ---------- no game ----------
  if (status === "none") {
    return (
      <div style={S.wrap}>
        <Header muted={muted} onMute={toggleMute} />
        {err && <div style={S.err}>{err}</div>}
        {!staff ? (
          <div style={S.panel}>
            Ván này đã đóng hoặc bạn chưa vào ván nào. Hãy nhờ người mở ván gửi mã mới.
            {onGone && <div style={{ marginTop: 10 }}><button style={S.btn} onClick={onGone}>Nhập mã khác</button></div>}
          </div>
        ) : st.open?.status === "lobby" ? (
          <div style={S.panel}>
            <b>Có một ván đang chờ</b> ({(st.open.players || []).join(", ")}).
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input style={S.input} placeholder="Tên hãng đĩa (bỏ trống = tên của bạn)" value={alias} maxLength={20} onChange={(e) => setAlias(e.target.value)} />
              <button style={S.btn} disabled={busy} onClick={() => run({ action: "join", alias })}>Vào chơi</button>
            </div>
          </div>
        ) : st.open ? (
          <div style={S.panel}>Một ván đang chạy ({(st.open.players || []).join(", ")}). Hãy đợi ván này xong rồi mở ván mới.</div>
        ) : (
          <div style={S.panel}>
            <b>Mở ván mới</b>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input style={S.input} placeholder="Tên hãng đĩa (bỏ trống = tên của bạn)" value={alias} maxLength={20} onChange={(e) => setAlias(e.target.value)} />
              <label style={{ fontSize: 13, opacity: 0.85 }}>Năm đích <input style={{ ...S.input, width: 90 }} value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="trống" /></label>
              <button style={S.btn} disabled={busy} onClick={() => run({ action: "create", alias, target })}>Mở ván</button>
            </div>
            <div style={S.hint}>Năm đích: tới năm đó ván kết thúc và hãng giàu nhất thắng. Để trống = chơi tới khi chỉ còn một hãng.</div>
          </div>
        )}
      </div>
    );
  }

  const me = players.find((p) => p.id === st.me);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const colorOf = (id) => PCOL[(byId[id]?.seat ?? 0) % PCOL.length];
  const propBy = Object.fromEntries((st.props || []).map((p) => [p.space, p]));
  const cur = byId[g.cur];

  // ---------- lobby ----------
  if (status === "lobby") {
    const link = typeof window !== "undefined" ? `${window.location.origin}/hit-makers/guest?c=${st.code}` : "";
    const copy = async (t, k) => { try { await navigator.clipboard.writeText(t); setCopied(k); setTimeout(() => setCopied(""), 1500); } catch (e) { /* ignore */ } };
    return (
      <div style={S.wrap} onPointerDown={() => sfx.unlock()}>
        <Header muted={muted} onMute={toggleMute} />
        {err && <div style={S.err}>{err}</div>}
        <div style={S.lobby}>
          <div style={S.panel}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Vẽ avatar của bạn</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>Hình này sẽ là quân cờ của bạn trên bàn. Vẽ xong nhớ bấm Lưu.</div>
            <HitMakersAvatarPad key={avs[st.me]?.h || "none"} initialSrc={avs[st.me]?.d || null} onSave={saveAvatar} saving={savingAv} saved={savedAv || !!avs[st.me]} />
          </div>
          <div style={S.panel}>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Phòng chờ · {players.length}/6 hãng đĩa{g.target_year ? ` · năm đích ${g.target_year}` : " · chơi tới khi còn một hãng"}</div>
            {st.is_host && (
              <div style={{ margin: "12px 0", padding: 12, border: "1px dashed #ffc857", borderRadius: 10 }}>
                <div style={{ fontSize: 13, opacity: 0.85 }}>Mã mời khách (không cần tài khoản):</div>
                <div style={{ fontSize: 34, letterSpacing: 6, fontWeight: 800, color: "#ffc857" }}>{st.code}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  <button style={S.btn2} onClick={() => copy(st.code, "c")}>{copied === "c" ? "Đã chép ✓" : "Chép mã"}</button>
                  <button style={S.btn2} onClick={() => copy(link, "l")}>{copied === "l" ? "Đã chép ✓" : "Chép link mời"}</button>
                  <button style={S.btn2} disabled={busy} onClick={() => run({ action: "edit", what: "code" })}>Đổi mã mới</button>
                </div>
                <div style={S.hint}>Khách mở link, nhập tên hãng đĩa là vào được. Mã chỉ dùng được lúc đang chờ.</div>
              </div>
            )}
            <div style={{ display: "grid", gap: 8, margin: "10px 0" }}>
              {players.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar p={p} src={avs[p.id]?.d} size={38} color={PCOL[p.seat % PCOL.length]} />
                  <b>{p.name}</b>{p.id === st.me && <span style={S.tag}>bạn</span>}{p.bot && <span style={S.tag}>bot</span>}{p.guest && <span style={S.tag}>khách</span>}
                </div>
              ))}
            </div>
            {st.is_host && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button style={S.btn2} disabled={busy || players.length >= 6} onClick={() => run({ action: "edit", what: "bots", n: 1 })}>+ Bot</button>
                <button style={S.btn2} disabled={busy} onClick={() => run({ action: "edit", what: "kick_bots" })}>Bỏ hết bot</button>
                <label style={{ fontSize: 13 }}>Năm đích <input style={{ ...S.input, width: 80 }} defaultValue={g.target_year || ""} onBlur={(e) => run({ action: "edit", what: "target", n: e.target.value })} placeholder="trống" /></label>
                <button style={S.btn} disabled={busy || players.length < 2} onClick={() => run({ action: "start" })}>Bắt đầu ván</button>
                <button style={S.btn2} disabled={busy} onClick={() => run({ action: "cancel" })}>Hủy ván</button>
              </div>
            )}
            {!st.is_host && <div style={S.hint}>Đang chờ người mở ván bắt đầu…</div>}
            <div style={{ marginTop: 10 }}><button style={S.link} onClick={() => run({ action: "leave" })}>Rời phòng</button></div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- running / finished ----------
  const myTurn = status === "running" && g.cur === st.me && me && !me.bankrupt;
  const here = me ? board[me.pos] : null;
  const myActs = (st.props || []).filter((p) => p.owner === st.me && board[p.space]?.kind === "act");
  const grpFull = (grp) => board.filter((b) => b.grp === grp).every((b) => propBy[b.space]?.owner === st.me);
  const bw = rects.bw || 700;
  const cw = rects.m[1]?.w || 60;
  const BIG = Math.max(28, Math.min(bw * 0.07, cw * 0.96)), SMALL = Math.max(17, BIG * 0.56);
  const bySq = {};
  players.filter((p) => !p.bankrupt && shown[p.id]).forEach((p) => { (bySq[shown[p.id].sq] = bySq[shown[p.id].sq] || []).push(p); });

  return (
    <div style={S.wrap} onPointerDown={() => sfx.unlock()}>
      <style>{CSS}</style>
      <Header sub={`Năm ${g.year}${g.target_year ? ` / đích ${g.target_year}` : ""} · vòng ${g.round}`} muted={muted} onMute={toggleMute} />
      {err && <div style={S.err}>{err}</div>}
      <div style={S.layout}>
        <div style={S.boardBox}>
          <div ref={boardRef} style={S.board}>
            {board.map((b) => {
              const [c, r] = cellOf(b.space); const side = sideOf(c, r); const corner = side === "x";
              const pr = propBy[b.space];
              return (
                <div key={b.space} ref={(el) => { if (el) cellEls.current[b.space] = el; }} style={{ ...S.cell, ...(corner ? S.corner : null), gridColumn: c + 1, gridRow: r + 1 }}>
                  {b.kind === "act" && <i style={{ ...S.bar, ...BAR[side], background: GROUP[b.grp] }} />}
                  <span style={{ fontSize: corner ? "clamp(16px,2.6vw,26px)" : "clamp(11px,1.6vw,16px)" }}>{ICON[b.kind] || ""}</span>
                  <b style={{ fontSize: corner ? "clamp(7px,1.15vw,11px)" : "clamp(6px,0.95vw,10px)", lineHeight: 1.1 }}>{b.kind === "start" ? `Music Award ${g.year}` : b.name}</b>
                  {b.price != null && <em style={S.price}>{b.price}</em>}
                  {pr && <i style={{ ...S.owner, background: colorOf(pr.owner) }}>{pr.level > 0 ? LEVELS[pr.level][0] + pr.level : ""}</i>}
                </div>
              );
            })}
            <div style={S.center}>
              <div style={S.logo}>HIT MAKERS</div>
              <DiceRoller dice={g.dice} rollNo={g.roll_no} canRoll={!!myTurn && g.phase === "roll" && !busy} onRoll={() => act("roll")} />
              {status === "finished" ? (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22 }}>🏆 {byId[g.winner]?.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8, maxWidth: 260 }}>{g.win_reason}</div>
                  <button style={{ ...S.btn, marginTop: 8 }} onClick={() => run({ action: "leave" })}>Xong</button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13 }}>Lượt của <b style={{ color: colorOf(g.cur) }}>{cur?.name}</b>{myTurn ? " (bạn)" : ""}{g.turn_left != null && !cur?.bot ? ` · ${g.turn_left}s` : ""}</div>
                  {myTurn && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                      {g.phase === "roll" && <button style={S.btn2} disabled={busy} onClick={() => act("roll")}>🎲 Tung (bấm nhanh)</button>}
                      {g.phase === "roll" && me.in_jail && <button style={S.btn2} disabled={busy || me.cash < 50} onClick={() => act("jail_pay")}>Đóng phí 50</button>}
                      {g.phase === "roll" && me.in_jail && me.jail_cards > 0 && <button style={S.btn2} disabled={busy} onClick={() => act("jail_card")}>Dùng thẻ ra tù</button>}
                      {g.phase === "buy" && <button style={S.btn} disabled={busy || me.cash < (here?.price || 0)} onClick={() => act("buy")}>Mua {here?.name} · {here?.price}</button>}
                      {g.phase === "buy" && <button style={S.btn2} disabled={busy} onClick={() => act("skip")}>Bỏ qua</button>}
                      {g.phase === "end" && <button style={S.btn} disabled={busy} onClick={() => act("end")}>Kết thúc lượt</button>}
                    </div>
                  )}
                  {me?.in_jail && <div style={{ fontSize: 12, opacity: 0.8 }}>Bạn đang ở Gỡ nhạc: tung đôi, dùng thẻ, hoặc đóng phí.</div>}
                </>
              )}
            </div>
            {/* token layer: avatars sit at the bottom-right of their square, next to the Single / EP / Album badge */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {Object.entries(bySq).flatMap(([sq, list]) => {
                const r = rects.m[sq]; if (!r) return [];
                const sorted = [...list].sort((a, b) => (a.id === g.cur ? 1 : 0) - (b.id === g.cur ? 1 : 0) || a.seat - b.seat);
                return sorted.map((p, i) => {
                  const isCur = p.id === g.cur && status === "running"; const s = isCur ? BIG : SMALL; const sh = shown[p.id];
                  const x = r.x + r.w - s - 3 - i * SMALL * 0.62, y = r.y + r.h - s - 2;
                  return (
                    <div key={p.id} style={{ position: "absolute", left: 0, top: 0, transform: `translate(${x}px, ${y}px)`, zIndex: isCur ? 30 : 20 + i,
                      transition: sh.mode === "zip" ? "transform .38s cubic-bezier(.15,.85,.25,1)" : sh.mode === "hop" ? "transform .17s ease-out" : "none" }}>
                      <div key={sh.k} style={{ animation: sh.mode === "hop" ? "hmHop .19s ease-out" : sh.mode === "zip" ? "hmZip .42s ease-out" : isCur ? "hmPulse 1.6s infinite" : "none", borderRadius: "26%" }}>
                        <Avatar p={p} src={avs[p.id]?.d} size={s} color={PCOL[p.seat % PCOL.length]} big={isCur} />
                      </div>
                    </div>
                  );
                });
              })}
            </div>
          </div>
        </div>
        <div style={S.side}>
          <div style={S.panel}>
            {players.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", opacity: p.bankrupt ? 0.4 : 1 }}>
                <Avatar p={p} src={avs[p.id]?.d} size={p.id === g.cur ? 34 : 26} color={PCOL[p.seat % PCOL.length]} big={p.id === g.cur && status === "running"} />
                <span style={{ flex: 1 }}><b>{p.name}</b>{p.id === st.me && <span style={S.tag}>bạn</span>}{p.bot && <span style={S.tag}>bot</span>}{p.in_jail && <span style={S.tag}>Gỡ nhạc</span>}{p.jail_cards > 0 && <span style={S.tag}>🎫{p.jail_cards}</span>}{p.bankrupt && <span style={S.tag}>phá sản</span>}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{money(p.cash)}</span>
              </div>
            ))}
            <div style={S.hint}>Tổng tài sản: {players.filter((p) => !p.bankrupt).map((p) => `${p.name} ${p.worth}`).join(" · ")}</div>
          </div>
          {myActs.length > 0 && (
            <div style={S.panel}>
              <b style={{ fontSize: 13 }}>Nghệ sĩ của bạn</b>
              {myActs.map((p) => { const b = board[p.space]; const full = grpFull(b.grp); return (
                <div key={p.space} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 13 }}>
                  <i style={{ width: 10, height: 10, borderRadius: 2, background: GROUP[b.grp] }} />
                  <span style={{ flex: 1 }}>{b.name} <span style={{ opacity: 0.6 }}>{p.level ? LEVELS[p.level] : ""}</span></span>
                  {full && myTurn && <>
                    <button style={S.mini} disabled={busy || p.level >= 4 || me.cash < b.up_cost} title={`Nâng cấp ${b.up_cost}`} onClick={() => act("upgrade", p.space)}>⬆ {b.up_cost}</button>
                    <button style={S.mini} disabled={busy || p.level < 1} title="Bán một cấp (nhận nửa giá)" onClick={() => act("sell", p.space)}>⬇</button>
                  </>}
                </div>); })}
              <div style={S.hint}>Sở hữu đủ cả nhóm màu thì tiền thuê gấp đôi và được nâng cấp (Single → EP → Album → Tour), nâng đều cả nhóm.</div>
            </div>
          )}
          <div style={{ ...S.panel, maxHeight: 280, overflow: "auto", fontSize: 13 }}>
            {[...(st.events || [])].reverse().map((e) => <div key={e.id} style={{ padding: "2px 0", borderBottom: "1px solid #2e2850" }}>{e.body}</div>)}
          </div>
          {status === "running" && <button style={S.link} onClick={() => { if (confirm("Rời bàn? Bot sẽ chơi thay bạn.")) run({ action: "leave" }); }}>Rời bàn</button>}
        </div>
      </div>
    </div>
  );
}

const CSS = `
@keyframes hmHop { 0% { transform: translateY(0) scale(1,1); } 50% { transform: translateY(-18px) scale(.94,1.1); } 100% { transform: translateY(0) scale(1.08,.9); } }
@keyframes hmZip { 0% { transform: scale(.7,1.35); filter: blur(2px); } 55% { transform: scale(1.3,.78); filter: blur(1px); } 100% { transform: scale(1,1); filter: none; } }
@keyframes hmPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,.75); } 50% { box-shadow: 0 0 0 9px rgba(255,255,255,0); } }
`;
const BAR = { b: { top: 0, left: 0, right: 0, height: "20%" }, t: { bottom: 0, left: 0, right: 0, height: "20%" }, l: { top: 0, bottom: 0, right: 0, width: "20%" }, r: { top: 0, bottom: 0, left: 0, width: "20%" }, x: {} };

function Header({ sub, muted, onMute }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
      <h1 style={{ margin: 0, fontSize: 22, background: "linear-gradient(90deg,#ffc857,#ff7ab6,#7fd3e8)", WebkitBackgroundClip: "text", color: "transparent" }}>Hit Makers</h1>
      {sub && <span style={{ opacity: 0.8, fontSize: 14 }}>{sub}</span>}
      <button type="button" onClick={onMute} title={muted ? "Bật âm thanh" : "Tắt âm thanh"} style={{ marginLeft: "auto", background: "none", border: "1px solid #5a4f8a", color: "#f3efff", borderRadius: 8, padding: "2px 9px", cursor: "pointer" }}>{muted ? "🔇" : "🔊"}</button>
    </div>
  );
}

const S = {
  wrap: { background: "#14121f", color: "#f3efff", minHeight: "100%", padding: 14, borderRadius: 12, fontFamily: "inherit" },
  layout: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14, alignItems: "start" },
  lobby: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14, alignItems: "start" },
  boardBox: { minWidth: 0 },
  board: { position: "relative", display: "grid", gridTemplateColumns: "1.5fr repeat(8, 1fr) 1.5fr", gridTemplateRows: "1.5fr repeat(8, 1fr) 1.5fr", gap: 2, aspectRatio: "1", background: "#3a3358", padding: 2, borderRadius: 12, width: "100%", maxWidth: 760 },
  cell: { background: "#1f1b33", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", position: "relative", overflow: "hidden", borderRadius: 4, padding: 2, minWidth: 0 },
  corner: { background: "#2b2350", border: "1px solid #ffc857" },
  bar: { position: "absolute" }, price: { fontStyle: "normal", color: "#ffc857", fontSize: "clamp(6px,0.9vw,10px)" },
  owner: { position: "absolute", left: 2, bottom: 2, minWidth: 8, height: 8, borderRadius: 4, fontStyle: "normal", fontSize: 7, color: "#111", lineHeight: "8px", padding: "0 2px", fontWeight: 700 },
  center: { gridColumn: "2 / 10", gridRow: "2 / 10", background: "radial-gradient(circle at 50% 40%, #2a2150, #17132a)", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 8 },
  logo: { fontSize: "clamp(16px,3.6vw,34px)", fontWeight: 800, letterSpacing: ".05em", background: "linear-gradient(90deg,#ffc857,#ff7ab6,#7fd3e8)", WebkitBackgroundClip: "text", color: "transparent" },
  side: { display: "grid", gap: 10 },
  panel: { background: "#1f1b33", border: "1px solid #3a3358", borderRadius: 10, padding: 12 },
  btn: { background: "#ffc857", color: "#2a1f00", border: 0, borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: "pointer" },
  btn2: { background: "#2b2350", color: "#f3efff", border: "1px solid #5a4f8a", borderRadius: 8, padding: "8px 12px", cursor: "pointer" },
  mini: { background: "#2b2350", color: "#f3efff", border: "1px solid #5a4f8a", borderRadius: 6, padding: "2px 7px", cursor: "pointer", fontSize: 12 },
  link: { background: "none", border: 0, color: "#a79fc9", textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 13 },
  input: { background: "#14121f", color: "#f3efff", border: "1px solid #5a4f8a", borderRadius: 8, padding: "8px 10px", minWidth: 0 },
  hint: { fontSize: 12, opacity: 0.7, marginTop: 8, lineHeight: 1.4 },
  tag: { marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "#3a3358", color: "#d7d0ff" },
  err: { background: "#4a1d2b", border: "1px solid #a03a55", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 13 },
};
