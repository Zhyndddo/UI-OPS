"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../../lib/AppShell";
import ReleasePicker from "../../../../lib/ReleasePicker";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuth } from "../../../../lib/AuthContext";
import {
  DESIGN_DEFAULT_STATUS,
  minNonUrgentDeadline,
  isDeadlineUrgent,
  isOverTeamDailyQuota,
  DEFAULT_DESIGN_NOTIFICATION_TEMPLATES,
} from "../../../../lib/designFlow";
import { resolveProfilesByRole } from "../../../../lib/pingNotification";
import styles from "../../../shared.module.css";

const REQUEST_TYPES = ["New Design", "Revision", "Resize"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Bespoke — Design is the one ticket type with a real Platform → Design
// Type → Size cascade (admin-managed via Config → Platforms/Design
// Types/Sizes), salvaged from v1's actual app.js config system. Every
// other ticket type uses the generic form.
//
// Round 34 rewrite: Priority field/column removed entirely, replaced by
// an auto-computed "Urgent" flag (see lib/designFlow.js). Expected
// Deadline sits where Priority used to (first field row); Project moved
// onto Artist's row; a new "Proposed PIC" field sits on Requested By's
// row (visible only while the ticket is in REQUEST status — this form is
// creation-time, so it always shows here; the list page hides it once the
// ticket moves on).
export default function NewDesignTicket() {
  const router = useRouter();
  const { profile } = useAuth();
  const [platforms, setPlatforms] = useState([]);
  const [types, setTypes] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [overload, setOverload] = useState(null);
  const [notifTemplates, setNotifTemplates] = useState(DEFAULT_DESIGN_NOTIFICATION_TEMPLATES);
  const [designTabId, setDesignTabId] = useState(null);

  const [requestType, setRequestType] = useState("New Design");
  const [expectedDeadline, setExpectedDeadline] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [proposedPic, setProposedPic] = useState("");
  const [project, setProject] = useState("");
  const [artist, setArtist] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [urgentConfirmOpen, setUrgentConfirmOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("design_platforms").select("*").order("sort_order").then(({ data }) => setPlatforms(data || []));
    supabase.from("design_types").select("*").order("sort_order").then(({ data }) => setTypes(data || []));
    supabase.from("design_sizes").select("*").order("sort_order").then(({ data }) => setSizes(data || []));
    supabase.from("profiles").select("*").order("name").then(({ data }) => setProfiles(data || []));
    supabase.from("app_settings").select("value").eq("key", "design_overload").maybeSingle()
      .then(({ data }) => setOverload(data?.value || { active: false, date: null }));
    supabase.from("app_settings").select("value").eq("key", "design_notification_templates").maybeSingle()
      .then(({ data }) => setNotifTemplates({ ...DEFAULT_DESIGN_NOTIFICATION_TEMPLATES, ...(data?.value || {}) }));
    supabase.from("ticket_tabs").select("id").eq("key", "design").single().then(({ data }) => setDesignTabId(data?.id || null));
  }, []);

  // Cascade — changing Platform clears Design Type + Size; changing
  // Design Type clears Size. Matches v1's updateModalDesignTypes/
  // updateModalSizes exactly.
  const typesForPlatform = types.filter((t) => t.platform_id === platformId);
  const sizesForType = sizes.filter((s) => s.design_type_id === typeId);

  function onPlatformChange(id) {
    setPlatformId(id);
    setTypeId("");
    setSizeId("");
  }
  function onTypeChange(id) {
    setTypeId(id);
    setSizeId("");
  }

  const overloadBlocked = overload?.active && overload.date === todayStr() && expectedDeadline === todayStr();
  const minDeadline = minNonUrgentDeadline();
  const urgentByDeadline = isDeadlineUrgent(expectedDeadline);

  async function doInsert(urgent) {
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "design").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Design ticket type — did schema.sql / add-round34-design-flow-and-ops-notes.sql get run?");
      return;
    }
    const platformName = platforms.find((p) => p.id === platformId)?.name || "";
    const typeName = types.find((t) => t.id === typeId)?.name || "";
    const sizeName = sizes.find((s) => s.id === sizeId)?.label || "";
    const requestedByProfile = profiles.find((p) => p.id === requestedBy);
    const status = tab.default_status || DESIGN_DEFAULT_STATUS;

    const { data: created, error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: {
        typeRequest: requestType,
        project,
        artist,
        platform: platformName,
        designType: typeName,
        size: sizeName,
        description,
        note: "",
        proposedPicProfileId: proposedPic || null,
        urgent,
        urgentConfirmed: false,
        task: `${requestType} - ${typeName}\n${project} - ${artist}`,
      },
      deadline: expectedDeadline || null,
      status,
      status_log: { [status]: new Date().toISOString() },
      requester_segment: requestedByProfile?.segment || profile?.segment || null,
      requester_name: requestedByProfile?.name || null,
    }).select().single();
    setSubmitting(false);
    if (insertErr || !created) {
      setError(insertErr?.message || "Couldn't create the request.");
      return;
    }
    // Urgent creation notice to dev — the generic ticket-insert DB trigger
    // already fans a plain "new Design ticket" notice out to the Design
    // team (ticket_tabs.executor_team='Design'); this is the ADDITIONAL
    // one the request calls for specifically for urgent requests, targeted
    // at dev instead. Template is dev-editable (Config → Notifications →
    // Design), see designFlow.js's DEFAULT_DESIGN_NOTIFICATION_TEMPLATES.
    if (urgent) {
      const devIds = await resolveProfilesByRole("dev");
      if (devIds.length > 0) {
        const body = (notifTemplates.urgentCreation || DEFAULT_DESIGN_NOTIFICATION_TEMPLATES.urgentCreation)
          .replace("{task}", `${requestType} - ${typeName}`)
          .replace("{deadline}", expectedDeadline || "—");
        await supabase.from("notifications").insert(
          devIds.map((profileId) => ({ profile_id: profileId, ticket_id: created.id, title: "Urgent Design request", body, link: "/tickets/design", created_at: new Date().toISOString() }))
        );
      }
    }
    router.push("/tickets/design");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!requestedBy || !project.trim() || !artist.trim() || !platformId || !typeId) {
      setError("Requested By, Project, Artist, Platform, and Design Type are required.");
      return;
    }
    if (overloadBlocked) {
      setError("Design is overloaded today — please choose a later deadline.");
      return;
    }
    // "lock at 2 request per team per day" — the 3rd+ Design request from
    // the same requester team today is auto-marked urgent rather than
    // blocked (nothing in the request calls for an outright block).
    let quotaUrgent = false;
    if (supabase && profile?.segment && designTabId) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("tab_id", designTabId)
        .eq("requester_segment", profile.segment)
        .gte("created_at", startOfDay.toISOString());
      quotaUrgent = isOverTeamDailyQuota(count || 0);
    }
    const urgent = urgentByDeadline || quotaUrgent;
    if (urgent && !urgentConfirmOpen) {
      setUrgentConfirmOpen(true);
      setPendingSubmit(true);
      return;
    }
    await doInsert(urgent);
  }

  function confirmUrgentAndSubmit() {
    setUrgentConfirmOpen(false);
    if (pendingSubmit) {
      setPendingSubmit(false);
      doInsert(true);
    }
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 680 }}>
          <Link href="/tickets/design" className={styles.backLink}>← Back</Link>
          <div className={styles.eyebrow}>// New Ticket</div>
          <h1 className={styles.title}>Create Design Request</h1>

          {error && <div className={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Request Type</label>
                <select className={styles.select} value={requestType} onChange={(e) => setRequestType(e.target.value)}>
                  {REQUEST_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Expected Deadline</label>
                <input type="date" className={styles.input} value={expectedDeadline} onChange={(e) => setExpectedDeadline(e.target.value)} />
                <p style={{ fontSize: 11, marginTop: 4, marginBottom: 0, color: urgentByDeadline ? "var(--error-fg)" : "var(--text-faint)" }}>
                  {urgentByDeadline
                    ? `⚠ Sooner than ${minDeadline} — this will be marked Urgent.`
                    : `Earliest non-urgent date: ${minDeadline}.`}
                </p>
                {overloadBlocked && (
                  <p style={{ color: "var(--error-fg)", fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                    ⚠ Design is overloaded today — choose a later date to unlock.
                  </p>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Requested By <span className={styles.required}>*</span></label>
                <select className={styles.select} value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)}>
                  <option value="">—</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Proposed PIC</label>
                <select className={styles.select} value={proposedPic} onChange={(e) => setProposedPic(e.target.value)}>
                  <option value="">—</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Project <span className={styles.required}>*</span></label>
                <div style={{ position: "relative" }}>
                  <input
                    className={styles.input}
                    style={{ paddingRight: 34 }}
                    placeholder="e.g. Nike Q3"
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                  />
                  <ReleasePicker
                    onSelect={(r) => {
                      setProject(r.title);
                      setArtist(r.main_artist);
                    }}
                  />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Artist <span className={styles.required}>*</span></label>
                <input className={styles.input} placeholder="e.g. John" value={artist} onChange={(e) => setArtist(e.target.value)} />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Platform <span className={styles.required}>*</span></label>
                <select className={styles.select} value={platformId} onChange={(e) => onPlatformChange(e.target.value)}>
                  <option value="">—</option>
                  {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Design Type <span className={styles.required}>*</span></label>
                <select className={styles.select} value={typeId} onChange={(e) => onTypeChange(e.target.value)} disabled={!platformId}>
                  <option value="">—</option>
                  {typesForPlatform.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Size</label>
                <select className={styles.select} value={sizeId} onChange={(e) => setSizeId(e.target.value)} disabled={!typeId}>
                  <option value="">—</option>
                  {sizesForType.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Description</label>
              <textarea className={styles.textarea} placeholder="Details…" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <button className={styles.btnPrimary} type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </form>

          {urgentConfirmOpen && (
            <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
              <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, width: 440 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 10px" }}>⚠ This request will be marked Urgent</h3>
                <p style={{ fontSize: 13, color: "var(--text-faint)", lineHeight: 1.5 }}>
                  Either the expected deadline is sooner than the standard 2-week-day lead time (or Friday-after-18:00
                  next-Tuesday rule), or your team already has 2+ Design requests today. Urgent requests notify dev
                  immediately and lock the ticket's status until dev confirms it. Confirm you want to proceed?
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button type="button" className={styles.btnPrimary} onClick={confirmUrgentAndSubmit} disabled={submitting}>
                    {submitting ? "Submitting…" : "Confirm & Submit"}
                  </button>
                  <button type="button" className={styles.btnSmall} onClick={() => { setUrgentConfirmOpen(false); setPendingSubmit(false); }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
