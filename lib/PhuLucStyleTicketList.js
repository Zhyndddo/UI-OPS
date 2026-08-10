"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "./supabaseClient";
import { fmtDate, statusColor } from "./helpers";
import { useAuth } from "./AuthContext";
import { isExecutorSegment } from "./teamTypes";
import TypeSwitcher from "./TypeSwitcher";
import { usePagination } from "./usePagination";
import Pagination from "./Pagination";
import SearchBox, { matchesQuery } from "./SearchBox";
import styles from "../app/shared.module.css";

const PHU_LUC_COLOR = {
  "Chưa Soạn": { bg: "rgba(255,255,255,0.06)", fg: "var(--text-faint)" },
  "Đã Soạn": { bg: "rgba(33,150,243,0.15)", fg: "#5cb3ff" },
  "Chờ Ký": { bg: "rgba(255,193,7,0.15)", fg: "#ffca4d" },
  "Đã Ký": { bg: "rgba(76,175,80,0.15)", fg: "#7ee6a8" },
};

// Same PL Status rule as app/tickets/phu-luc/page.js's phuLucStatus(), just
// read off this ticket's OWN data fields instead of release columns —
// Phụ Lục MG/Publishing don't have dedicated release columns of their own
// (unlike the real Phụ Lục, which predates the ticket system and owns
// releases.link_phu_luc/phu_luc_ngay_gui/phu_luc_ngay_ky), so their
// link/ngày Gửi/ngày Ký live on the ticket itself instead.
function plStatusFor(data) {
  if (!data) return "Chưa Soạn";
  if (data.linkPhuLuc && data.ngayKy) return "Đã Ký";
  if (data.linkPhuLuc && data.ngayGui) return "Chờ Ký";
  if (data.linkPhuLuc) return "Đã Soạn";
  return "Chưa Soạn";
}

// Shared by Phụ Lục MG and Phụ Lục Publishing — "reuse the current phụ
// lục template, just add the name next to each column to differentiate
// them" per explicit request. Same table layout/columns as the original
// Phụ Lục ticket (app/tickets/phu-luc/page.js), with `differentiator`
// appended to column labels, plus (unlike the original, which has no
// dual view) a Legal-executor/AR-requester dual view with the same 4
// status tabs every other new Legal Request sub-ticket type got.
export default function PhuLucStyleTicketList({ typeKey, basePath, title, differentiator, urlLabel }) {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [releases, setReleases] = useState({}); // did -> release
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [query, setQuery] = useState(""); // round 76 — quick index search box

  const isExecutorView = !profile?.segment || isExecutorSegment(profile.segment, "Legal");

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name").order("name").then(({ data }) => setProfiles(data || []));
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", typeKey).single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data: tix } = await supabase
      .from("tickets")
      .select("*")
      .eq("tab_id", tabRow.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setTickets(tix || []);

    const dids = [...new Set((tix || []).map((t) => t.data?.releaseId).filter(Boolean))];
    if (dids.length > 0) {
      const { data: rels } = await supabase.from("releases").select("id, did, title, main_artist").in("did", dids);
      const map = {};
      (rels || []).forEach((r) => (map[r.did] = r));
      setReleases(map);
    }
    setLoading(false);
  }

  async function updateTicketData(t, patch) {
    const newData = { ...t.data, ...patch };
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, data: newData } : x)));
    await supabase.from("tickets").update({ data: newData }).eq("id", t.id);
  }

  async function updatePic(t, profileId) {
    const patch = { pic_profile_id: profileId || null };
    if (profileId && t.status === tab.default_status) {
      const nextStatus = tab.status_options[1];
      if (nextStatus) { patch.status = nextStatus; patch.status_log = { ...t.status_log, [nextStatus]: new Date().toISOString() }; }
    }
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  async function updateStatus(t, newStatus) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    const patch = { status: newStatus, status_log: newLog };
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = (isExecutorView ? tickets.filter((t) => t.status === statusFilter) : tickets).filter((t) => matchesQuery(t, query));
  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 1150 }}>
        <TypeSwitcher kind="ticket" current={typeKey} />
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Ticket</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>{title}</h1>
          </div>
          <Link href={`${basePath}/new`} className={styles.btnPrimary}>+ New Ticket</Link>
        </div>

        <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />

        {isExecutorView && tab && (
          <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
            {tab.status_options.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`${styles.tabBtn} ${statusFilter === s ? styles.tabBtnActive : ""}`} style={{ border: "1px solid var(--border)", borderRadius: 6 }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : visibleTickets.length === 0 ? (
          <div className={styles.emptyState}>{isExecutorView ? `No tickets with status "${statusFilter}".` : "No tickets yet."}</div>
        ) : (
          <>
          <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ngày Order</th>
                <th>Release</th>
                <th>{`Giá Trị PL (${differentiator})`}</th>
                <th>{`Mã PL (${differentiator})`}</th>
                <th>PIC</th>
                <th>Status</th>
                <th>PL Status</th>
                {/* Round 71 — per explicit request, this column reads
                    "URL Publishing" for the Phụ Lục Publishing list
                    specifically (urlLabel prop), instead of the generic
                    "Link Phụ Lục (…)" every other user of this shared
                    component still gets. */}
                <th>{urlLabel || `Link Phụ Lục (${differentiator})`}</th>
                <th>Ngày Gửi</th>
                <th>Ngày Ký</th>
              </tr>
            </thead>
            <tbody>
              {pagedTickets.map((t) => {
                const color = statusColor(t.status);
                const rel = releases[t.data?.releaseId];
                const plStatus = plStatusFor(t.data);
                const plColor = PHU_LUC_COLOR[plStatus];
                return (
                  <tr key={t.id}>
                    <td>{fmtDate(t.created_at)}</td>
                    <td>
                      {rel ? (
                        <Link href={`/releases/${rel.id}`} className={styles.rowLink}>
                          {rel.title} <span style={{ color: "var(--text-faint)" }}>({rel.did})</span>
                        </Link>
                      ) : (
                        <span>Release {t.data?.releaseId} (not found)</span>
                      )}
                    </td>
                    <td>
                      <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, width: 100 }} defaultValue={t.data?.giaTri || ""} onBlur={(e) => updateTicketData(t, { giaTri: e.target.value })} />
                    </td>
                    <td>
                      <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, width: 90 }} defaultValue={t.data?.maPL || ""} onBlur={(e) => updateTicketData(t, { maPL: e.target.value })} />
                    </td>
                    <td>
                      {isExecutorView ? (
                        <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: "16ch" }} value={t.pic_profile_id || ""} onChange={(e) => updatePic(t, e.target.value)}>
                          <option value="">— Unassigned —</option>
                          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: 12 }}>{profiles.find((p) => p.id === t.pic_profile_id)?.name || "—"}</span>
                      )}
                    </td>
                    <td>
                      {isExecutorView ? (
                        <select value={t.status} onChange={(e) => updateStatus(t, e.target.value)} style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
                          {tab?.status_options.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{t.status}</span>
                      )}
                    </td>
                    <td><span className={styles.statusBadge} style={{ background: plColor.bg, color: plColor.fg }}>{plStatus}</span></td>
                    <td>
                      <input className={styles.input} style={{ padding: "4px 8px", fontSize: 11, width: 120 }} defaultValue={t.data?.linkPhuLuc || ""} placeholder="link…" onBlur={(e) => updateTicketData(t, { linkPhuLuc: e.target.value })} />
                    </td>
                    <td>
                      <input type="date" className={styles.input} style={{ padding: "4px 8px", fontSize: 11 }} defaultValue={t.data?.ngayGui || ""} onBlur={(e) => updateTicketData(t, { ngayGui: e.target.value })} />
                    </td>
                    <td>
                      <input type="date" className={styles.input} style={{ padding: "4px 8px", fontSize: 11 }} defaultValue={t.data?.ngayKy || ""} onBlur={(e) => updateTicketData(t, { ngayKy: e.target.value })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
          </>
        )}
      </div>
    </div>
  );
}
