"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "./supabaseClient";
import { TICKET_CONFIGS } from "./ticketConfigs";
import styles from "../app/shared.module.css";

export default function NewTicketPage({ typeKey, basePath }) {
  const config = TICKET_CONFIGS[typeKey];
  const router = useRouter();
  const initial = {};
  (config?.fields || []).forEach((f) => (initial[f.key] = ""));
  const [form, setForm] = useState(initial);
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const missing = config.fields.filter((f) => f.required && !form[f.key]?.trim());
    if (missing.length > 0) {
      setError(`${missing.map((f) => f.label).join(", ")} required.`);
      return;
    }
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id").eq("key", typeKey).single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError(`Couldn't find the ${config.label} ticket type — did schema.sql get redeployed?`);
      return;
    }
    const { error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: form,
      deadline: deadline || null,
    });
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else router.push(basePath);
  }

  if (!config) return <div className={styles.page}><div className={styles.container}>Unknown ticket type: {typeKey}</div></div>;

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 640 }}>
        <Link href={basePath} className={styles.backLink}>← Back</Link>
        <div className={styles.eyebrow}>// New Ticket</div>
        <h1 className={styles.title}>{config.label}</h1>

        {error && <div className={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.grid2}>
            {config.fields.filter((f) => f.type !== "textarea").map((f) => (
              <div key={f.key} className={styles.field}>
                <label className={styles.fieldLabel}>
                  {f.label} {f.required && <span className={styles.required}>*</span>}
                </label>
                <input
                  type={f.type === "date" ? "date" : "text"}
                  className={styles.input}
                  value={form[f.key]}
                  onChange={(e) => update(f.key, e.target.value)}
                />
              </div>
            ))}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Deadline</label>
              <input type="date" className={styles.input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>

          {config.fields.filter((f) => f.type === "textarea").map((f) => (
            <div key={f.key} className={styles.field}>
              <label className={styles.fieldLabel}>
                {f.label} {f.required && <span className={styles.required}>*</span>}
              </label>
              <textarea className={styles.textarea} value={form[f.key]} onChange={(e) => update(f.key, e.target.value)} />
            </div>
          ))}

          <button className={styles.btnPrimary} type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Ticket"}
          </button>
        </form>
      </div>
    </div>
  );
}
