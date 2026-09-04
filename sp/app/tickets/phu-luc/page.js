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
import { statusNeedsNote, withStatusNote } from "../../../lib/statusNoteGate";
import { useAuth } from "../../../lib/AuthContext";
import { canEditPhuLucMaPL } from "../../../lib/permissions";
import styles from "../../shared.module.css";

const PHU_LUC_COLOR = {
  "Chưa Soạn": { bg: "rgba(255,255,255,0.06)", fg: "var(--text-faint)" },
  "Đã Soạn": { bg: "rgba(33,150,243,0.15)", fg: "#5cb3ff" },
  "Chờ Ký": { bg: "rgba(255,193,7,0.15)", fg: "#ffca4d" },
  "Đã Ký": { bg: "rgba(76,175,80,0.15)", fg: "#7ee6a8" },
};

// Mirrors phu_luc_status() in schema.sql
function phuLucStatus(r) {
  if (!r) return "Chưa Soạn";
  if (r.link_phu_luc && r.phu_luc_ngay_ky) return "Đã Ký";
  if (r.link_phu_luc && r.phu_luc_ngay_gui) return "Chờ Ký";
  if (r.link_phu_luc) return "Đã Soạn";
  return "Chưa Soạn";
}

export default function PhuLucList() {
  const { profile } = useAuth();
  const canEditMaPL = canEditPhuLucMaPL(profile);
  const [tickets, setTickets] = useState([]);
  const [releases, setReleases] = useState({}); // id -> release
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(""); // round 76 — quick index search box
  // Round 162 — item: dedicated label filter, per explicit request ("add a
  // filter so that when they search a label, show the current ma PL and
  // the corresponding product"). Separate from the generic quick-index
  // SearchBox above (which already matches substrings anywhere in the
  // row, label included, once label is actually fetched below) — this is
  // a focused, label-only filter so narrowing down to one label's Mã PL
  // sequence doesn't depend on the label string not accidentally
  // colliding with something else in the row (a title, a DID, etc.).
  const [labelFilter, setLabelFilter] = useState("");

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], "Legal"))); // round 78
  }, []);

  async function load() {
    setLoading(true);
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "phu_luc").single();
    if (!tab) { setLoading(false); return; }
    const { data: tix } = await supabase
      .from("tickets")
      .select("*")
      .eq("tab_id", tab.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setTickets(tix || []);

    // This ticket has no fields of its own for link/dates anymore — it
    // reads/writes releases.link_phu_luc/phu_luc_ngay_gui/phu_luc_ngay_ky
    // directly, so fetch the releases it points at (via data.releaseId,
    // a real releases.id set when the ticket was auto-created).
    const releaseIds = [...new Set((tix || []).map((t) => t.data?.releaseId).filter(Boolean))];
    if (releaseIds.length > 0) {
      // Round 162 — label added, for the new label filter below (and so
      // the generic quick-index search box can already match a label
      // typed into it, since matchesQuery stringifies the whole row).
      const { data: rels } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, label, link_phu_luc, phu_luc_ngay_gui, phu_luc_ngay_ky, phu_luc_gia_tri")
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

  // Round 161 — item 3: manual Mã PL fix for exceptions, gated to
  // canEditPhuLucMaPL (AR admin+, Legal, dev — see lib/permissions.js).
  // Writes straight into ticket.data, same shape computeNextMaPL's
  // auto-assignment already uses at creation time — a manual fix here is
  // just a later overwrite of the same field, not a different mechanism.
  async function updateMaPL(t, value) {
    const newData = { ...(t.data || {}), maPL: value };
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, data: newData } : x)));
    await supabase.from("tickets").update({ data: newData }).eq("id", t.id);
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
    // Round 80 — refund/cancel-like moves require a short reason, folded
    // into ticket.data.note (see lib/statusNoteGate.js).
    if (statusNeedsNote(newStatus)) {
      const newData = withStatusNote(t.data, newStatus);
      if (!newData) return; // cancelled / no reason given — abort the change
      patch.data = newData;
    }
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = tickets
    .filter((t) => matchesQuery({ ...t, release: releases[t.data?.releaseId] }, query))
    .filter((t) => {
      if (!labelFilter.trim()) return true;
      const rel = releases[t.data?.releaseId];
      return (rel?.label || "").toLowerCase().includes(labelFilter.trim().toLowerCase());
    });
  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 1100 }}>
        <TypeSwitcher kind="ticket" current="phu_luc" />
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Ticket</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>Phụ Lục</h1>
          </div>
          <Link href="/tickets/phu-luc/new" className={styles.btnPrimary}>+ New Ticket</Link>
        </div>

        <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
          Auto-created when an artist locks in a contract type via the magic link. Link/Ngày Gửi/Ngày Ký
          here edit the release directly (single source of truth) — Status is the generic ticket lifecycle,
          PL Status is the Phụ Lục-specific document status, computed separately.
        </p>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />
          {/* Round 162 — dedicated label filter, see its own state comment
              above. Deliberately its own input rather than folded into the
              SearchBox above — narrowing to exactly one label's Mã PL
              sequence (per Round 161's per-label counter) is the specific
              ask, not "search anything." */}
          <input
            type="text"
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
            placeholder="Filter by label…"
            style={{
              padding: "7px 12px",
              fontSize: 12,
              border: "1px solid var(--border-strong)",
              borderRadius: 6,
              background: "var(--bg-input)",
              color: "var(--text)",
              width: 200,
              marginBottom: 12,
            }}
          />
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : visibleTickets.length === 0 ? (
          <div className={styles.emptyState}>No tickets yet.</div>
        ) : (
          <>
          <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th><th>Ngày Order</th><th>Label</th><th>Release</th><th>Giá Trị PL</th><th>Mã PL</th><th>PIC</th>
                <th>Status</th><th>PL Status</th><th>Link Phụ Lục</th><th>Ngày Gửi</th><th>Ngày Ký</th>
              </tr>
            </thead>
            <tbody>
              {pagedTickets.map((t, i) => {
                const status = t.status;
                const color = statusColor(status);
                const rel = releases[t.data?.releaseId];
                const plStatus = phuLucStatus(rel);
                const plColor = PHU_LUC_COLOR[plStatus];
                return (
                  <tr key={t.id}>
                    <td>{(page - 1) * pageSize + i + 1}</td>
                    <td>{fmtDate(t.created_at)}</td>
                    <td style={{ color: "var(--text-faint)", fontSize: 12 }}>{rel?.label || "—"}</td>
                    <td>
                      {rel ? (
                        <Link href={`/releases/${rel.id}`} className={styles.rowLink}>
                          {rel.title} <span style={{ color: "var(--text-faint)" }}>({rel.did})</span>
                        </Link>
                      ) : "—"}
                    </td>
                    <td>
                      {/* Round 161 — item 4: was a plain read-only "—"
                          display of t.data?.giaTri; now a real release-level
                          field (releases.phu_luc_gia_tri), editable here,
                          same "reads/writes the release directly" pattern
                          Link Phụ Lục/Ngày Gửi/Ngày Ký already use below —
                          release detail page's Phụ Lục (Booking) section
                          edits the exact same column. Falls back to
                          displaying a pre-Round-161 ticket's own
                          data.giaTri only when the release field is still
                          blank (old tickets that predate this column) —
                          typing here always writes to the release from now
                          on, same one-time-migration-by-touch idiom used
                          elsewhere in this app. */}
                      <input
                        className={styles.input}
                        style={{ padding: "4px 8px", fontSize: 11, width: 100 }}
                        value={rel?.phu_luc_gia_tri || t.data?.giaTri || ""}
                        placeholder="—"
                        onChange={(e) => rel && updateReleaseField(rel.id, "phu_luc_gia_tri", e.target.value)}
                        disabled={!rel}
                      />
                    </td>
                    <td>
                      {/* Round 161 — item 2/3: auto-assigned by the
                          per-label counter at creation time (see
                          lib/phuLucCounter.js) — editable here only for
                          canEditPhuLucMaPL (AR admin+, Legal, dev), for the
                          "any exception" manual-fix case. Everyone else
                          sees it read-only, same as before. */}
                      {canEditMaPL ? (
                        <input
                          className={styles.input}
                          style={{ padding: "4px 8px", fontSize: 11, width: 80 }}
                          value={t.data?.maPL || ""}
                          onChange={(e) => updateMaPL(t, e.target.value)}
                        />
                      ) : (
                        t.data?.maPL || "—"
                      )}
                    </td>
                    <td>
                      <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: "16ch" }} value={t.pic_profile_id || ""} onChange={(e) => updatePic(t, e.target.value)}>
                        <option value="">— Unassigned —</option>
                        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td title={t.data?.note || undefined}>
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
                        value={rel?.link_phu_luc || ""}
                        placeholder="link…"
                        onChange={(e) => rel && updateReleaseField(rel.id, "link_phu_luc", e.target.value)}
                        disabled={!rel}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className={styles.input}
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        value={rel?.phu_luc_ngay_gui || ""}
                        onChange={(e) => rel && updateReleaseField(rel.id, "phu_luc_ngay_gui", e.target.value)}
                        disabled={!rel}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className={styles.input}
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        value={rel?.phu_luc_ngay_ky || ""}
                        onChange={(e) => rel && updateReleaseField(rel.id, "phu_luc_ngay_ky", e.target.value)}
                        disabled={!rel}
                      />
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
    </AppShell>
  );
}
