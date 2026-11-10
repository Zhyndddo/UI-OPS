"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { FILTER_GROUPS, FILTER_FIELDS, FIELD_BY_KEY, choicesFor } from "./releaseFilterCatalog";

// Round 590 — Releases dashboard "Advanced filter": a collapsible panel with one tab per group (General / Data & Legal / Marketing /
// Process), every field of the release detail page as a Yes/No/value picker, and a chips row that shows (and clears) everything that
// is active — including the filters the stat cards set. The parent owns the values; this file only draws them.
//
// props
//   values      { fieldKey: value }       current value of every field ("" / undefined = any)
//   onChange    (fieldKey, value) => void
//   onClear     () => void                clears all advanced fields (the parent decides what that includes)
//   options     { project_type: [[v,l]], requester_segment: [[v,l]], stage: [...], created: [...] }   choices for the "core" fields
//   tagSlot     node                       the existing tag autocomplete, shown inside the General tab
//   styles      the page's shared css module

export function AdvFilterButton({ styles, open, onToggle, count }) {
  return (
    <button type="button" className={styles.btnSecondary} onClick={onToggle} aria-expanded={open}
      style={{ ...(count ? { borderColor: "#ff7a1a", color: "#ff7a1a" } : {}) }}>
      ⚙ Advanced filter{count ? ` (${count})` : ""} {open ? "▴" : "▾"}
    </button>
  );
}

// text box that only sends its value on Enter / blur (so typing does not run a database query per keystroke)
function TextCommit({ value, onCommit, styles, placeholder }) {
  const [v, setV] = useState(value || "");
  useEffect(() => { setV(value || ""); }, [value]);
  const commit = () => { if ((value || "") !== v.trim()) onCommit(v.trim()); };
  return (
    <input className={styles.input} value={v} placeholder={placeholder || "contains…"} onChange={(e) => setV(e.target.value)}
      onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />
  );
}

export function labelOfValue(fld, value, dynamic, coreOptions) {
  if (fld.kind === "core") {
    const hit = (coreOptions?.[fld.key] || []).find((o) => o[0] === value);
    return hit ? hit[1] : value;
  }
  if (fld.kind === "text") return `"${value}"`;
  const hit = choicesFor(fld, dynamic).find((o) => o[0] === value);
  return hit ? hit[1] : value;
}

export function AdvFilterPanel({ styles, open, values, onChange, onClear, options, tagSlot }) {
  const [tab, setTab] = useState("general");
  const [dynamic, setDynamic] = useState({});

  // genre / topic lists (same table the release detail page uses) — loaded once, the first time the panel opens
  useEffect(() => {
    if (!open || dynamic.__loaded || !supabase) return;
    supabase.from("lookup_options").select("category, value, label").eq("active", true).in("category", ["genre", "topic"]).order("sort_order")
      .then(({ data }) => {
        const by = { __loaded: true, genre: [], topic: [] };
        (data || []).forEach((r) => { if (by[r.category]) by[r.category].push([r.value, r.label || r.value]); });
        setDynamic(by);
      });
  }, [open, dynamic.__loaded]);

  const activeKeys = useMemo(() => FILTER_FIELDS.filter((fld) => {
    const v = values?.[fld.key];
    return v !== undefined && v !== null && v !== "";
  }).map((fld) => fld.key), [values]);

  const countByGroup = useMemo(() => {
    const c = {};
    activeKeys.forEach((k) => { const g = FIELD_BY_KEY[k].group; c[g] = (c[g] || 0) + 1; });
    return c;
  }, [activeKeys]);

  const sections = useMemo(() => {
    const out = [];
    FILTER_FIELDS.filter((fld) => fld.group === tab).forEach((fld) => {
      let s = out.find((x) => x.name === fld.section);
      if (!s) { s = { name: fld.section, fields: [] }; out.push(s); }
      s.fields.push(fld);
    });
    return out;
  }, [tab]);

  function control(fld) {
    const v = values?.[fld.key] ?? "";
    if (fld.key === "tag") return tagSlot || null;
    if (fld.kind === "text") return <TextCommit value={v} styles={styles} onCommit={(x) => onChange(fld.key, x)} />;
    const list = fld.kind === "core" ? (options?.[fld.key] || []) : choicesFor(fld, dynamic);
    return (
      <select className={styles.select} value={v} onChange={(e) => onChange(fld.key, e.target.value)}
        style={v ? { borderColor: "#ff7a1a" } : undefined}>
        <option value="">— any —</option>
        {list.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
      </select>
    );
  }

  return (
    <>
      {open && (
        <div style={{ flexBasis: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            {FILTER_GROUPS.map((g) => (
              <button key={g.key} type="button" onClick={() => setTab(g.key)}
                style={{ padding: "6px 14px", borderRadius: 999, fontWeight: 700, fontSize: 13, cursor: "pointer",
                  border: `1px solid ${tab === g.key ? "#ff7a1a" : "var(--border)"}`, background: tab === g.key ? "#ff7a1a" : "transparent", color: tab === g.key ? "#fff" : "inherit" }}>
                {g.label}{countByGroup[g.key] ? ` · ${countByGroup[g.key]}` : ""}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            {activeKeys.length > 0 && (
              <button type="button" onClick={onClear}
                style={{ background: "none", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "6px 12px", fontSize: 11, color: "var(--text-faint)", cursor: "pointer" }}>
                ✕ Clear advanced filters
              </button>
            )}
          </div>
          {tab === "data" && (
            <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginBottom: 8 }}>
              Copyright checks read the release-level checklist (Singles). EP / Album rights are kept per track and are not covered here.
            </div>
          )}
          {sections.map((s) => (
            <div key={s.name} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-faint)", marginBottom: 6 }}>{s.name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
                {s.fields.map((fld) => (
                  <label key={fld.key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                    <span style={{ fontWeight: 700 }}>{fld.label}</span>
                    {control(fld)}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {activeKeys.length > 0 && (
        <div style={{ flexBasis: "100%", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>Active:</span>
          {activeKeys.map((k) => {
            const fld = FIELD_BY_KEY[k];
            const grp = FILTER_GROUPS.find((g) => g.key === fld.group)?.short;
            return (
              <button key={k} type="button" onClick={() => onChange(k, "")} title={`${grp} · ${fld.section} — click to remove`}
                style={{ border: "1px solid #ff7a1a", borderRadius: 999, padding: "3px 10px", fontSize: 12, background: "rgba(255,122,26,0.10)", color: "inherit", cursor: "pointer" }}>
                {fld.label}: <b>{labelOfValue(fld, values[k], dynamic, options)}</b> ✕
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
