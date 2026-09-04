"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../../lib/AppShell";
import { supabase } from "../../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../../lib/helpers";
import { useAuth } from "../../../../lib/AuthContext";
import { isOpsTeam } from "../../../../lib/teamTypes";
import { filterProfilesByTeam } from "../../../../lib/workstationHelpers";
import { parseBatchPaste, BATCH_ITEM_COLUMNS } from "../../../../lib/phaiSinhBatchParse";
import { recomputeBatchStatus, batchProgress } from "../../../../lib/batchPhaiSinhStatus";
import { sendPing, resolvePingTargets } from "../../../../lib/pingNotification";
import { CHILD_ITEM_STATUSES } from "../../../../lib/phaiSinhTypes";
import BatchFileImport from "../../../../lib/BatchFileImport";
import { canEditLockedDeadline } from "../../../../lib/permissions";
import styles from "../../../shared.module.css";

// Round 41 — extended with the Kho Nhạc workflow's own stages
// (UPLOADING/DELIVERY/RECHECKING), see lib/phaiSinhTypes.js.
const ITEM_STATUSES = CHILD_ITEM_STATUSES;

// The "expand into a full-size table" view per explicit request — this is
// what the batch row on the list page opens into (new tab, "for
// clarity"). Every song in the batch lives here as its own row, with its
// own PIC/deadline/status — this is where the actual per-item workload
// tracking happens; the list page only ever shows the batch-level
// aggregate.
export default function BatchPhaiSinhDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [items, setItems] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState(null);
  const [pasteSubmitting, setPasteSubmitting] = useState(false);

  const isExecutorView = !profile?.segment || isOpsTeam(profile.segment);

  useEffect(() => {
    if (!supabase || !id) return;
    load();
    supabase.from("profiles").select("id, name, segment, role").order("name").then(({ data }) => setProfiles(filterProfilesByTeam(data || [], "OPS"))); // round 78
  }, [id]);

  async function load() {
    setLoading(true);
    const { data: t } = await supabase.from("tickets").select("*").eq("id", id).single();
    setTicket(t || null);
    const { data: i } = await supabase.from("phai_sinh_batch_items").select("*").eq("batch_ticket_id", id).is("deleted_at", null).order("created_at", { ascending: true });
    setItems(i || []);
    setLoading(false);
  }

  async function updateItem(item, patch) {
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
    await supabase.from("phai_sinh_batch_items").update(patch).eq("id", item.id);
  }

  async function updateStatus(item, newStatus) {
    const newLog = { ...item.status_log, [newStatus]: new Date().toISOString() };
    const patch = { status: newStatus, status_log: newLog };
    // Ngày Hoàn Thành — app-stamped the moment status becomes COMPLETE,
    // cleared if taken back out, same pattern as Splitshare's Ngày Hoàn
    // Thành (app/tickets/split-share/page.js).
    if (newStatus === "COMPLETE") patch.ngay_hoan_thanh = new Date().toISOString().slice(0, 10);
    else if (item.status === "COMPLETE") patch.ngay_hoan_thanh = null;
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
    await supabase.from("phai_sinh_batch_items").update(patch).eq("id", item.id);
    await recomputeBatchStatus(id);
    const { data: t } = await supabase.from("tickets").select("*").eq("id", id).single();
    setTicket(t || null);
  }

  async function updatePic(item, profileId) {
    await updateItem(item, { pic_profile_id: profileId || null });
  }

  async function pingItem(item) {
    const targets = await resolvePingTargets(item.pic_profile_id);
    await sendPing({
      targetProfileIds: targets,
      ticketId: id,
      title: "Ping — Phái Sinh (Batch) item",
      body: `${item.ten_bai} in ${ticket?.data?.batchLabel || "a batch"} needs attention.`,
      link: `/tickets/batch-phai-sinh/${id}`,
    });
  }

  async function pingBatch() {
    const targets = await resolvePingTargets(ticket?.pic_profile_id);
    await sendPing({
      targetProfileIds: targets,
      ticketId: id,
      title: "Ping — Phái Sinh (Batch)",
      body: `${ticket?.data?.batchLabel || "A batch"} needs attention.`,
      link: `/tickets/batch-phai-sinh/${id}`,
    });
  }

  async function handleAddPaste(e) {
    e.preventDefault();
    setPasteError(null);
    const { rows, skipped } = parseBatchPaste(pasteText);
    if (rows.length === 0) {
      setPasteError("Nothing parsed from the box — check the column order and try again.");
      return;
    }
    setPasteSubmitting(true);
    const { error } = await supabase.from("phai_sinh_batch_items").insert(rows.map((r) => ({ ...r, batch_ticket_id: id })));
    setPasteSubmitting(false);
    if (error) {
      setPasteError(error.message);
      return;
    }
    setPasteText("");
    setPasteOpen(false);
    await load();
    void skipped;
  }

  // Round 41 — file-upload alternative to the paste textarea, per explicit
  // request ("also make the import so they can import the data via
  // template file"). Same insert as the paste path, just a different
  // source of parsed rows.
  async function handleAddFile({ rows, skipped }) {
    setPasteError(null);
    const { error } = await supabase.from("phai_sinh_batch_items").insert(rows.map((r) => ({ ...r, batch_ticket_id: id })));
    if (error) {
      setPasteError(error.message);
      return;
    }
    setPasteOpen(false);
    await load();
    void skipped;
  }

  if (loading) {
    return <AppShell><div className={styles.page}><div className={styles.container}><div className={styles.emptyState}>Loading…</div></div></div></AppShell>;
  }
  if (!ticket) {
    return <AppShell><div className={styles.page}><div className={styles.container}><div className={styles.emptyState}>Batch not found.</div></div></div></AppShell>;
  }

  const { done, total } = batchProgress(items);
  const ticketColor = statusColor(ticket.status);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1500 }}>
          <Link href="/tickets/batch-phai-sinh" className={styles.backLink}>← Back to Phái Sinh (Batch)</Link>
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Batch</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>{ticket.data?.batchLabel || "(untitled batch)"}</h1>
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4 }}>
                {ticket.data?.mainArtist} · {total === 0 ? "no songs yet" : `${done}/${total} resolved`} ·{" "}
                <span className={styles.statusBadge} style={{ background: ticketColor.bg, color: ticketColor.fg }}>{ticket.status}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className={styles.btnSmall} onClick={pingBatch}>Ping Batch</button>
              <button type="button" className={styles.btnPrimary} onClick={() => setPasteOpen((o) => !o)}>+ Add Via Paste</button>
            </div>
          </div>

          {pasteOpen && (
            <form onSubmit={handleAddPaste} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 20 }}>
              {pasteError && <div className={styles.errorBox}>{pasteError}</div>}
              <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 0, marginBottom: 6 }}>
                Same column order as batch creation: {BATCH_ITEM_COLUMNS.join(" · ")}
              </p>
              <div style={{ marginBottom: 10 }}>
                <BatchFileImport styles={styles} onParsed={handleAddFile} />
              </div>
              <textarea
                className={styles.textarea}
                style={{ minHeight: 140, fontFamily: "monospace", fontSize: 11 }}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste tab-separated rows here…"
              />
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button className={styles.btnPrimary} type="submit" disabled={pasteSubmitting}>
                  {pasteSubmitting ? "Adding…" : "Add Songs"}
                </button>
                <button type="button" className={styles.btnSmall} onClick={() => { setPasteOpen(false); setPasteText(""); setPasteError(null); }}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {items.length === 0 ? (
            <div className={styles.emptyState}>No songs in this batch yet — use "+ Add Via Paste" above.</div>
          ) : (
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ minWidth: 2700 }}>
              <thead>
                <tr>
                  {/* Round 116 — new leftmost column, per explicit request
                      ("add a column label 'Album name'... right before the
                      'Tên Bài' column"). Takes over the sticky-left-column
                      spot from Tên Bài (this app has no established
                      2-sticky-column pattern anywhere else, and Album Name
                      is now the more-left one) — Tên Bài becomes a normal
                      scrolling column right after it. */}
                  <th style={{ position: "sticky", left: 0, zIndex: 21, background: "var(--bg)", minWidth: 160 }}>Album Name</th>
                  <th style={{ minWidth: 200 }}>Tên Bài</th>
                  <th style={{ minWidth: 110 }}>Version</th>
                  <th style={{ minWidth: 100 }}>Thể Loại</th>
                  <th style={{ minWidth: 130 }}>Artist</th>
                  <th style={{ minWidth: 130 }}>Composer</th>
                  <th style={{ minWidth: 120 }}>Producer</th>
                  <th style={{ minWidth: 110 }}>Mixer</th>
                  <th style={{ minWidth: 120 }}>Release Date</th>
                  <th style={{ minWidth: 110 }}>UPC</th>
                  <th style={{ minWidth: 110 }}>ISRC</th>
                  <th style={{ minWidth: 160 }}>Link Audio</th>
                  <th style={{ minWidth: 160 }}>Link Artwork</th>
                  <th style={{ minWidth: 160 }}>Lyrics</th>
                  <th style={{ minWidth: 160 }}>Smartlink</th>
                  <th style={{ minWidth: 120 }}>Ngày Nhận</th>
                  <th style={{ minWidth: 130 }}>Ngày Hoàn Thành</th>
                  <th style={{ minWidth: 140 }}>Tác Quyền</th>
                  <th style={{ minWidth: 100 }}>Type</th>
                  <th style={{ minWidth: 140 }}>Note</th>
                  <th style={{ minWidth: 160 }}>Link Labelmaster</th>
                  <th style={{ minWidth: 130 }}>PIC</th>
                  <th style={{ minWidth: 120 }}>Deadline</th>
                  <th style={{ minWidth: 120 }}>Status</th>
                  {/* Round 41 item 2d — "recheck takedown bên cũ", single-
                      choice Yes/No, counted (if yes) on the parent list's
                      mini dashboard. */}
                  <th style={{ minWidth: 130 }}>Takedown Bên Cũ</th>
                  <th style={{ minWidth: 70 }}>Ping</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const color = statusColor(item.status);
                  return (
                    <tr key={item.id}>
                      <td style={{ position: "sticky", left: 0, zIndex: 5, background: "var(--bg)" }}>
                        <input className={styles.input} style={{ padding: "4px 6px", fontSize: 12 }} defaultValue={item.album_name || ""} onBlur={(e) => updateItem(item, { album_name: e.target.value })} />
                      </td>
                      <td>
                        <input className={styles.input} style={{ padding: "4px 6px", fontSize: 12 }} defaultValue={item.ten_bai || ""} onBlur={(e) => updateItem(item, { ten_bai: e.target.value })} />
                      </td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.version || ""} onBlur={(e) => updateItem(item, { version: e.target.value })} /></td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.the_loai || ""} onBlur={(e) => updateItem(item, { the_loai: e.target.value })} /></td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.artist || ""} onBlur={(e) => updateItem(item, { artist: e.target.value })} /></td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.composer || ""} onBlur={(e) => updateItem(item, { composer: e.target.value })} /></td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.producer || ""} onBlur={(e) => updateItem(item, { producer: e.target.value })} /></td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.mixer || ""} onBlur={(e) => updateItem(item, { mixer: e.target.value })} /></td>
                      <td><input type="date" className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.release_date || ""} onBlur={(e) => updateItem(item, { release_date: e.target.value || null })} /></td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.upc || ""} onBlur={(e) => updateItem(item, { upc: e.target.value })} /></td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.isrc || ""} onBlur={(e) => updateItem(item, { isrc: e.target.value })} /></td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.link_audio || ""} onBlur={(e) => updateItem(item, { link_audio: e.target.value })} /></td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.link_artwork || ""} onBlur={(e) => updateItem(item, { link_artwork: e.target.value })} /></td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.lyrics || ""} onBlur={(e) => updateItem(item, { lyrics: e.target.value })} /></td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.smartlink || ""} onBlur={(e) => updateItem(item, { smartlink: e.target.value })} /></td>
                      <td><input type="date" className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.ngay_nhan || ""} onBlur={(e) => updateItem(item, { ngay_nhan: e.target.value || null })} /></td>
                      <td style={{ fontSize: 11, color: "var(--text-faint)" }}>{fmtDate(item.ngay_hoan_thanh)}</td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.tac_quyen || ""} onBlur={(e) => updateItem(item, { tac_quyen: e.target.value })} /></td>
                      <td>
                        <select className={styles.select} style={{ padding: "4px 6px", fontSize: 11 }} value={item.type_request || "Phái Sinh"} onChange={(e) => updateItem(item, { type_request: e.target.value })}>
                          <option value="Phái Sinh">Phái Sinh</option>
                          <option value="Original">Original</option>
                        </select>
                      </td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.note || ""} onBlur={(e) => updateItem(item, { note: e.target.value })} /></td>
                      <td><input className={styles.input} style={{ padding: "4px 6px", fontSize: 11 }} defaultValue={item.link_labelmaster || ""} onBlur={(e) => updateItem(item, { link_labelmaster: e.target.value })} /></td>
                      <td>
                        {isExecutorView ? (
                          <select className={styles.select} style={{ padding: "4px 6px", fontSize: 11, minWidth: "16ch" }} value={item.pic_profile_id || ""} onChange={(e) => updatePic(item, e.target.value)}>
                            <option value="">— Unassigned —</option>
                            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 11 }}>{profiles.find((p) => p.id === item.pic_profile_id)?.name || "—"}</span>
                        )}
                      </td>
                      <td>
                        {(() => {
                          const deadlineLocked = item.status !== "REQUESTED" && !canEditLockedDeadline(profile); // round 57 — teamlead+
                          return (
                            <input
                              type="date"
                              className={styles.input}
                              style={{ padding: "4px 6px", fontSize: 11 }}
                              defaultValue={item.deadline || ""}
                              disabled={deadlineLocked}
                              title={deadlineLocked ? "Deadline is locked once work has moved past Requested — only dev/admin can change it now." : undefined}
                              onBlur={(e) => updateItem(item, { deadline: e.target.value || null })}
                            />
                          );
                        })()}
                      </td>
                      <td>
                        {isExecutorView ? (
                          <select value={item.status} onChange={(e) => updateStatus(item, e.target.value)} style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 6px", fontSize: 10, fontWeight: 700 }}>
                            {ITEM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{item.status}</span>
                        )}
                      </td>
                      <td>
                        <select
                          className={styles.select}
                          style={{ padding: "4px 6px", fontSize: 11 }}
                          value={item.takedown_ban_cu ? "yes" : "no"}
                          onChange={(e) => updateItem(item, { takedown_ban_cu: e.target.value === "yes" })}
                        >
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </td>
                      <td>
                        <button type="button" className={styles.btnSmall} style={{ padding: "3px 6px", fontSize: 10 }} onClick={() => pingItem(item)}>
                          Ping
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
