"use client";

import AppShell from "../../../lib/AppShell";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import NotePopup from "../../../lib/ReleaseNotePopup";
import styles from "../../shared.module.css";

export default function NewreleaseUploadList() {
  const [tickets, setTickets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [releasesByDid, setReleasesByDid] = useState({});
  const [loading, setLoading] = useState(true);
  const [notePopup, setNotePopup] = useState(null); // { release, kind: "product" | "linkshare" } | null

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name").order("name").then(({ data }) => setProfiles(data || []));
  }, []);

  async function load() {
    const { data: tab } = await supabase.from("ticket_tabs").select("*").eq("key", "newrelease_upload").single();
    if (!tab) { setLoading(false); return; }
    const { data } = await supabase
      .from("tickets")
      .select("*")
      .eq("tab_id", tab.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setTickets(data || []);

    // The note popups need the full release row (every field either note
    // template reads), not just the display bits — one query by DID, same
    // pattern as the Media Booking ticket list's Release column.
    const dids = [...new Set((data || []).map((t) => t.data?.releaseId).filter(Boolean))];
    if (dids.length > 0) {
      const { data: rels } = await supabase.from("releases").select("*").in("did", dids);
      const map = {};
      (rels || []).forEach((r) => { map[r.did] = r; });
      setReleasesByDid(map);
    }
    setLoading(false);
  }

  // Immediate-write, same convention as the release detail page — patches
  // the release row and updates both the popup's own view and the shared
  // map so the rest of the table (and a re-opened popup) stays in sync.
  async function updateRelease(release, patch) {
    setReleasesByDid((prev) => ({ ...prev, [release.did]: { ...prev[release.did], ...patch } }));
    setNotePopup((p) => (p && p.release.id === release.id ? { ...p, release: { ...p.release, ...patch } } : p));
    await supabase.from("releases").update(patch).eq("id", release.id);
  }

  async function updateStatus(t, newStatus) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    const patch = { status: newStatus, status_log: newLog };
    if (newStatus === "REFUND") patch.pic_profile_id = null;
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  async function updatePic(t, profileId) {
    const patch = { pic_profile_id: profileId || null };
    if (profileId && t.status === "REQUESTED") {
      patch.status = "PROCESS";
      patch.status_log = { ...t.status_log, PROCESS: new Date().toISOString() };
    }
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <TypeSwitcher kind="ticket" current="newrelease_upload" />
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Ticket</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>Newrelease Upload</h1>
          </div>
          <Link href="/tickets/newrelease-upload/new" className={styles.btnPrimary}>+ New Ticket</Link>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : tickets.length === 0 ? (
          <div className={styles.emptyState}>No tickets yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th><th>Ngày Order</th><th>Nội Dung</th><th>PIC</th><th>Deadline</th><th>Note</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t, i) => {
                const status = t.status;
                const color = statusColor(status);
                return (
                  <tr key={t.id}>
                    <td>{i + 1}</td>
                    <td>{fmtDate(t.created_at)}</td>
                    <td>{t.data?.project || t.data?.releaseId || "—"} — {t.data?.artist || ""}</td>
                    <td>
                      <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12 }} value={t.pic_profile_id || ""} onChange={(e) => updatePic(t, e.target.value)}>
                        <option value="">— Unassigned —</option>
                        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td>{fmtDate(t.deadline)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {(() => {
                        const rel = releasesByDid[t.data?.releaseId];
                        if (!rel) return <span style={{ color: "#555" }}>—</span>;
                        return (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => setNotePopup({ release: rel, kind: "product" })}
                              title="Note — Link Drive, Smartlink, UPC, etc."
                              style={{ background: "none", border: "none", color: "var(--accent-soft)", cursor: "pointer", fontSize: 16, padding: 0 }}
                            >
                              📝
                            </button>
                            <button
                              onClick={() => setNotePopup({ release: rel, kind: "linkshare" })}
                              title="Linkshare Note — Tiktok/Facebook release timing"
                              style={{ background: "none", border: "none", color: "var(--accent-soft)", cursor: "pointer", fontSize: 16, padding: 0 }}
                            >
                              🔗
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <select
                        value={status}
                        onChange={(e) => updateStatus(t, e.target.value)}
                        style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}
                      >
                        {["REQUESTED", "PROCESS", "COMPLETE", "REFUND", "CANCELED"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>

    {notePopup && (
      <NotePopup
        release={notePopup.release}
        kind={notePopup.kind}
        onUpdate={(patch) => updateRelease(notePopup.release, patch)}
        onClose={() => setNotePopup(null)}
      />
    )}
    </AppShell>
  );
}
