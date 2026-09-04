"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import styles from "../shared.module.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return;
    setSubmitting(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSubmitting(false);
    if (err) setError(err.message);
    else setSent(true);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ width: 360 }}>
        <div className={styles.eyebrow}>// VIEENT</div>
        <h1 className={styles.title} style={{ marginBottom: 20 }}>Sign in</h1>

        {sent ? (
          <div className={styles.successBox}>
            Check your inbox — click the link we sent to <strong>{email}</strong> to sign in. You'll only
            be recognized if this email is already on the team roster; ask an admin/dev to add you first
            if this is your first time.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className={styles.errorBox}>{error}</div>}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Email</label>
              <input
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@vieent.com"
              />
            </div>
            <button className={styles.btnPrimary} type="submit" disabled={submitting} style={{ width: "100%" }}>
              {submitting ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
