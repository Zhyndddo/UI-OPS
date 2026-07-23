"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../../lib/AppShell";
import ReleasePicker from "../../../../lib/ReleasePicker";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuth } from "../../../../lib/AuthContext";
import styles from "../../../shared.module.css";

const REQUEST_TYPES = ["New Design", "Revision", "Resize"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Bespoke — Design is the one ticket type with a real Platform → Design
// Type → Size cascade (admin-managed via Config → Platforms/Design
// Types/Sizes), salvaged from v1's actual app.js config system. Every
// other ticket type uses the generic form.
export default function NewDesignTicket() {
  const router = useRouter();
  const { profile } = useAuth();
  const [platforms, setPlatforms] = useState([]);
  const [types, setTypes] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [overload, setOverload] = useState(null);

  const [requestType, setRequestType] = useState("New Design");
  const [priority, setPriority] = useState("NORMAL");
  const [requestedBy, setRequestedBy] = useState("");
  const [project, setProject] = useState("");
  const [artist, setArtist] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("design_platforms").select("*").order("sort_order").then(({ data }) => setPlatforms(data || []));
    supabase.from("design_types").select("*").order("sort_order").then(({ data }) => setTypes(data || []));
    supabase.from("design_sizes").select("*").order("sort_order").then(({ data }) => setSizes(data || []));
    supabase.from("profiles").select("*").order("name").then(({ data }) => setProfiles(data || []));
    supabase.from("app_settings").select("value").eq("key", "design_overload").maybeSingle()
      .then(({ data }) => setOverload(data?.value || { active: false, date: null }));
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

  const overloadBlocked = overload?.active && overload.date === todayStr() && deadline === todayStr();

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
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "design").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Design ticket type — did schema.sql get redeployed?");
      return;
    }
    const platformName = platforms.find((p) => p.id === platformId)?.name || "";
    const typeName = types.find((t) => t.id === typeId)?.name || "";
    const sizeName = sizes.find((s) => s.id === sizeId)?.label || "";
    const requestedByProfile = profiles.find((p) => p.id === requestedBy);

    const { error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: {
        typeRequest: requestType,
        priority,
        project,
        artist,
        platform: platformName,
        designType: typeName,
        size: sizeName,
        description,
        task: `${requestType} - ${typeName}\n${project} - ${artist}`,
      },
      deadline: deadline || null,
      status: tab.default_status,
      status_log: { [tab.default_status]: new Date().toISOString() },
      requester_segment: requestedByProfile?.segment || profile?.segment || null,
      requester_name: requestedByProfile?.name || null,
    });
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else router.push("/tickets/design");
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
                <label className={styles.fieldLabel}>Priority</label>
                <select className={styles.select} value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Requested By <span className={styles.required}>*</span></label>
                <select className={styles.select} value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)}>
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

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Deadline</label>
                <input type="date" className={styles.input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                {overloadBlocked && (
                  <p style={{ color: "var(--error-fg)", fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                    ⚠ Design is overloaded today — choose a later date to unlock.
                  </p>
                )}
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
        </div>
      </div>
    </AppShell>
  );
}
