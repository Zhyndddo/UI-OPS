"use client";

// Round 144 — Report Conflict's create form, rebuilt bespoke (see
// lib/ticketConfigs.js's comment on the now-unused generic config entry
// for the full reasoning). Per explicit request:
//   1. Type is a real single-choice dropdown (was free text).
//   2. Grouped layout — top row (Type, Requester), Asset Info, "Thông tin
//      cần report", "Thông tin Official", Note.
//   3. Picking an Asset Title via ReleasePicker auto-fills Artist, Label,
//      Original Release Date, Official Song Title, Official Artist,
//      Official ISRC, Official UPC straight off the picked release — all
//      of it still freely editable/overridable afterward, same as every
//      other plain input on this form.
//
// Two fields resolved through follow-up questions this round:
//   - "Official Sound Link" is TYPE-DEPENDENT: it edits officialURL for
//     TikTok/Facebook/Spotify, but swaps to editing linkMVYoutube (shown
//     as "MV YouTube Link") when Type = YouTube. Both values are kept
//     independently in the ticket's data regardless of which one is
//     currently showing, so switching Type back and forth never loses
//     either value.
//   - "Hình profile Tiktok NS" is a link/text field (tiktokProfile,
//     renamed) — no image upload, matching the rest of the form and the
//     app (nothing else here uploads real files).
// "Text Block" and "Original Sound Link" (both pre-existing fields) were
// dropped from the form entirely per explicit request — any value already
// saved on an older ticket stays in the database, just no longer shown.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../../lib/AppShell";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuth } from "../../../../lib/AuthContext";
import ReleasePicker from "../../../../lib/ReleasePicker";
import { fmtDate } from "../../../../lib/helpers";
import styles from "../../../shared.module.css";

const CONFLICT_TYPES = ["TikTok", "YouTube", "Facebook", "Spotify"];

const EMPTY_FORM = {
  conflictType: "",
  assetTitle: "",
  artist: "",
  reportedISRC: "",
  reportedUPC: "",
  reportedURL: "",
  label: "",
  originalReleaseDate: "",
  officialSongTitle: "",
  officialArtist: "",
  officialISRC: "",
  officialUPC: "",
  officialURL: "",
  linkMVYoutube: "",
  tiktokProfile: "",
  note: "",
};

export default function NewReportConflictPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Rule 3 — auto-fill off the picked release. Only fills fields this
  // release actually has a value for, so it never clobbers something
  // already typed with a blank; everything filled here stays a normal
  // editable input afterward (manual override always available).
  function fillFromRelease(release) {
    setForm((f) => ({
      ...f,
      assetTitle: release.title ?? f.assetTitle,
      artist: release.main_artist ?? f.artist,
      label: release.label ?? f.label,
      originalReleaseDate: release.release_date ? fmtDate(release.release_date) : f.originalReleaseDate,
      officialSongTitle: release.title ?? f.officialSongTitle,
      officialArtist: release.main_artist ?? f.officialArtist,
      officialISRC: release.isrc ?? f.officialISRC,
      officialUPC: release.upc ?? f.officialUPC,
    }));
  }

  const isYoutube = form.conflictType === "YouTube";

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const missing = [];
    if (!form.conflictType) missing.push("Type");
    if (!form.assetTitle.trim()) missing.push("Asset Title");
    if (missing.length > 0) {
      setError(`${missing.join(", ")} required.`);
      return;
    }
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "report_conflict").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Report Conflict ticket type — did schema.sql get redeployed?");
      return;
    }
    const { error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: form,
      status: tab.default_status,
      status_log: { [tab.default_status]: new Date().toISOString() },
      requester_segment: profile?.segment || null,
      requester_name: profile?.name || null,
    });
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else router.push("/tickets/report-conflict");
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 640 }}>
          <Link href="/tickets/report-conflict" className={styles.backLink}>← Back</Link>
          <div className={styles.eyebrow}>// New Ticket</div>
          <h1 className={styles.title}>Report Conflict</h1>

          {error && <div className={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit}>
            {/* a. top row — no title */}
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  Type <span className={styles.required}>*</span>
                </label>
                <select className={styles.select} value={form.conflictType} onChange={(e) => update("conflictType", e.target.value)}>
                  <option value="">— Select —</option>
                  {CONFLICT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Requester</label>
                <div style={{ padding: "9px 12px", fontSize: 14, color: "var(--text-muted)" }}>
                  {profile?.name || "—"}{profile?.segment ? ` (${profile.segment})` : ""}
                </div>
              </div>
            </div>

            {/* b. Asset Info */}
            <div className={styles.subheading}>Asset Info</div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  Asset Title <span className={styles.required}>*</span>
                </label>
                <div style={{ position: "relative" }}>
                  <input className={styles.input} style={{ paddingRight: 34 }} value={form.assetTitle} onChange={(e) => update("assetTitle", e.target.value)} />
                  <ReleasePicker onSelect={fillFromRelease} />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Artist</label>
                <input className={styles.input} value={form.artist} onChange={(e) => update("artist", e.target.value)} />
              </div>
            </div>

            {/* c. Thông tin cần report — each on its own full-width row */}
            <div className={styles.subheading}>Thông tin cần report</div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Reported ISRC</label>
              <input className={styles.input} value={form.reportedISRC} onChange={(e) => update("reportedISRC", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Reported UPC</label>
              <input className={styles.input} value={form.reportedUPC} onChange={(e) => update("reportedUPC", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Reported Sound Link</label>
              <input className={styles.input} value={form.reportedURL} onChange={(e) => update("reportedURL", e.target.value)} />
            </div>

            {/* d. Thông tin Official */}
            <div className={styles.subheading}>Thông tin Official</div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Label</label>
                <input className={styles.input} value={form.label} onChange={(e) => update("label", e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Original Release Date</label>
                <input className={styles.input} value={form.originalReleaseDate} onChange={(e) => update("originalReleaseDate", e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Official Song Title</label>
                <input className={styles.input} value={form.officialSongTitle} onChange={(e) => update("officialSongTitle", e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Official Artist</label>
                <input className={styles.input} value={form.officialArtist} onChange={(e) => update("officialArtist", e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Official ISRC</label>
                <input className={styles.input} value={form.officialISRC} onChange={(e) => update("officialISRC", e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Official UPC</label>
                <input className={styles.input} value={form.officialUPC} onChange={(e) => update("officialUPC", e.target.value)} />
              </div>
              {/* Type-dependent slot — edits officialURL normally, swaps to
                  linkMVYoutube when Type=YouTube. Both values persist
                  independently regardless of which is showing. */}
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{isYoutube ? "MV YouTube Link" : "Official Sound Link"}</label>
                <input
                  className={styles.input}
                  value={isYoutube ? form.linkMVYoutube : form.officialURL}
                  onChange={(e) => update(isYoutube ? "linkMVYoutube" : "officialURL", e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Hình profile Tiktok NS</label>
                <input className={styles.input} value={form.tiktokProfile} onChange={(e) => update("tiktokProfile", e.target.value)} />
              </div>
            </div>

            {/* e. Note */}
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
