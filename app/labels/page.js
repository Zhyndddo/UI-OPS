"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { withLabelPrefix, stripLabelPrefix, hasLabelPrefix, LABEL_PREFIX } from "../../lib/labelHelpers";
import { LABEL_HOP_TAC_OPTIONS, LABEL_PHAN_LOAI_OPTIONS } from "../../lib/pickerOptions";
import { HOP_TAC_TICKET_TYPE, hopTacTagEntry, hopTacTagStatus, hopTacStatusColor, anyHopTacDone } from "../../lib/labelHopTacStatus";
import { useAuth } from "../../lib/AuthContext";
import PickSelect from "../../lib/PickSelect";
import NoteCell from "../../lib/NoteCell";
import { fetchAllRows } from "../../lib/helpers";
import styles from "../shared.module.css";

// Round 87 — Genre dropped entirely (item 1: "drop the genre column and
// field"). hop_tac_status (the per-tag Hợp Đồng tracking — see
// lib/labelHopTacStatus.js) replaces plain hop_tac as the thing this form
// actually writes; hop_tac itself is kept in sync alongside it purely so
// nothing else reading labels.hop_tac (e.g. the release detail page's
// read-only display) breaks.
const EMPTY = { label_name: "", hop_tac: [], hop_tac_status: {}, phan_loai: "", contract_signed: false };

const LABEL_SYNC_THROTTLE_KEY = "vieent_labels_sync_last_run";
const LABEL_SYNC_THROTTLE_MS = 6 * 60 * 60 * 1000; // 6 hours

// Round 87 — separate, shorter throttle for checking whether any in-flight
// Hợp Đồng ticket has finished (drives the gold -> green flip). Lighter
// interval than the activity-year sync since this is the status a person
// is actually watching change, not a background derived field.
const HOPTAC_SYNC_THROTTLE_KEY = "vieent_labels_hoptac_sync_last_run";
const HOPTAC_SYNC_THROTTLE_MS = 30 * 60 * 1000; // 30 minutes

export default function LabelsPage() {
  const { profile } = useAuth();
  const [labels, setLabels] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  // { mode: "create" } | { mode: "row", label } — which tag's "send to
  // legal?" popup is open, if any.
  const [legalPopup, setLegalPopup] = useState(null);

  async function load() {
    const { data } = await supabase.from("labels").select("*").order("label_name");
    setLabels(data || []);
    syncLatestActivityYears(data || []);
    syncHopTacTicketStatuses(data || []);
  }

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  // Thời gian hoạt động gần nhất — unchanged from before, see prior round's
  // comment (kept for context): auto-computed from this label's own
  // releases, persisted, throttled to once per 6h.
  async function syncLatestActivityYears(labelRows) {
    if (!supabase || labelRows.length === 0) return;
    let lastRun = 0;
    try { lastRun = parseInt(window.localStorage.getItem(LABEL_SYNC_THROTTLE_KEY), 10) || 0; } catch {}
    if (Date.now() - lastRun < LABEL_SYNC_THROTTLE_MS) return;
    try { window.localStorage.setItem(LABEL_SYNC_THROTTLE_KEY, String(Date.now())); } catch {}

    const { data: rels } = await fetchAllRows(() =>
      supabase.from("releases").select("label, release_date").not("release_date", "is", null).order("id")
    );
    if (!rels) return;
    const latestByLabel = {};
    rels.forEach((r) => {
      if (!r.label || !r.release_date) return;
      const year = parseInt(r.release_date.slice(0, 4), 10);
      if (!latestByLabel[r.label] || year > latestByLabel[r.label]) latestByLabel[r.label] = year;
    });
    const stale = labelRows.filter((l) => latestByLabel[l.label_name] && latestByLabel[l.label_name] !== l.latest_activity_year);
    if (stale.length === 0) return;
    await Promise.all(stale.map((l) => supabase.from("labels").update({ latest_activity_year: latestByLabel[l.label_name] }).eq("id", l.id)));
    setLabels((prev) => prev.map((l) => (latestByLabel[l.label_name] ? { ...l, latest_activity_year: latestByLabel[l.label_name] } : l)));
  }

  // Round 87 — checks every label's in-flight (gold) Hợp Đồng tickets and
  // flips them to done (green) once their ticket's status has reached that
  // ticket type's last status_options entry. Same "last option = the
  // terminal/finished status" convention TicketListPage.js already relies
  // on elsewhere in this app — there's no separate "is this ticket done"
  // flag on the tickets table to read instead.
  async function syncHopTacTicketStatuses(labelRows) {
    if (!supabase || labelRows.length === 0) return;
    let lastRun = 0;
    try { lastRun = parseInt(window.localStorage.getItem(HOPTAC_SYNC_THROTTLE_KEY), 10) || 0; } catch {}
    if (Date.now() - lastRun < HOPTAC_SYNC_THROTTLE_MS) return;
    try { window.localStorage.setItem(HOPTAC_SYNC_THROTTLE_KEY, String(Date.now())); } catch {}

    const pending = [];
    labelRows.forEach((l) => {
      Object.entries(l.hop_tac_status || {}).forEach(([tag, entry]) => {
        if (entry?.sentToLegal && entry.ticketId && !entry.done) pending.push({ labelId: l.id, tag, ticketId: entry.ticketId });
      });
    });
    if (pending.length === 0) return;

    const ticketIds = [...new Set(pending.map((p) => p.ticketId))];
    const { data: tickets } = await supabase.from("tickets").select("id, status, tab_id").in("id", ticketIds);
    if (!tickets || tickets.length === 0) return;
    const tabIds = [...new Set(tickets.map((t) => t.tab_id))];
    const { data: tabs } = await supabase.from("ticket_tabs").select("id, status_options").in("id", tabIds);
    const lastStatusByTab = {};
    (tabs || []).forEach((t) => { lastStatusByTab[t.id] = t.status_options?.[t.status_options.length - 1]; });
    const ticketById = {};
    tickets.forEach((t) => { ticketById[t.id] = t; });

    for (const p of pending) {
      const ticket = ticketById[p.ticketId];
      if (!ticket) continue;
      const doneStatus = lastStatusByTab[ticket.tab_id];
      if (!doneStatus || ticket.status !== doneStatus) continue;
      const freshLabel = (labels.find((l) => l.id === p.labelId)) || labelRows.find((l) => l.id === p.labelId);
      if (!freshLabel) continue;
      await markTagDone(freshLabel, p.tag);
    }
  }

  // Shared by the ticket-finished sync above and the "send to legal? No"
  // path below — both end with a tag flipping to done and the same two
  // cascades: auto-sign the label's overall Contract if this is its first
  // done tag, and (Publishing only) lock Phụ Lục Publishing on every
  // release under this label.
  async function markTagDone(label, tag, entryPatch) {
    const entry = { ...(label.hop_tac_status?.[tag] || {}), ...entryPatch, done: true };
    const nextStatus = { ...(label.hop_tac_status || {}), [tag]: entry };
    await supabase.from("labels").update({ hop_tac_status: nextStatus }).eq("id", label.id);
    let updated = { ...label, hop_tac_status: nextStatus };

    if (hasLabelPrefix(updated.label_name)) {
      const stripped = stripLabelPrefix(updated.label_name);
      await supabase.from("labels").update({ label_name: stripped, contract_signed: true }).eq("id", updated.id);
      updated = { ...updated, label_name: stripped, contract_signed: true };
    }
    // Item 6 — Publishing only for now (see lib/labelHopTacStatus.js's
    // publishingHdDone comment for why Youtube/Nhạc Số aren't wired up
    // yet). Locks every release currently tagged with this label — new
    // releases get force-locked live on the New Release / release detail
    // pages themselves (they read the label's own hop_tac_status).
    if (tag === "Publishing") {
      await supabase.from("releases").update({ gate_phu_luc_publishing: "false" }).eq("label", updated.label_name);
    }

    setLabels((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    return updated;
  }

  // Creates the Hợp Đồng ticket for tag on labelRow (label must already
  // exist — have a real id) and returns the resulting hop_tac_status
  // entry. Doesn't persist to `labels` itself — callers do that as part of
  // a larger update (and, for "No", call markTagDone right after instead).
  async function sendHopTacTicket(labelRow, tag) {
    const typeKey = HOP_TAC_TICKET_TYPE[tag];
    const { data: tab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", typeKey).single();
    if (!tab) return { sentToLegal: true, ticketId: null, done: false };
    const { data: ticket } = await supabase
      .from("tickets")
      .insert({
        tab_id: tab.id,
        data: { labelId: labelRow.id, labelName: labelRow.label_name, note: "" },
        status: tab.default_status,
        status_log: { [tab.default_status]: new Date().toISOString() },
        requester_segment: profile?.segment || null,
      })
      .select()
      .single();
    return { sentToLegal: true, ticketId: ticket?.id ?? null, done: false };
  }

  // "Send HĐ …" button on an existing row, or a tag re-clicked after the
  // popup already confirmed Yes/No — resolves the tag for a label that
  // already has an id.
  async function decideForRow(label, tag, sendToLegal) {
    setLegalPopup(null);
    if (!sendToLegal) {
      await markTagDone(label, tag);
      // markTagDone doesn't add the tag to hop_tac itself (it only patches
      // hop_tac_status) — do that here so the row's colored-pill list and
      // any hop_tac readers stay in sync.
      if (!(label.hop_tac || []).includes(tag)) {
        const nextHopTac = [...(label.hop_tac || []), tag];
        await supabase.from("labels").update({ hop_tac: nextHopTac }).eq("id", label.id);
        setLabels((prev) => prev.map((l) => (l.id === label.id ? { ...l, hop_tac: nextHopTac } : l)));
      }
      return;
    }
    const entry = await sendHopTacTicket(label, tag);
    const nextHopTac = (label.hop_tac || []).includes(tag) ? label.hop_tac : [...(label.hop_tac || []), tag];
    const nextStatus = { ...(label.hop_tac_status || {}), [tag]: entry };
    await supabase.from("labels").update({ hop_tac: nextHopTac, hop_tac_status: nextStatus }).eq("id", label.id);
    setLabels((prev) => prev.map((l) => (l.id === label.id ? { ...l, hop_tac: nextHopTac, hop_tac_status: nextStatus } : l)));
  }

  // Create-form version — the label doesn't have an id yet, so this only
  // stages the decision locally; addLabel() below does the actual ticket
  // creation once the insert returns a real id.
  function decideForCreate(tag, sendToLegal) {
    setLegalPopup(null);
    setForm((f) => ({
      ...f,
      hop_tac: f.hop_tac.includes(tag) ? f.hop_tac : [...f.hop_tac, tag],
      hop_tac_status: { ...f.hop_tac_status, [tag]: { sentToLegal, ticketId: null, done: !sentToLegal, pendingCreate: sendToLegal } },
    }));
  }

  function toggleFormHopTac(tag) {
    if (form.hop_tac.includes(tag)) {
      // Turning a tag back off — revert, no ticket exists yet at this stage.
      setForm((f) => {
        const nextStatus = { ...f.hop_tac_status };
        delete nextStatus[tag];
        return { ...f, hop_tac: f.hop_tac.filter((t) => t !== tag), hop_tac_status: nextStatus };
      });
      return;
    }
    setLegalPopup({ mode: "create", tag });
  }

  async function addLabel(e) {
    e.preventDefault();
    setError(null);
    if (!form.label_name.trim()) {
      setError("Label Name is required.");
      return;
    }
    const payload = {
      ...form,
      label_name: form.contract_signed ? stripLabelPrefix(form.label_name) : withLabelPrefix(form.label_name),
    };
    const { data: inserted, error: err } = await supabase.from("labels").insert(payload).select().single();
    if (err) {
      setError(err.message);
      return;
    }

    // Resolve every tag staged during creation now that a real label id
    // exists — send-to-legal Yes tags get their ticket created here;
    // No tags were already marked done at stage time, just need the
    // contract/publishing cascade run once, same as any other done tag.
    let labelRow = inserted;
    let finalStatus = { ...(labelRow.hop_tac_status || {}) };
    for (const tag of labelRow.hop_tac || []) {
      const staged = finalStatus[tag];
      if (!staged) continue;
      if (staged.pendingCreate) {
        const entry = await sendHopTacTicket(labelRow, tag);
        finalStatus[tag] = entry;
      }
    }
    await supabase.from("labels").update({ hop_tac_status: finalStatus }).eq("id", labelRow.id);
    labelRow = { ...labelRow, hop_tac_status: finalStatus };
    for (const tag of Object.keys(finalStatus)) {
      if (finalStatus[tag]?.done) labelRow = await markTagDone(labelRow, tag, finalStatus[tag]);
    }

    setForm(EMPTY);
    load();
  }

  async function updateLabelSuffix(label, suffix) {
    const newName = hasLabelPrefix(label.label_name) ? LABEL_PREFIX + suffix : suffix;
    setLabels((prev) => prev.map((l) => (l.id === label.id ? { ...l, label_name: newName } : l)));
    await supabase.from("labels").update({ label_name: newName }).eq("id", label.id);
  }

  async function updateField(label, field, value) {
    setLabels((prev) => prev.map((l) => (l.id === label.id ? { ...l, [field]: value } : l)));
    await supabase.from("labels").update({ [field]: value }).eq("id", label.id);
  }

  async function signContract(label) {
    if (!window.confirm(`Mark "${label.label_name}" as contract signed? This removes the "${LABEL_PREFIX}" prefix and can't be undone here.`)) return;
    const stripped = stripLabelPrefix(label.label_name);
    setLabels((prev) => prev.map((l) => (l.id === label.id ? { ...l, label_name: stripped, contract_signed: true } : l)));
    await supabase.from("labels").update({ label_name: stripped, contract_signed: true }).eq("id", label.id);
  }

  async function deleteLabel(label) {
    const { data: tiedArtists } = await supabase.from("artists").select("stage_name").eq("label_id", label.id);
    if (tiedArtists && tiedArtists.length > 0) {
      window.alert(
        `Can't delete "${label.label_name}" — ${tiedArtists.length} artist(s) are still linked to it ` +
        `(${tiedArtists.map((a) => a.stage_name).join(", ")}). Remove or reassign those ties first.`
      );
      return;
    }
    if (!window.confirm(`Delete "${label.label_name}"? This can't be undone.`)) return;
    const { error: err } = await supabase.from("labels").delete().eq("id", label.id);
    if (err) {
      window.alert(`Couldn't delete: ${err.message}`);
      return;
    }
    setLabels((prev) => prev.filter((l) => l.id !== label.id));
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>// Reference Table</div>
        <h1 className={styles.title}>Label List</h1>

        {error && <div className={styles.errorBox}>{error}</div>}

        <form onSubmit={addLabel} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10, alignItems: "flex-end" }}>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 180 }}>
            <label className={styles.fieldLabel}>Label Name *</label>
            <input className={styles.input} value={form.label_name} onChange={(e) => setForm((f) => ({ ...f, label_name: e.target.value }))} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 220 }}>
            <label className={styles.fieldLabel}>Hợp Tác</label>
            <TagPicker options={LABEL_HOP_TAC_OPTIONS} value={form.hop_tac} onToggle={toggleFormHopTac} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 140 }}>
            <label className={styles.fieldLabel}>Phân Loại</label>
            <PickSelect styles={styles} opts={["", ...LABEL_PHAN_LOAI_OPTIONS]} value={form.phan_loai} onChange={(v) => setForm((f) => ({ ...f, phan_loai: v }))} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0 }}>
            <label className={styles.fieldLabel} style={{ visibility: "hidden" }}>Contract</label>
            <button
              type="button"
              className={styles.btnSmall}
              onClick={() => setForm((f) => ({ ...f, contract_signed: !f.contract_signed }))}
              style={{
                background: form.contract_signed ? "rgba(255,107,26,0.15)" : "transparent",
                borderColor: form.contract_signed ? "var(--accent)" : "var(--border-strong)",
                color: form.contract_signed ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {form.contract_signed ? "✓ Contract Signed" : "Contract Signed"}
            </button>
          </div>
          <button className={styles.btnPrimary} type="submit">+ Add Label</button>
        </form>
        <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: -2, marginBottom: 20 }}>
          New labels get "{LABEL_PREFIX}" prepended automatically — shown as a fixed badge below, not part of
          the editable name. Contract auto-signs the moment any Hợp Tác tag goes green below — the "Contract
          Signed" button is only there as a manual fallback.
        </p>

        {labels.length === 0 ? (
          <div className={styles.emptyState}>No labels yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Label Name</th>
                <th>Contract</th>
                <th>Hợp Tác</th>
                <th>Thời gian hoạt động gần nhất</th>
                <th>Hợp Đồng</th>
                <th>Phân Loại</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {labels.map((l) => {
                const notStarted = LABEL_HOP_TAC_OPTIONS.filter((tag) => hopTacTagStatus(l, tag) === "none");
                const signed = anyHopTacDone(l) || !hasLabelPrefix(l.label_name);
                return (
                <tr key={l.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {hasLabelPrefix(l.label_name) && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap" }}>{LABEL_PREFIX}</span>
                      )}
                      <input
                        className={styles.input}
                        style={{ padding: "4px 8px", fontSize: 12, minWidth: 140 }}
                        defaultValue={hasLabelPrefix(l.label_name) ? stripLabelPrefix(l.label_name) : l.label_name}
                        onBlur={(e) => updateLabelSuffix(l, e.target.value)}
                      />
                    </div>
                  </td>
                  <td>
                    {signed ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--success-fg)" }}>✓ Signed</span>
                    ) : (
                      <button className={styles.btnSmall} onClick={() => signContract(l)}>Contract Signed</button>
                    )}
                  </td>
                  <td style={{ minWidth: 200 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {LABEL_HOP_TAC_OPTIONS.map((tag) => {
                        const status = hopTacTagStatus(l, tag);
                        const color = hopTacStatusColor(status);
                        const entry = hopTacTagEntry(l, tag);
                        return (
                          <span
                            key={tag}
                            title={status === "pending" ? `Ticket #${entry.ticketId} — pending` : status === "done" ? "Hợp Đồng complete" : "Not started"}
                            style={{ padding: "3px 10px", fontSize: 11, fontWeight: 700, borderRadius: 999, background: color.bg, color: color.fg, border: "1px solid var(--border)" }}
                          >
                            {tag}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text-faint)" }} title="Auto-computed from this label's most recent release — not editable here.">
                    {l.latest_activity_year || "—"}
                  </td>
                  <td style={{ minWidth: 160 }}>
                    {notStarted.length === 0 ? (
                      <span style={{ fontSize: 11, color: "var(--text-faint)" }}>—</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                        {notStarted.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className={styles.btnSmall}
                            style={{ fontSize: 10, padding: "3px 8px", whiteSpace: "nowrap" }}
                            onClick={() => setLegalPopup({ mode: "row", label: l, tag })}
                          >
                            Send HĐ {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <PickSelect styles={styles} opts={["", ...LABEL_PHAN_LOAI_OPTIONS]} value={l.phan_loai} onChange={(v) => updateField(l, "phan_loai", v)} style={{ padding: "4px 8px", fontSize: 12, minWidth: 110 }} />
                  </td>
                  <td>
                    <NoteCell value={l.note} onSave={(v) => updateField(l, "note", v)} />
                  </td>
                  <td><button onClick={() => deleteLabel(l)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>✕</button></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>

    {legalPopup && (
      <HopTacLegalPopup
        tag={legalPopup.tag}
        onCancel={() => setLegalPopup(null)}
        onDecide={(sendToLegal) =>
          legalPopup.mode === "create" ? decideForCreate(legalPopup.tag, sendToLegal) : decideForRow(legalPopup.label, legalPopup.tag, sendToLegal)
        }
      />
    )}
    </AppShell>
  );
}

// Multi-select pill picker for Hợp Tác on the CREATE form only — clicking
// an inactive tag opens the send-to-legal popup (see toggleFormHopTac);
// existing rows show a read-only status version of this instead (colored
// by hopTacTagStatus), no longer this clickable picker.
function TagPicker({ options, value, onToggle }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((opt) => {
        const active = (value || []).includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 999,
              cursor: "pointer",
              border: active ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
              background: active ? "rgba(255,107,26,0.15)" : "transparent",
              color: active ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// Round 87 (item 4) — the "send to legal?" panel a tag pops up, whether
// it's being chosen for the first time on the create form or started later
// via a row's "Send HĐ …" button. Yes sends a real ticket to that tag's
// Hợp Đồng list (Legal executes it); No just records the Hợp Đồng as
// already complete outside this system, same end color (green) either way
// once done.
function HopTacLegalPopup({ tag, onDecide, onCancel }) {
  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 20, width: "min(420px, 90vw)" }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Hợp Đồng {tag}</div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 0, marginBottom: 16 }}>
          Send to legal? Yes sends a ticket to Hợp Đồng {tag} (Legal executes it — the tag turns gold until it's
          done). No just marks it as already complete outside this system (turns green right away).
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onCancel} className={styles.btnSmall}>Cancel</button>
          <button type="button" onClick={() => onDecide(false)} className={styles.btnSmall}>No</button>
          <button type="button" onClick={() => onDecide(true)} className={styles.btnPrimary} style={{ padding: "6px 14px" }}>Yes</button>
        </div>
      </div>
    </div>
  );
}
