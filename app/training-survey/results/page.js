"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { SECTIONS, QUESTIONS, SURVEY_TITLE, optList } from "../../../lib/trainingSurveyQuestions";

// Round 587 — results of the training survey: who has read it, who has answered, and the answers.
// Open to dev (signed in) OR anybody holding the secret link  /training-survey/results?k=<key>  (no login needed). Not wrapped in AppShell on purpose.
const accent = "#ff7a1a";
const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 };
const btn = { padding: "7px 14px", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "inherit", cursor: "pointer" };
const fmt = (iso) => { try { return iso ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"; } catch (e) { return "—"; } };
const status = (p) => (p.submitted_at ? "answered" : p.opened_at ? "opened" : "new");
const STATUS_LABEL = { answered: "Đã trả lời", opened: "Đã mở, chưa trả lời", new: "Chưa mở" };
const STATUS_COLOR = { answered: "#37b26c", opened: "#e0a100", new: "#8a8a99" };

function show(q, a) {
  if (a == null) return "";
  if (q.type === "multi") return [...(a.picks || []), ...(a.other ? [`Khác: ${a.other}`] : [])].join("; ");
  return String(a);
}

export default function TrainingResultsPage() {
  const [people, setPeople] = useState(null);
  const [via, setVia] = useState("");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("who");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState({});
  const [msg, setMsg] = useState("");
  const [key, setKey] = useState("");

  const load = useCallback(async (k) => {
    setErr("");
    try {
      let token = "";
      try { const { data } = await supabase.auth.getSession(); token = data?.session?.access_token || ""; } catch (e) { /* no session: key only */ }
      const r = await fetch("/api/training-survey", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action: "results", key: k || "" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`);
      setPeople(j.people); setVia(j.via);
    } catch (e) { setErr(e.message); setPeople([]); }
  }, []);

  useEffect(() => {
    let k = "";
    try { k = new URLSearchParams(window.location.search).get("k") || ""; } catch (e) { /* ignore */ }
    setKey(k);
    load(k);
  }, [load]);

  const counts = useMemo(() => {
    const c = { all: 0, answered: 0, opened: 0, new: 0 };
    (people || []).forEach((p) => { c.all++; c[status(p)]++; });
    return c;
  }, [people]);
  const readCount = counts.answered + counts.opened;

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (people || []).filter((p) => (filter === "all" || status(p) === filter) && (!s || `${p.name} ${p.email} ${p.segment}`.toLowerCase().includes(s)));
  }, [people, filter, search]);

  const answered = useMemo(() => (people || []).filter((p) => p.answers), [people]);

  async function devCall(action) {
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/training-survey", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` }, body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`);
    return j.key;
  }
  async function copyLink() {
    try {
      const k = await devCall("link");
      await navigator.clipboard.writeText(`${window.location.origin}/training-survey/results?k=${k}`);
      setMsg("Đã chép link kết quả (ai có link này đều xem được kết quả).");
    } catch (e) { setMsg(e.message || "Không chép được."); }
  }
  async function rotate() {
    if (!window.confirm("Đổi khoá? Link kết quả cũ sẽ ngừng hoạt động.")) return;
    try { await devCall("rotate"); setMsg("Đã đổi khoá. Bấm “Chép link kết quả” để lấy link mới."); } catch (e) { setMsg(e.message); }
  }

  function csv() {
    const q = (v) => { let x = String(v == null ? "" : v); if (/^[=+\-@]/.test(x)) x = "'" + x; return '"' + x.replace(/"/g, '""') + '"'; };
    const head = ["Tên", "Email", "Bộ phận (app)", "Mở lần đầu", "Gửi lúc", ...QUESTIONS.map((x, i) => `${i + 1}. ${x.text}`)];
    const lines = [head, ...answered.map((p) => [p.name, p.email, p.segment, p.opened_at || "", p.submitted_at || "", ...QUESTIONS.map((x) => show(x, p.answers[x.id]))])].map((r) => r.map(q).join(","));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `training-survey_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const tile = (n, label, color) => (
    <div style={{ ...card, marginBottom: 0, flex: "1 1 110px", textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{n}</div>
      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{label}</div>
    </div>
  );
  const tabBtn = (id, label) => <button type="button" onClick={() => setTab(id)} style={{ ...btn, ...(tab === id ? { background: accent, color: "#fff", borderColor: accent } : {}) }}>{label}</button>;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "20px 14px 70px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, margin: "0 0 2px" }}>Kết quả khảo sát</h1>
        <div style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 14 }}>{SURVEY_TITLE}</div>

        {people === null && <div style={{ fontSize: 14, color: "var(--text-faint)" }}>Đang tải…</div>}
        {err && <div style={{ ...card, borderColor: "#ff6b6b", color: "#ff9a9a", fontSize: 13.5 }}>{err}{!key && " — mở bằng link kết quả hoặc đăng nhập bằng tài khoản dev."}</div>}

        {people && people.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {tile(counts.all, "Được mời", "var(--text)")}
              {tile(readCount, "Đã mở form", "#e0a100")}
              {tile(counts.answered, "Đã trả lời", "#37b26c")}
              {tile(counts.new, "Chưa mở", "#8a8a99")}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              {tabBtn("who", "Ai đã đọc / trả lời")}
              {tabBtn("q", "Theo câu hỏi")}
              {tabBtn("person", "Từng người")}
              <span style={{ flex: 1 }} />
              <button type="button" style={btn} onClick={() => load(key)}>↻ Tải lại</button>
              <button type="button" style={btn} onClick={csv} disabled={!answered.length}>Tải CSV</button>
              {via === "dev" && <button type="button" style={btn} onClick={copyLink}>Chép link kết quả</button>}
              {via === "dev" && <button type="button" style={btn} onClick={rotate}>Đổi khoá</button>}
            </div>
            {msg && <div style={{ ...card, fontSize: 13 }}>{msg}</div>}
          </>
        )}

        {people && people.length > 0 && tab === "who" && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {[["all", `Tất cả (${counts.all})`], ["new", `Chưa mở (${counts.new})`], ["opened", `Mở, chưa trả lời (${counts.opened})`], ["answered", `Đã trả lời (${counts.answered})`]].map(([id, l]) => (
                <button key={id} type="button" onClick={() => setFilter(id)} style={{ ...btn, ...(filter === id ? { borderColor: accent, color: accent } : {}) }}>{l}</button>
              ))}
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên / bộ phận…" style={{ ...btn, fontWeight: 400, minWidth: 160 }} />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead><tr style={{ textAlign: "left", color: "var(--text-faint)", fontSize: 12 }}>
                  <th style={{ padding: "6px 8px" }}>Tên</th><th>Bộ phận</th><th>Trạng thái</th><th>Mở lúc</th><th>Số lần mở</th><th>Gửi lúc</th>
                </tr></thead>
                <tbody>
                  {rows.map((p) => { const st = status(p); return (
                    <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 8px", fontWeight: 700 }}>{p.name}</td>
                      <td>{p.segment || "—"}</td>
                      <td><span style={{ color: STATUS_COLOR[st], fontWeight: 700 }}>● {STATUS_LABEL[st]}</span></td>
                      <td>{fmt(p.opened_at)}</td><td>{p.opens || 0}</td><td>{fmt(p.submitted_at)}</td>
                    </tr>
                  ); })}
                  {!rows.length && <tr><td colSpan={6} style={{ padding: 14, color: "var(--text-faint)" }}>Không có ai trong mục này.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {people && people.length > 0 && tab === "q" && (
          !answered.length ? <div style={{ fontSize: 14, color: "var(--text-faint)" }}>Chưa có ai trả lời.</div> :
          SECTIONS.map((s) => (
            <div key={s.id}>
              <h2 style={{ fontSize: 15, color: accent, margin: "16px 0 8px" }}>{s.title}</h2>
              {s.questions.map((q) => {
                const n = Number(q.id.slice(1));
                const total = answered.length;
                let body;
                if (q.type === "text") {
                  body = answered.map((p) => (
                    <div key={p.id} style={{ borderTop: "1px solid var(--border)", padding: "7px 0", fontSize: 13.5, whiteSpace: "pre-wrap" }}>
                      <b>{p.name}</b>{p.segment ? <span style={{ color: "var(--text-faint)" }}> · {p.segment}</span> : null}<div>{p.answers[q.id]}</div>
                    </div>
                  ));
                } else {
                  const labels = q.type === "scale" ? ["1", "2", "3", "4", "5"] : optList(q);
                  const cnt = Object.fromEntries(labels.map((l) => [l, 0]));
                  const others = [];
                  answered.forEach((p) => {
                    const a = p.answers[q.id];
                    if (q.type === "multi") { (a?.picks || []).forEach((x) => { if (x in cnt) cnt[x]++; }); if (a?.other) others.push(`${p.name}: ${a.other}`); }
                    else if (a != null && String(a) in cnt) cnt[String(a)]++;
                  });
                  const avg = q.type === "scale" ? (answered.reduce((t, p) => t + (Number(p.answers[q.id]) || 0), 0) / total).toFixed(1) : null;
                  body = (
                    <>
                      {labels.map((l) => (
                        <div key={l} style={{ margin: "5px 0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>{l}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{cnt[l]} ({Math.round((cnt[l] / total) * 100)}%)</span></div>
                          <div style={{ height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}><div style={{ width: `${(cnt[l] / total) * 100}%`, height: "100%", background: accent, borderRadius: 4 }} /></div>
                        </div>
                      ))}
                      {avg && <div style={{ fontSize: 13, marginTop: 6 }}>Trung bình: <b>{avg}</b> / 5</div>}
                      {others.length > 0 && <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 8 }}>Khác: {others.join(" · ")}</div>}
                    </>
                  );
                }
                return <div key={q.id} style={card}><div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{n}. {q.text}</div>{body}</div>;
              })}
            </div>
          ))
        )}

        {people && people.length > 0 && tab === "person" && (
          !answered.length ? <div style={{ fontSize: 14, color: "var(--text-faint)" }}>Chưa có ai trả lời.</div> :
          answered.map((p) => (
            <div key={p.id} style={card}>
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))} style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", width: "100%", gap: 8 }}>
                <span style={{ fontWeight: 800 }}>{p.name}{p.segment ? <span style={{ fontWeight: 400, color: "var(--text-faint)" }}> · {p.segment}</span> : null}</span>
                <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Gửi {fmt(p.submitted_at)} {open[p.id] ? "▲" : "▼"}</span>
              </button>
              {open[p.id] && QUESTIONS.map((q, i) => (
                <div key={q.id} style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 7, fontSize: 13.5 }}>
                  <div style={{ color: "var(--text-faint)", fontSize: 12.5 }}>{i + 1}. {q.text}</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{show(q, p.answers[q.id]) || "—"}</div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
