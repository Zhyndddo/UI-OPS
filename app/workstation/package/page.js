"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import styles from "../../shared.module.css";

function fmtVnd(n) {
  if (n === null || n === undefined || n === "") return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

// Marketing's actual package-building tool — this is where the itemized
// package (release_package_items) gets edited, and where magic link
// generation now lives, moved out of the release popup per the agreed
// split (Package Prep ticket = the request; this workstation = the
// ongoing work of actually building it).
export default function PackageWorkstation() {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [items, setItems] = useState([]);
  const [magicLinkUrl, setMagicLinkUrl] = useState(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("releases")
      .select("id, did, title, main_artist, project_type, package_ticket_sent, package_total_value, package_vieent_support, package_label_payment, package_payment_status, package_locked, release_date")
      .eq("package_ticket_sent", true)
      .order("release_date", { ascending: false });
    setReleases(data || []);
    setLoading(false);
  }

  async function expand(release) {
    if (expandedId === release.id) { setExpandedId(null); return; }
    setExpandedId(release.id);
    setMagicLinkUrl(null);
    const { data: existingItems } = await supabase.from("release_package_items").select("*").eq("release_id", release.id).order("sort_order");
    setItems(existingItems || []);
    const { data: link } = await supabase.from("magic_links").select("token").eq("release_id", release.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (link) setMagicLinkUrl(`${window.location.origin}/pick-package/${link.token}`);
  }

  async function addItem(release) {
    const maxSort = Math.max(-1, ...items.map((i) => i.sort_order));
    const { data } = await supabase.from("release_package_items").insert({ release_id: release.id, category: "", unit: "", quantity: null, detail: "", amount: null, sort_order: maxSort + 1 }).select().single();
    if (data) setItems((prev) => [...prev, data]);
  }

  async function updateItem(item, field, value) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, [field]: value } : i)));
    await supabase.from("release_package_items").update({ [field]: value }).eq("id", item.id);
  }

  async function removeItem(item) {
    await supabase.from("release_package_items").delete().eq("id", item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  async function updateReleaseField(release, field, value) {
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, [field]: value } : r)));
    await supabase.from("releases").update({ [field]: value }).eq("id", release.id);
  }

  async function generateMagicLink(release) {
    setGeneratingLink(true);
    const { data, error } = await supabase.from("magic_links").insert({ release_id: release.id }).select("token").single();
    setGeneratingLink(false);
    if (!error && data) setMagicLinkUrl(`${window.location.origin}/pick-package/${data.token}`);
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1100 }}>
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 4 }}>Package</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 24 }}>
            Releases that have had a Package Prep ticket sent — build the itemized package here, then
            generate the magic link once it's ready.
          </p>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : releases.length === 0 ? (
            <div className={styles.emptyState}>No releases with a Package Prep request yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {releases.map((r) => (
                <div key={r.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  <div
                    onClick={() => expand(r)}
                    style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                  >
                    <div>
                      <Link href={`/releases/${r.id}`} className={styles.rowLink} onClick={(e) => e.stopPropagation()}>{r.title}</Link>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.main_artist} · {r.did} · {fmtDate(r.release_date)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, color: "var(--accent-soft)", fontWeight: 700 }}>{r.project_type}</span>
                      <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{expandedId === r.id ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {expandedId === r.id && (
                    <div style={{ borderTop: "1px solid var(--border)", padding: 16 }}>
                      <div className={styles.grid2} style={{ marginBottom: 16 }}>
                        <Field label="Tổng Giá Trị Gói">
                          <input className={styles.input} defaultValue={r.package_total_value || ""} onBlur={(e) => updateReleaseField(r, "package_total_value", e.target.value || null)} />
                        </Field>
                        <Field label="VIEENT Hỗ Trợ">
                          <input className={styles.input} defaultValue={r.package_vieent_support || ""} onBlur={(e) => updateReleaseField(r, "package_vieent_support", e.target.value || null)} />
                        </Field>
                        <Field label="Label Thanh Toán">
                          <input className={styles.input} defaultValue={r.package_label_payment || ""} onBlur={(e) => updateReleaseField(r, "package_label_payment", e.target.value || null)} />
                        </Field>
                        <Field label="Trạng Thái Thanh Toán">
                          <select className={styles.select} value={r.package_payment_status || ""} onChange={(e) => updateReleaseField(r, "package_payment_status", e.target.value)}>
                            {["Chưa Thực Hiện", "Đang Thực Hiện", "Hoàn Thành"].map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </Field>
                      </div>

                      <div className={styles.subheading} style={{ marginTop: 0 }}>Itemized Package</div>
                      <table className={styles.table} style={{ marginBottom: 12 }}>
                        <thead>
                          <tr><th>Hạng Mục</th><th>Đơn Vị</th><th>Số Lượng</th><th>Chi Tiết</th><th>Thành Tiền</th><th></th></tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <tr key={item.id}>
                              <td><input className={styles.input} style={{ padding: "4px 8px", fontSize: 12 }} defaultValue={item.category || ""} onBlur={(e) => updateItem(item, "category", e.target.value)} /></td>
                              <td><input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, width: 70 }} defaultValue={item.unit || ""} onBlur={(e) => updateItem(item, "unit", e.target.value)} /></td>
                              <td><input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, width: 70 }} defaultValue={item.quantity || ""} onBlur={(e) => updateItem(item, "quantity", e.target.value || null)} /></td>
                              <td><input className={styles.input} style={{ padding: "4px 8px", fontSize: 12 }} defaultValue={item.detail || ""} onBlur={(e) => updateItem(item, "detail", e.target.value)} /></td>
                              <td><input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, width: 110 }} defaultValue={item.amount || ""} onBlur={(e) => updateItem(item, "amount", e.target.value || null)} /></td>
                              <td><button onClick={() => removeItem(item)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>✕</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <button className={styles.btnSmall} onClick={() => addItem(r)}>+ Add Item</button>

                      <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <button className={styles.btnSecondary} onClick={() => generateMagicLink(r)} disabled={generatingLink}>
                          {generatingLink ? "Generating…" : magicLinkUrl ? "Generate New Link" : "Generate Magic Link"}
                        </button>
                        {r.package_locked && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Locked on the release side</span>}
                      </div>
                      {magicLinkUrl && (
                        <div style={{ marginTop: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>Share this link with the artist:</div>
                          <a href={magicLinkUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 13, wordBreak: "break-all" }}>{magicLinkUrl}</a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}
