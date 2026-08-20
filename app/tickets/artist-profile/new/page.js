"use client";

// Round 166 — replaced the generic NewTicketPage-driven form with a
// bespoke one, same reason the list page (../page.js) already went
// bespoke back in Round 31: the generic engine renders one flat field
// list per type, and this type now needs its field list to change based
// on which of the 7 request types is picked (see
// lib/artistProfileRequestTypes.js for the full shape/reasoning). Layout/
// styling intentionally mirrors lib/NewTicketPage.js's own form as closely
// as possible so this doesn't look like a different app from every other
// ticket's "+ New Ticket" page.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../../lib/AppShell";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuth } from "../../../../lib/AuthContext";
import { REQUEST_TYPES, fieldsForType, platformOptionsForType } from "../../../../lib/artistProfileRequestTypes";
import styles from "../../../shared.module.css";

export default function NewArtistProfilePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [requestType, setRequestType] = useState("verification");
  const [platform, setPlatform] = useState("");
  const [form, setForm] = useState({});
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fields = fieldsForType(requestType);
  const platformOptions = platformOptionsForType(requestType);

  function changeRequestType(next) {
    setRequestType(next);
    // Fields/platform are type-specific — starting fresh on type change
    // avoids carrying a value into a field key the new type doesn't even
    // use, or a platform that isn't valid for it (e.g. Facebook selected
    // under Verification, which doesn't offer it).
    setForm({});
    setPlatform("");
  }

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!platform) {
      setError("Nền Tảng required.");
      return;
    }
    const missing = fields.filter((f) => f.required && !(form[f.key] || "").trim());
    if (missing.length > 0) {
      setError(`${missing.map((f) => f.label).join(", ")} required.`);
      return;
    }
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "artist_profile").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Artist Profile ticket type — did schema.sql get redeployed?");
      return;
    }
    const { error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: { requestType, platform, ...form },
      deadline: deadline || null,
      status: tab.default_status,
      status_log: { [tab.default_status]: new Date().toISOString() },
      requester_segment: profile?.segment || null,
      requester_name: profile?.name || null,
    });
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else router.push("/tickets/artist-profile");
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 640 }}>
          <Link href="/tickets/artist-profile" className={styles.backLink}>← Back</Link>
          <div className={styles.eyebrow}>// New Ticket</div>
          <h1 className={styles.title}>Artist Profile</h1>

          {error && <div className={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  Loại Yêu Cầu <span className={styles.required}>*</span>
                </label>
                <select className={styles.select} value={requestType} onChange={(e) => changeRequestType(e.target.value)}>
                  {REQUEST_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  Nền Tảng <span className={styles.required}>*</span>
                </label>
                <select className={styles.select} value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  <option value="">— Chọn nền tảng —</option>
                  {platformOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>

              {fields.filter((f) => !f.multiline).map((f) => (
                <div key={f.key} className={styles.field}>
                  <label className={styles.fieldLabel}>
                    {f.label} {f.required && <span className={styles.required}>*</span>}
                  </label>
                  {f.type === "select" ? (
                    <select className={styles.select} value={form[f.key] || ""} onChange={(e) => update(f.key, e.target.value)}>
                      {(f.options || ["", "Yes", "No"]).map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className={styles.input}
                      value={form[f.key] || ""}
                      onChange={(e) => update(f.key, e.target.value)}
                    />
                  )}
                </div>
              ))}

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Deadline</label>
                <input type="date" className={styles.input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
            </div>

            {fields.filter((f) => f.multiline).map((f) => (
              <div key={f.key} className={styles.field}>
                <label className={styles.fieldLabel}>
                  {f.label} {f.required && <span className={styles.required}>*</span>}
                </label>
                <textarea
                  className={styles.textarea}
                  style={{ minHeight: 90 }}
                  value={form[f.key] || ""}
                  onChange={(e) => update(f.key, e.target.value)}
                />
              </div>
            ))}

            <button className={styles.btnPrimary} type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create Ticket"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
