"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import styles from "../../shared.module.css";

function fmtVnd(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

export default function PickPackagePage() {
  const { token } = useParams();
  const [magicLink, setMagicLink] = useState(null);
  const [release, setRelease] = useState(null);
  const [contractTypes, setContractTypes] = useState([]);
  const [templates, setTemplates] = useState({}); // contract_type -> {total_value, items}
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [selectedValue, setSelectedValue] = useState(null); // local pick, not yet committed
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!supabase || !token) return;
    load();
  }, [token]);

  async function load() {
    setLoading(true);
    setError(null);

    const { data: link, error: linkErr } = await supabase
      .from("magic_links")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (linkErr || !link) {
      setError("This link doesn't look valid. Double-check the URL you were sent.");
      setLoading(false);
      return;
    }
    setMagicLink(link);

    const { data: rel } = await supabase.from("releases").select("*").eq("id", link.release_id).single();
    setRelease(rel);
    if (rel && !["BRIEF & DATA", "DEALING"].includes(rel.project_type)) {
      setSelectedValue(rel.project_type);
      setConfirmed(true);
    }

    const { data: contracts } = await supabase
      .from("lookup_options")
      .select("value, label")
      .eq("category", "contract_type")
      .eq("active", true)
      .order("sort_order");
    setContractTypes(contracts || []);

    // Prefer the release's own customized package (Marketing's working
    // copy) over the generic template — falls back to the template if
    // Marketing hasn't prepared one yet for a given contract type.
    const { data: releaseItems } = await supabase
      .from("release_package_items")
      .select("*")
      .eq("release_id", link.release_id)
      .order("sort_order");
    const { data: templateRows } = await supabase.from("contract_type_packages").select("*");

    const byType = {};
    (templateRows || []).forEach((t) => {
      byType[t.contract_type] = { total_value: t.total_value, items: t.items || [] };
    });
    // If this release has its own customized items at all, they apply to
    // whichever contract type is currently selected/resolved (Marketing
    // works on one specific deal, not a library of options simultaneously).
    if (releaseItems && releaseItems.length > 0 && rel?.project_type) {
      byType[rel.project_type] = {
        total_value: rel.package_total_value,
        items: releaseItems.map((i) => ({ category: i.category, unit: i.unit, quantity: i.quantity, detail: i.detail, amount: i.amount })),
      };
    }
    setTemplates(byType);

    supabase.from("magic_links").update({ last_used_at: new Date().toISOString() }).eq("id", link.id);
    setLoading(false);
  }

  // Clicking a card only selects it locally now — nothing commits until
  // Confirm is pressed. This also removes the old race condition where a
  // click could land while isLocked was flipping true (e.g. admin hitting
  // "Lock editing" around the same moment), leaving project_type stuck.
  function selectPackage(value) {
    if (isLocked) return;
    setSelectedValue(value);
    setConfirmed(false);
  }

  // The actual commit — resolves project_type out of the pipeline, locks
  // in the package, and auto-creates the Phụ Lục ticket (once).
  async function confirmChoice() {
    if (isLocked || !selectedValue) return;
    setPicking(true);
    const wasPipelineStage = ["BRIEF & DATA", "DEALING"].includes(release?.project_type);
    const pkg = templates[selectedValue];
    const { error: err } = await supabase
      .from("releases")
      .update({
        project_type: selectedValue,
        package_total_value: pkg?.total_value ?? null,
      })
      .eq("id", release.id);
    setPicking(false);
    if (err) { setError(err.message); return; }
    setRelease((r) => ({ ...r, project_type: selectedValue, package_total_value: pkg?.total_value ?? null }));
    setConfirmed(true);

    if (wasPipelineStage) {
      const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "phu_luc").single();
      if (tab) {
        await supabase.from("tickets").insert({
          tab_id: tab.id,
          data: { releaseId: release.id },
        });
      }
    }

    // If Marketing hasn't already built a customized package for this
    // release, seed release_package_items from the template right now —
    // otherwise the Media Booking tab has nothing to show until someone
    // manually opens the popup builder later.
    const { data: existingItems } = await supabase.from("release_package_items").select("id").eq("release_id", release.id).limit(1);
    if ((!existingItems || existingItems.length === 0) && pkg?.items?.length > 0) {
      const rows = pkg.items.map((it, i) => ({
        release_id: release.id, category: it.category, unit: it.unit,
        quantity: it.quantity, detail: it.detail, amount: it.amount, sort_order: i,
      }));
      await supabase.from("release_package_items").insert(rows);
    }
  }

  if (loading) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 640 }}>Loading…</div></div>;
  if (error) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 640 }}><div className={styles.errorBox}>{error}</div></div></div>;

  const isLocked = magicLink?.locked || release?.package_locked;
  const isPipelineStage = ["BRIEF & DATA", "DEALING"].includes(release?.project_type);

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 640 }}>
        <div className={styles.eyebrow}>// Chọn Loại Hợp Đồng</div>
        <h1 className={styles.title} style={{ marginBottom: 4 }}>
          {release?.title}
        </h1>
        <div style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
          {release?.main_artist} · {release?.release_date} {release?.release_time}
        </div>

        {isLocked && (
          <div className={styles.errorBox} style={{ background: "#1a1a1a", borderColor: "#333", color: "#aaa" }}>
            Selection is locked for this release — contact your OPS/AR contact if you need to change it.
          </div>
        )}

        {!isLocked && isPipelineStage && (
          <p style={{ color: "#666", fontSize: 12, marginBottom: 16 }}>
            Current stage: <span style={{ color: "#ff9d5c" }}>{release?.project_type}</span>
          </p>
        )}

        <p style={{ color: "#888", fontSize: 12, marginBottom: 20 }}>
          Each contract type comes with its own package — pick the one that fits, tap to see the full
          breakdown, then confirm your choice below.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          {contractTypes.map((c) => {
            const selected = selectedValue === c.value;
            const pkg = templates[c.value];
            const isOpen = expanded === c.value;
            return (
              <div
                key={c.value}
                style={{
                  background: selected ? "rgba(255,107,26,0.1)" : "#121212",
                  border: selected ? "1px solid #ff6b1a" : "1px solid #262626",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => selectPackage(c.value)}
                  disabled={isLocked || picking}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    padding: 16,
                    cursor: isLocked ? "not-allowed" : "pointer",
                    opacity: isLocked && !selected ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 15, fontWeight: 800, color: selected ? "#ff9d5c" : "#f4f4f4" }}>
                        {c.label || c.value}
                      </span>
                      {selected && <span style={{ fontSize: 11, color: "#ff6b1a", fontWeight: 700, marginLeft: 10 }}>{confirmed ? "CONFIRMED" : "SELECTED — not confirmed yet"}</span>}
                    </div>
                    {pkg?.total_value != null && (
                      <span style={{ fontSize: 13, color: "#999" }}>{fmtVnd(pkg.total_value)}</span>
                    )}
                  </div>
                </button>
                {pkg?.items?.length > 0 && (
                  <div style={{ borderTop: "1px solid #262626", padding: "8px 16px" }}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : c.value)}
                      style={{ background: "none", border: "none", color: "#666", fontSize: 11, cursor: "pointer", padding: "4px 0" }}
                    >
                      {isOpen ? "▲ Ẩn chi tiết" : "▼ Xem chi tiết gói"}
                    </button>
                    {isOpen && (
                      <table className={styles.table} style={{ marginTop: 8 }}>
                        <thead>
                          <tr><th>Hạng Mục</th><th>Số Lượng</th><th>Chi Tiết</th><th>Thành Tiền</th></tr>
                        </thead>
                        <tbody>
                          {pkg.items.map((item, i) => (
                            <tr key={i}>
                              <td>{item.category}</td>
                              <td>{item.quantity} {item.unit}</td>
                              <td style={{ fontSize: 11, color: "#999", whiteSpace: "pre-line" }}>{item.detail || "—"}</td>
                              <td>{fmtVnd(item.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {contractTypes.length === 0 && (
          <div className={styles.emptyState}>No contract types configured yet.</div>
        )}

        {!isLocked && selectedValue && (
          <button
            onClick={confirmChoice}
            disabled={picking || confirmed}
            style={{
              marginTop: 20,
              width: "100%",
              background: confirmed ? "#1a1a1a" : "#ff6b1a",
              color: confirmed ? "#7ee6a8" : "#0a0a0a",
              border: confirmed ? "1px solid #2e7d32" : "none",
              borderRadius: 8,
              padding: "14px 0",
              fontSize: 14,
              fontWeight: 800,
              cursor: confirmed ? "default" : "pointer",
              letterSpacing: 0.4,
            }}
          >
            {picking ? "Confirming…" : confirmed ? "✓ Package Confirmed" : "Xác Nhận Gói Đã Chọn"}
          </button>
        )}
      </div>
    </div>
  );
}
