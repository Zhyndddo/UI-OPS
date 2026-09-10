"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../../lib/AppShell";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuth } from "../../../../lib/AuthContext";
import ReleasePicker from "../../../../lib/ReleasePicker";
import styles from "../../../shared.module.css";
// Round 281 — audit log / requester attribution
import { logTicketCreate } from "../../../../lib/auditLog";

// Round 280 — Bổ Sung DATA's creation form. Per explicit spec, this is
// deliberately just a release picker — "only need the OPS to choose the
// product in an index field (type in will search anything from product
// name to artist name)". No other fields to fill in: the missing-data
// checklist itself isn't chosen here, it's computed live off the picked
// release's own Metadata Checklist columns once the ticket exists (see
// app/tickets/bo-sung-data/page.js).
//
// Two entry points reach this same page, per spec: the "+ New Ticket"
// button on the ticket list itself (no releaseId param — picker starts
// empty), and a button on the New Release Setup workstation's row for a
// specific release (app/workstation/upload/page.js), which passes
// ?releaseId=<did> so the picker starts pre-filled instead of making OPS
// search for the release they were just looking at.
export default function BoSungDataNewTicket() {
  return (
    <Suspense fallback={<AppShell><div className={styles.page}><div className={styles.container}>Loading…</div></div></AppShell>}>
      <BoSungDataNewTicketInner />
    </Suspense>
  );
}

// useSearchParams() requires the component that calls it to sit inside a
// <Suspense> boundary during prerendering (Next.js app router) — same
// pattern as app/workstation/confirm/page.js.
function BoSungDataNewTicketInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const presetDid = searchParams.get("releaseId");

  const [release, setRelease] = useState(null); // { id, did, title, main_artist, label }
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState(!!presetDid);

  useEffect(() => {
    if (!presetDid || !supabase) { setLoadingPreset(false); return; }
    supabase
      .from("releases")
      .select("id, did, title, main_artist, label")
      .eq("did", presetDid)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setRelease(data);
        setLoadingPreset(false);
      });
  }, [presetDid]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!release) {
      setError("Pick a release first.");
      return;
    }
    if (!supabase) {
      setError("Supabase isn't configured — check environment variables.");
      return;
    }
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "bo_sung_data").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Bổ Sung DATA ticket type — did the Round 280 SQL migration get run?");
      return;
    }
    // One OPEN (not yet COMPLETE) ticket per release at a time — no point
    // in two people independently tracking the same checklist. A release
    // whose earlier ticket already completed can still get a new one if
    // data goes missing again later (e.g. a field gets walked back).
    const { data: existing } = await supabase
      .from("tickets")
      .select("id, status")
      .eq("tab_id", tab.id)
      .is("deleted_at", null)
      .contains("data", { releaseId: release.did })
      .neq("status", "COMPLETE")
      .maybeSingle();
    if (existing) {
      setSubmitting(false);
      setError("There's already an open Bổ Sung DATA ticket for this release.");
      return;
    }
    const { data: newTicket, error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: { releaseId: release.did, title: release.title, artist: release.main_artist },
      status: tab.default_status,
      status_log: { [tab.default_status]: new Date().toISOString() },
      requester_segment: profile?.segment || null,
      requester_name: profile?.name || null,
      // Round 281 — audit log / requester attribution
      requester_profile_id: profile?.id || null,
    }).select().single();
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else {
      // Round 281 — audit log / requester attribution
      logTicketCreate({ actor: profile?.id, ticketId: newTicket?.id });
      router.push("/tickets/bo-sung-data");
    }
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 560 }}>
          <Link href="/tickets/bo-sung-data" className={styles.backLink}>← Back</Link>
          <div className={styles.eyebrow}>// New Ticket</div>
          <h1 className={styles.title}>Bổ Sung DATA</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -12, marginBottom: 20 }}>
            Pick the release — AR will see whichever Metadata Checklist fields aren't done yet and work through them from here.
          </p>

          {error && <div className={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Product <span className={styles.required}>*</span></label>
              <div style={{ position: "relative" }}>
                <input
                  className={styles.input}
                  style={{ paddingRight: 34 }}
                  value={release ? `${release.title} — ${release.main_artist}` : ""}
                  readOnly
                  placeholder={loadingPreset ? "Loading…" : "Search by product name or artist…"}
                />
                <ReleasePicker onSelect={setRelease} />
              </div>
            </div>

            {release && (
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>DID</label>
                  <input className={styles.input} value={release.did || ""} readOnly />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Label</label>
                  <input className={styles.input} value={release.label || ""} readOnly />
                </div>
              </div>
            )}

            <button className={styles.btnPrimary} type="submit" disabled={submitting || loadingPreset}>
              {submitting ? "Creating…" : "Create Ticket"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
