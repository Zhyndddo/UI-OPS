"use client";

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import styles from "../shared.module.css";

const CATEGORIES = ["project_type", "contract_type", "genre", "channel", "release_category"];

export default function ConfigPage() {
  const [options, setOptions] = useState([]);
  const [category, setCategory] = useState("contract_type");
  const [newValue, setNewValue] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("lookup_options").select("*").order("category").order("sort_order");
    setOptions(data || []);
    setLoading(false);
  }

  async function addValue(e) {
    e.preventDefault();
    if (!newValue.trim()) return;
    const maxSort = Math.max(0, ...options.filter((o) => o.category === category).map((o) => o.sort_order));
    await supabase.from("lookup_options").insert({ category, value: newValue.trim(), sort_order: maxSort + 1 });
    setNewValue("");
    load();
  }

  async function toggleActive(opt) {
    await supabase.from("lookup_options").update({ active: !opt.active }).eq("id", opt.id);
    setOptions((prev) => prev.map((o) => (o.id === opt.id ? { ...o, active: !o.active } : o)));
  }

  const filtered = options.filter((o) => o.category === category);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Config</div>
          <h1 className={styles.title}>Config</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 24 }}>
            Admin-editable dropdown values — no schema change or redeploy needed to add/retire an option here.
          </p>

          <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`${styles.tabBtn} ${category === c ? styles.tabBtnActive : ""}`}
                style={{ border: "1px solid var(--border)", borderRadius: 6 }}
              >
                {c}
              </button>
            ))}
          </div>

          <form onSubmit={addValue} style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <input
              className={styles.input}
              style={{ maxWidth: 300 }}
              placeholder={`Add a new ${category} value…`}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
            <button className={styles.btnPrimary} type="submit">+ Add</button>
          </form>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>No values yet for {category}.</div>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Value</th><th>Sort Order</th><th>Active</th></tr></thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id}>
                    <td>{o.label || o.value}</td>
                    <td>{o.sort_order}</td>
                    <td>
                      <button
                        className={styles.btnSmall}
                        onClick={() => toggleActive(o)}
                        style={!o.active ? { opacity: 0.5 } : undefined}
                      >
                        {o.active ? "Active" : "Retired"}
                      </button>
                    </td>
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
