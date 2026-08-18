"use client";

import AppShell from "../../../../lib/AppShell";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabaseClient";
import { computeNextMaPL } from "../../../../lib/phuLucCounter";
import styles from "../../../shared.module.css";

export default function NewPhuLucTicket() {
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
    // Round 161 — label added (for the Mã PL per-label counter below) and
    // phu_luc_gia_tri added (to prefill Giá Trị Phụ Lục if AR already
    // filled it in on the release detail page before this backfill ticket
    // gets created).
    supabase.from("releases").select("id, did, title, main_artist, label, phu_luc_gia_tri").order("title").then(({ data }) => setReleases(data || []));
  }, []);

  // This ticket is normally auto-created from the pick-package magic link
  // flow (data.releaseId stored as the release's UUID here, unlike most
  // other ticket types which store the DID) — filter out releases that
  // already have a non-deleted Phụ Lục ticket so this manual/backfill form
  // can't accidentally create a second one for the same release.
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: tabRow } = await supabase.from("ticket_tabs").select("id").eq("key", "phu_luc").single();
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

  // Round 161 — item 2: auto-suggest Mã PL (per-label counter, see
  // lib/phuLucCounter.js) the moment a release is picked, same as the
  // normal magic-link auto-create path now does. Still a plain editable
  // input below (this form has always allowed hand-typing Mã PL for
  // backfill/manual cases — not narrowing that here) — this only changes
  // the DEFAULT from blank to a real computed suggestion. Only overwrites
  // an EMPTY field, so it never clobbers something already typed if the
  // release selection changes again.
  useEffect(() => {
    if (!selected) return;
    if (!maPL.trim()) computeNextMaPL(selected.label).then((suggested) => setMaPL(suggested));
    if (selected.phu_luc_gia_tri && !giaTri.trim()) setGiaTri(selected.phu_luc_gia_tri);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!releaseId || !giaTri.trim()) {
      setError("Release and Giá Trị Phụ Lục are required.");
      return;
    }
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id").eq("key", "phu_luc").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Phụ Lục ticket type — did schema.sql get redeployed?");
      return;
    }
    // Belt-and-suspenders re-check right before insert, same pattern as
    // Media Booking and the generic engine's oneTicketPerRelease types.
    const { data: dupe } = await supabase
      .from("tickets")
      .select("id")
      .eq("tab_id", tab.id)
      .is("deleted_at", null)
      .contains("data", { releaseId })
      .maybeSingle();
    if (dupe) {
      setSubmitting(false);
      setError("A Phụ Lục ticket for this release already exists — only one is allowed per release.");
      return;
    }
    // Round 161 — Giá Trị Phụ Lục moved to a plain release field
    // (releases.phu_luc_gia_tri — same one AR fills in on the release
    // detail page, and the ticket list itself reads/writes) instead of
    // living in ticket.data — write it there directly rather than on the
    // ticket, same "release is the single source of truth" pattern
    // link_phu_luc/phu_luc_ngay_gui/phu_luc_ngay_ky already use.
    const { error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: { releaseId, maPL, vcpmcDocQuyen: vcpmc },
      deadline: deadline || null,
    });
    if (!insertErr) await supabase.from("releases").update({ phu_luc_gia_tri: giaTri }).eq("id", releaseId);
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else router.push("/tickets/phu-luc");
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 640 }}>
        <Link href="/tickets/phu-luc" className={styles.backLink}>← Back</Link>
        <div className={styles.eyebrow}>// New Ticket</div>
        <h1 className={styles.title}>Phụ Lục</h1>

        <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
          Normally this ticket is auto-created when an artist locks in a contract type via the magic link —
          use this form only for a manual/backfill case. Link Phụ Lục / Ngày Gửi / Ngày Ký are edited on the
          release directly afterward (URL tab or Pre-release tab), not here.
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
              <label className={styles.fieldLabel}>Giá Trị Phụ Lục <span className={styles.required}>*</span></label>
              <input className={styles.input} value={giaTri} onChange={(e) => setGiaTri(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Mã PL</label>
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
