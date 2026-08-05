"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../../lib/AppShell";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuth } from "../../../../lib/AuthContext";
import ReleasePicker from "../../../../lib/ReleasePicker";
import { CO_TRONG_NET_DRAFT_DEFAULTS, MoTaPopup } from "../../../../lib/GateFields";
import styles from "../../../shared.module.css";

// Bespoke manual-creation form per explicit spec — "DID (search-able,
// auto fill name and artist, and label); the 4 fields above [Teaser/
// Official/Short/Mô Tả]". Mirrors the release detail page's own panel
// (lib/GateFields.js's CoTrongNetYoutubePanel) for the 4 fields, but this
// page needs its own release picker + name/artist/label display since
// there's no existing release form wrapping it here.
export default function CoTrongNetYoutubeNewTicket() {
  const router = useRouter();
  const { profile } = useAuth();

  const [release, setRelease] = useState(null); // { id, did, title, main_artist, label }
  const [draft, setDraft] = useState(CO_TRONG_NET_DRAFT_DEFAULTS);
  const [moTaOpen, setMoTaOpen] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function update(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
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
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "co_trong_net_youtube").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Có Trong Net YouTube ticket type — did schema.sql get redeployed?");
      return;
    }
    // Same idempotency guard as every other oneTicketPerRelease type.
    const { data: dupe } = await supabase
      .from("tickets")
      .select("id")
      .eq("tab_id", tab.id)
      .is("deleted_at", null)
      .contains("data", { releaseId: release.did })
      .maybeSingle();
    if (dupe) {
      setSubmitting(false);
      setError("A Có Trong Net YouTube ticket for this release already exists — only one is allowed per release.");
      return;
    }
    const { error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: { releaseId: release.did, ...draft },
      status: tab.default_status,
      status_log: { [tab.default_status]: new Date().toISOString() },
      requester_segment: profile?.segment || null,
      requester_name: profile?.name || null,
    });
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else router.push("/tickets/co-trong-net-youtube");
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 640 }}>
          <Link href="/tickets/co-trong-net-youtube" className={styles.backLink}>← Back</Link>
          <div className={styles.eyebrow}>// New Ticket</div>
          <h1 className={styles.title}>Có Trong Net YouTube</h1>

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
                <ReleasePicker onSelect={setRelease} />
              </div>
            </div>

            {release && (
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Tên</label>
                  <input className={styles.input} value={release.title || ""} readOnly />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Artist</label>
                  <input className={styles.input} value={release.main_artist || ""} readOnly />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Label</label>
                  <input className={styles.input} value={release.label || ""} readOnly />
                </div>
              </div>
            )}

            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Teaser</label>
                <input type="datetime-local" className={styles.input} value={draft.teaser} onChange={(e) => update("teaser", e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Official</label>
                <input type="datetime-local" className={styles.input} value={draft.official} onChange={(e) => update("official", e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Short — Từ Ngày</label>
                <input type="date" className={styles.input} value={draft.shortFrom} onChange={(e) => update("shortFrom", e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Short — Đến Ngày</label>
                <input type="date" className={styles.input} value={draft.shortTo} onChange={(e) => update("shortTo", e.target.value)} />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Mô Tả</label>
              <div>
                <button type="button" className={styles.btnSmall} onClick={() => setMoTaOpen(true)}>
                  {draft.moTa ? "✓ Mô Tả (edit)" : "+ Mô Tả"}
                </button>
              </div>
            </div>

            <button className={styles.btnPrimary} type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create Ticket"}
            </button>
          </form>
        </div>
      </div>
      {moTaOpen && (
        <MoTaPopup value={draft.moTa} onChange={(v) => update("moTa", v)} onClose={() => setMoTaOpen(false)} />
      )}
    </AppShell>
  );
}
