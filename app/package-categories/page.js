"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import styles from "../shared.module.css";

export default function PackageCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (supabase) load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("package_categories").select("*").order("sort_order");
    setCategories(data || []);
    setLoading(false);
  }

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const maxSort = Math.max(-1, ...categories.map((c) => c.sort_order));
    await supabase.from("package_categories").insert({ name: name.trim(), sort_order: maxSort + 1 });
    setName("");
    load();
  }

  async function remove(c) {
    if (!window.confirm(`Delete "${c.name}"? Any content-plan data using it will be affected.`)) return;
    await supabase.from("package_categories").delete().eq("id", c.id);
    load();
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>// Reference Table</div>
        <h1 className={styles.title}>Package Categories</h1>
        <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
          The top-level groups in a real content-plan spec (Social Vieent, Community, TikTok Channel...) —
          used when building a package inside the Media Booking ticket.
        </p>

        <form onSubmit={add} style={{ display: "flex", gap: 10, marginBottom: 24, alignItems: "flex-end" }}>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 220 }}>
            <label className={styles.fieldLabel}>Category Name</label>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className={styles.btnPrimary} type="submit">+ Add</button>
        </form>

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : categories.length === 0 ? (
          <div className={styles.emptyState}>No categories yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {categories.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 14px" }}>
                <span>{c.name}</span>
                <button onClick={() => remove(c)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </AppShell>
  );
}
