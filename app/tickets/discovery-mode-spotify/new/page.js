"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../../lib/AppShell";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuth } from "../../../../lib/AuthContext";
import ReleasePicker from "../../../../lib/ReleasePicker";
import { fmtDate } from "../../../../lib/helpers";
import styles from "../../../shared.module.css";

// Bespoke manual-creation form per explicit spec — "only have 5 fields
// DID (search-able, auto fill the others), url LBM, name of product,
// artist, release date." Url LBM/name/artist/release date all live on the
// release itself (same "map directly back" idiom as Sony Publish/Music
// Video on Spotify), so — like those two — this form only ever creates
// the ticket with { releaseId }; the 4 auto-filled fields are shown here
// purely for the requester to confirm they've picked the right release,
// read-only except Url LBM (editable here too since a requester may be
// the first person to have it on hand — writes straight to the release,
// same convention as the executing ticket list's own Url LBM cell).
export default function DiscoveryModeSpotifyNewTicket() {
  const router = useRouter();
  const { profile } = useAuth();

  const [release, setRelease] = useState(null); // { id, did, title, main_artist, label, release_date }
  const [linkLbm, setLinkLbm] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSelect(r) {
    setRelease(r);
    setLinkLbm("");
    // link_lbm isn't part of ReleasePicker's own select, so fetch it
    // separately once a release is picked.
    if (supabase) {
      supabase.from("releases").select("link_lbm").eq("id", r.id).single().then(({ data }) => setLinkLbm(data?.link_lbm || ""));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!release) {
      setError("Pick a release (DID) first.");
      return;
    }
    if (!supabase) {
      setError("Supabase isn't configured — check environment variables.");
      return;
    }
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "discovery_mode_spotify").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Discovery Mode on Spotify ticket type — did schema.sql get redeployed?");
      return;
    }
    const { data: dupe } = await supabase
      .from("tickets")
      .select("id")
      .eq("tab_id", tab.id)
      .is("deleted_at", null)
      .contains("data", { releaseId: release.did })
      .maybeSingle();
    if (dupe) {
      setSubmitting(false);
      setError("A Discovery Mode on Spotify ticket for this release already exists — only one is allowed per release.");
      return;
    }
    if (linkLbm.trim()) {
      await supabase.from("releases").update({ link_lbm: linkLbm.trim() }).eq("id", release.id);
    }
    const { error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: { releaseId: release.did },
      status: tab.default_status,
      status_log: { [tab.default_status]: new Date().toISOString() },
      requester_segment: profile?.segment || null,
      requester_name: profile?.name || null,
    });
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else router.push("/tickets/discovery-mode-spotify");
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 640 }}>
          <Link href="/tickets/discovery-mode-spotify" className={styles.backLink}>← Back</Link>
          <div className={styles.eyebrow}>// New Ticket</div>
          <h1 className={styles.title}>Discovery Mode on Spotify</h1>

          {error && <div className={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>DID <span className={styles.required}>*</span></label>
              <div style={{ position: "relative" }}>
                <input
                  className={styles.input}
                  style={{ paddingRight: 34 }}
                  value={release ? `${release.did} — ${release.title}` : ""}
                  readOnly
                  placeholder="Search and pick a release…"
                />
                <ReleasePicker onSelect={handleSelect} />
              </div>
            </div>

            {release && (
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Url LBM</label>
                  <input className={styles.input} value={linkLbm} onChange={(e) => setLinkLbm(e.target.value)} placeholder="https://…" />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Name Of Product</label>
                  <input className={styles.input} value={release.title || ""} readOnly />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Artist</label>
                  <input className={styles.input} value={release.main_artist || ""} readOnly />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Release Date</label>
                  <input className={styles.input} value={fmtDate(release.release_date)} readOnly />
                </div>
              </div>
            )}

            <button className={styles.btnPrimary} type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create Ticket"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
