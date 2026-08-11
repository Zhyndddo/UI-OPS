"use client";

// ============================================================================
// Round 85 — TEMPORARY, short-lived page. See lib/teamBuildingSurveyQuestions.js
// and DATA_FIXES.md's "Round 85" entry for the full teardown checklist —
// this whole file, its lib module, the sidebar entry, and the
// team_building_survey_responses table are all meant to come out together
// once this survey has served its purpose.
// ============================================================================

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { fmtDate } from "../../lib/helpers";
import {
  RATING_SCALE,
  SURVEY_TITLE,
  GENERAL_QUESTIONS,
  DESTINATION_SECTION_LABEL,
  DESTINATION_QUESTIONS,
  STYLE_QUESTION,
  ALL_RATING_QUESTIONS,
} from "../../lib/teamBuildingSurveyQuestions";
import styles from "../shared.module.css";

const CHART_COLORS = ["#ff6b1a", "#5b9dff", "#7ee6a8", "#ffca4d", "#e0672c", "#a78bfa", "#ff8a80", "#3fa7a0"];

export default function TeamBuildingSurveyPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState("survey");
  const [myAnswers, setMyAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [responses, setResponses] = useState([]); // report tab — every profile's response, joined with name
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !profile?.id) return;
    supabase
      .from("team_building_survey_responses")
      .select("answers")
      .eq("profile_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.answers) {
          setMyAnswers(data.answers);
          setAlreadySubmitted(true);
        }
        setLoading(false);
      });
  }, [profile?.id]);

  useEffect(() => {
    if (tab !== "report" || !supabase) return;
    setReportLoading(true);
    supabase
      .from("team_building_survey_responses")
      .select("id, answers, created_at, updated_at, profiles(name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setResponses(data || []);
        setReportLoading(false);
      });
  }, [tab]);

  function setAnswer(key, value) {
    setMyAnswers((prev) => ({ ...prev, [key]: value }));
  }

  // One response per person — resubmitting overwrites the previous
  // answer, per explicit request. Upsert on profile_id.
  async function submit() {
    if (!profile?.id) return;
    setSaving(true);
    await supabase.from("team_building_survey_responses").upsert(
      { profile_id: profile.id, answers: myAnswers, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" }
    );
    setSaving(false);
    setAlreadySubmitted(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 900 }}>
          <div className={styles.eyebrow}>// Survey · Temporary</div>
          <h1 className={styles.title} style={{ marginBottom: 8 }}>{SURVEY_TITLE}</h1>
          <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: -8, marginBottom: 20 }}>
            Quick, short-lived survey — this page (and the data in it) will be removed once results
            are reported out.
          </p>

          <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
            <button onClick={() => setTab("survey")} className={`${styles.tabBtn} ${tab === "survey" ? styles.tabBtnActive : ""}`} style={{ border: "1px solid var(--border)", borderRadius: 6 }}>
              Survey
            </button>
            <button onClick={() => setTab("report")} className={`${styles.tabBtn} ${tab === "report" ? styles.tabBtnActive : ""}`} style={{ border: "1px solid var(--border)", borderRadius: 6 }}>
              Report
            </button>
          </div>

          {tab === "survey" ? (
            loading ? (
              <div className={styles.emptyState}>Loading…</div>
            ) : (
              <SurveyForm
                answers={myAnswers}
                onAnswer={setAnswer}
                onSubmit={submit}
                saving={saving}
                saved={saved}
                alreadySubmitted={alreadySubmitted}
              />
            )
          ) : (
            <ReportView loading={reportLoading} responses={responses} />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function RatingRow({ label, value, note, onChange, onNoteChange }) {
  const [noteOpen, setNoteOpen] = useState(!!note);
  return (
    <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontSize: 13, marginBottom: 8, color: "var(--text)" }}>{label}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        {RATING_SCALE.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              border: value === n ? "2px solid var(--accent)" : "1px solid var(--border-strong)",
              background: value === n ? "var(--accent)" : "var(--bg-input)",
              color: value === n ? "var(--accent-on)" : "var(--text)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setNoteOpen((o) => !o)}
          style={{ background: "none", border: "none", color: "var(--accent-soft)", fontSize: 11, cursor: "pointer", marginLeft: 8, padding: 0 }}
        >
          {noteOpen ? "− ẩn ghi chú" : "+ ghi chú"}
        </button>
      </div>
      {noteOpen && (
        <input
          className={styles.input}
          style={{ marginTop: 8, fontSize: 12, padding: "6px 10px", maxWidth: 420 }}
          placeholder="Ghi chú (tuỳ chọn)…"
          defaultValue={note || ""}
          onBlur={(e) => onNoteChange(e.target.value)}
        />
      )}
    </div>
  );
}

function SurveyForm({ answers, onAnswer, onSubmit, saving, saved, alreadySubmitted }) {
  const general = answers.general || {};
  const destinations = answers.destinations || {};
  const style = answers.style || null;

  function setRating(section, key, value) {
    onAnswer(section, { ...(answers[section] || {}), [key]: value });
  }
  function setNote(section, key, note) {
    onAnswer(section, { ...(answers[section] || {}), [`${key}_note`]: note });
  }

  const allAnswered =
    GENERAL_QUESTIONS.every((q) => general[q.key] != null) &&
    DESTINATION_QUESTIONS.every((q) => destinations[q.key] != null) &&
    !!style;

  return (
    <div>
      {alreadySubmitted && (
        <div style={{ background: "rgba(126,230,168,0.1)", border: "1px solid var(--success-fg, #7ee6a8)", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "var(--success-fg, #7ee6a8)", marginBottom: 20 }}>
          ✓ You've already submitted — editing below will overwrite your previous answer.
        </div>
      )}

      <div className={styles.subheading} style={{ marginTop: 0 }}>General</div>
      {GENERAL_QUESTIONS.map((q) => (
        <RatingRow
          key={q.key}
          label={q.label}
          value={general[q.key]}
          note={general[`${q.key}_note`]}
          onChange={(v) => setRating("general", q.key, v)}
          onNoteChange={(v) => setNote("general", q.key, v)}
        />
      ))}

      <div className={styles.subheading}>{DESTINATION_SECTION_LABEL}</div>
      {DESTINATION_QUESTIONS.map((q) => (
        <RatingRow
          key={q.key}
          label={q.label}
          value={destinations[q.key]}
          note={destinations[`${q.key}_note`]}
          onChange={(v) => setRating("destinations", q.key, v)}
          onNoteChange={(v) => setNote("destinations", q.key, v)}
        />
      ))}

      <div className={styles.subheading}>{STYLE_QUESTION.label}</div>
      <div style={{ display: "grid", gap: 8, marginBottom: 24, maxWidth: 520 }}>
        {STYLE_QUESTION.options.map((opt) => (
          <label
            key={opt.value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              border: style === opt.value ? "2px solid var(--accent)" : "1px solid var(--border-strong)",
              background: style === opt.value ? "rgba(255,107,26,0.08)" : "var(--bg-card)",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="style"
              checked={style === opt.value}
              onChange={() => onAnswer("style", opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className={styles.btnPrimary} onClick={onSubmit} disabled={saving || !allAnswered}>
          {saving ? "Đang lưu…" : alreadySubmitted ? "Cập Nhật Câu Trả Lời" : "Gửi Khảo Sát"}
        </button>
        {!allAnswered && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Trả lời hết các câu hỏi để gửi.</span>}
        {saved && <span style={{ fontSize: 12, color: "var(--success-fg, #7ee6a8)", fontWeight: 700 }}>Saved</span>}
      </div>
    </div>
  );
}

// ── Report — aggregated averages/tally first, raw per-respondent list
// below. Plain CSS bars, same pattern as app/report/page.js's BarChart
// (kept as its own local copy here rather than shared, since this whole
// page is meant to be deleted in one piece — see the file header).
function avgRatingBar(question, section, responses) {
  const values = responses.map((r) => r.answers?.[section]?.[question.key]).filter((v) => v != null);
  const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  return { label: question.label, value: avg, count: values.length };
}

function AvgBarChart({ data }) {
  if (data.length === 0) return <div style={{ color: "var(--text-faint)", fontSize: 12 }}>No responses yet.</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {data.map((d, i) => (
        <div key={d.label} style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.label}>
            {d.label}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, height: 10, background: "var(--bg-input)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: `${(d.value / 10) * 100}%`, height: "100%", background: CHART_COLORS[i % CHART_COLORS.length] }} />
            </div>
            <span style={{ fontSize: 11, color: "var(--text-faint)", width: 28, textAlign: "right" }}>{d.value.toFixed(1)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StyleTally({ responses }) {
  const counts = {};
  STYLE_QUESTION.options.forEach((o) => (counts[o.value] = 0));
  responses.forEach((r) => {
    const v = r.answers?.style;
    if (v && counts[v] != null) counts[v]++;
  });
  const total = responses.length;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {STYLE_QUESTION.options.map((opt, i) => (
        <div key={opt.value} style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{opt.label}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, height: 10, background: "var(--bg-input)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: total ? `${(counts[opt.value] / total) * 100}%` : "0%", height: "100%", background: CHART_COLORS[i % CHART_COLORS.length] }} />
            </div>
            <span style={{ fontSize: 11, color: "var(--text-faint)", width: 46, textAlign: "right" }}>
              {counts[opt.value]} ({total ? Math.round((counts[opt.value] / total) * 100) : 0}%)
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportView({ loading, responses }) {
  const [expanded, setExpanded] = useState(null);

  if (loading) return <div className={styles.emptyState}>Loading…</div>;
  if (responses.length === 0) return <div className={styles.emptyState}>No responses yet.</div>;

  const generalBars = GENERAL_QUESTIONS.map((q) => avgRatingBar(q, "general", responses));
  const destBars = DESTINATION_QUESTIONS.map((q) => avgRatingBar(q, "destinations", responses));

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 20 }}>
        {responses.length} response{responses.length === 1 ? "" : "s"} so far.
      </p>

      <div className={styles.subheading} style={{ marginTop: 0 }}>Average Score — General (1-10)</div>
      <div style={{ marginBottom: 24 }}><AvgBarChart data={generalBars} /></div>

      <div className={styles.subheading}>Average Score — {DESTINATION_SECTION_LABEL}</div>
      <div style={{ marginBottom: 24 }}><AvgBarChart data={destBars} /></div>

      <div className={styles.subheading}>{STYLE_QUESTION.label} — Tally</div>
      <div style={{ marginBottom: 28, maxWidth: 520 }}><StyleTally responses={responses} /></div>

      <div className={styles.subheading}>Responses</div>
      <div style={{ display: "grid", gap: 8 }}>
        {responses.map((r) => {
          const isOpen = expanded === r.id;
          const styleLabel = STYLE_QUESTION.options.find((o) => o.value === r.answers?.style)?.label || "—";
          return (
            <div key={r.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                onClick={() => setExpanded(isOpen ? null : r.id)}
              >
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{r.profiles?.name || "—"}</span>
                  <span style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: 10 }}>{fmtDate(r.updated_at || r.created_at)}</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--accent-soft)" }}>{isOpen ? "▾ Ẩn" : "▸ Xem"}</span>
              </div>
              {isOpen && (
                <div style={{ marginTop: 12, fontSize: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px", marginBottom: 10 }}>
                    {ALL_RATING_QUESTIONS.map((q) => {
                      const section = GENERAL_QUESTIONS.includes(q) ? "general" : "destinations";
                      const val = r.answers?.[section]?.[q.key];
                      const note = r.answers?.[section]?.[`${q.key}_note`];
                      return (
                        <div key={q.key} style={{ display: "contents" }}>
                          <div style={{ color: "var(--text-muted)" }}>
                            {q.label}
                            {note && <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}> — {note}</span>}
                          </div>
                          <div style={{ color: "var(--text)", fontWeight: 700 }}>{val ?? "—"}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ color: "var(--text-muted)" }}>
                    <strong>{STYLE_QUESTION.label}:</strong> {styleLabel}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
