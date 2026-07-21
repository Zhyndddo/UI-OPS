"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import styles from "../shared.module.css";

const EMPTY = { stage_name: "", real_name: "", email: "", spotify_url: "", tiktok_url: "", label_id: "" };

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

  return (
    <div className={styles.page}>
      <div className={styles.container}>
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
            <select className={styles.select} value={form.label_id} onChange={(e) => setForm((f) => ({ ...f, label_id: e.target.value }))}>
              <option value="">—</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>{l.label_name}</option>
              ))}
            </select>
          </div>
          <button className={styles.btnPrimary} type="submit">+ Add Artist</button>
        </form>

        {artists.length === 0 ? (
          <div className={styles.emptyState}>No artists yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nghệ Danh</th><th>Họ Và Tên</th><th>Email</th><th>Label</th><th>Spotify</th>
              </tr>
            </thead>
            <tbody>
              {artists.map((a) => (
                <tr key={a.id}>
                  <td>{a.stage_name}</td>
                  <td>{a.real_name || "—"}</td>
                  <td>{a.email || "—"}</td>
                  <td>{a.labels?.label_name || "—"}</td>
                  <td>{a.spotify_url ? <a href={a.spotify_url} target="_blank" rel="noopener noreferrer" style={{ color: "#ff6b1a" }}>link</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
