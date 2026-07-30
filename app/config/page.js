"use client";

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import styles from "../shared.module.css";

const CATEGORIES = ["contract_type", "genre", "topic", "channel"];
// release_category is a fixed 2-value single choice ("New Release" /
// "Remarketing"), hardcoded directly in the New Release form and release
// detail page — not admin-configurable via lookup_options anymore.
const ROLES = ["exc", "admin", "dev"];
const TEAMS = ["AR", "Marketing", "OPS", "Design"];

export default function ConfigPage() {
  const { profile } = useAuth();
  const isDev = profile?.role === "dev";
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
              ["picDefaults", "PIC Defaults"],
              ["packageTerms", "Package Terms"],
              ["platforms", "Platforms"],
              ["designTypes", "Design Types"],
              ["sizes", "Sizes"],
              ...(isDev ? [["notifications", "Notifications"], ["sessions", "Sessions"]] : []),
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
          {section === "picDefaults" && <PicDefaultsSection />}
          {section === "packageTerms" && <PackageTermsSection />}
          {section === "platforms" && <PlatformsSection />}
          {section === "designTypes" && <DesignTypesSection />}
          {section === "sizes" && <SizesSection />}
          {section === "notifications" && isDev && <NotificationsSection />}
          {section === "sessions" && isDev && <SessionsSection />}
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
  const [inviteStatus, setInviteStatus] = useState(null);

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
    setInviteStatus(null);
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    const { data: created, error: err } = await supabase
      .from("profiles")
      .insert({
        name: name.trim(),
        email: email.trim(),
        role,
        segment: role === "dev" ? null : segment,
      })
      .select()
      .single();
    if (err) {
      setError(err.message);
      return;
    }
    setName("");
    setEmail("");
    load();

    // Send the real invite — they'll get an email to set their own
    // password. If this fails, the profile row still exists (they just
    // won't be able to log in yet) — surfaced clearly so it's not silent.
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    try {
      const res = await fetch("/api/admin/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: created.email, profileId: created.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Invite failed");
      setInviteStatus({ ok: true, email: created.email });
    } catch (inviteErr) {
      setInviteStatus({ ok: false, email: created.email, message: inviteErr.message });
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

  async function updateName(p, newName) {
    if (!newName.trim() || newName.trim() === p.name) return;
    await supabase.from("profiles").update({ name: newName.trim() }).eq("id", p.id);
    load();
  }

  // Removes both their real login and their profiles row — a real
  // delete-user API route, since removing the auth account needs the
  // service role key, which the browser never has direct access to.
  async function deleteProfile(p) {
    if (!window.confirm(`Delete "${p.name}" entirely? This removes their login too — they won't be able to sign in again unless re-invited. This can't be undone.`)) return;
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ profileId: p.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Delete failed");
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
        Add someone here with the email they'll sign in with — this sends them a real invite email to set
        their own password. They won't be recognized by the app until their row exists here.
      </p>

      {error && <div className={styles.errorBox}>{error}</div>}
      {inviteStatus && (
        <div className={inviteStatus.ok ? undefined : styles.errorBox} style={inviteStatus.ok ? { background: "#0f1f14", border: "1px solid #2e7d32", color: "#7ee6a8", borderRadius: 8, padding: "10px 14px", fontSize: 12, marginBottom: 16 } : undefined}>
          {inviteStatus.ok
            ? `Invite sent to ${inviteStatus.email}.`
            : `Profile created, but the invite email to ${inviteStatus.email} failed: ${inviteStatus.message}`}
        </div>
      )}

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
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>Signed In</th><th></th></tr></thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    className={styles.input}
                    style={{ padding: "4px 8px", fontSize: 12, minWidth: 120 }}
                    defaultValue={p.name}
                    onBlur={(e) => updateName(p, e.target.value)}
                  />
                </td>
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
                <td>
                  <button onClick={() => deleteProfile(p)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }} title="Delete this person entirely">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── PIC Defaults ────────────────────────────────────────────────────────
// Sets the "column default" PIC for a workstation — a workstation_assignments
// row with column_key='all' and release_id=null. This is the fallback used
// whenever a release has no row-level override. Every workstation page
// below already reads this default and lets a per-release override be set
// inline, but none of them exposed a way to set the DEFAULT itself — that
// used to only happen via a hardcoded SQL seed (the old "Hiếu Trần" row,
// now removed for good). This is the real UI for it.
//
// "wired: true" workstations already read/use this default in their own
// page today. "wired: false" ones (booking, package_price, stream,
// milestone) don't have any PIC concept in their UI yet — this still lets
// an admin record who owns them, ready for whenever those pages grow a
// picker of their own.
const PIC_WORKSTATIONS = [
  { key: "upload", label: "Upload", wired: true },
  { key: "pitching", label: "Pitching", wired: true },
  { key: "confirm_phase1", label: "Re-Check — Phase 1", wired: true },
  { key: "confirm_phase2", label: "Re-Check — Phase 2", wired: true },
  { key: "pre_release", label: "Pre-release", wired: true },
  { key: "booking", label: "Booking", wired: false },
  { key: "package_price", label: "Package Price Management", wired: false },
  { key: "stream", label: "Streaming", wired: false },
  { key: "milestone", label: "Milestone", wired: false },
];

function PicDefaultsSection() {
  const [profiles, setProfiles] = useState([]);
  const [defaults, setDefaults] = useState({}); // workstation -> pic_profile_id
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // workstation key currently saving

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: profs }, { data: assigns }] = await Promise.all([
      supabase.from("profiles").select("id, name").order("name"),
      supabase.from("workstation_assignments").select("workstation, pic_profile_id").is("release_id", null).eq("column_key", "all"),
    ]);
    setProfiles(profs || []);
    const map = {};
    (assigns || []).forEach((a) => (map[a.workstation] = a.pic_profile_id));
    setDefaults(map);
    setLoading(false);
  }

  async function setDefault(workstation, profileId) {
    setSaving(workstation);
    const { data: existing } = await supabase
      .from("workstation_assignments")
      .select("id")
      .eq("workstation", workstation)
      .eq("column_key", "all")
      .is("release_id", null)
      .maybeSingle();

    if (!profileId) {
      // Clearing — remove the row entirely rather than leaving a
      // null-PIC row, since pic_profile_id is not-null on this table.
      if (existing) await supabase.from("workstation_assignments").delete().eq("id", existing.id);
    } else if (existing) {
      await supabase.from("workstation_assignments").update({ pic_profile_id: profileId }).eq("id", existing.id);
    } else {
      await supabase.from("workstation_assignments").insert({ workstation, column_key: "all", release_id: null, pic_profile_id: profileId });
    }

    setDefaults((d) => ({ ...d, [workstation]: profileId || undefined }));
    setSaving(null);
  }

  if (loading) return <div style={{ color: "var(--text-faint)", fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20, maxWidth: 640 }}>
        The fallback PIC for each workstation — used whenever a release has no per-row override set on its own page.
        Changes save immediately. Set to "— Unassigned —" to clear the default entirely.
      </p>

      <table className={styles.table} style={{ maxWidth: 560 }}>
        <thead>
          <tr>
            <th>Workstation</th>
            <th>Default PIC</th>
          </tr>
        </thead>
        <tbody>
          {PIC_WORKSTATIONS.map((w) => (
            <tr key={w.key}>
              <td>
                {w.label}
                {!w.wired && (
                  <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
                    Not yet shown on its own page — recorded here for now
                  </div>
                )}
              </td>
              <td>
                <select
                  className={styles.select}
                  style={{ minWidth: 160 }}
                  value={defaults[w.key] || ""}
                  disabled={saving === w.key}
                  onChange={(e) => setDefault(w.key, e.target.value)}
                >
                  <option value="">— Unassigned —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Package Terms ───────────────────────────────────────────────────────
// Two pieces, both shown on the magic-link pick-package page under a
// package's name: (1) each real contract_type's own canned terms_text
// (contract_type_packages.terms_text — VĨNH VIỄN/05 năm/02 năm etc.),
// (2) the 2 shared blocks every real package shows alongside its own
// terms (global_settings). Both save on blur, immediate-write like
// everything else in this app.
function PackageTermsSection() {
  const [packages, setPackages] = useState([]);
  const [sharedA, setSharedA] = useState("");
  const [conditions, setConditions] = useState("");
  const [sharedB, setSharedB] = useState("");
  const [loading, setLoading] = useState(true);
  const [savedKey, setSavedKey] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: pkgs }, { data: settings }] = await Promise.all([
      supabase.from("contract_type_packages").select("id, contract_type, terms_text").order("contract_type"),
      supabase.from("global_settings").select("key, value").in("key", ["package_terms_shared_a", "package_terms_conditions", "package_terms_shared_b"]),
    ]);
    setPackages(pkgs || []);
    const byKey = {};
    (settings || []).forEach((s) => (byKey[s.key] = s.value));
    setSharedA(byKey.package_terms_shared_a || "");
    setConditions(byKey.package_terms_conditions || "");
    setSharedB(byKey.package_terms_shared_b || "");
    setLoading(false);
  }

  function flashSaved(key) {
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500);
  }

  async function savePackageTerms(pkg, value) {
    setPackages((prev) => prev.map((p) => (p.id === pkg.id ? { ...p, terms_text: value } : p)));
    await supabase.from("contract_type_packages").update({ terms_text: value || null }).eq("id", pkg.id);
    flashSaved(pkg.id);
  }

  async function saveShared(key, value) {
    await supabase.from("global_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    flashSaved(key);
  }

  if (loading) return <div style={{ color: "var(--text-faint)", fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20, maxWidth: 640 }}>
        Fixed wording shown under each package's name on the magic-link page — picking a given contract type
        always shows the same terms every time. Changes save on blur.
      </p>

      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 10 }}>
        Per-Package Terms
      </div>
      <div style={{ display: "grid", gap: 16, marginBottom: 28, maxWidth: 640 }}>
        {packages.map((p) => (
          <div key={p.id}>
            <label className={styles.fieldLabel} style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
              <span>{p.contract_type}</span>
              {savedKey === p.id && <span style={{ color: "var(--success-fg)", fontWeight: 400 }}>Saved</span>}
            </label>
            <textarea
              className={styles.textarea}
              style={{ width: "100%", minHeight: 60, fontSize: 12 }}
              defaultValue={p.terms_text || ""}
              placeholder="No terms text — nothing extra shown for this package."
              onBlur={(e) => savePackageTerms(p, e.target.value)}
            />
          </div>
        ))}
        {packages.length === 0 && <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No contract-type packages found.</div>}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 10 }}>
        Shared Terms
      </div>
      <p style={{ fontSize: 10, color: "var(--text-dim)", marginTop: -6, marginBottom: 12 }}>
        Fixed render order on the magic-link page: Intro → Conditions → this package's own terms (above) → the
        5/2-năm note (only shown for those 2 tiers).
      </p>
      <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
        <div>
          <label className={styles.fieldLabel} style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
            <span>Intro (shown first)</span>
            {savedKey === "package_terms_shared_a" && <span style={{ color: "var(--success-fg)", fontWeight: 400 }}>Saved</span>}
          </label>
          <textarea
            className={styles.textarea}
            style={{ width: "100%", minHeight: 60, fontSize: 12 }}
            defaultValue={sharedA}
            onBlur={(e) => { setSharedA(e.target.value); saveShared("package_terms_shared_a", e.target.value); }}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
            <span>Conditions (shown second, before this package's own terms)</span>
            {savedKey === "package_terms_conditions" && <span style={{ color: "var(--success-fg)", fontWeight: 400 }}>Saved</span>}
          </label>
          <textarea
            className={styles.textarea}
            style={{ width: "100%", minHeight: 70, fontSize: 12 }}
            defaultValue={conditions}
            onBlur={(e) => { setConditions(e.target.value); saveShared("package_terms_conditions", e.target.value); }}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
            <span>5/2-năm note (shown last, 5-năm/2-năm packages only)</span>
            {savedKey === "package_terms_shared_b" && <span style={{ color: "var(--success-fg)", fontWeight: 400 }}>Saved</span>}
          </label>
          <textarea
            className={styles.textarea}
            style={{ width: "100%", minHeight: 110, fontSize: 12 }}
            defaultValue={sharedB}
            onBlur={(e) => { setSharedB(e.target.value); saveShared("package_terms_shared_b", e.target.value); }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Notifications ────────────────────────────────────────────────────────
// Dev-only master switches for the notification system (Config item 5):
// in-app notifications on new ticket / ticket complete (fanned out by DB
// trigger — see add-notifications.sql), and the daily digest email (sent
// by /api/cron/daily-digest, scheduled via vercel.json's hourly cron; the
// digest_hour/digest_last_sent_date fields here are what makes it actually
// fire once, at the configured hour, despite the coarser hourly poll).
function NotificationsSection() {
  const [settings, setSettings] = useState(null);
  const [recipientsDraft, setRecipientsDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("notification_settings").select("*").eq("id", 1).maybeSingle();
    setSettings(data);
    setRecipientsDraft((data?.digest_recipients || []).join(", "));
    setLoading(false);
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function updateSetting(patch) {
    setSettings((prev) => ({ ...prev, ...patch }));
    await supabase.from("notification_settings").update(patch).eq("id", 1);
    flashSaved();
  }

  function saveRecipients() {
    const list = recipientsDraft.split(",").map((s) => s.trim()).filter(Boolean);
    updateSetting({ digest_recipients: list });
  }

  async function sendTestDigest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/cron/daily-digest?force=1");
      const body = await res.json();
      setTestResult(body);
    } catch (e) {
      setTestResult({ error: e.message });
    }
    setTesting(false);
  }

  if (loading || !settings) return <div style={{ color: "var(--text-faint)", fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
        Master switches for the notification system — dev only. When off, no in-app notifications fire and no digest
        email is sent, regardless of the sub-settings below.
      </p>

      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, cursor: "pointer" }}>
        <input type="checkbox" checked={settings.enabled} onChange={(e) => updateSetting({ enabled: e.target.checked })} />
        <span style={{ fontSize: 13, fontWeight: 700 }}>Notifications enabled</span>
        {saved && <span style={{ color: "var(--success-fg)", fontSize: 11 }}>Saved</span>}
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, cursor: "pointer", opacity: settings.enabled ? 1 : 0.5 }}>
        <input
          type="checkbox"
          checked={settings.notify_team_on_complete}
          disabled={!settings.enabled}
          onChange={(e) => updateSetting({ notify_team_on_complete: e.target.checked })}
        />
        <span style={{ fontSize: 12 }}>Also notify the executor team (not just the requester) when a ticket completes</span>
      </label>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>
          Daily Digest Email
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 10, flexWrap: "wrap" }}>
          <div>
            <label className={styles.fieldLabel} style={{ fontSize: 10 }}>Hour (UTC)</label>
            <select
              className={styles.select}
              style={{ minWidth: 100 }}
              value={settings.digest_hour}
              onChange={(e) => updateSetting({ digest_hour: parseInt(e.target.value, 10) })}
            >
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select>
          </div>
        </div>
        <p style={{ fontSize: 10, color: "#d99", marginTop: -4, marginBottom: 10 }}>
          On Vercel's Hobby plan, cron jobs are capped at once/day — the actual send time is fixed by vercel.json's
          schedule (currently 00:00 UTC), not this picker. Changing it here records intent but needs vercel.json
          edited + redeployed to actually move the send time, unless the project is on a paid Vercel plan with an
          hourly cron schedule, where this picker becomes live.
        </p>
        <label className={styles.fieldLabel} style={{ fontSize: 10 }}>Recipients (comma-separated emails — blank = every admin/dev)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className={styles.input}
            style={{ flex: 1 }}
            value={recipientsDraft}
            onChange={(e) => setRecipientsDraft(e.target.value)}
            onBlur={saveRecipients}
            placeholder="alice@vieent.com, bob@vieent.com"
          />
        </div>
        <p style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 10 }}>
          Sent via SMTP through a real mailbox (SMTP_HOST/SMTP_USER/SMTP_PASS in the deployment's environment) — no
          domain ownership needed. Without those set, "Send test" below still computes the digest but reports the
          email as unsent.
        </p>
        <button className={styles.btnSecondary} onClick={sendTestDigest} disabled={testing} style={{ marginTop: 10 }}>
          {testing ? "Sending…" : "Send test digest now"}
        </button>
        {testResult && (
          <pre style={{ marginTop: 10, fontSize: 10, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: 10, overflowX: "auto", maxHeight: 200 }}>
            {JSON.stringify(testResult, null, 2)}
          </pre>
        )}
      </div>
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

function SessionsSection() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (supabase) load();
  }, []);

  async function authHeader() {
    const { data } = await supabase.auth.getSession();
    return { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token}` };
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/list-sessions", { headers: await authHeader() });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load sessions");
      setSessions(body.sessions);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function kick(s) {
    if (!window.confirm(`Kick ${s.profile?.name || s.email}? They'll be signed out within about a minute.`)) return;
    setBusyId(s.authId);
    try {
      const res = await fetch("/api/admin/kick-user", { method: "POST", headers: await authHeader(), body: JSON.stringify({ authId: s.authId }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to kick");
      load();
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  async function restore(s) {
    setBusyId(s.authId);
    try {
      const res = await fetch("/api/admin/restore-user", { method: "POST", headers: await authHeader(), body: JSON.stringify({ authId: s.authId }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to restore");
      load();
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  function fmtWhen(iso) {
    if (!iso) return "Never signed in";
    return new Date(iso).toLocaleString();
  }

  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
        dev-only. "Last sign-in" is the closest thing Supabase offers to a live session list — there's no
        literal "currently open tabs" view. Kicking someone signs them out within about a minute (their
        current token has to actually try to refresh before the ban takes effect), not instantly.
      </p>

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : sessions.length === 0 ? (
        <div className={styles.emptyState}>No linked accounts yet.</div>
      ) : (
        <table className={styles.table}>
          <thead><tr><th>Name</th><th>Email</th><th>Team</th><th>Last Sign-in</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.authId}>
                <td>{s.profile?.name || "— unlinked —"}</td>
                <td style={{ fontSize: 12 }}>{s.email}</td>
                <td>{s.profile?.segment || (s.profile?.role === "dev" ? "dev" : "—")}</td>
                <td style={{ fontSize: 12, color: "var(--text-faint)" }}>{fmtWhen(s.lastSignInAt)}</td>
                <td>
                  {s.isKicked ? (
                    <span className={styles.statusBadge} style={{ background: "var(--error-bg)", color: "var(--error-fg)" }}>Kicked</span>
                  ) : (
                    <span className={styles.statusBadge} style={{ background: "var(--success-bg)", color: "var(--success-fg)" }}>Active</span>
                  )}
                </td>
                <td>
                  {s.isKicked ? (
                    <button className={styles.btnSmall} disabled={busyId === s.authId} onClick={() => restore(s)}>Restore</button>
                  ) : (
                    <button className={styles.btnSmall} disabled={busyId === s.authId} onClick={() => kick(s)} style={{ color: "var(--error-fg)" }}>Kick</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
