"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import styles from "../../shared.module.css";

const TEMPLATES = ["Độc Quyền Vĩnh Viễn", "Độc Quyền 5 năm", "Độc Quyền 2 năm"];

function fmtVnd(n) {
  if (n === null || n === undefined || n === "") return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

// This IS the package-building tool (the "workstation" it was briefly
// pulled out into moved back in here) — clicking a row opens the builder:
// pick a template, edit the itemized numbers live, generate the magic
// link as a final check. The executor flipping status PROCESS -> DONE is
// what actually sends that link forward to the release's detail page.
export default function MediaBookingList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [openTicket, setOpenTicket] = useState(null);

  const isExecutorView = !profile?.segment || profile.segment === "Marketing";

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name").order("name").then(({ data }) => setProfiles(data || []));
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "media_booking").single();
    setTab(tabRow);
    if (tabRow && !statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data } = tabRow
      ? await supabase.from("tickets").select("*, profiles(name)").eq("tab_id", tabRow.id).is("deleted_at", null).order("created_at", { ascending: false })
      : { data: [] };
    setTickets(data || []);
    setLoading(false);
  }

  async function updatePic(t, profileId) {
    const patch = { pic_profile_id: profileId || null };
    if (profileId && t.status === tab.default_status) {
      const nextStatus = tab.status_options[1];
      if (nextStatus) { patch.status = nextStatus; patch.status_log = { ...t.status_log, [nextStatus]: new Date().toISOString() }; }
    }
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
    load();
  }

  async function updateStatus(t, newStatus) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    const patch = { status: newStatus, status_log: newLog };
    if (newStatus === "REFUND") patch.pic_profile_id = null;
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  const visibleTickets = useMemo(() => {
    if (!tab) return [];
    if (isExecutorView) return tickets.filter((t) => t.status === statusFilter);
    return [...tickets].sort((a, b) => (a.status === "REFUND" ? 0 : 1) - (b.status === "REFUND" ? 0 : 1));
  }, [tickets, tab, isExecutorView, statusFilter]);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1100 }}>
          <TypeSwitcher kind="ticket" current="media_booking" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Media Booking</h1>
            </div>
            <Link href="/tickets/media-booking/new" className={styles.btnPrimary}>+ New Ticket</Link>
          </div>

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
            <table className={styles.table}>
              <thead>
                <tr><th>Release (DID)</th><th>Propose Package</th><th>PIC</th><th>Deadline</th><th>Status</th></tr>
              </thead>
              <tbody>
                {visibleTickets.map((t) => {
                  const color = statusColor(t.status);
                  return (
                    <tr key={t.id} onClick={() => setOpenTicket(t)} style={{ cursor: "pointer" }}>
                      <td><span className={styles.rowLink}>{t.data?.releaseId}</span></td>
                      <td>{t.data?.proposedPackage || "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isExecutorView ? (
                          <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12 }} value={t.pic_profile_id || ""} onChange={(e) => updatePic(t, e.target.value)}>
                            <option value="">— Unassigned —</option>
                            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : (t.profiles?.name || "—")}
                      </td>
                      <td>{fmtDate(t.deadline)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isExecutorView ? (
                          <select value={t.status} onChange={(e) => updateStatus(t, e.target.value)} style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
                            {tab.status_options.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{t.status}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {openTicket && (
        <PackageBuilderPopup
          ticket={openTicket}
          onClose={() => setOpenTicket(null)}
          onStatusChange={(newStatus) => { updateStatus(openTicket, newStatus); setOpenTicket((t) => ({ ...t, status: newStatus })); }}
        />
      )}
    </AppShell>
  );
}

function PackageBuilderPopup({ ticket, onClose, onStatusChange }) {
  const [release, setRelease] = useState(null);
  const [template, setTemplate] = useState(ticket.data?.proposedPackage || "");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [magicLinkUrl, setMagicLinkUrl] = useState(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: rel } = await supabase.from("releases").select("*").eq("did", ticket.data?.releaseId).maybeSingle();
      setRelease(rel);
      if (rel) {
        const { data: existingItems } = await supabase.from("release_package_items").select("*").eq("release_id", rel.id).order("sort_order");
        if (existingItems && existingItems.length > 0) {
          setItems(existingItems);
        } else if (template) {
          await loadTemplate(template, rel.id);
        }
        const { data: link } = await supabase.from("magic_links").select("token").eq("release_id", rel.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (link) setMagicLinkUrl(`${window.location.origin}/pick-package/${link.token}`);
      }
      setLoading(false);
    })();
  }, []);

  // Picking a template copies its items into release_package_items for
  // this release — a real, editable starting point, not just a preview.
  async function loadTemplate(templateName, releaseId) {
    setTemplate(templateName);
    const targetReleaseId = releaseId || release?.id;
    if (!targetReleaseId) return;
    const { data: tpl } = await supabase.from("contract_type_packages").select("*").eq("contract_type", templateName).maybeSingle();
    if (!tpl) return;
    await supabase.from("release_package_items").delete().eq("release_id", targetReleaseId);
    const rows = (tpl.items || []).map((it, i) => ({ release_id: targetReleaseId, category: it.category, unit: it.unit, quantity: it.quantity, detail: it.detail, amount: it.amount, sort_order: i }));
    const { data: inserted } = await supabase.from("release_package_items").insert(rows).select();
    setItems(inserted || []);
    await supabase.from("releases").update({ package_total_value: tpl.total_value }).eq("id", targetReleaseId);
  }

  async function updateItem(item, field, value) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, [field]: value } : i)));
    await supabase.from("release_package_items").update({ [field]: value }).eq("id", item.id);
  }

  async function generateLink() {
    if (!release) return;
    setGeneratingLink(true);
    const { data, error } = await supabase.from("magic_links").insert({ release_id: release.id }).select("token").single();
    setGeneratingLink(false);
    if (!error && data) setMagicLinkUrl(`${window.location.origin}/pick-package/${data.token}`);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 24, maxWidth: 800, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div className={styles.eyebrow}>// Package Builder</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{release?.title || ticket.data?.releaseId}</h2>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{release?.main_artist}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : (
          <>
            <div className={styles.subheading} style={{ marginTop: 0 }}>Template</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {TEMPLATES.map((t) => (
                <button
                  key={t}
                  onClick={() => loadTemplate(t)}
                  style={{
                    padding: "8px 16px", fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer",
                    border: template === t ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
                    background: template === t ? "rgba(255,107,26,0.1)" : "transparent",
                    color: template === t ? "var(--accent-soft)" : "var(--text)",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {items.length > 0 && (
              <table className={styles.table} style={{ marginBottom: 16 }}>
                <thead><tr><th>Hạng Mục</th><th>Số Lượng</th><th>Chi Tiết</th><th>Thành Tiền</th></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontSize: 12 }}>{item.category}</td>
                      <td>
                        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, width: 80 }} defaultValue={item.quantity || ""} onBlur={(e) => updateItem(item, "quantity", e.target.value || null)} />
                        <span style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: 4 }}>{item.unit}</span>
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        <textarea
                          className={styles.textarea}
                          style={{ minHeight: 40, fontSize: 11, padding: "4px 8px" }}
                          defaultValue={item.detail || ""}
                          onBlur={(e) => updateItem(item, "detail", e.target.value)}
                        />
                      </td>
                      <td>
                        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, width: 110 }} defaultValue={item.amount || ""} onBlur={(e) => updateItem(item, "amount", e.target.value || null)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {!magicLinkUrl && (
                <button className={styles.btnSecondary} onClick={generateLink} disabled={generatingLink || !release}>
                  {generatingLink ? "Generating…" : "Generate Magic Link"}
                </button>
              )}
              <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Final check before the next step — the artist doesn't see this until you mark the ticket Done.</span>
            </div>
            {magicLinkUrl && (
              <div style={{ marginTop: 12, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Link already generated — sent once, not regenerable from here.</div>
                <a href={magicLinkUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 12, wordBreak: "break-all" }}>{magicLinkUrl}</a>
              </div>
            )}

            <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <div className={styles.fieldLabel} style={{ marginBottom: 8 }}>Status</div>
              <select className={styles.select} value={ticket.status} onChange={(e) => onStatusChange(e.target.value)} style={{ maxWidth: 220 }}>
                {["REQUESTED", "PROCESS", "COMPLETE", "REFUND", "CANCELED"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 6 }}>
                Moving this to Done is what actually sends the magic link forward to the release's detail page.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
