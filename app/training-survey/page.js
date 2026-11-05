"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { SECTIONS, SURVEY_TITLE, SURVEY_INTRO, SURVEY_SEEN_BY, optLabel, cleanAnswers } from "../../lib/trainingSurveyQuestions";

// Round 587 — pre-training survey form. Staff sign in (AppShell sends visitors to /login and brings them back here),
// opening the page counts as "read", sending the form counts as "answered". Answers can be edited later.
const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 12 };
const accent = "#ff7a1a";
const chip = (on) => ({ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontSize: 14, border: `1px solid ${on ? accent : "var(--border)"}`, background: on ? "rgba(255,122,26,0.12)" : "transparent" });

export default function TrainingSurveyPage() {
  const [ans, setAns] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [badId, setBadId] = useState("");
  const [done, setDone] = useState("");
  const refs = useRef({});

  const call = useCallback(async (body) => {
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/training-survey", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`);
    return j;
  }, []);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data?.session) { setLoaded(true); return; }   // AppShell is sending them to /login
        const j = await call({ action: "open" });
        if (off) return;
        if (j.answers) { setAns(j.answers); setSubmittedAt(j.submitted_at); }
      } catch (e) { if (!off) setErr(e.message); }
      if (!off) setLoaded(true);
    })();
    return () => { off = true; };
  }, [call]);

  const setOne = (id, v) => { setAns((a) => ({ ...a, [id]: v })); if (badId === id) setBadId(""); };
  const togglePick = (q, label, exclusive) => {
    const cur = ans[q.id]?.picks || [];
    let next;
    if (cur.includes(label)) next = cur.filter((x) => x !== label);
    else if (exclusive) next = [label];
    else next = [...cur.filter((x) => !q.options.some((o) => typeof o !== "string" && o.exclusive && o.label === x)), label];
    setOne(q.id, { picks: next, other: ans[q.id]?.other || "" });
  };

  async function submit(e) {
    e.preventDefault();
    setErr(""); setDone("");
    const c = cleanAnswers(ans);
    if (!c.ok) {
      const q = SECTIONS.flatMap((s) => s.questions).find((x) => c.error.endsWith(x.text));
      setErr(c.error);
      if (q) { setBadId(q.id); refs.current[q.id]?.scrollIntoView({ behavior: "smooth", block: "center" }); }
      return;
    }
    setSaving(true);
    try {
      const j = await call({ action: "submit", answers: ans });
      setSubmittedAt(new Date().toISOString());
      setDone(j.edited ? "Đã cập nhật câu trả lời của bạn. Cảm ơn bạn!" : "Đã gửi. Cảm ơn bạn!");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) { setErr(e2.message); }
    setSaving(false);
  }

  return (
    <AppShell>
      <form onSubmit={submit} style={{ maxWidth: 720, margin: "0 auto", padding: "16px 14px 70px" }}>
        <h1 style={{ fontSize: 21, margin: "0 0 6px" }}>{SURVEY_TITLE}</h1>
        <p style={{ fontSize: 13.5, color: "var(--text-faint)", margin: "0 0 4px" }}>{SURVEY_INTRO}</p>
        <p style={{ fontSize: 12.5, color: "var(--text-faint)", margin: "0 0 14px" }}>{SURVEY_SEEN_BY}</p>
        {!loaded && <div style={{ fontSize: 14, color: "var(--text-faint)" }}>Đang tải…</div>}
        {done && <div style={{ ...card, borderColor: "#37b26c", background: "rgba(55,178,108,0.10)", fontSize: 14 }}>✅ {done} Bạn vẫn có thể sửa và bấm gửi lại.</div>}
        {!done && submittedAt && <div style={{ ...card, fontSize: 13.5 }}>✅ Bạn đã gửi khảo sát này. Bạn có thể sửa và gửi lại.</div>}

        {loaded && SECTIONS.map((s) => (
          <div key={s.id}>
            <h2 style={{ fontSize: 16, margin: "18px 0 8px", color: accent }}>{s.title}</h2>
            {s.questions.map((q) => {
              const n = Number(q.id.slice(1));
              return (
                <div key={q.id} ref={(el) => { refs.current[q.id] = el; }} style={{ ...card, ...(badId === q.id ? { borderColor: "#ff6b6b" } : {}) }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 8, lineHeight: 1.45 }}>{n}. {q.text} <span style={{ color: "#ff6b6b" }}>*</span></div>

                  {q.type === "single" && (
                    <div style={{ display: "grid", gap: 6 }}>
                      {q.options.map((o) => { const l = optLabel(o); const on = ans[q.id] === l; return (
                        <label key={l} style={chip(on)}><input type="radio" name={q.id} checked={on} onChange={() => setOne(q.id, l)} /> {l}</label>
                      ); })}
                    </div>
                  )}

                  {q.type === "multi" && (
                    <div style={{ display: "grid", gap: 6 }}>
                      {q.options.map((o) => { const l = optLabel(o); const on = (ans[q.id]?.picks || []).includes(l); return (
                        <label key={l} style={chip(on)}><input type="checkbox" checked={on} onChange={() => togglePick(q, l, typeof o !== "string" && o.exclusive)} /> {l}</label>
                      ); })}
                      {q.other && (
                        <input value={ans[q.id]?.other || ""} onChange={(e) => setOne(q.id, { picks: ans[q.id]?.picks || [], other: e.target.value })} placeholder="Khác (nếu có)…" maxLength={300}
                          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "inherit", font: "inherit", fontSize: 14 }} />
                      )}
                    </div>
                  )}

                  {q.type === "scale" && (
                    <div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {[1, 2, 3, 4, 5].map((v) => (
                          <button key={v} type="button" onClick={() => setOne(q.id, v)}
                            style={{ flex: 1, padding: "10px 0", fontSize: 16, fontWeight: 800, borderRadius: 10, cursor: "pointer", border: `1px solid ${ans[q.id] === v ? accent : "var(--border)"}`, background: ans[q.id] === v ? accent : "transparent", color: ans[q.id] === v ? "#fff" : "inherit" }}>{v}</button>
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "var(--text-faint)", marginTop: 6 }}><span>{q.low}</span><span style={{ textAlign: "right" }}>{q.high}</span></div>
                    </div>
                  )}

                  {q.type === "text" && (
                    <textarea value={ans[q.id] || ""} onChange={(e) => setOne(q.id, e.target.value)} rows={4} maxLength={2000}
                      style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "inherit", font: "inherit", fontSize: 14, resize: "vertical" }} />
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {loaded && (
          <div style={{ marginTop: 8 }}>
            {err && <div style={{ ...card, borderColor: "#ff6b6b", color: "#ff9a9a", fontSize: 13.5 }}>{err}</div>}
            <button type="submit" disabled={saving} style={{ padding: "12px 26px", fontWeight: 800, fontSize: 15, borderRadius: 10, border: "none", background: accent, color: "#fff", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Đang gửi…" : submittedAt ? "Gửi lại (cập nhật)" : "Gửi khảo sát"}
            </button>
          </div>
        )}
      </form>
    </AppShell>
  );
}
