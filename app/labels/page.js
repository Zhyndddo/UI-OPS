"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import styles from "../shared.module.css";

const EMPTY = { label_name: "", hop_tac: "", pic: "", phan_loai: "" };

export default function LabelsPage() {
  const [labels, setLabels] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);

  async function load() {
    const { data } = await supabase.from("labels").select("*").order("label_name");
    setLabels(data || []);
  }

  useEffect(() => {
    if (supabase) load();
  }, []);

  async function addLabel(e) {
    e.preventDefault();
    setError(null);
    if (!form.label_name.trim()) {
      setError("Label Name is required.");
      return;
    }
    const { error: err } = await supabase.from("labels").insert(form);
    if (err) setError(err.message);
    else {
      setForm(EMPTY);
      load();
    }
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>// Reference Table</div>
        <h1 className={styles.title}>Label List</h1>

        {error && <div className={styles.errorBox}>{error}</div>}

        <form onSubmit={addLabel} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28, alignItems: "flex-end" }}>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 180 }}>
            <label className={styles.fieldLabel}>Label Name *</label>
            <input className={styles.input} value={form.label_name} onChange={(e) => setForm((f) => ({ ...f, label_name: e.target.value }))} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 140 }}>
            <label className={styles.fieldLabel}>Hợp Tác</label>
            <input className={styles.input} value={form.hop_tac} onChange={(e) => setForm((f) => ({ ...f, hop_tac: e.target.value }))} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 140 }}>
            <label className={styles.fieldLabel}>PIC</label>
            <input className={styles.input} value={form.pic} onChange={(e) => setForm((f) => ({ ...f, pic: e.target.value }))} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 140 }}>
            <label className={styles.fieldLabel}>Phân Loại</label>
            <input className={styles.input} value={form.phan_loai} onChange={(e) => setForm((f) => ({ ...f, phan_loai: e.target.value }))} />
          </div>
          <button className={styles.btnPrimary} type="submit">+ Add Label</button>
        </form>

        {labels.length === 0 ? (
          <div className={styles.emptyState}>No labels yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Label Name</th><th>Hợp Tác</th><th>PIC</th><th>Phân Loại</th></tr>
            </thead>
            <tbody>
              {labels.map((l) => (
                <tr key={l.id}>
                  <td>{l.label_name}</td>
                  <td>{l.hop_tac || "—"}</td>
                  <td>{l.pic || "—"}</td>
                  <td>{l.phan_loai || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </AppShell>
  );
}
