"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchNonDidProducts } from "./nonDidProducts";

// Round 488 — name box for a non-DID product: type anything (free text — it is
// added to the shared list on submit) or click a saved product to reuse its
// exact spelling.
export default function NonDidProductPicker({ styles, value, onChange }) {
  const [products, setProducts] = useState([]);
  const [focused, setFocused] = useState(false);
  useEffect(() => { fetchNonDidProducts().then(setProducts); }, []);
  const q = (value || "").trim().toLowerCase();
  const matches = useMemo(() => products.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 8), [products, q]);
  const exact = products.some((p) => p.name.toLowerCase() === q);
  return (
    <div style={{ position: "relative" }}>
      <input
        className={styles.input}
        value={value}
        placeholder="Product / campaign name (type a new one or pick a saved one)"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      <p style={{ color: "var(--text-faint)", fontSize: 11, margin: "4px 0 0" }}>
        {q ? (exact ? "Saved product — will be reused." : "New name — it will be saved to the product list.") : `${products.length} saved product(s).`}
      </p>
      {focused && matches.length > 0 && !exact && (
        <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% - 18px)", zIndex: 50, background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", maxHeight: 220, overflowY: "auto" }}>
          {matches.map((p) => (
            <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); onChange(p.name); setFocused(false); }}
              style={{ display: "flex", justifyContent: "space-between", width: "100%", textAlign: "left", background: "transparent", border: "none", color: "var(--text)", cursor: "pointer", padding: "7px 10px", fontSize: 12 }}>
              <span>{p.name}</span><span style={{ color: "var(--text-faint)", fontSize: 10 }}>{p.artist || p.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
