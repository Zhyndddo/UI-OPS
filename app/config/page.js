"use client";

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import styles from "../shared.module.css";

const CATEGORIES = ["contract_type", "genre", "topic", "channel", "release_category"];
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

          <div style={{ display: "flex", gap: 4, marginBottom: 24, flexWrap: "wrap" }}>
            {[
              ["lookups", "Lookup Options"],
              ["team", "Team"],
              ["platforms", "Platforms"],
              ["designTypes", "Design Types"],
              ["sizes", "Sizes"],
            ].map(([key, label]) => (
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

          {section === "lookups" && <LookupOptionsSection />}
          {section === "team" && <TeamSection />}
          {section === "platforms" && <PlatformsSection />}
          {section === "designTypes" && <DesignTypesSection />}
          {section === "sizes" && <SizesSection />}
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

// ── Platforms — flat list, matches v1's renderSimpleList exactly ──────────
function PlatformsSection() {
  const [platforms, setPlatforms] = useState([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (supabase) load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("design_platforms").select("*").order("sort_order");
    setPlatforms(data || []);
    setLoading(false);
  }

  async function add(e) {
    e.preventDefault();
    const val = newName.trim();
    if (!val) return;
    if (platforms.some((p) => p.name.toLowerCase() === val.toLowerCase())) return;
    const maxSort = Math.max(-1, ...platforms.map((p) => p.sort_order));
    await supabase.from("design_platforms").insert({ name: val, sort_order: maxSort + 1 });
    setNewName("");
    load();
  }

  async function remove(p) {
    await supabase.from("design_platforms").delete().eq("id", p.id);
    load();
  }

  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 16 }}>
        Deleting a platform also removes its design types and their sizes (cascades).
      </p>
      <form onSubmit={add} style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input className={styles.input} style={{ maxWidth: 300 }} placeholder="Add platform…" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className={styles.btnPrimary} type="submit">+ Add</button>
      </form>
      {loading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {platforms.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 14px" }}>
              <span>{p.name}</span>
              <button onClick={() => remove(p)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Design Types — map keyed by Platform, matches v1's renderMapList ──────
function DesignTypesSection() {
  const [platforms, setPlatforms] = useState([]);
  const [types, setTypes] = useState([]);
  const [platformId, setPlatformId] = useState("");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (supabase) load(); }, []);

  async function load() {
    setLoading(true);
    const { data: p } = await supabase.from("design_platforms").select("*").order("sort_order");
    const { data: t } = await supabase.from("design_types").select("*").order("sort_order");
    setPlatforms(p || []);
    setTypes(t || []);
    setLoading(false);
  }

  async function add(e) {
    e.preventDefault();
    const val = newName.trim();
    if (!val || !platformId) return;
    const siblings = types.filter((t) => t.platform_id === platformId);
    if (siblings.some((t) => t.name.toLowerCase() === val.toLowerCase())) return;
    const maxSort = Math.max(-1, ...siblings.map((t) => t.sort_order));
    await supabase.from("design_types").insert({ platform_id: platformId, name: val, sort_order: maxSort + 1 });
    setNewName("");
    load();
  }

  async function remove(t) {
    await supabase.from("design_types").delete().eq("id", t.id);
    load();
  }

  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 16 }}>
        Deleting a design type also removes its sizes (cascades).
      </p>
      <form onSubmit={add} style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <select className={styles.select} style={{ maxWidth: 220 }} value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
          <option value="">Select platform</option>
          {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className={styles.input} style={{ maxWidth: 260 }} placeholder="Add design type…" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className={styles.btnPrimary} type="submit">+ Add</button>
      </form>
      {loading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : (
        platforms.map((p) => {
          const group = types.filter((t) => t.platform_id === p.id);
          if (group.length === 0) return null;
          return (
            <div key={p.id} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>{p.name}</div>
              <div style={{ display: "grid", gap: 6 }}>
                {group.map((t) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 14px" }}>
                    <span>{t.name}</span>
                    <button onClick={() => remove(t)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Sizes — map keyed by Design Type, matches v1's renderMapList ──────────
function SizesSection() {
  const [types, setTypes] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [typeId, setTypeId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (supabase) load(); }, []);

  async function load() {
    setLoading(true);
    const { data: t } = await supabase.from("design_types").select("*").order("sort_order");
    const { data: s } = await supabase.from("design_sizes").select("*").order("sort_order");
    setTypes(t || []);
    setSizes(s || []);
    setLoading(false);
  }

  async function add(e) {
    e.preventDefault();
    const val = newLabel.trim();
    if (!val || !typeId) return;
    const siblings = sizes.filter((s) => s.design_type_id === typeId);
    if (siblings.some((s) => s.label.toLowerCase() === val.toLowerCase())) return;
    const maxSort = Math.max(-1, ...siblings.map((s) => s.sort_order));
    await supabase.from("design_sizes").insert({ design_type_id: typeId, label: val, sort_order: maxSort + 1 });
    setNewLabel("");
    load();
  }

  async function remove(s) {
    await supabase.from("design_sizes").delete().eq("id", s.id);
    load();
  }

  return (
    <div>
      <form onSubmit={add} style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <select className={styles.select} style={{ maxWidth: 220 }} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">Select design type</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input className={styles.input} style={{ maxWidth: 260 }} placeholder="Add size…" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        <button className={styles.btnPrimary} type="submit">+ Add</button>
      </form>
      {loading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : (
        types.map((t) => {
          const group = sizes.filter((s) => s.design_type_id === t.id);
          if (group.length === 0) return null;
          return (
            <div key={t.id} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>{t.name}</div>
              <div style={{ display: "grid", gap: 6 }}>
                {group.map((s) => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 14px" }}>
                    <span>{s.label}</span>
                    <button onClick={() => remove(s)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
