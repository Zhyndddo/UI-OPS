"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import styles from "./styles.module.css";

const EMPTY_FORM = {
  project_type: "",
  label: "",
  title: "",
  main_artist: "",
  feature_artist: "",
  genre: "",
  release_date: "",
  release_time: "19:00",
  theme: "",
  drive_link: "",
  brief: "",
  requires_dsp_pitching: false,
  has_isrc: false,
};

export default function NewReleasePage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [projectTypes, setProjectTypes] = useState([]);
  const [genres, setGenres] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [createdDid, setCreatedDid] = useState(null);
  const [labelTouched, setLabelTouched] = useState(false); // true once user manually edits Label — blocks autofill from overwriting it
  const [autofillNote, setAutofillNote] = useState(null);

  useEffect(() => {
    if (!supabase) return;

    supabase
      .from("lookup_options")
      .select("category, value, label")
      .eq("active", true)
      .in("category", ["project_type", "genre"])
      .order("sort_order")
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(`Couldn't load dropdown options: ${fetchError.message}`);
          return;
        }
        setProjectTypes((data || []).filter((r) => r.category === "project_type"));
        setGenres((data || []).filter((r) => r.category === "genre"));
      });
  }, []);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "label") setLabelTouched(true);
  }

  // Autofill: on leaving Main Artist, look it up in the Artist List
  // reference table — if found and Label hasn't been manually edited yet,
  // suggest its Label. Never overwrites a manual edit (matches v1's
  // masterData_service.js behavior).
  async function handleArtistBlur() {
    if (!supabase || !form.main_artist.trim() || labelTouched) return;
    const { data } = await supabase
      .from("artists")
      .select("stage_name, labels(label_name)")
      .ilike("stage_name", form.main_artist.trim())
      .maybeSingle();
    if (data?.labels?.label_name) {
      setForm((f) => ({ ...f, label: data.labels.label_name }));
      setAutofillNote(`Label auto-filled from Artist List ("${data.stage_name}").`);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setCreatedDid(null);

    if (!form.title.trim() || !form.main_artist.trim() || !form.release_date) {
      setError("Tên bài hát, Main Artist, and Ngày phát hành are required.");
      return;
    }
    if (!supabase) {
      setError("Supabase isn't configured — check environment variables.");
      return;
    }

    setSubmitting(true);
    const payload = {
      ...form,
      label: form.label || null,
      feature_artist: form.feature_artist || null,
      genre: form.genre || null,
      theme: form.theme || null,
      drive_link: form.drive_link || null,
      brief: form.brief || null,
      project_type: form.project_type || null,
    };

    const { data, error: insertError } = await supabase
      .from("releases")
      .insert(payload)
      .select("did")
      .single();

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setCreatedDid(data.did);
    setForm(EMPTY_FORM);
    setLabelTouched(false);
    setAutofillNote(null);
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>// New Release</div>
        <h1 className={styles.title}>New Release</h1>

        <div className={styles.didBox}>
          <div className={styles.didLabel}>// Release ID (DID)</div>
          {createdDid ? (
            <div className={styles.didValue}>{createdDid}</div>
          ) : (
            <div className={styles.didPlaceholder}>---- ---- ----</div>
          )}
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}
        {autofillNote && (
          <div style={{ color: "#888", fontSize: 12, marginBottom: 16 }}>{autofillNote}</div>
        )}
        {createdDid && (
          <div className={styles.successBox}>
            Release created — DID {createdDid}. The form below has been cleared for the next one.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Loại dự án <span className={styles.required}>*</span>
              </label>
              <select
                className={styles.select}
                value={form.project_type}
                onChange={(e) => update("project_type", e.target.value)}
              >
                <option value="">— Chọn —</option>
                {projectTypes.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label || opt.value}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Label / Nhà phát hành</label>
              <input
                className={styles.input}
                placeholder="Tên label"
                value={form.label}
                onChange={(e) => update("label", e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Tên bài hát / EP / Album <span className={styles.required}>*</span>
              </label>
              <input
                className={styles.input}
                placeholder="Nhập tên dự án"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Main Artist <span className={styles.required}>*</span>
              </label>
              <input
                className={styles.input}
                placeholder="Tên nghệ sĩ chính"
                value={form.main_artist}
                onChange={(e) => update("main_artist", e.target.value)}
                onBlur={handleArtistBlur}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Feature Artist</label>
              <input
                className={styles.input}
                placeholder="Tên nghệ sĩ feat (nếu có)"
                value={form.feature_artist}
                onChange={(e) => update("feature_artist", e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Thể loại</label>
              <select
                className={styles.select}
                value={form.genre}
                onChange={(e) => update("genre", e.target.value)}
              >
                <option value="">— Chọn thể loại —</option>
                {genres.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label || opt.value}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Ngày phát hành <span className={styles.required}>*</span>
              </label>
              <input
                type="date"
                className={styles.input}
                value={form.release_date}
                onChange={(e) => update("release_date", e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Giờ phát hành</label>
              <input
                type="time"
                className={styles.input}
                value={form.release_time}
                onChange={(e) => update("release_time", e.target.value)}
              />
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel}>Chủ đề</label>
              <input
                className={styles.input}
                placeholder="VD: Tình yêu, Tình yêu tan vỡ"
                value={form.theme}
                onChange={(e) => update("theme", e.target.value)}
              />
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel}>Link Drive</label>
              <input
                className={styles.input}
                placeholder="https://drive.google.com/..."
                value={form.drive_link}
                onChange={(e) => update("drive_link", e.target.value)}
              />
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel}>Brief & Confirmation</label>
              <textarea
                className={styles.textarea}
                placeholder="Tình trạng data, xác nhận gói HTTT…"
                value={form.brief}
                onChange={(e) => update("brief", e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={form.requires_dsp_pitching}
                  onChange={(e) => update("requires_dsp_pitching", e.target.checked)}
                />
                Yêu cầu Pitching DSP
              </label>
            </div>

            <div className={styles.field}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={form.has_isrc}
                  onChange={(e) => update("has_isrc", e.target.checked)}
                />
                Đã có ISRC
              </label>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? "Đang tạo…" : "Tạo Release"}
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                setForm(EMPTY_FORM);
                setError(null);
                setCreatedDid(null);
                setLabelTouched(false);
                setAutofillNote(null);
              }}
            >
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
