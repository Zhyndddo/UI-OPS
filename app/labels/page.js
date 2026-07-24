"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { withLabelPrefix, stripLabelPrefix, hasLabelPrefix, LABEL_PREFIX } from "../../lib/labelHelpers";
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

  // label_name edits from the table only ever carry the SUFFIX now — the
  // "HĐ - " prefix is a fixed badge outside the input, not part of what's
  // editable, so there's nothing to validate/block anymore. Filling in
  // Curve ID is what actually removes the prefix now, automatically.
  async function updateLabelSuffix(label, suffix) {
    const newName = hasLabelPrefix(label.label_name) ? LABEL_PREFIX + suffix : suffix;
    setLabels((prev) => prev.map((l) => (l.id === label.id ? { ...l, label_name: newName } : l)));
    await supabase.from("labels").update({ label_name: newName }).eq("id", label.id);
  }

  async function updateField(label, field, value) {
    setLabels((prev) => prev.map((l) => (l.id === label.id ? { ...l, [field]: value } : l)));
    await supabase.from("labels").update({ [field]: value }).eq("id", label.id);

    if (field === "curve_id" && value.trim() && hasLabelPrefix(label.label_name)) {
      const stripped = stripLabelPrefix(label.label_name);
      setLabels((prev) => prev.map((l) => (l.id === label.id ? { ...l, label_name: stripped } : l)));
      await supabase.from("labels").update({ label_name: stripped }).eq("id", label.id);
    }
  }

  async function deleteLabel(label) {
    const { data: tiedArtists } = await supabase.from("artists").select("stage_name").eq("label_id", label.id);
    if (tiedArtists && tiedArtists.length > 0) {
      window.alert(
        `Can't delete "${label.label_name}" — ${tiedArtists.length} artist(s) are still linked to it ` +
        `(${tiedArtists.map((a) => a.stage_name).join(", ")}). Remove or reassign those ties first.`
      );
      return;
    }
    if (!window.confirm(`Delete "${label.label_name}"? This can't be undone.`)) return;
    const { error: err } = await supabase.from("labels").delete().eq("id", label.id);
    if (err) {
      window.alert(`Couldn't delete: ${err.message}`);
      return;
    }
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
          New labels get "{LABEL_PREFIX}" prepended automatically — shown as a fixed badge below, not part of
          the editable name. It's removed automatically the moment Curve ID gets filled in.
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
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {hasLabelPrefix(l.label_name) && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap" }}>{LABEL_PREFIX}</span>
                      )}
                      <input
                        className={styles.input}
                        style={{ padding: "4px 8px", fontSize: 12, minWidth: 140 }}
                        defaultValue={hasLabelPrefix(l.label_name) ? stripLabelPrefix(l.label_name) : l.label_name}
                        onBlur={(e) => updateLabelSuffix(l, e.target.value)}
                      />
                    </div>
                  </td>
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
