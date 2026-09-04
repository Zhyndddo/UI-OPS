"use client";

import AppShell from "../../../../lib/AppShell";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabaseClient";
import styles from "../../../shared.module.css";

export default function NewPublishingTicket() {
  const router = useRouter();
  const [releases, setReleases] = useState([]);
  const [releaseId, setReleaseId] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [giaTri, setGiaTri] = useState("");
  const [maPL, setMaPL] = useState("");
  const [vcpmc, setVcpmc] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [excludeIds, setExcludeIds] = useState(new Set());

  useEffect(() => {
    if (!supabase) return;
    supabase.from("releases").select("id, did, title, main_artist").order("title").then(({ data }) => setReleases(data || []));
  }, []);

  // Same one-ticket-per-release guard as Phụ Lục's own /new form — filter
  // out releases that already have a non-deleted Publishing ticket.
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: tabRow } = await supabase.from("ticket_tabs").select("id").eq("key", "publishing").single();
      if (!tabRow) return;
      const { data: existing } = await supabase.from("tickets").select("data").eq("tab_id", tabRow.id).is("deleted_at", null);
      setExcludeIds(new Set((existing || []).map((t) => t.data?.releaseId).filter(Boolean)));
    })();
  }, []);

  const selectableReleases = excludeIds.size > 0 ? releases.filter((r) => !excludeIds.has(r.id)) : releases;
  const selected = selectableReleases.find((r) => r.id === releaseId);
  const matches = search.trim()
    ? selectableReleases.filter((r) => `${r.title} ${r.main_artist} ${r.did}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : [];

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!releaseId || !giaTri.trim()) {
      setError("Release and Giá Trị Publishing are required.");
      return;
    }
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id").eq("key", "publishing").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Publishing ticket type — did schema.sql get redeployed?");
      return;
    }
    const { data: dupe } = await supabase
      .from("tickets")
      .select("id")
      .eq("tab_id", tab.id)
      .is("deleted_at", null)
      .contains("data", { releaseId })
      .maybeSingle();
    if (dupe) {
      setSubmitting(false);
      setError("A Publishing ticket for this release already exists — only one is allowed per release.");
      return;
    }
    const { error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: { releaseId, giaTri, maPL, vcpmcDocQuyen: vcpmc },
      deadline: deadline || null,
    });
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else router.push("/tickets/publishing");
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 640 }}>
        <Link href="/tickets/publishing" className={styles.backLink}>← Back</Link>
        <div className={styles.eyebrow}>// New Ticket</div>
        <h1 className={styles.title}>Publishing</h1>

        <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
          URL Publishing / Ngày Gửi / Ngày Ký are edited on the release directly afterward (URL tab
          or Booking tab), not here.
        </p>

        {error && <div className={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.field} style={{ position: "relative" }}>
            <label className={styles.fieldLabel}>Release <span className={styles.required}>*</span></label>
            <input
              className={styles.input}
              placeholder="Search by title, artist, or DID…"
              value={selected ? `${selected.title} — ${selected.main_artist} (${selected.did})` : search}
              onChange={(e) => { setSearch(e.target.value); setReleaseId(""); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {open && matches.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: "var(--bg-hover)", border: "1px solid #333", borderRadius: 6, marginTop: 4, maxHeight: 220, overflowY: "auto" }}>
                {matches.map((r) => (
                  <div
                    key={r.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setReleaseId(r.id); setSearch(""); setOpen(false); }}
                    style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--border)" }}
                  >
                    {r.title} — {r.main_artist} <span style={{ color: "var(--text-faint)" }}>({r.did})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Giá Trị Publishing <span className={styles.required}>*</span></label>
              <input className={styles.input} value={giaTri} onChange={(e) => setGiaTri(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Mã Publishing</label>
              <input className={styles.input} value={maPL} onChange={(e) => setMaPL(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Deadline</label>
              <input type="date" className={styles.input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>

          <label className={styles.checkboxRow} style={{ marginBottom: 20 }}>
            <input type="checkbox" checked={vcpmc} onChange={(e) => setVcpmc(e.target.checked)} />
            VCPMC Độc Quyền
          </label>

          <button className={styles.btnPrimary} type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Ticket"}
          </button>
        </form>
      </div>
    </div>
    </AppShell>
  );
}
