"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../../lib/AppShell";
import { supabase } from "../../../../lib/supabaseClient";
import ReleasePicker from "../../../../lib/ReleasePicker";
import styles from "../../../shared.module.css";

const TEMPLATES = ["Độc Quyền Vĩnh Viễn", "Độc Quyền 5 năm", "Độc Quyền 2 năm"];

// Modeled on Phụ Lục's simple create-form pattern (search a release, one
// key field) — "Giá Trị Phụ Lục" becomes "Propose Package" here: AR can
// optionally pre-pick which template Marketing should start from. Left
// blank when this same ticket gets auto-created from the release popup's
// "Send Package Ticket" button instead of this manual form.
export default function NewMediaBookingTicket() {
  const router = useRouter();
  const [releaseId, setReleaseId] = useState("");
  const [releaseLabel, setReleaseLabel] = useState("");
  const [proposedPackage, setProposedPackage] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handlePick(release) {
    setReleaseId(release.did);
    setReleaseLabel(`${release.title} — ${release.main_artist} (${release.did})`);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!releaseId) {
      setError("Pick a release first.");
      return;
    }
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "media_booking").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Media Booking ticket type — did schema.sql get redeployed?");
      return;
    }
    const { error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: { releaseId, proposedPackage: proposedPackage || null },
      status: tab.default_status,
      status_log: { [tab.default_status]: new Date().toISOString() },
    });
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else router.push("/tickets/media-booking");
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 560 }}>
          <Link href="/tickets/media-booking" className={styles.backLink}>← Back</Link>
          <div className={styles.eyebrow}>// New Ticket</div>
          <h1 className={styles.title}>Media Booking</h1>

          {error && <div className={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className={styles.field} style={{ position: "relative" }}>
              <label className={styles.fieldLabel}>Release <span className={styles.required}>*</span></label>
              <div style={{ position: "relative" }}>
                <input className={styles.input} style={{ paddingRight: 34 }} value={releaseLabel} readOnly placeholder="Search and pick a release…" />
                <ReleasePicker onSelect={handlePick} />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Propose Package</label>
              <select className={styles.select} value={proposedPackage} onChange={(e) => setProposedPackage(e.target.value)}>
                <option value="">— Leave for Marketing to decide —</option>
                {TEMPLATES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
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
