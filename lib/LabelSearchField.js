"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import FloatingMenu from "./FloatingMenu";

// Round 493 — text box with search over the Labels list (labels.label_name).
// Free text is allowed (a label that isn't on the list yet still saves as typed);
// clicking a match fills the exact spelling.
export default function LabelSearchField({ styles, value, onChange, placeholder }) {
  const [labels, setLabels] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("labels").select("label_name, default_lbl_tag").order("label_name").then(({ data }) => setLabels(data || []));
  }, []);
  useEffect(() => {
    function onDocClick(e) {
      if (e.target?.closest?.("[data-floating-menu]")) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const q = (value || "").trim().toLowerCase();
  const matches = labels.filter((l) => l.label_name && (!q || l.label_name.toLowerCase().includes(q))).slice(0, 8);
  const exact = labels.some((l) => (l.label_name || "").toLowerCase() === q);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        className={styles.input}
        value={value || ""}
        placeholder={placeholder || "Label (search or type)"}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && matches.length > 0 && !exact && (
        <FloatingMenu anchorRef={wrapRef} maxHeight={240} style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
          {matches.map((l) => (
            <div
              key={l.label_name}
              onClick={() => { onChange(l.label_name); setOpen(false); }}
              style={{ padding: "7px 8px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 8 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: "var(--text)" }}>{l.label_name}</span>
              <span style={{ color: "var(--text-faint)", fontSize: 10 }}>{(l.default_lbl_tag || "").replace("LBL_", "")}</span>
            </div>
          ))}
        </FloatingMenu>
      )}
    </div>
  );
}
