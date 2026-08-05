"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../../lib/AppShell";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuth } from "../../../../lib/AuthContext";
import { BATCH_ITEM_COLUMNS, parseBatchPaste } from "../../../../lib/phaiSinhBatchParse";
import styles from "../../../shared.module.css";

// Creates ONE batch ticket plus however many phai_sinh_batch_items rows
// come out of the pasted block — this is the "instead of 100 tickets,
// request that one batch as 1 row" flow. Paste a range copied straight
// out of a sheet built like the "NHẠC SỐ Nguyễn Văn Chung x VIEENT —
// TRACKING LIST" example (see BATCH_ITEM_COLUMNS for the exact expected
// column order); a header row, if included, is auto-skipped.
export default function BatchPhaiSinhNewTicket() {
  const router = useRouter();
  const { profile } = useAuth();

  const [batchLabel, setBatchLabel] = useState("");
  const [mainArtist, setMainArtist] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { rows: parsedRows, skipped } = parseBatchPaste(pasteText);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!batchLabel.trim()) {
      setError("Batch label required.");
      return;
    }
    if (parsedRows.length === 0) {
      setError("Paste at least one song row first — nothing parsed from the box below.");
      return;
    }
    if (!supabase) {
      setError("Supabase isn't configured — check environment variables.");
      return;
    }
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "batch_phai_sinh").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Phái Sinh (Batch) ticket type — did schema.sql / add-round33-batch-phai-sinh.sql get run?");
      return;
    }
    const { data: created, error: insertErr } = await supabase
      .from("tickets")
      .insert({
        tab_id: tab.id,
        data: { batchLabel: batchLabel.trim(), mainArtist: mainArtist.trim() },
        status: tab.default_status,
        status_log: { [tab.default_status]: new Date().toISOString() },
        requester_segment: profile?.segment || null,
        requester_name: profile?.name || null,
      })
      .select()
      .single();
    if (insertErr || !created) {
      setSubmitting(false);
      setError(insertErr?.message || "Couldn't create the batch ticket.");
      return;
    }
    const { error: itemsErr } = await supabase.from("phai_sinh_batch_items").insert(
      parsedRows.map((r) => ({ ...r, batch_ticket_id: created.id }))
    );
    setSubmitting(false);
    if (itemsErr) {
      setError(`Batch created, but songs failed to import: ${itemsErr.message}. Open the batch and use "+ Add via paste" to retry.`);
      return;
    }
    router.push(`/tickets/batch-phai-sinh/${created.id}`);
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 760 }}>
          <Link href="/tickets/batch-phai-sinh" className={styles.backLink}>← Back</Link>
          <div className={styles.eyebrow}>// New Batch</div>
          <h1 className={styles.title}>Phái Sinh (Batch)</h1>

          {error && <div className={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Batch Label <span className={styles.required}>*</span></label>
                <input className={styles.input} value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder="e.g. NHẠC SỐ Nguyễn Văn Chung x VIEENT" />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Main Artist</label>
                <input className={styles.input} value={mainArtist} onChange={(e) => setMainArtist(e.target.value)} placeholder="e.g. Nguyễn Văn Chung" />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Paste Songs (from Excel/Sheets)</label>
              <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 0, marginBottom: 6 }}>
                Expected column order: {BATCH_ITEM_COLUMNS.join(" · ")}. Copy a range with these columns (a header
                row is fine, it's auto-skipped) and paste below — one song per line.
              </p>
              <textarea
                className={styles.textarea}
                style={{ minHeight: 220, fontFamily: "monospace", fontSize: 11 }}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste tab-separated rows here…"
              />
              <p style={{ fontSize: 12, marginTop: 6, color: parsedRows.length > 0 ? "var(--success-fg)" : "var(--text-faint)" }}>
                {parsedRows.length} song{parsedRows.length === 1 ? "" : "s"} parsed{skipped > 0 ? `, ${skipped} blank line${skipped === 1 ? "" : "s"} skipped` : ""}.
              </p>
            </div>

            <button className={styles.btnPrimary} type="submit" disabled={submitting}>
              {submitting ? "Creating…" : `Create Batch (${parsedRows.length} song${parsedRows.length === 1 ? "" : "s"})`}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
