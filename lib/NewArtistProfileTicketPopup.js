"use client";

// Round 172 — "+ New Ticket" moved off its own page
// (app/tickets/artist-profile/new/page.js) into a popup opened directly
// from the list, per explicit request ("apply the pop up choice for the
// detail request tick as we discuss" → confirmed: card list + edit popup +
// creation popup, no page navigation). Logic is a straight lift from that
// page (same validation, same insert shape) — only the wrapper changed
// from a full AppShell page to an overlay+box popup (same convention as
// lib/ArtistDetailPopup.js).

import { useState } from "react";
import { supabase } from "./supabaseClient";
import { REQUEST_TYPES, fieldsForType, platformOptionsForType } from "./artistProfileRequestTypes";

export default function NewArtistProfileTicketPopup({ styles, profile, onClose, onCreated }) {
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
    const { data: created, error: insertErr } = await supabase
      .from("tickets")
      .insert({
        tab_id: tab.id,
        data: { requestType, platform, ...form },
        deadline: deadline || null,
        status: tab.default_status,
        status_log: { [tab.default_status]: new Date().toISOString() },
        requester_segment: profile?.segment || null,
        requester_name: profile?.name || null,
      })
      .select("*")
      .single();
    setSubmitting(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    onCreated(created);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 399, background: "rgba(0,0,0,0.5)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 400,
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "85vh",
          overflowY: "auto",
          background: "var(--bg-card)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          padding: 20,
          boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>New Artist Profile Ticket</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              Loại Yêu Cầu <span className={styles.required}>*</span>
            </label>
            <select className={styles.select} style={{ width: "100%", boxSizing: "border-box" }} value={requestType} onChange={(e) => changeRequestType(e.target.value)}>
              {REQUEST_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              Nền Tảng <span className={styles.required}>*</span>
            </label>
            <select className={styles.select} style={{ width: "100%", boxSizing: "border-box" }} value={platform} onChange={(e) => setPlatform(e.target.value)}>
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
                <select className={styles.select} style={{ width: "100%", boxSizing: "border-box" }} value={form[f.key] || ""} onChange={(e) => update(f.key, e.target.value)}>
                  {(f.options || ["", "Yes", "No"]).map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                </select>
              ) : (
                <input type="text" className={styles.input} style={{ width: "100%", boxSizing: "border-box" }} value={form[f.key] || ""} onChange={(e) => update(f.key, e.target.value)} />
              )}
            </div>
          ))}

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Deadline</label>
            <input type="date" className={styles.input} style={{ width: "100%", boxSizing: "border-box" }} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>

          {fields.filter((f) => f.multiline).map((f) => (
            <div key={f.key} className={styles.field}>
              <label className={styles.fieldLabel}>
                {f.label} {f.required && <span className={styles.required}>*</span>}
              </label>
              <textarea className={styles.textarea} style={{ minHeight: 90, width: "100%", boxSizing: "border-box" }} value={form[f.key] || ""} onChange={(e) => update(f.key, e.target.value)} />
            </div>
          ))}

          <button className={styles.btnPrimary} type="submit" disabled={submitting} style={{ marginTop: 8 }}>
            {submitting ? "Creating…" : "Create Ticket"}
          </button>
        </form>
      </div>
    </>
  );
}
