"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import styles from "../shared.module.css";

// Landed on from the invite email link. Supabase's redirect already
// carries a valid recovery-type session by the time this page loads
// (handled automatically by the client library reading the URL) — this
// just collects the password itself.
export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password needs to be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (!supabase) {
      setError("Supabase isn't configured.");
      return;
    }
    setSubmitting(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/releases"), 1500);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ width: 380 }}>
        <div className={styles.eyebrow}>// VIEENT</div>
        <h1 className={styles.title} style={{ marginBottom: 8 }}>Set your password</h1>
        <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
          Welcome — pick a password to finish setting up your account.
        </p>

        {error && <div className={styles.errorBox}>{error}</div>}

        {done ? (
          <div className={styles.emptyState}>Password set — taking you in…</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>New password</label>
              <input className={styles.input} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Confirm password</label>
              <input className={styles.input} type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <button className={styles.btnPrimary} type="submit" disabled={submitting} style={{ width: "100%" }}>
              {submitting ? "Setting…" : "Set password & continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
