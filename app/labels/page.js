"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { withLabelPrefix, validateLabelNameEdit, LABEL_PREFIX } from "../../lib/labelHelpers";
import styles from "../shared.module.css";

const EMPTY = { label_name: "", hop_tac: "", pic: "", phan_loai: "", curve_id: "" };

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
    const payload = { ...form, label_name: withLabelPrefix(form.label_name), curve_id: form.curve_id || null };
    const { error: err } = await supabase.from("labels").insert(payload);
    if (err) setError(err.message);
    else {
      setForm(EMPTY);
      load();
    }
  }

  async function updateField(label, field, value) {
    if (field === "label_name") {
      const check = validateLabelNameEdit(label.label_name, value, label.curve_id);
      if (!check.ok) {
        window.alert(check.message);
        load(); // snap the input back to the real stored value
        return;
      }
    }
    setLabels((prev) => prev.map((l) => (l.id === label.id ? { ...l, [field]: value } : l)));
    await supabase.from("labels").update({ [field]: value }).eq("id", label.id);
  }

  async function deleteLabel(label) {
    if (!window.confirm(`Delete "${label.label_name}"? This can't be undone.`)) return;
    await supabase.from("labels").delete().eq("id", label.id);
    setLabels((prev) => prev.filter((l) => l.id !== label.id));
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>// Reference Table</div>
        <h1 className={styles.title}>Label List</h1>

        {error && <div className={styles.errorBox}>{error}</div>}

        <form onSubmit={addLabel} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10, alignItems: "flex-end" }}>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 180 }}>
            <label className={styles.fieldLabel}>Label Name *</label>
            <input className={styles.input} value={form.label_name} onChange={(e) => setForm((f) => ({ ...f, label_name: e.target.value }))} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 140 }}>
            <label className={styles.fieldLabel}>Curve ID</label>
            <input className={styles.input} value={form.curve_id} onChange={(e) => setForm((f) => ({ ...f, curve_id: e.target.value }))} />
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
        <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: -2, marginBottom: 20 }}>
          New labels get "{LABEL_PREFIX}" prepended automatically. That prefix can only be removed later
          (editable in the table below) once Curve ID is filled in.
        </p>

        {labels.length === 0 ? (
          <div className={styles.emptyState}>No labels yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Label Name</th><th>Curve ID</th><th>Hợp Tác</th><th>PIC</th><th>Phân Loại</th><th>Note</th><th></th></tr>
            </thead>
            <tbody>
              {labels.map((l) => (
                <tr key={l.id}>
                  <td><input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 160 }} defaultValue={l.label_name} onBlur={(e) => updateField(l, "label_name", e.target.value)} /></td>
                  <td><input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 100 }} defaultValue={l.curve_id || ""} onBlur={(e) => updateField(l, "curve_id", e.target.value)} /></td>
                  <td><input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 100 }} defaultValue={l.hop_tac || ""} onBlur={(e) => updateField(l, "hop_tac", e.target.value)} /></td>
                  <td><input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 100 }} defaultValue={l.pic || ""} onBlur={(e) => updateField(l, "pic", e.target.value)} /></td>
                  <td><input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 100 }} defaultValue={l.phan_loai || ""} onBlur={(e) => updateField(l, "phan_loai", e.target.value)} /></td>
                  <td><input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 140 }} defaultValue={l.note || ""} onBlur={(e) => updateField(l, "note", e.target.value)} /></td>
                  <td><button onClick={() => deleteLabel(l)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>✕</button></td>
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
