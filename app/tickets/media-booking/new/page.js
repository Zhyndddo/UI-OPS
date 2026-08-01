"use client";

import { useEffect, useState } from "react";
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
  const [excludeDids, setExcludeDids] = useState(new Set());

  // Releases that already have a (non-deleted) Media Booking ticket don't
  // show up in the search at all — creating a duplicate from here is a
  // mistake, not a real workflow. Resending for one of them is still
  // possible, just from the release detail popup's own button instead.
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "media_booking").single();
      if (!tab) return;
      const { data: existing } = await supabase.from("tickets").select("data").eq("tab_id", tab.id).is("deleted_at", null);
      setExcludeDids(new Set((existing || []).map((t) => t.data?.releaseId).filter(Boolean)));
    })();
  }, []);

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

    // Belt-and-suspenders re-check right before insert — the excludeDids
    // filter above only reflects the picker list as of page load, so a
    // ticket for this exact release could've been created by someone else
    // (or from the release popup's Send Package Ticket button) in the
    // meantime. The DB also rejects this via
    // trg_prevent_duplicate_media_booking (see add-media-booking-dedup.sql)
    // — this check just gives a clean message instead of a raw Postgres
    // error if that race actually happens.
    const { data: dupe } = await supabase.from("tickets").select("id").eq("tab_id", tab.id).is("deleted_at", null).contains("data", { releaseId }).maybeSingle();
    if (dupe) {
      setSubmitting(false);
      setError("A Media Booking ticket for this release already exists — only one is allowed per release.");
      return;
    }

    const { error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: { releaseId, proposedPackage: proposedPackage || null },
      status: tab.default_status,
      status_log: { [tab.default_status]: new Date().toISOString() },
    });
    setSubmitting(false);
    if (insertErr) {
      // Most likely the DB trigger catching a race the check above missed.
      setError(insertErr.message.includes("only one is allowed per release") ? "A Media Booking ticket for this release already exists — only one is allowed per release." : insertErr.message);
    } else {
      router.push("/tickets/media-booking");
    }
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
                <ReleasePicker onSelect={handlePick} excludeDids={excludeDids} />
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
