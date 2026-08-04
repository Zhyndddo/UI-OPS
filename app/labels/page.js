"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { withLabelPrefix, stripLabelPrefix, hasLabelPrefix, LABEL_PREFIX } from "../../lib/labelHelpers";
import { LABEL_HOP_TAC_OPTIONS, LABEL_PHAN_LOAI_OPTIONS } from "../../lib/pickerOptions";
import PickSelect from "../../lib/PickSelect";
import styles from "../shared.module.css";

const EMPTY = { label_name: "", hop_tac: [], the_loai: "", phan_loai: "", contract_signed: false };

export default function LabelsPage() {
  const [labels, setLabels] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [genres, setGenres] = useState([]);

  async function load() {
    const { data } = await supabase.from("labels").select("*").order("label_name");
    setLabels(data || []);
    syncLatestActivityYears(data || []);
  }

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase
      .from("lookup_options")
      .select("value, label")
      .eq("active", true)
      .eq("category", "genre")
      .order("sort_order")
      .then(({ data }) => setGenres(data || []));
  }, []);

  // Thời gian hoạt động gần nhất — auto-computed from this label's own
  // releases (matched by the denormalized releases.label text, same
  // matching approach the old Curve ID lookup used), not hand-entered.
  // Per explicit decision, this is PERSISTED to labels.latest_activity_year
  // (not just displayed) so other queries/exports can rely on it — writes
  // back only the labels whose stored year is actually stale, same
  // "auto-sync on load" pattern as the Stream workstation's metrics rows.
  async function syncLatestActivityYears(labelRows) {
    if (!supabase || labelRows.length === 0) return;
    const { data: rels } = await supabase.from("releases").select("label, release_date").not("release_date", "is", null);
    if (!rels) return;
    const latestByLabel = {};
    rels.forEach((r) => {
      if (!r.label || !r.release_date) return;
      const year = parseInt(r.release_date.slice(0, 4), 10);
      if (!latestByLabel[r.label] || year > latestByLabel[r.label]) latestByLabel[r.label] = year;
    });
    const stale = labelRows.filter((l) => latestByLabel[l.label_name] && latestByLabel[l.label_name] !== l.latest_activity_year);
    if (stale.length === 0) return;
    await Promise.all(stale.map((l) => supabase.from("labels").update({ latest_activity_year: latestByLabel[l.label_name] }).eq("id", l.id)));
    setLabels((prev) => prev.map((l) => (latestByLabel[l.label_name] ? { ...l, latest_activity_year: latestByLabel[l.label_name] } : l)));
  }

  function toggleFormHopTac(tag) {
    setForm((f) => ({ ...f, hop_tac: f.hop_tac.includes(tag) ? f.hop_tac.filter((t) => t !== tag) : [...f.hop_tac, tag] }));
  }

  async function addLabel(e) {
    e.preventDefault();
    setError(null);
    if (!form.label_name.trim()) {
      setError("Label Name is required.");
      return;
    }
    const payload = {
      ...form,
      // Ticking "Contract Signed" at creation skips the "HĐ - " prefix
      // entirely, so there's nothing to click off afterward — same result
      // as adding it un-signed and then hitting the table row's "Contract
      // Signed" button, just in one step.
      label_name: form.contract_signed ? stripLabelPrefix(form.label_name) : withLabelPrefix(form.label_name),
      the_loai: form.the_loai || null,
    };
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
  }

  async function toggleRowHopTac(label, tag) {
    const next = (label.hop_tac || []).includes(tag) ? (label.hop_tac || []).filter((t) => t !== tag) : [...(label.hop_tac || []), tag];
    await updateField(label, "hop_tac", next);
  }

  // One-time, one-way action: strips the "HĐ - " prefix and marks the
  // label as under contract. This is now the ONLY sanctioned way to remove
  // the prefix (see validateLabelNameEdit) — no Curve ID field to gate it
  // on anymore. Any further correction goes through direct DB edit (no
  // dev-role reset UI, per the "Direct DB edit only" decision).
  async function signContract(label) {
    if (!window.confirm(`Mark "${label.label_name}" as contract signed? This removes the "${LABEL_PREFIX}" prefix and can't be undone here.`)) return;
    const stripped = stripLabelPrefix(label.label_name);
    setLabels((prev) => prev.map((l) => (l.id === label.id ? { ...l, label_name: stripped, contract_signed: true } : l)));
    await supabase.from("labels").update({ label_name: stripped, contract_signed: true }).eq("id", label.id);
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
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 220 }}>
            <label className={styles.fieldLabel}>Hợp Tác</label>
            <TagPicker options={LABEL_HOP_TAC_OPTIONS} value={form.hop_tac} onToggle={toggleFormHopTac} />
          </div>
          {/* Genre — new field, taking the spot PIC used to have in this
              create row (PIC is gone from here entirely, see the table's
              "Thời gian hoạt động gần nhất" column below). */}
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 160 }}>
            <label className={styles.fieldLabel}>Genre</label>
            <select className={styles.select} value={form.the_loai} onChange={(e) => setForm((f) => ({ ...f, the_loai: e.target.value }))}>
              <option value="">— Chọn thể loại —</option>
              {genres.map((opt) => <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>)}
            </select>
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 140 }}>
            <label className={styles.fieldLabel}>Phân Loại</label>
            <PickSelect styles={styles} opts={["", ...LABEL_PHAN_LOAI_OPTIONS]} value={form.phan_loai} onChange={(v) => setForm((f) => ({ ...f, phan_loai: v }))} />
          </div>
          {/* Contract Signed at creation — ticking this skips the "HĐ - "
              prefix entirely instead of adding it and requiring a separate
              click on the table row's "Contract Signed" button afterward. */}
          <div className={styles.field} style={{ marginBottom: 0 }}>
            <label className={styles.fieldLabel} style={{ visibility: "hidden" }}>Contract</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", cursor: "pointer", height: 32 }}>
              <input
                type="checkbox"
                checked={form.contract_signed}
                onChange={(e) => setForm((f) => ({ ...f, contract_signed: e.target.checked }))}
              />
              Contract Signed
            </label>
          </div>
          <button className={styles.btnPrimary} type="submit">+ Add Label</button>
        </form>
        <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: -2, marginBottom: 20 }}>
          New labels get "{LABEL_PREFIX}" prepended automatically — shown as a fixed badge below, not part of
          the editable name. Click "Contract Signed" once the contract is in to remove it — one-time, can't be
          undone from here.
        </p>

        {labels.length === 0 ? (
          <div className={styles.emptyState}>No labels yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Label Name</th>
                <th>Contract</th>
                <th>Hợp Tác</th>
                <th>Thời gian hoạt động gần nhất</th>
                <th>Genre</th>
                <th>Phân Loại</th>
                <th>Note</th>
                <th></th>
              </tr>
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
                  <td>
                    {hasLabelPrefix(l.label_name) ? (
                      <button className={styles.btnSmall} onClick={() => signContract(l)}>Contract Signed</button>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--success-fg)" }}>✓ Signed</span>
                    )}
                  </td>
                  <td style={{ minWidth: 200 }}>
                    <TagPicker options={LABEL_HOP_TAC_OPTIONS} value={l.hop_tac || []} onToggle={(tag) => toggleRowHopTac(l, tag)} />
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text-faint)" }} title="Auto-computed from this label's most recent release — not editable here.">
                    {l.latest_activity_year || "—"}
                  </td>
                  <td>
                    <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: 130 }} value={l.the_loai || ""} onChange={(e) => updateField(l, "the_loai", e.target.value)}>
                      <option value="">—</option>
                      {genres.map((opt) => <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>)}
                    </select>
                  </td>
                  <td>
                    <PickSelect styles={styles} opts={["", ...LABEL_PHAN_LOAI_OPTIONS]} value={l.phan_loai} onChange={(v) => updateField(l, "phan_loai", v)} style={{ padding: "4px 8px", fontSize: 12, minWidth: 110 }} />
                  </td>
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

// Multi-select pill picker for Hợp Tác — click to toggle a tag in/out of
// the array. Same visual language (small pill buttons) as GateToggle
// elsewhere, but multi- not single-select.
function TagPicker({ options, value, onToggle }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((opt) => {
        const active = (value || []).includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 999,
              cursor: "pointer",
              border: active ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
              background: active ? "rgba(255,107,26,0.15)" : "transparent",
              color: active ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
