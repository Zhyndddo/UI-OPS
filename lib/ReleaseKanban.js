"use client";

// Round 688 — Calendar → "Kanban" tab: every release as a card in a stage column; Phái Sinh tickets as an extra
// column (toggle). Click a card = who is the PIC of each step (AR, every workstation, every ticket of that release).
// Stage rules live in stageOf() below — one place to change if the team defines the steps differently.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "./supabaseClient";
import { fetchAllRows, fmtDate } from "./helpers";
import { localDateStr } from "./releaseDateHighlight";
import SearchBox, { matchesQuery } from "./SearchBox";
import { TICKET_TYPE_LABELS } from "./teamTypes";
import { TASK_PHASE } from "./taskPhases";
import LoadingSkeleton from "./LoadingSkeleton";
import styles from "../app/shared.module.css";

// Round 698 — each column header has its own colour (feedback: "kanban cho mấy cục tiêu đề màu khác được không")
const PS_COLOR = "#ff6fa8";
const headStyle = (c) => ({ background: `${c}26`, borderLeft: `4px solid ${c}`, borderRadius: 6, padding: "7px 10px", marginBottom: 8 });
const STAGES = [
  { key: "data", label: "Chuẩn bị dữ liệu", hint: "Chưa gửi Upload", color: "#5b8def" },
  { key: "upload", label: "Đã gửi Upload", hint: "Đang upload, chưa có UPC", color: "#f5a623" },
  { key: "recheck", label: "Re-check / Smartlink", hint: "Đã có UPC, chưa có smartlink", color: "#a66bff" },
  { key: "ready", label: "Sẵn sàng phát hành", hint: "Có smartlink, chưa tới ngày phát hành", color: "#22c1a3" },
  { key: "released", label: "Đã phát hành", hint: "Có UPC và đã tới ngày phát hành", color: "#4cc364" },
];
const hasText = (v) => !!String(v ?? "").trim();
export function stageOf(r, today) {
  const out = !!r.release_date && String(r.release_date).slice(0, 10) <= today;
  if (hasText(r.upc) && out) return "released";
  if (hasText(r.upc) && hasText(r.smartlink)) return "ready";
  if (hasText(r.upc)) return "recheck";
  if (r.requested) return "upload";
  return "data";
}

const WINDOWS = [["day", "Một ngày"], ["14", "Từ 14 ngày trước"], ["30", "Từ 30 ngày trước"], ["90", "Từ 90 ngày trước"], ["all", "Tất cả (từ 01/07)"]];
const WORKSTATIONS = [
  ["upload", "Upload (New Release Setup)"], ["confirm", "Re-Check"], ["pre_release", "Pre-release (Canva / Lyrics)"],
  ["booking", "Booking"], ["pitching", "Pitching"], ["package_price", "Package Price"], ["cost_mkt", "Cost Marketing"],
  ["stream", "Streaming"], ["milestone", "Milestone"], ["non_package_booking", "Booking ngoài package"],
];
const TERMINAL = ["COMPLETE", "CANCELED", "REFUND", "CANCEL"];
const LABEL_KEYS = ["tenBai", "title", "songTitle", "projectName", "name", "artist", "label"];
const labelOf = (d) => { for (const k of LABEL_KEYS) { const v = d?.[k]; if (typeof v === "string" && v.trim()) return v.trim(); } return null; };
const picIds = (row) => (row?.pic_profile_ids?.length ? row.pic_profile_ids : [row?.pic_profile_id]).filter(Boolean);
const daysBetween = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export default function ReleaseKanban() {
  const [loading, setLoading] = useState(true);
  const [releases, setReleases] = useState([]);
  const [phaiSinh, setPhaiSinh] = useState([]);
  const [winKey, setWinKey] = useState("14");
  const [dayPick, setDayPick] = useState(localDateStr(new Date()));   // Round 689 — "Một ngày" window
  const [showPs, setShowPs] = useState(true);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(null);   // { kind: "release" | "ps", item }
  const today = localDateStr(new Date());

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const from = winKey === "all" ? "2026-07-01" : localDateStr(new Date(Date.now() - Number(winKey) * 86400000));
      const [{ data: rels }, { data: tabs }] = await Promise.all([
        fetchAllRows(() => {
          const q = supabase.from("releases")
            .select("id, did, title, main_artist, release_date, project_type, requested, upc, smartlink, ar_pic_profile_id, single_album_ep")
            .is("cancelled_at", null);
          return (winKey === "day" ? q.eq("release_date", dayPick) : q.gte("release_date", from)).order("release_date");
        }),
        supabase.from("ticket_tabs").select("id, key").eq("key", "phai_sinh"),
      ]);
      let ps = [];
      if (tabs?.[0]) {
        const { data: tk } = await supabase.from("tickets")
          .select("id, status, data, created_at, status_log, pic_profile_id, pic_profile_ids, requester_profile_id")
          .eq("tab_id", tabs[0].id).is("deleted_at", null).gte("created_at", "2026-08-08").order("created_at", { ascending: false }).limit(1000);
        ps = (tk || []).filter((t) => !TERMINAL.includes(t.status));
      }
      if (!alive) return;
      setReleases(rels || []);
      setPhaiSinh(ps);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [winKey, dayPick]);

  const columns = useMemo(() => {
    const by = Object.fromEntries(STAGES.map((s) => [s.key, []]));
    releases.filter((r) => matchesQuery({ t: r.title, a: r.main_artist, d: r.did }, query)).forEach((r) => by[stageOf(r, today)].push(r));
    STAGES.forEach((s) => by[s.key].sort((a, b) => (s.key === "released" ? String(b.release_date).localeCompare(String(a.release_date)) : String(a.release_date).localeCompare(String(b.release_date)))));
    return by;
  }, [releases, query, today]);
  const psCards = useMemo(() => phaiSinh.filter((t) => matchesQuery({ l: labelOf(t.data), d: t.data?.releaseId }, query)), [phaiSinh, query]);

  const card = { display: "block", width: "100%", textAlign: "left", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", cursor: "pointer", font: "inherit" };
  const colBox = { flex: "1 1 0", minWidth: 250, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 };
  const scroll = { display: "flex", flexDirection: "column", gap: 6, maxHeight: "68vh", overflowY: "auto" };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <select className={styles.input} style={{ maxWidth: 190 }} value={winKey} onChange={(e) => setWinKey(e.target.value)}>
          {WINDOWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {winKey === "day" && <input type="date" className={styles.input} style={{ maxWidth: 170 }} value={dayPick} onChange={(e) => e.target.value && setDayPick(e.target.value)} />}
        <label style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showPs} onChange={(e) => setShowPs(e.target.checked)} /> Hiện Phái Sinh
        </label>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Bấm vào thẻ để xem PIC của từng bước.</span>
      </div>
      <SearchBox value={query} onChange={setQuery} placeholder="Tìm tên bài / nghệ sĩ / DID…" />
      {loading ? <LoadingSkeleton /> : (
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", overflowX: "auto", paddingBottom: 8 }}>
          {STAGES.map((s) => (
            <div key={s.key} style={{ ...colBox, borderTop: `3px solid ${s.color}` }}>
              <div style={headStyle(s.color)}>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.label} <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>({columns[s.key].length})</span></div>
                <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{s.hint}</div>
              </div>
              <div style={scroll}>
                {columns[s.key].length === 0 && <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Trống.</div>}
                {columns[s.key].map((r) => {
                  const late = s.key !== "released" && r.release_date && String(r.release_date).slice(0, 10) <= today;
                  return (
                    <button key={r.id} type="button" style={card} onClick={() => setSel({ kind: "release", item: r })}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{r.title || "—"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.main_artist || "—"}</div>
                      <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>{fmtDate(r.release_date)} · {r.did || "—"}{r.single_album_ep && r.single_album_ep !== "Single" ? ` · ${r.single_album_ep}` : ""}</div>
                      {late && <div style={{ fontSize: 10, fontWeight: 700, color: "#ff6b6b", marginTop: 2 }}>Đã tới / quá ngày phát hành</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {showPs && (
            <div style={{ ...colBox, borderTop: `3px solid ${PS_COLOR}` }}>
              <div style={headStyle(PS_COLOR)}>
                <div style={{ fontSize: 13, fontWeight: 700, color: PS_COLOR }}>Phái Sinh <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>({psCards.length})</span></div>
                <div style={{ fontSize: 10, color: "var(--text-faint)" }}>Ticket Phái Sinh đang mở</div>
              </div>
              <div style={scroll}>
                {psCards.length === 0 && <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Trống.</div>}
                {psCards.slice(0, 150).map((t) => (
                  <button key={t.id} type="button" style={card} onClick={() => setSel({ kind: "ps", item: t })}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{labelOf(t.data) || "(ticket không có tên)"}</div>
                    <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>{t.status || "—"} · {daysBetween(t.created_at)} ngày trước{t.data?.releaseId ? ` · ${t.data.releaseId}` : ""}</div>
                  </button>
                ))}
                {psCards.length > 150 && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>… và {psCards.length - 150} ticket nữa — dùng ô tìm kiếm để lọc.</div>}
              </div>
            </div>
          )}
        </div>
      )}
      {sel && <PicDetail sel={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

// Who is the PIC of each step: AR, each workstation, and every ticket of this release.
function PicDetail({ sel, onClose }) {
  const [state, setState] = useState({ loading: true, assigns: [], tickets: [], names: {}, tabs: {} });
  const isRelease = sel.kind === "release";
  const item = sel.item;

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: tabRows } = await supabase.from("ticket_tabs").select("id, key, label");
      const tabs = Object.fromEntries((tabRows || []).map((t) => [t.id, t]));
      let assigns = [], tickets = [];
      if (isRelease) {
        const [a, t] = await Promise.all([
          supabase.from("workstation_assignments").select("workstation, pic_profile_id, pic_profile_ids, auto_assigned").eq("release_id", item.id),
          item.did ? supabase.from("tickets").select("id, tab_id, status, pic_profile_id, pic_profile_ids, requester_profile_id").filter("data->>releaseId", "eq", item.did).is("deleted_at", null) : Promise.resolve({ data: [] }),
        ]);
        assigns = a.data || []; tickets = t.data || [];
      } else {
        tickets = [{ ...item, tab_id: Object.keys(tabs).find((k) => tabs[k].key === "phai_sinh") }];
      }
      const ids = [...new Set([item.ar_pic_profile_id, ...assigns.flatMap(picIds), ...tickets.flatMap(picIds), ...tickets.map((x) => x.requester_profile_id)].filter(Boolean))];
      const names = {};
      if (ids.length) { const { data: ps } = await supabase.from("profiles").select("id, name").in("id", ids); (ps || []).forEach((p) => { names[p.id] = p.name; }); }
      if (alive) setState({ loading: false, assigns, tickets, names, tabs });
    })();
    return () => { alive = false; };
  }, [sel]);   // eslint-disable-line react-hooks/exhaustive-deps

  const nm = (ids) => (ids.length ? ids.map((i) => state.names[i] || "—").join(", ") : null);
  const rowStyle = { display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 };
  const none = <span style={{ color: "var(--text-faint)" }}>chưa có PIC</span>;
  const wsRows = WORKSTATIONS.map(([k, label]) => {
    const rows = state.assigns.filter((a) => a.workstation === k);
    const ids = [...new Set(rows.flatMap(picIds))];
    return { k, label, ids, auto: rows.length > 0 && rows.every((x) => x.auto_assigned) };
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 22, maxWidth: 560, width: "100%", maxHeight: "86vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{isRelease ? item.title : (labelOf(item.data) || "Phái Sinh")}</div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 10 }}>
          {isRelease ? `${item.main_artist || "—"} · ${item.did || "—"} · ${fmtDate(item.release_date)}` : `Phái Sinh · ${item.status || "—"}`}
        </div>
        {isRelease && <Link href={`/releases/${item.id}`} style={{ fontSize: 12, color: "var(--accent)" }}>Mở release →</Link>}
        {!isRelease && <Link href="/tickets/phai-sinh" style={{ fontSize: 12, color: "var(--accent)" }}>Mở danh sách Phái Sinh →</Link>}
        {state.loading ? <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-faint)" }}>Đang tải…</div> : (
          <>
            {isRelease && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", margin: "14px 0 4px" }}>Các bước &amp; PIC</div>
                <div style={rowStyle}><span>AR (phụ trách release)</span><span>{nm(item.ar_pic_profile_id ? [item.ar_pic_profile_id] : []) || none}</span></div>
                {wsRows.map((w) => (
                  <div key={w.k} style={rowStyle}>
                    <span>{w.label} <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{k2phase(w.k)}</span></span>
                    <span>{w.ids.length ? <>{nm(w.ids)}{w.auto ? <span style={{ fontSize: 10, color: "var(--text-faint)" }}> (tự động)</span> : null}</> : none}</span>
                  </div>
                ))}
              </>
            )}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", margin: "14px 0 4px" }}>{isRelease ? "Ticket của release này" : "Ticket"}</div>
            {state.tickets.length === 0 && <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Chưa có ticket nào.</div>}
            {state.tickets.map((t) => {
              const tab = state.tabs[t.tab_id];
              const label = (tab && (TICKET_TYPE_LABELS[tab.key] || tab.label)) || "Ticket";
              const pics = nm(picIds(t));
              return (
                <div key={t.id} style={rowStyle}>
                  <span>{label} <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{t.status || "—"}{t.requester_profile_id ? ` · gửi bởi ${state.names[t.requester_profile_id] || "—"}` : ""}</span></span>
                  <span>{pics || none}</span>
                </div>
              );
            })}
          </>
        )}
        <button type="button" className={styles.btnSecondary} style={{ marginTop: 16 }} onClick={onClose}>Đóng</button>
      </div>
    </div>
  );
}

const k2phase = (k) => {
  const p = k === "confirm" ? "Pre-release / Release" : TASK_PHASE[`workstation:${k}`];
  return p ? `· ${p}` : "";
};
