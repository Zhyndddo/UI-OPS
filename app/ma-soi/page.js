"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { howlOnce, playHowl, getSound, setSound } from "../../lib/maSoiHowl";
import MaSoiChat, { MaSoiDevTools } from "../../lib/MaSoiChat";
import RoleQR from "../../lib/RoleQR";   // Round 600   // Round 596

// Round 576 — Ma Sói (Werewolf) office game, slice 1. All rules run in the database (sql/pending/add-round576-ma-soi.sql);
// this page only shows what the server says this player may see, and sends the player's answers.
const POLL_MS = 20000;
const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 12 };
const btn = { padding: "9px 16px", fontWeight: 800, borderRadius: 8, border: "none", background: "#ff7a1a", color: "#fff", cursor: "pointer" };
const btnGhost = { padding: "8px 14px", fontWeight: 700, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "inherit", cursor: "pointer" };
const ROLE_VI = { wolf: "Sói", villager: "Dân làng", seer: "Tiên tri", witch: "Phù thủy", hunter: "Thợ săn", guard: "Bảo vệ", cupid: "Thần Tình Yêu", idiot: "Kẻ ngốc", elder: "Già làng", whitewolf: "Sói trắng", halfwolf: "Sói nửa người", silencer: "Người bịt miệng", whisperer: "Người thổi sáo", seerapprentice: "Tiên tri tập sự", wolfcub: "Sói con", detective: "Thám tử", scapegoat: "Kẻ thế thân", fool: "Thằng ngu", prince: "Vương công", diseased: "Kẻ bệnh tật", medium: "Thầy đồng", scryer: "Nhà chiêm tinh", ghost: "Kẻ yểu mệnh", rogue: "Kẻ trộm", wildchild: "Đứa trẻ hoang dã" };
const PHASE_LABEL = { night: "🌙 Đêm", day: "☀️ Ngày — bỏ phiếu", runoff: "⚖️ Bỏ phiếu lại", hunter: "🏹 Phát súng cuối" };

function fmtLeft(ms) {
  if (ms <= 0) return "đang chốt…";
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h ? h + " giờ " : ""}${String(m).padStart(h ? 2 : 1, "0")} phút ${String(sec).padStart(2, "0")} giây`;
}
function fmtAt(iso) {
  try { return new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }); } catch (e) { return ""; }
}

function Countdown({ endsAt, skew }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (!endsAt) return null;
  const left = new Date(endsAt).getTime() - (Date.now() + skew);
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtLeft(left)}</span>;
}

function Picker({ options, value, onPick, disabled, extra }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0" }}>
      {options.map((o) => (
        <button key={o.id} type="button" disabled={disabled} onClick={() => onPick(o.id)}
          style={{ ...btnGhost, ...(value === o.id ? { background: "#ff7a1a", color: "#fff", borderColor: "#ff7a1a" } : {}), opacity: disabled ? 0.6 : 1 }}>{o.name}</button>
      ))}
      {extra}
    </div>
  );
}

// Round 595 — the Sói trắng's extra kill (even nights): pick anybody (wolf or villager) or skip. Used inside the wolf card and on its own.
function ScryBox({ o, busy, onSend }) {   // Round 608 — the wolf-side Nhà chiêm tinh
  const [pick, setPick] = useState("");
  return (
    <div>
      <div style={{ fontWeight: 800 }}>🔭 Nhà chiêm tinh — dò xem ai là Tiên tri</div>
      {o.done ? <div style={{ fontSize: 13, marginTop: 6 }}>Bạn đã dò xong — kết quả nằm trong thẻ bên dưới.</div> : (
        <>
          <Picker options={o.options} value={pick} disabled={busy} onPick={setPick} />
          <button type="button" style={btn} disabled={busy || !pick} onClick={() => onSend(pick)}>{busy ? "Đang gửi…" : "Dò người này"}</button>
        </>
      )}
    </div>
  );
}

function WhiteWolfBox({ o, busy, onSend }) {
  const [pick, setPick] = useState("");
  return (
    <div>
      <div style={{ fontWeight: 800 }}>🐺⚪ Sói trắng — nhát giết thêm (đêm chẵn)</div>
      {o.done ? <div style={{ fontSize: 13, marginTop: 6 }}>Bạn đã quyết định xong.</div> : (
        <>
          <Picker options={o.options} value={pick === "__skip" ? "" : pick} disabled={busy} onPick={setPick}
            extra={<button type="button" disabled={busy} onClick={() => setPick("__skip")} style={{ ...btnGhost, ...(pick === "__skip" ? { background: "#555", color: "#fff" } : {}) }}>Bỏ qua đêm nay</button>} />
          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 8 }}>Giết một người bất kỳ — sói hay dân. Bảo vệ và Phù thủy không cứu được nhát này. Bạn đổi ý được cho đến khi bấm Xác nhận.</div>
          <button type="button" style={btn} disabled={busy || !pick} onClick={() => onSend(pick === "__skip" ? null : pick)}>{busy ? "Đang gửi…" : "Xác nhận"}</button>
        </>
      )}
    </div>
  );
}

// Round 586 — "start automatically when N people joined" field, used by both "open a new game" boxes (first game and after a game ended)
function AutoField({ value, onChange }) {
  return (
    <div style={{ fontSize: 13, marginBottom: 8 }}>
      Tự bắt đầu khi đủ <input value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric"
        style={{ width: 44, padding: 4, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "inherit", textAlign: "center" }} /> người (tối thiểu 4, tối đa 30; 0 = chỉ dev bấm bắt đầu).
    </div>
  );
}

// Round 586 — who has NOT acted yet (never how anybody acted). The server decides what each person may see:
// day = names of players who have not voted; night = wolves see their pack, everybody else only the roles still to act.
function Waiting({ w }) {
  const list = w.list || [];
  if (w.type === "pack") {
    return (
      <div style={{ fontSize: 12.5, marginTop: 6 }}>
        🐺 Bầy sói: {list.map((x, i) => <span key={i} style={{ marginRight: 8, fontWeight: x.me ? 800 : 400 }}>{x.name}{x.me ? " (bạn)" : ""} {x.done ? "✅" : "⏳"}</span>)}
      </div>
    );
  }
  if (!list.length) return null;
  return (
    <div style={{ fontSize: 12.5, marginTop: 6 }}>
      {w.type === "names" ? "⏳ Chưa bỏ phiếu: " : "⏳ Đang chờ: "}<b>{list.join(", ")}</b>
    </div>
  );
}

// Round 585 — tiny sound control: only a speaker icon until opened (switch, volume, test).
function SoundControl() {
  const [open, setOpen] = useState(false);
  const [snd, setSnd] = useState({ on: true, vol: 0.7 });
  useEffect(() => { setSnd(getSound()); }, []);
  const change = (patch) => setSnd(setSound(patch));
  return (
    <div style={{ position: "relative" }}>
      <button type="button" aria-label="Âm thanh" title="Âm thanh" onClick={() => setOpen((x) => !x)}
        style={{ ...btnGhost, padding: "4px 9px", fontSize: 15, lineHeight: 1 }}>{snd.on && snd.vol > 0 ? "🔊" : "🔇"}</button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, width: 220, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, boxShadow: "0 6px 20px rgba(0,0,0,.4)", fontSize: 13 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
            <input type="checkbox" checked={snd.on} onChange={(e) => change({ on: e.target.checked })} /> Bật tiếng tru
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0" }}>
            <span>🔉</span>
            <input type="range" min={0} max={100} value={Math.round(snd.vol * 100)} onChange={(e) => change({ vol: Number(e.target.value) / 100 })} style={{ flex: 1 }} />
            <span style={{ width: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(snd.vol * 100)}</span>
          </div>
          <button type="button" style={{ ...btnGhost, width: "100%" }} onClick={() => playHowl({ force: true })}>▶ Thử âm thanh</button>
          <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8 }}>Tiếng tru chỉ vang một lần khi có ván mới và khi ván bắt đầu.</div>
        </div>
      )}
    </div>
  );
}

export default function MaSoiPage() {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [skew, setSkew] = useState(0);
  const [showRole, setShowRole] = useState(true);
  const [auto, setAutoRaw] = useState("6");
  const setAuto = (v) => { setAutoRaw(v); try { localStorage.setItem("ms_auto", v); } catch (e) { /* ignore */ } };
  useEffect(() => { try { const v = localStorage.getItem("ms_auto"); if (v !== null && /^\d{1,2}$/.test(v)) setAutoRaw(v); } catch (e) { /* ignore */ } }, []);
  const [sel2, setSel2] = useState("");   // Round 589 — Cupid's second lover
  const [selW, setSelW] = useState([]);   // Round 598 — the flute-player picks two names from ONE list
  const [sel, setSel] = useState("");   // Round 583 — pending choice (seer / guard / witch / hunter) until "Xác nhận" is pressed
  const timer = useRef(null);

  const call = useCallback(async (body) => {
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/ma-soi", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`);
    return j;
  }, []);

  const load = useCallback(async () => {
    try {
      const j = await call({ action: "state" });
      setSkew(j.now ? new Date(j.now).getTime() - Date.now() : 0);
      setSt(j);
    } catch (e) { setErr(e.message); }
  }, [call]);

  useEffect(() => {
    load();
    const start = () => { clearInterval(timer.current); timer.current = setInterval(() => { if (document.visibilityState === "visible") load(); }, POLL_MS); };
    start();
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(timer.current); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  async function run(body) {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const j = await call(body);
      if (j && j.state) { setSkew(j.state.now ? new Date(j.state.now).getTime() - Date.now() : 0); setSt(j.state); }
      else await load();
    } catch (e) { setErr(e.message); await load(); }
    setBusy(false);
  }
  const act = (kind, target, data) => run({ action: "act", kind, target: target || null, data: data || {} });

  const g = st?.game;
  const pr = st?.prompt;
  const roleCard = st?.cards?.find((c) => c.kind === "role");
  const others = (st?.cards || []).filter((c) => c.kind !== "role");
  useEffect(() => { setSel(""); setSel2(""); setSelW([]); }, [g?.phase_no, g?.stage, st?.prompt?.type]);
  // new game opened (lobby) = "come and join" howl, once per game per browser
  useEffect(() => { if (g?.id && g.status === "lobby") howlOnce(`ms_howl_lobby_${g.id}`); }, [g?.id, g?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const isWolfCard = !!roleCard && /SÓI/.test(roleCard.title || "") && !/NỬA/.test(roleCard.title || "");
  // Round 582 — the howl plays once per game, the first time this person sees their role card (= game start / role reveal)
  useEffect(() => { if (g?.id && roleCard) howlOnce(`ms_howl_${g.id}`); }, [g?.id, !!roleCard]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 14px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, margin: "0 0 4px" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>🐺 Ma Sói</h1>
          <SoundControl />
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-faint)", margin: "0 0 14px" }}>
          Mỗi ngày một lượt: đêm chốt lúc 00:00, buổi bỏ phiếu chốt lúc 19:00 (sớm hơn nếu mọi người đã trả lời xong).
        </p>
        {err && <div style={{ ...card, borderColor: "#ff6b6b", color: "#ff9a9a", fontSize: 13.5 }}>{err}</div>}
        {!st && !err && <div style={{ fontSize: 14, color: "var(--text-faint)" }}>Đang tải…</div>}

        {st && !g && (
          <div style={card}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Chưa có ván chơi nào</div>
            {st.dev ? (
              <div>
                <AutoField value={auto} onChange={setAuto} />
                <button type="button" style={btn} disabled={busy} onClick={() => run({ action: "create", auto: parseInt(auto, 10) || 0 })}>Mở ván mới</button>
              </div>
            ) : <div style={{ fontSize: 13, color: "var(--text-faint)" }}>Khi có ván mới, bạn sẽ thấy ở đây.</div>}
          </div>
        )}

        {g?.status === "lobby" && (
          <div style={{ ...card, position: "relative", overflow: "hidden", paddingRight: 120, minHeight: 130 }}>
            <img src="/ma-soi/wolf.png" alt="" width={96} style={{ position: "absolute", right: 12, bottom: 10, opacity: 0.95 }} />
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>🌕 Làng đang chờ người</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              {st.players.length} người đã tham gia{g.auto_start ? ` — ván tự bắt đầu khi đủ ${g.auto_start} người` : ""}.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {st.players.map((p) => <span key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "3px 10px", fontSize: 13 }}>{p.name}</span>)}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {st.joined
                ? <button type="button" style={btnGhost} disabled={busy} onClick={() => run({ action: "leave" })}>Rời hàng chờ</button>
                : <button type="button" style={btn} disabled={busy} onClick={() => run({ action: "join" })}>Tham gia</button>}
              {st.dev && <button type="button" style={btn} disabled={busy || st.players.length < 4} onClick={() => run({ action: "start" })}>Bắt đầu ngay ({st.players.length})</button>}
              {st.dev && <button type="button" style={btnGhost} disabled={busy} onClick={() => { if (confirm("Huỷ ván này?")) run({ action: "cancel" }); }}>Huỷ ván</button>}
            </div>
          </div>
        )}

        {(g?.status === "running" || g?.status === "paused") && (
          <>
            <div style={{ ...card, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{PHASE_LABEL[g.phase] || ""} · Ngày {g.day_no}</div>
                {g.status === "running" && <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Còn lại <Countdown endsAt={g.ends_at} skew={skew} /> · {st.progress.answered}/{st.progress.expected} đã xong</div>}
                {g.status === "running" && st.waiting && <Waiting w={st.waiting} />}
              </div>
              {st.dev && <button type="button" style={btnGhost} disabled={busy} onClick={() => { if (confirm("Huỷ ván đang chơi?")) run({ action: "cancel" }); }}>Huỷ ván</button>}
            </div>

            {g.status === "paused" && (
              <div style={{ ...card, borderColor: "#d98a00" }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>⏸️ Làng đang tạm nghỉ</div>
                <div style={{ fontSize: 13, marginBottom: 8 }}>Không ai trả lời trong lượt trước nên ván được tạm dừng.</div>
                {(st.alive || st.dev) && <button type="button" style={btn} disabled={busy} onClick={() => run({ action: "resume" })}>Tiếp tục</button>}
              </div>
            )}

            {roleCard && (
              <div style={{ ...card, background: "rgba(255,122,26,0.10)" }}>
                <RoleQR key={g.id} call={call} btnStyle={btnGhost} inline />
              </div>
            )}

            {g.status === "running" && pr && (
              <div style={{ ...card, borderColor: "#ff7a1a" }}>
                {pr.type === "dead" && <div style={{ fontSize: 14 }}>💀 Bạn đã rời cuộc chơi. Hãy xem các thẻ bên dưới và giữ bí mật vai trò của người khác.</div>}
                {pr.type === "sleep" && <div style={{ fontSize: 14 }}>{pr.blocked ? "🤐 Bạn bị bịt miệng — đêm nay bạn không thể dùng khả năng. Chờ đến sáng nhé." : "😴 Đêm nay bạn ngủ yên. Chờ đến sáng nhé."}</div>}
                {pr.type === "wait" && <div style={{ fontSize: 14 }}>Chờ người khác hoàn thành lượt…</div>}

                {pr.type === "wolf" && (
                  <div>
                    <div style={{ fontWeight: 800 }}>🐺 Chọn nạn nhân của bầy sói</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Mỗi con sói chọn và bấm "Xác nhận". Khi tất cả sói xác nhận, lựa chọn mới được tính.</div>
                    <Picker options={pr.options} value={pr.my_vote} disabled={busy} onPick={(id) => act("wolf_vote", id)} />
                    <div style={{ fontSize: 13, margin: "6px 0" }}>
                      {pr.wolves.map((w, i) => <div key={i}>{w.me ? "👉 " : ""}{w.name}: {w.vote ? `chọn ${w.vote}` : "chưa chọn"}{w.confirmed ? " ✅ đã xác nhận" : ""}</div>)}
                    </div>
                    <button type="button" style={btn} disabled={busy || !pr.my_vote || pr.my_confirmed} onClick={() => act("wolf_confirm")}>{pr.my_confirmed ? "Đã xác nhận" : "Xác nhận"}</button>
                  </div>
                )}

                {pr.type === "wolf" && pr.ww && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
                    <WhiteWolfBox key={`${g.phase_no}-ww`} o={pr.ww} busy={busy} onSend={(id) => act("wwolf", id)} />
                  </div>
                )}
                {pr.type === "wolf" && pr.scry && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
                    <ScryBox key={`${g.phase_no}-sc`} o={pr.scry} busy={busy} onSend={(id) => act("scry", id)} />
                  </div>
                )}
                {pr.type === "rogue" && (
                  <div>
                    <div style={{ fontWeight: 800 }}>🦝 Bạn muốn rình ai đêm nay?</div>
                    {pr.done ? <div style={{ fontSize: 13, marginTop: 6 }}>Bạn đã chọn xong — kết quả đến lúc bình minh, nằm trong thẻ bên dưới.</div>
                      : <>
                          <Picker options={pr.options} value={sel} disabled={busy} onPick={setSel} />
                          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 8 }}>Bạn biết người đó nhắm vào ai đêm nay. Người không có khả năng ban đêm sẽ cho bạn tên một con sói. Cẩn thận: rình trúng sói thì bạn biết mục tiêu của bầy — nhưng bạn sẽ chết vào sáng hôm sau.</div>
                          <button type="button" style={btn} disabled={busy || !sel} onClick={() => act("rob", sel)}>{busy ? "Đang gửi…" : "Xác nhận"}</button>
                        </>}
                  </div>
                )}

                {pr.type === "ghost" && (
                  <div>
                    <div style={{ fontWeight: 800 }}>👻 Kẻ yểu mệnh</div>
                    {pr.done ? <div style={{ fontSize: 13, marginTop: 6 }}>Bạn đã chọn ra đi — bạn sẽ chết lúc bình minh.</div> : (
                      <>
                        <div style={{ fontSize: 12.5, color: "var(--text-faint)", margin: "6px 0 8px" }}>Bạn có thể tự ra đi đêm nay: cả làng chỉ biết bạn chết vì bệnh tật, và bạn biết tên MỘT người đã ra tay giết người đêm đó. Không chọn gì cũng được.</div>
                        <button type="button" style={btn} disabled={busy} onClick={() => act("ghost", null)}>{busy ? "Đang gửi…" : "Tự ra đi đêm nay"}</button>
                      </>
                    )}
                  </div>
                )}
                {pr.type === "whitewolf" && <WhiteWolfBox key={`${g.phase_no}-w2`} o={pr} busy={busy} onSend={(id) => act("wwolf", id)} />}

                {pr.type === "silencer" && (
                  <div>
                    <div style={{ fontWeight: 800 }}>🤐 Bạn bịt miệng ai?</div>
                    {pr.done ? <div style={{ fontSize: 13, marginTop: 6 }}>Bạn đã chọn rồi.</div>
                      : <>
                          <Picker options={pr.options} value={sel} disabled={busy} onPick={setSel} />
                          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 8 }}>Người bị chọn không thể nhắn trong phòng chat cả ngày hôm sau (vẫn được bỏ phiếu). Bạn đổi ý được cho đến khi bấm Xác nhận.</div>
                          <button type="button" style={btn} disabled={busy || !sel} onClick={() => act("silence", sel)}>{busy ? "Đang gửi…" : "Xác nhận bịt miệng"}</button>
                        </>}
                  </div>
                )}

                {pr.type === "whisperer" && (
                  <div>
                    <div style={{ fontWeight: 800 }}>🎶 Bạn thổi sáo mê hoặc ai?</div>
                    {pr.done ? <div style={{ fontSize: 13, marginTop: 6 }}>Bạn đã thổi sáo xong — chi tiết nằm trong thẻ bên dưới.</div>
                      : (() => {
                          const need = pr.left >= 2 ? 2 : 1;
                          const toggle = (id) => setSelW((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= need ? [...cur.slice(1), id] : [...cur, id]);
                          return (
                            <>
                              <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Còn {pr.left} người chưa bị mê hoặc. Bấm tên để chọn {need === 2 ? "ĐÚNG 2 người" : "người cuối cùng"} (đã chọn {selW.length}/{need}); bấm lại để bỏ chọn.</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0" }}>
                                {pr.options.map((o) => {
                                  const on = selW.includes(o.id);
                                  return <button key={o.id} type="button" disabled={busy} onClick={() => toggle(o.id)}
                                    style={{ ...btnGhost, ...(on ? { background: "#ff7a1a", color: "#fff", borderColor: "#ff7a1a" } : {}), opacity: busy ? 0.6 : 1 }}>{on ? "✓ " : ""}{o.name}</button>;
                                })}
                              </div>
                              <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 8 }}>Khi mọi người còn sống (trừ bạn) đều bị mê hoặc, dân làng thắng. Bạn đổi ý được cho đến khi bấm Xác nhận.</div>
                              <button type="button" style={{ ...btn, opacity: selW.length === need ? 1 : 0.6 }} disabled={busy || selW.length !== need}
                                onClick={() => act("whisper", selW[0], need === 2 ? { second: selW[1] } : {})}>
                                {busy ? "Đang gửi…" : selW.length === need ? "Xác nhận thổi sáo" : `Chọn thêm ${need - selW.length} người nữa`}
                              </button>
                            </>
                          );
                        })()}
                  </div>
                )}

                {pr.type === "mute" && <div style={{ fontSize: 14 }}>🤡 Bạn đã lộ vai Kẻ ngốc nên không còn quyền bỏ phiếu. Hãy tranh luận và chờ kết quả — bạn vẫn có thể bị bỏ phiếu và bị trục xuất lần nữa.</div>}

                {pr.type === "cupid" && (
                  <div>
                    <div style={{ fontWeight: 800 }}>💘 Bạn kết đôi ai?</div>
                    {pr.done ? <div style={{ fontSize: 13, marginTop: 6 }}>Bạn đã kết đôi xong — chi tiết nằm trong thẻ bên dưới.</div>
                      : <>
                          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 4 }}>Người thứ nhất:</div>
                          <Picker options={pr.options} value={sel} disabled={busy} onPick={setSel} />
                          <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Người thứ hai (có thể chọn cả chính bạn):</div>
                          <Picker options={pr.options} value={sel2} disabled={busy} onPick={setSel2} />
                          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 8 }}>Chọn hai người khác nhau, bạn vẫn đổi ý được cho đến khi bấm Xác nhận. Cả hai sẽ biết nhau; một người chết thì người kia chết theo.</div>
                          <button type="button" style={btn} disabled={busy || !sel || !sel2 || sel === sel2} onClick={() => act("cupid", sel, { second: sel2 })}>{busy ? "Đang gửi…" : "Xác nhận kết đôi"}</button>
                        </>}
                  </div>
                )}

                {pr.type === "detective" && (
                  <div>
                    <div style={{ fontWeight: 800 }}>🕵️ Bạn muốn so sánh hai người nào đêm nay?</div>
                    {pr.done ? <div style={{ fontSize: 13, marginTop: 6 }}>Bạn đã điều tra xong — kết quả nằm trong thẻ bên dưới.</div>
                      : <>
                          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 4 }}>Người thứ nhất:</div>
                          <Picker options={pr.options} value={sel} disabled={busy} onPick={setSel} />
                          <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Người thứ hai:</div>
                          <Picker options={pr.options} value={sel2} disabled={busy} onPick={setSel2} />
                          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 8 }}>Bạn sẽ biết hai người CÙNG PHE hay KHÁC PHE (phe sói / không phải sói). Bạn vẫn đổi ý được cho đến khi bấm Xác nhận.</div>
                          <button type="button" style={btn} disabled={busy || !sel || !sel2 || sel === sel2} onClick={() => act("detect", sel, { second: sel2 })}>{busy ? "Đang gửi…" : "Xác nhận điều tra"}</button>
                        </>}
                  </div>
                )}

                {(pr.type === "scryer" || pr.type === "wildchild") && (
                  <div>
                    <div style={{ fontWeight: 800 }}>{pr.type === "scryer" ? "🔭 Bạn muốn dò ai xem có phải Tiên tri?" : "🌿 Chọn người làm hình mẫu của bạn"}</div>
                    {pr.done ? <div style={{ fontSize: 13, marginTop: 6 }}>Bạn đã chọn xong — kết quả nằm trong thẻ bên dưới.</div>
                      : <>
                          <Picker options={pr.options} value={sel} disabled={busy} onPick={setSel} />
                          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 8 }}>{pr.type === "scryer" ? "Bạn sẽ biết người đó có phải Tiên tri hay không." : "Nếu hình mẫu chết, bạn hoá thành sói."} Bạn vẫn đổi ý được cho đến khi bấm Xác nhận.</div>
                          <button type="button" style={btn} disabled={busy || !sel} onClick={() => act(pr.type === "scryer" ? "scry" : "model", sel)}>{busy ? "Đang gửi…" : "Xác nhận"}</button>
                        </>}
                  </div>
                )}

                {pr.type === "medium" && (
                  <div>
                    <div style={{ fontWeight: 800 }}>🕯️ Thầy đồng — gọi hồn hoặc hồi sinh (mỗi quyền một lần)</div>
                    {pr.done ? <div style={{ fontSize: 13, marginTop: 6 }}>Bạn đã gọi hồn xong — kết quả nằm trong thẻ bên dưới.</div>
                      : <>
                          <Picker options={pr.options} value={sel} disabled={busy} onPick={setSel} />
                          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 8 }}>Gọi hồn: biết người đã khuất từng mang vai trò gì. Hồi sinh: người đó sống lại lúc bình minh. Nếu chưa muốn dùng, cứ để đó — bạn dùng được ở bất kỳ đêm nào.</div>
                          {pr.can_learn && <button type="button" style={btn} disabled={busy || !sel} onClick={() => act("medium", null, { dead: sel })}>{busy ? "Đang gửi…" : "Gọi hồn (biết vai trò)"}</button>}
                          {pr.can_revive && <button type="button" style={{ ...btn, marginLeft: pr.can_learn ? 8 : 0 }} disabled={busy || !sel} onClick={() => act("medium", null, { dead: sel, revive: true })}>{busy ? "Đang gửi…" : "Hồi sinh người này"}</button>}
                          <button type="button" style={{ ...btnGhost, marginLeft: 8 }} disabled={busy} onClick={() => act("medium", null, {})}>Không dùng đêm nay</button>
                        </>}
                  </div>
                )}

                {pr.type === "seer" && (
                  <div>
                    <div style={{ fontWeight: 800 }}>🔮 Bạn muốn soi ai đêm nay?</div>
                    {pr.done ? <div style={{ fontSize: 13, marginTop: 6 }}>Bạn đã soi rồi — kết quả nằm trong thẻ bên dưới.</div>
                      : <>
                          <Picker options={pr.options} value={sel} disabled={busy} onPick={setSel} />
                          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 8 }}>Chọn một người, bạn vẫn đổi ý được cho đến khi bấm Xác nhận.</div>
                          <button type="button" style={btn} disabled={busy || !sel} onClick={() => act("seer", sel)}>{busy ? "Đang gửi…" : "Xác nhận soi"}</button>
                        </>}
                  </div>
                )}

                {pr.type === "guard" && (
                  <div>
                    <div style={{ fontWeight: 800 }}>🛡️ Bạn bảo vệ ai đêm nay?</div>
                    {pr.done ? <div style={{ fontSize: 13, marginTop: 6 }}>Bạn đã chọn rồi.</div>
                      : <>
                          <Picker options={pr.options} value={sel} disabled={busy} onPick={setSel} />
                          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 8 }}>Chọn một người, bạn vẫn đổi ý được cho đến khi bấm Xác nhận.</div>
                          <button type="button" style={btn} disabled={busy || !sel} onClick={() => act("guard", sel)}>{busy ? "Đang gửi…" : "Xác nhận bảo vệ"}</button>
                        </>}
                  </div>
                )}

                {pr.type === "witch" && (
                  <div>
                    <div style={{ fontWeight: 800 }}>🧪 Lượt của Phù thủy</div>
                    <div style={{ fontSize: 13.5, margin: "6px 0" }}>{pr.victim ? `Bầy sói đã nhắm vào ${pr.victim}${pr.victim2 ? ` và ${pr.victim2} (Sói con báo thù — bạn chỉ cứu được một người)` : ""}.` : pr.victim2 ? `Bầy sói nhắm vào ${pr.victim2} (Sói con báo thù).` : "Bầy sói chưa chọn được ai."}</div>
                    {pr.done ? <div style={{ fontSize: 13 }}>Bạn đã quyết định xong.</div> : (
                      <>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                          {pr.can_heal && pr.victim && <button type="button" disabled={busy} onClick={() => setSel("heal")} style={{ ...btnGhost, ...(sel === "heal" ? { background: "#ff7a1a", color: "#fff", borderColor: "#ff7a1a" } : {}) }}>Cứu {pr.victim}</button>}
                          {pr.can_heal && pr.victim2 && <button type="button" disabled={busy} onClick={() => setSel("heal2")} style={{ ...btnGhost, ...(sel === "heal2" ? { background: "#ff7a1a", color: "#fff", borderColor: "#ff7a1a" } : {}) }}>Cứu {pr.victim2} (nhát cắn thứ hai)</button>}
                          <button type="button" disabled={busy} onClick={() => setSel("none")} style={{ ...btnGhost, ...(sel === "none" ? { background: "#ff7a1a", color: "#fff", borderColor: "#ff7a1a" } : {}) }}>Không làm gì</button>
                        </div>
                        {pr.can_poison && (
                          <>
                            <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Hoặc dùng bình độc cho:</div>
                            <Picker options={pr.options} value={sel.startsWith("poison:") ? sel.slice(7) : ""} disabled={busy} onPick={(id) => setSel("poison:" + id)} />
                          </>
                        )}
                        <div style={{ fontSize: 12.5, color: "var(--text-faint)", margin: "4px 0 8px" }}>Chọn một lựa chọn, bạn vẫn đổi ý được cho đến khi bấm Xác nhận. Bình cứu và bình độc không thể hoàn tác sau khi xác nhận.</div>
                        <button type="button" style={btn} disabled={busy || !sel}
                          onClick={() => { if (sel === "heal") act("witch", null, { heal: true }); else if (sel === "heal2") act("witch", null, { heal: true, second: true }); else if (sel.startsWith("poison:")) act("witch", sel.slice(7), { poison: true }); else act("witch", null, {}); }}>{busy ? "Đang gửi…" : "Xác nhận"}</button>
                      </>
                    )}
                  </div>
                )}

                {pr.type === "vote" && (
                  <div>
                    <div style={{ fontWeight: 800 }}>{pr.runoff ? "⚖️ Bỏ phiếu lại — chỉ giữa những người hoà phiếu" : "☀️ Làng nên trục xuất ai?"}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Chọn một người rồi bấm Xác nhận. Bạn vẫn đổi phiếu được cho đến khi lượt kết thúc.</div>
                    <Picker options={pr.options} value={sel === "__blank" ? "" : (sel || pr.my_vote || "")} disabled={busy} onPick={setSel}
                      extra={<button type="button" disabled={busy} onClick={() => setSel("__blank")} style={{ ...btnGhost, ...((sel === "__blank" || (!sel && pr.voted && !pr.my_vote)) ? { background: "#555", color: "#fff" } : {}) }}>Bỏ phiếu trắng</button>} />
                    <div style={{ fontSize: 13, margin: "6px 0" }}>
                      {pr.voted ? `Phiếu hiện tại của bạn: ${pr.my_vote ? (pr.options.find((o) => o.id === pr.my_vote)?.name || "đã chọn") : "phiếu trắng"}.` : "Bạn chưa bỏ phiếu."}
                    </div>
                    <button type="button" style={btn} disabled={busy || !sel || (sel === "__blank" ? (pr.voted && !pr.my_vote) : sel === pr.my_vote)}
                      onClick={() => act("vote", sel === "__blank" ? null : sel)}>{busy ? "Đang gửi…" : pr.voted ? "Đổi phiếu" : "Xác nhận phiếu"}</button>
                  </div>
                )}

                {pr.type === "hunter" && (
                  <div>
                    <div style={{ fontWeight: 800 }}>🏹 Bạn bắn ai?</div>
                    {pr.done ? <div style={{ fontSize: 13, marginTop: 6 }}>Bạn đã bắn xong.</div>
                      : <>
                          <Picker options={pr.options} value={sel} disabled={busy} onPick={setSel} />
                          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 8 }}>Chọn một người, bạn vẫn đổi ý được cho đến khi bấm Xác nhận.</div>
                          <button type="button" style={btn} disabled={busy || !sel} onClick={() => act("hunter", sel)}>{busy ? "Đang gửi…" : "Xác nhận bắn"}</button>
                        </>}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {g?.status === "finished" && (
          <div style={{ ...card, background: "rgba(255,122,26,0.10)" }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{g.winner === "wolves" ? "🐺 Bầy sói chiến thắng" : g.winner === "village" ? "🏡 Dân làng chiến thắng" : g.winner === "couple" ? "💘 Cặp đôi chiến thắng" : g.winner === "fool" ? "🤡 Thằng ngu chiến thắng" : "Ván chơi đã kết thúc"}</div>
            {st.dev && <div style={{ marginTop: 10 }}><AutoField value={auto} onChange={setAuto} /><button type="button" style={btn} disabled={busy} onClick={() => run({ action: "create", auto: parseInt(auto, 10) || 0 })}>Mở ván mới</button></div>}
          </div>
        )}

        {g?.status === "lobby" && st.dev && <MaSoiDevTools status="lobby" call={call} onChanged={load} />}

        {g && g.status !== "lobby" && st.joined && <MaSoiChat gid={g.id} status={g.status} dayNo={g.day_no} phaseKey={`${g.phase}-${g.stage}-${g.day_no}`} cards={st.cards} call={call} dev={st.dev} onChanged={load} />}

        {g && g.status !== "lobby" && (
          <div style={card}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Dân làng</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {st.players.map((p) => (
                <span key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "3px 10px", fontSize: 13, opacity: p.alive ? 1 : 0.5, textDecoration: p.alive ? "none" : "line-through" }}>
                  {p.alive ? "" : "💀 "}{p.name}{p.role ? ` — ${ROLE_VI[p.role] || p.role}` : p.revealed ? " — 🤡 Kẻ ngốc" : p.shown === "prince" ? " — 👑 Vương công" : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {others.length > 0 && (
          <div>
            <div style={{ fontWeight: 800, margin: "16px 0 8px" }}>📜 Thẻ & bản tin</div>
            {others.map((c) => (
              <div key={c.id} style={{ ...card, ...(c.kind === "story" ? { borderLeft: "4px solid #ff7a1a" } : c.kind === "final" ? { borderColor: "#ff7a1a" } : c.kind === "log" ? { borderColor: "#ff7a1a", background: "rgba(255,122,26,0.06)" } : {}) }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 800 }}>{c.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-faint)", whiteSpace: "nowrap" }}>{fmtAt(c.at)}</div>
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 6, whiteSpace: "pre-wrap" }}>{c.body}</div>
                {c.kind !== "story" && c.kind !== "info" && c.kind !== "final" && c.kind !== "log" && <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>Chỉ mình bạn thấy thẻ này.</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
