"use client";

import AppShell from "../../../lib/AppShell";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { filterProfilesByTeam } from "../../../lib/workstationHelpers";
import { fmtDate, statusColor } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import SearchBox, { matchesQuery } from "../../../lib/SearchBox";
import styles from "../../shared.module.css";

// Round 72 — a genuinely separate ticket type from Phụ Lục Publishing
// (round 71 mistakenly conflated the two — reverted). Built the exact
// same way the original Phụ Lục ticket (app/tickets/phu-luc/page.js)
// works: link/ngày Gửi/ngày Ký live directly on the release
// (releases.link_publishing/publishing_ngay_gui/publishing_ngay_ky), not
// on the ticket's own `data`. Cloned field-for-field from that page —
// only the column labels and release fields changed to Publishing's own.

const PUBLISHING_COLOR = {
  "Chưa Soạn": { bg: "rgba(255,255,255,0.06)", fg: "var(--text-faint)" },
  "Đã Soạn": { bg: "rgba(33,150,243,0.15)", fg: "#5cb3ff" },
  "Chờ Ký": { bg: "rgba(255,193,7,0.15)", fg: "#ffca4d" },
  "Đã Ký": { bg: "rgba(76,175,80,0.15)", fg: "#7ee6a8" },
};

// Mirrors publishing_status() in schema.sql
function publishingStatus(r) {
  if (!r) return "Chưa Soạn";
  if (r.link_publishing && r.publishing_ngay_ky) return "Đã Ký";
  if (r.link_publishing && r.publishing_ngay_gui) return "Chờ Ký";
  if (r.link_publishing) return "Đã Soạn";
  return "Chưa Soạn";
}

export default function PublishingList() {
  const [tickets, setTickets] = useState([]);
  const [releases, setReleases] = useState({}); // id -> release
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(""); // round 76 — quick index search box

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], "Legal"))); // round 78
  }, []);

  async function load() {
    setLoading(true);
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "publishing").single();
    if (!tab) { setLoading(false); return; }
    const { data: tix } = await supabase
      .from("tickets")
      .select("*")
      .eq("tab_id", tab.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setTickets(tix || []);

    // Same as Phụ Lục — this ticket has no fields of its own for
    // link/dates, it reads/writes releases.link_publishing/
    // publishing_ngay_gui/publishing_ngay_ky directly (data.releaseId is
    // a real releases.id, set when the ticket was created via the /new form).
    const releaseIds = [...new Set((tix || []).map((t) => t.data?.releaseId).filter(Boolean))];
    if (releaseIds.length > 0) {
      const { data: rels } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, link_publishing, publishing_ngay_gui, publishing_ngay_ky")
        .in("id", releaseIds);
      const map = {};
      (rels || []).forEach((r) => (map[r.id] = r));
      setReleases(map);
    }
    setLoading(false);
  }

  async function updateReleaseField(releaseId, field, value) {
    setReleases((prev) => ({ ...prev, [releaseId]: { ...prev[releaseId], [field]: value } }));
    await supabase.from("releases").update({ [field]: value }).eq("id", releaseId);
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

  async function updateStatus(t, newStatus) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    const patch = { status: newStatus, status_log: newLog };
    if (newStatus === "REFUND") patch.pic_profile_id = null;
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = tickets.filter((t) => matchesQuery({ ...t, release: releases[t.data?.releaseId] }, query));
  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 1100 }}>
        <TypeSwitcher kind="ticket" current="publishing" />
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Ticket</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>Publishing</h1>
          </div>
          <Link href="/tickets/publishing/new" className={styles.btnPrimary}>+ New Ticket</Link>
        </div>

        <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
          URL Publishing / Ngày Gửi / Ngày Ký here edit the release directly (single source of truth,
          same as Phụ Lục) — Status is the generic ticket lifecycle, Publishing Status is the
          document status, computed separately.
        </p>

        <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : visibleTickets.length === 0 ? (
          <div className={styles.emptyState}>No tickets yet.</div>
        ) : (
          <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th><th>Ngày Order</th><th>Release</th><th>Giá Trị Publishing</th><th>Mã Publishing</th><th>PIC</th>
                <th>Status</th><th>Publishing Status</th><th>URL Publishing</th><th>Ngày Gửi</th><th>Ngày Ký</th>
              </tr>
            </thead>
            <tbody>
              {pagedTickets.map((t, i) => {
                const status = t.status;
                const color = statusColor(status);
                const rel = releases[t.data?.releaseId];
                const plStatus = publishingStatus(rel);
                const plColor = PUBLISHING_COLOR[plStatus];
                return (
                  <tr key={t.id}>
                    <td>{(page - 1) * pageSize + i + 1}</td>
                    <td>{fmtDate(t.created_at)}</td>
                    <td>
                      {rel ? (
                        <Link href={`/releases/${rel.id}`} className={styles.rowLink}>
                          {rel.title} <span style={{ color: "var(--text-faint)" }}>({rel.did})</span>
                        </Link>
                      ) : "—"}
                    </td>
                    <td>{t.data?.giaTri || "—"}</td>
                    <td>{t.data?.maPL || "—"}</td>
                    <td>
                      <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: "16ch" }} value={t.pic_profile_id || ""} onChange={(e) => updatePic(t, e.target.value)}>
                        <option value="">— Unassigned —</option>
                        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
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
                    <td><span className={styles.statusBadge} style={{ background: plColor.bg, color: plColor.fg }}>{plStatus}</span></td>
                    <td>
                      <input
                        className={styles.input}
                        style={{ padding: "4px 8px", fontSize: 11, width: 120 }}
                        value={rel?.link_publishing || ""}
                        placeholder="link…"
                        onChange={(e) => rel && updateReleaseField(rel.id, "link_publishing", e.target.value)}
                        disabled={!rel}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className={styles.input}
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        value={rel?.publishing_ngay_gui || ""}
                        onChange={(e) => rel && updateReleaseField(rel.id, "publishing_ngay_gui", e.target.value)}
                        disabled={!rel}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className={styles.input}
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        value={rel?.publishing_ngay_ky || ""}
                        onChange={(e) => rel && updateReleaseField(rel.id, "publishing_ngay_ky", e.target.value)}
                        disabled={!rel}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
          </>
        )}
      </div>
    </div>
    </AppShell>
  );
}
