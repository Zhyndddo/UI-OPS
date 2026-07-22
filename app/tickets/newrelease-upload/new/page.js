"use client";

import AppShell from "../../../../lib/AppShell";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabaseClient";
import styles from "../../../shared.module.css";

const EMPTY = { releaseId: "", upc: "", label: "", project: "", artist: "", featureArtist: "", drive: "", note: "" };

export default function NewNewreleaseUploadTicket() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.project.trim() || !form.artist.trim()) {
      setError("Project and Artist are required.");
      return;
    }
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id").eq("key", "newrelease_upload").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Newrelease Upload ticket type — did schema.sql get redeployed?");
      return;
    }
    const { error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: form,
      deadline: deadline || null,
    });
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else router.push("/tickets/newrelease-upload");
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 640 }}>
        <Link href="/tickets/newrelease-upload" className={styles.backLink}>← Back</Link>
        <div className={styles.eyebrow}>// New Ticket</div>
        <h1 className={styles.title}>Newrelease Upload</h1>

        {error && <div className={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Release (DID)</label>
              <input className={styles.input} value={form.releaseId} onChange={(e) => update("releaseId", e.target.value)} placeholder="link to a New Release, optional" />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>UPC</label>
              <input className={styles.input} value={form.upc} onChange={(e) => update("upc", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Label</label>
              <input className={styles.input} value={form.label} onChange={(e) => update("label", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Project <span className={styles.required}>*</span></label>
              <input className={styles.input} value={form.project} onChange={(e) => update("project", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Artist <span className={styles.required}>*</span></label>
              <input className={styles.input} value={form.artist} onChange={(e) => update("artist", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Feature Artist</label>
              <input className={styles.input} value={form.featureArtist} onChange={(e) => update("featureArtist", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Drive</label>
              <input className={styles.input} value={form.drive} onChange={(e) => update("drive", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Deadline</label>
              <input type="date" className={styles.input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Note</label>
            <textarea className={styles.textarea} value={form.note} onChange={(e) => update("note", e.target.value)} />
          </div>
          <button className={styles.btnPrimary} type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Ticket"}
          </button>
        </form>
      </div>
    </div>
    </AppShell>
  );
}
