"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import styles from "../shared.module.css";

// TEMPORARY pseudo sign-in — real magic-link auth is bugged. Pick your
// identity from the existing roster, no verification at all. See
// lib/AuthContext.js for how to restore the real flow later.
export default function LoginPage() {
  const router = useRouter();
  const { signInAs } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("profiles").select("*").order("name").then(({ data }) => {
      setProfiles(data || []);
      setLoading(false);
    });
  }, []);

  async function pick(p) {
    await signInAs(p);
    router.push("/");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ width: 420 }}>
        <div className={styles.eyebrow}>// VIEENT</div>
        <h1 className={styles.title} style={{ marginBottom: 8 }}>Sign in</h1>
        <div className={styles.errorBox} style={{ background: "#1a1a1a", borderColor: "#5a4a1a", color: "#ffca4d" }}>
          Temporary pseudo sign-in — real login is being fixed. Pick who you are below, no password or
          verification involved. Not secure — for internal testing only.
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading roster…</div>
        ) : profiles.length === 0 ? (
          <div className={styles.emptyState}>
            No one on the roster yet. Add the first admin/dev row directly via the Supabase SQL editor.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => pick(p)}
                style={{
                  textAlign: "left",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                  {p.email} · {p.role}{p.segment ? ` · ${p.segment}` : ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
