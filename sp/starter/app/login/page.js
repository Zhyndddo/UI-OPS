"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import styles from "../shared.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!supabase) {
      setError("Supabase isn't configured.");
      return;
    }
    setSubmitting(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (err) {
      setError(err.message === "Invalid login credentials" ? "Wrong email or password." : err.message);
      return;
    }
    router.push("/releases");
  }

  async function handleResetRequest(e) {
    e.preventDefault();
    setError(null);
    if (!supabase) {
      setError("Supabase isn't configured.");
      return;
    }
    setSubmitting(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setResetSent(true);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ width: 380 }}>
        <div className={styles.eyebrow}>// VIEENT</div>
        <h1 className={styles.title} style={{ marginBottom: 20 }}>{resetMode ? "Reset password" : "Sign in"}</h1>

        {error && <div className={styles.errorBox}>{error}</div>}

        {resetMode ? (
          resetSent ? (
            <div className={styles.emptyState}>
              Check {email} for a reset link. It'll bring you back here to set a new password.
            </div>
          ) : (
            <form onSubmit={handleResetRequest}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Email</label>
                <input className={styles.input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button className={styles.btnPrimary} type="submit" disabled={submitting} style={{ width: "100%" }}>
                {submitting ? "Sending…" : "Send reset link"}
              </button>
              <button
                type="button"
                onClick={() => { setResetMode(false); setError(null); }}
                style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 12, marginTop: 12, cursor: "pointer" }}
              >
                ← Back to sign in
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Email</label>
              <input className={styles.input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Password</label>
              <input className={styles.input} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className={styles.btnPrimary} type="submit" disabled={submitting} style={{ width: "100%" }}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => { setResetMode(true); setError(null); }}
              style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 12, marginTop: 12, cursor: "pointer" }}
            >
              Forgot password?
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
