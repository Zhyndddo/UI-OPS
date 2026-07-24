"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import QuickCreate from "../../lib/QuickCreate";
import styles from "../shared.module.css";

const DSP_FIELDS = [
  ["spotify_url", "Spotify"],
  ["apple_url", "Apple"],
  ["tiktok_url", "TikTok"],
  ["facebook_url", "Facebook"],
  ["zing_url", "Zing"],
  ["nct_url", "NCT"],
];

const EMPTY = { stage_name: "", real_name: "", email: "", label_id: "" };

export default function ArtistsPage() {
  const [artists, setArtists] = useState([]);
  const [labels, setLabels] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);

  async function load() {
    const { data: a } = await supabase.from("artists").select("*, labels(label_name)").order("stage_name");
    const { data: l } = await supabase.from("labels").select("id, label_name").order("label_name");
    setArtists(a || []);
    setLabels(l || []);
  }

  useEffect(() => {
    if (supabase) load();
  }, []);

  async function addArtist(e) {
    e.preventDefault();
    setError(null);
    if (!form.stage_name.trim()) {
      setError("Nghệ Danh is required.");
      return;
    }
    const payload = { ...form, label_id: form.label_id || null };
    const { error: err } = await supabase.from("artists").insert(payload);
    if (err) setError(err.message);
    else {
      setForm(EMPTY);
      load();
    }
  }

  async function updateField(artist, field, value) {
    setArtists((prev) => prev.map((a) => (a.id === artist.id ? { ...a, [field]: value } : a)));
    await supabase.from("artists").update({ [field]: value }).eq("id", artist.id);
  }

  async function updateLabel(artist, labelId) {
    const label = labels.find((l) => l.id === labelId);
    setArtists((prev) => prev.map((a) => (a.id === artist.id ? { ...a, label_id: labelId || null, labels: label ? { label_name: label.label_name } : null } : a)));
    await supabase.from("artists").update({ label_id: labelId || null }).eq("id", artist.id);
  }

  async function deleteArtist(artist) {
    if (!window.confirm(`Delete "${artist.stage_name}"? This can't be undone.`)) return;
    await supabase.from("artists").delete().eq("id", artist.id);
    setArtists((prev) => prev.filter((a) => a.id !== artist.id));
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 1300 }}>
        <div className={styles.eyebrow}>// Reference Table</div>
        <h1 className={styles.title}>Artist List</h1>

        {error && <div className={styles.errorBox}>{error}</div>}

        <form onSubmit={addArtist} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28, alignItems: "flex-end" }}>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 160 }}>
            <label className={styles.fieldLabel}>Nghệ Danh *</label>
            <input className={styles.input} value={form.stage_name} onChange={(e) => setForm((f) => ({ ...f, stage_name: e.target.value }))} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 160 }}>
            <label className={styles.fieldLabel}>Họ Và Tên</label>
            <input className={styles.input} value={form.real_name} onChange={(e) => setForm((f) => ({ ...f, real_name: e.target.value }))} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 180 }}>
            <label className={styles.fieldLabel}>Email</label>
            <input className={styles.input} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 160 }}>
            <label className={styles.fieldLabel}>Label</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select className={styles.select} value={form.label_id} onChange={(e) => setForm((f) => ({ ...f, label_id: e.target.value }))}>
                <option value="">—</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>{l.label_name}</option>
                ))}
              </select>
              <QuickCreate
                kind="label"
                onCreated={(newLabel) => {
                  setLabels((prev) => [...prev, newLabel]);
                  setForm((f) => ({ ...f, label_id: newLabel.id }));
                }}
              />
            </div>
          </div>
          <button className={styles.btnPrimary} type="submit">+ Add Artist</button>
        </form>
        <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: -20, marginBottom: 20 }}>
          DSP links and Note are editable directly in the table below, after creating.
        </p>

        {artists.length === 0 ? (
          <div className={styles.emptyState}>No artists yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
          <table className={styles.table} style={{ minWidth: 1200 }}>
            <thead>
              <tr>
                <th>Nghệ Danh</th><th>Họ Và Tên</th><th>Email</th><th>Label</th>
                {DSP_FIELDS.map(([, label]) => <th key={label}>{label}</th>)}
                <th>Note</th><th></th>
              </tr>
            </thead>
            <tbody>
              {artists.map((a) => (
                <tr key={a.id}>
                  <td>
                    <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 120 }} defaultValue={a.stage_name} onBlur={(e) => updateField(a, "stage_name", e.target.value)} />
                  </td>
                  <td>
                    <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 120 }} defaultValue={a.real_name || ""} onBlur={(e) => updateField(a, "real_name", e.target.value)} />
                  </td>
                  <td>
                    <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 140 }} defaultValue={a.email || ""} onBlur={(e) => updateField(a, "email", e.target.value)} />
                  </td>
                  <td>
                    <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: 120 }} value={a.label_id || ""} onChange={(e) => updateLabel(a, e.target.value)}>
                      <option value="">—</option>
                      {labels.map((l) => <option key={l.id} value={l.id}>{l.label_name}</option>)}
                    </select>
                  </td>
                  {DSP_FIELDS.map(([key]) => (
                    <td key={key}>
                      <input className={styles.input} style={{ padding: "4px 8px", fontSize: 11, minWidth: 100 }} defaultValue={a[key] || ""} placeholder="url…" onBlur={(e) => updateField(a, key, e.target.value)} />
                    </td>
                  ))}
                  <td>
                    <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 140 }} defaultValue={a.note || ""} onBlur={(e) => updateField(a, "note", e.target.value)} />
                  </td>
                  <td>
                    <button onClick={() => deleteArtist(a)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
    </AppShell>
  );
}
