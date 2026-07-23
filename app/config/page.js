"use client";

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import styles from "../shared.module.css";

const CATEGORIES = ["project_type", "contract_type", "genre", "channel", "release_category"];
const ROLES = ["exc", "admin", "dev"];
const TEAMS = ["AR", "Marketing", "OPS", "Design"];

export default function ConfigPage() {
  const [section, setSection] = useState("lookups"); // "lookups" | "team"

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Config</div>
          <h1 className={styles.title}>Config</h1>

          <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
            {[["lookups", "Lookup Options"], ["team", "Team"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSection(key)}
                className={`${styles.tabBtn} ${section === key ? styles.tabBtnActive : ""}`}
                style={{ border: "1px solid var(--border)", borderRadius: 6 }}
              >
                {label}
              </button>
            ))}
          </div>

          {section === "lookups" ? <LookupOptionsSection /> : <TeamSection />}
        </div>
      </div>
    </AppShell>
  );
}

function LookupOptionsSection() {
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
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
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
  );
}

// The team roster — profiles need a row here BEFORE someone can sign in
// successfully (AuthContext looks up profiles by email on login; no match
// = "not on roster" screen). This is how people actually get access.
function TeamSection() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("exc");
  const [segment, setSegment] = useState("AR");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    setProfiles(data || []);
    setLoading(false);
  }

  async function addProfile(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    const { error: err } = await supabase.from("profiles").insert({
      name: name.trim(),
      email: email.trim(),
      role,
      segment: role === "dev" ? null : segment,
    });
    if (err) setError(err.message);
    else {
      setName("");
      setEmail("");
      load();
    }
  }

  async function updateRole(p, newRole) {
    const patch = { role: newRole, segment: newRole === "dev" ? null : p.segment || "AR" };
    await supabase.from("profiles").update(patch).eq("id", p.id);
    load();
  }

  async function updateSegment(p, newSegment) {
    await supabase.from("profiles").update({ segment: newSegment }).eq("id", p.id);
    load();
  }

  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
        Add someone here with the email they'll sign in with — they won't be recognized by the app until
        their row exists here, even after clicking a valid magic link.
      </p>

      {error && <div className={styles.errorBox}>{error}</div>}

      <form onSubmit={addProfile} style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className={styles.field} style={{ marginBottom: 0, minWidth: 160 }}>
          <label className={styles.fieldLabel}>Name</label>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className={styles.field} style={{ marginBottom: 0, minWidth: 200 }}>
          <label className={styles.fieldLabel}>Email</label>
          <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className={styles.field} style={{ marginBottom: 0, minWidth: 100 }}>
          <label className={styles.fieldLabel}>Role</label>
          <select className={styles.select} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {role !== "dev" && (
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 130 }}>
            <label className={styles.fieldLabel}>Team</label>
            <select className={styles.select} value={segment} onChange={(e) => setSegment(e.target.value)}>
              {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
        <button className={styles.btnPrimary} type="submit">+ Add</button>
      </form>

      {loading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : profiles.length === 0 ? (
        <div className={styles.emptyState}>No one on the roster yet — add yourself first.</div>
      ) : (
        <table className={styles.table}>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>Signed In</th></tr></thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.email}</td>
                <td>
                  <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12 }} value={p.role} onChange={(e) => updateRole(p, e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td>
                  {p.role === "dev" ? (
                    <span style={{ color: "var(--text-faint)" }}>—</span>
                  ) : (
                    <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12 }} value={p.segment || ""} onChange={(e) => updateSegment(p, e.target.value)}>
                      {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </td>
                <td>{p.auth_id ? <span style={{ color: "var(--success-fg)" }}>Yes</span> : <span style={{ color: "var(--text-faint)" }}>Not yet</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
