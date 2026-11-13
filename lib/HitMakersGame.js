"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Round 620 — Hit Makers: the whole game screen (used by the staff page /hit-makers and the guest page /hit-makers/guest).
// `call(body)` is supplied by the page: it POSTs to /api/hit-makers with the right identity (login token or guest token) and returns the JSON.
// The game state is polled every 2.5 s; every click returns the fresh state in the same reply.
const GROUP = { 1: "#8b6b4e", 2: "#7fd3e8", 3: "#f08fc0", 4: "#f5a04a", 5: "#e5534b", 6: "#f2d34f", 7: "#4fc58b", 8: "#3a4fb8" };
const PCOL = ["#ffc857", "#7fd3e8", "#ff7ab6", "#7be0a0", "#b79cff", "#ff9b5e"];
const LEVELS = ["", "Single", "EP", "Album", "Tour"];
const ICON = { start: "🏆", jail: "📄", rest: "🎤", gojail: "🚫", plat: "📡", util: "🎚️", news: "⚡", deal: "✍️" };
const FACE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const money = (n) => `${Number(n || 0).toLocaleString("vi-VN")} MD`;

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

export default function HitMakersGame({ call, mode = "staff", onGone }) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [alias, setAlias] = useState("");
  const [target, setTarget] = useState("2035");
  const [copied, setCopied] = useState("");
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    try { const j = await call({ action: "state" }); setSt(j); setErr(""); } catch (e) { if (e.status === 401 && onGone) onGone(); else setErr(e.message || "Lỗi mạng"); }
  }, [call, onGone]);
  useEffect(() => { refresh(); const t = setInterval(() => { if (!document.hidden) refresh(); }, 2500); return () => clearInterval(t); }, [refresh]);

  const run = async (body) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setErr("");
    try { const j = await call(body); if (j.state) setSt(j.state); } catch (e) { setErr(e.message || "Lỗi"); }
    busyRef.current = false; setBusy(false);
  };
  const act = (kind, arg) => run({ action: "act", kind, arg });

  if (!st) return <div style={S.wrap}>{err ? <div style={S.err}>{err}</div> : <div style={{ opacity: 0.7 }}>Đang tải…</div>}</div>;

  const staff = mode === "staff";
  // ---------- no game / lobby ----------
  if (st.status === "none") {
    return (
      <div style={S.wrap}>
        <Header />
        {err && <div style={S.err}>{err}</div>}
        {!staff ? (
          <div style={S.panel}>Ván này đã đóng hoặc bạn chưa vào ván nào. Hãy nhờ người mở ván gửi mã mới.</div>
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

  const players = st.players || [];
  const me = players.find((p) => p.id === st.me);
  const board = st.board || [];
  const g = st.game || {};
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const colorOf = (id) => PCOL[(byId[id]?.seat ?? 0) % PCOL.length];
  const propBy = Object.fromEntries((st.props || []).map((p) => [p.space, p]));
  const cur = byId[g.cur];

  // ---------- lobby ----------
  if (st.status === "lobby") {
    const link = typeof window !== "undefined" ? `${window.location.origin}/hit-makers/guest?c=${st.code}` : "";
    const copy = async (t, k) => { try { await navigator.clipboard.writeText(t); setCopied(k); setTimeout(() => setCopied(""), 1500); } catch (e) { /* ignore */ } };
    return (
      <div style={S.wrap}>
        <Header />
        {err && <div style={S.err}>{err}</div>}
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
          <div style={{ display: "grid", gap: 6, margin: "10px 0" }}>
            {players.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i style={{ width: 14, height: 14, borderRadius: 7, background: PCOL[p.seat % PCOL.length], display: "inline-block" }} />
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
    );
  }

  // ---------- running / finished ----------
  const myTurn = st.status === "running" && g.cur === st.me && me && !me.bankrupt;
  const here = me ? board[me.pos] : null;
  const myActs = (st.props || []).filter((p) => p.owner === st.me && board[p.space]?.kind === "act");
  const grpFull = (grp) => board.filter((b) => b.grp === grp).every((b) => propBy[b.space]?.owner === st.me);
  const dice = g.dice || [];

  return (
    <div style={S.wrap}>
      <Header sub={`Năm ${g.year}${g.target_year ? ` / đích ${g.target_year}` : ""} · vòng ${g.round}`} />
      {err && <div style={S.err}>{err}</div>}
      <div style={S.layout}>
        <div style={S.boardBox}>
          <div style={S.board}>
            {board.map((b) => {
              const [c, r] = cellOf(b.space); const side = sideOf(c, r); const corner = side === "x";
              const pr = propBy[b.space]; const toks = players.filter((p) => !p.bankrupt && p.pos === b.space);
              return (
                <div key={b.space} style={{ ...S.cell, ...(corner ? S.corner : null), gridColumn: c + 1, gridRow: r + 1 }}>
                  {b.kind === "act" && <i style={{ ...S.bar, ...BAR[side], background: GROUP[b.grp] }} />}
                  <span style={{ fontSize: corner ? "clamp(16px,2.6vw,26px)" : "clamp(11px,1.6vw,16px)" }}>{ICON[b.kind] || ""}</span>
                  <b style={{ fontSize: corner ? "clamp(7px,1.15vw,11px)" : "clamp(6px,0.95vw,10px)", lineHeight: 1.1 }}>{b.kind === "start" ? `Music Award ${g.year}` : b.name}</b>
                  {b.price != null && <em style={S.price}>{b.price}</em>}
                  {pr && <i style={{ ...S.owner, background: colorOf(pr.owner) }}>{pr.level > 0 ? LEVELS[pr.level][0] + pr.level : ""}</i>}
                  <span style={S.toks}>{toks.map((p) => <i key={p.id} title={p.name} style={{ ...S.tok, background: PCOL[p.seat % PCOL.length], outline: p.id === g.cur ? "2px solid #fff" : "none" }} />)}</span>
                </div>
              );
            })}
            <div style={S.center}>
              <div style={S.logo}>HIT MAKERS</div>
              <div style={{ fontSize: "clamp(28px,6vw,54px)", lineHeight: 1 }}>{dice.length ? `${FACE[dice[0]]} ${FACE[dice[1]]}` : "🎲"}</div>
              {st.status === "finished" ? (
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
                      {g.phase === "roll" && <button style={S.btn} disabled={busy} onClick={() => act("roll")}>🎲 Tung xúc xắc</button>}
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
          </div>
        </div>
        <div style={S.side}>
          <div style={S.panel}>
            {players.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", opacity: p.bankrupt ? 0.4 : 1 }}>
                <i style={{ width: 12, height: 12, borderRadius: 6, background: PCOL[p.seat % PCOL.length], display: "inline-block", outline: p.id === g.cur ? "2px solid #fff" : "none" }} />
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
          {st.status === "running" && <button style={S.link} onClick={() => { if (confirm("Rời bàn? Bot sẽ chơi thay bạn.")) run({ action: "leave" }); }}>Rời bàn</button>}
        </div>
      </div>
    </div>
  );
}

const BAR = { b: { top: 0, left: 0, right: 0, height: "20%" }, t: { bottom: 0, left: 0, right: 0, height: "20%" }, l: { top: 0, bottom: 0, right: 0, width: "20%" }, r: { top: 0, bottom: 0, left: 0, width: "20%" }, x: {} };

function Header({ sub }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
      <h1 style={{ margin: 0, fontSize: 22, background: "linear-gradient(90deg,#ffc857,#ff7ab6,#7fd3e8)", WebkitBackgroundClip: "text", color: "transparent" }}>Hit Makers</h1>
      {sub && <span style={{ opacity: 0.8, fontSize: 14 }}>{sub}</span>}
    </div>
  );
}

const S = {
  wrap: { background: "#14121f", color: "#f3efff", minHeight: "100%", padding: 14, borderRadius: 12, fontFamily: "inherit" },
  layout: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14, alignItems: "start" },
  boardBox: { minWidth: 0 },
  board: { display: "grid", gridTemplateColumns: "1.5fr repeat(8, 1fr) 1.5fr", gridTemplateRows: "1.5fr repeat(8, 1fr) 1.5fr", gap: 2, aspectRatio: "1", background: "#3a3358", padding: 2, borderRadius: 12, width: "100%", maxWidth: 760 },
  cell: { background: "#1f1b33", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", position: "relative", overflow: "hidden", borderRadius: 4, padding: 2, minWidth: 0 },
  corner: { background: "#2b2350", border: "1px solid #ffc857" },
  bar: { position: "absolute" }, price: { fontStyle: "normal", color: "#ffc857", fontSize: "clamp(6px,0.9vw,10px)" },
  owner: { position: "absolute", left: 2, bottom: 2, minWidth: 8, height: 8, borderRadius: 4, fontStyle: "normal", fontSize: 7, color: "#111", lineHeight: "8px", padding: "0 2px", fontWeight: 700 },
  toks: { position: "absolute", right: 2, bottom: 2, display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "70%" },
  tok: { width: "clamp(7px,1.2vw,13px)", height: "clamp(7px,1.2vw,13px)", borderRadius: "50%", display: "inline-block", boxShadow: "0 1px 3px #000a" },
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
