"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import styles from "../../shared.module.css";

function fmtVnd(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

// These 2 are always offered alongside whatever real packages Marketing
// has actually built for this release — they're plain picks with no
// itemized breakdown, not full packages. ("Int Media" used to be a 3rd
// entry here as a fake quick-pick; it's now a real buildable package type
// — see BuildPackagePopup — so it was removed from this list to avoid two
// different things both being called "Int Media".)
const SIMPLE_OPTIONS = ["Chỉ Phát Hành", "Không Độc Quyền"];

export default function PickPackagePage() {
  const { token } = useParams();
  const [magicLink, setMagicLink] = useState(null);
  const [release, setRelease] = useState(null);
  const [pickOptions, setPickOptions] = useState([]); // real built packages + the 3 simple ones
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
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

    const { data: realPackages } = await supabase
      .from("media_booking_packages")
      .select("*, media_booking_package_lines(*)")
      .eq("release_id", link.release_id)
      .order("sort_order");
    const { data: pkgCategories } = await supabase.from("package_categories").select("id, name");
    const categoryNameById = {};
    (pkgCategories || []).forEach((c) => (categoryNameById[c.id] = c.name));

    const realOptions = (realPackages || []).map((p) => {
      // INT MEDIA is a mushed package — Hạng Mục names only, never a
      // price or a calculation, on the build side or here.
      const isIntMedia = p.name === "INT MEDIA";
      return {
        value: p.name,
        label: p.name,
        kind: isIntMedia ? "intMedia" : "real",
        totalValue: isIntMedia || !(p.media_booking_package_lines || []).some((l) => l.amount != null)
          ? null
          : p.media_booking_package_lines.reduce((sum, l) => sum + (l.amount || 0), 0),
        items: (p.media_booking_package_lines || []).map((l) => ({
          category: (categoryNameById[l.category_id] || l.platform || "—") + (l.brand ? ` — ${l.brand}` : ""),
          unit: l.unit, quantity: l.quantity, detail: l.detail, amount: l.amount,
        })),
      };
    });
    const simpleOptions = SIMPLE_OPTIONS.map((name) => ({ value: name, label: name, kind: "simple", totalValue: null, items: [] }));
    const options = [...realOptions, ...simpleOptions];
    setPickOptions(options);

    if (rel && !["BRIEF & DATA", "DEALING"].includes(rel.project_type)) {
      setSelectedValue(rel.project_type);
      setConfirmed(true);
    }

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
  // in the package, and auto-creates the Phụ Lục ticket (once). A real
  // package's lines get copied into release_package_items (matching how
  // the old template flow worked); a simple option just sets project_type
  // with no itemized breakdown at all.
  async function confirmChoice() {
    if (isLocked || !selectedValue) return;
    setPicking(true);
    const wasPipelineStage = ["BRIEF & DATA", "DEALING"].includes(release?.project_type);
    const option = pickOptions.find((o) => o.value === selectedValue);
    const { error: err } = await supabase
      .from("releases")
      .update({
        project_type: selectedValue,
        package_total_value: option?.totalValue ?? null,
      })
      .eq("id", release.id);
    setPicking(false);
    if (err) { setError(err.message); return; }
    setRelease((r) => ({ ...r, project_type: selectedValue, package_total_value: option?.totalValue ?? null }));
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

    // Real packages (including INT MEDIA, which still carries the full
    // underlying quantity/detail data even though it's hidden from this
    // client-facing view) have items to seed release_package_items with —
    // simple options (Chỉ Phát Hành etc.) genuinely have none.
    if ((option?.kind === "real" || option?.kind === "intMedia") && option.items.length > 0) {
      const { data: existingItems } = await supabase.from("release_package_items").select("id").eq("release_id", release.id).limit(1);
      if (!existingItems || existingItems.length === 0) {
        const rows = option.items.map((it, i) => ({
          release_id: release.id, category: it.category, unit: it.unit,
          quantity: it.quantity, detail: it.detail, amount: it.amount, sort_order: i,
        }));
        await supabase.from("release_package_items").insert(rows);
      }
    }
  }

  if (loading) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 640 }}>Loading…</div></div>;
  if (error) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 640 }}><div className={styles.errorBox}>{error}</div></div></div>;

  const isLocked = magicLink?.locked || release?.package_locked;
  const isPipelineStage = ["BRIEF & DATA", "DEALING"].includes(release?.project_type);

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 1180 }}>
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
          Each contract type comes with its own package — compare them side by side below, then confirm
          your choice.
        </p>

        {/* All options shown at once, full breakdown always expanded — a
            side-by-side comparison, not a stack of collapsible cards. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, alignItems: "start" }}>
          {pickOptions.map((c) => {
            const selected = selectedValue === c.value;
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: selected ? "#ff9d5c" : "#f4f4f4" }}>
                      {c.label || c.value}
                    </span>
                    {selected && <span style={{ fontSize: 11, color: "#ff6b1a", fontWeight: 700 }}>{confirmed ? "CONFIRMED" : "SELECTED — not confirmed yet"}</span>}
                    {c.totalValue != null && (
                      <span style={{ fontSize: 13, color: "#999" }}>{fmtVnd(c.totalValue)}</span>
                    )}
                  </div>
                </button>
                {c.kind === "intMedia" ? (
                  // INT MEDIA — Hạng Mục names only, no numbers or pricing.
                  <div style={{ borderTop: "1px solid #262626", padding: "10px 16px", display: "grid", gap: 6 }}>
                    {c.items.map((item, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#ccc" }}>{item.category}</div>
                    ))}
                  </div>
                ) : c.items?.length > 0 ? (
                  <div style={{ borderTop: "1px solid #262626", padding: "8px 16px" }}>
                    <table className={styles.table} style={{ marginTop: 8 }}>
                      <thead>
                        <tr><th>Hạng Mục</th><th>Số Lượng</th><th>Chi Tiết</th><th>Thành Tiền</th></tr>
                      </thead>
                      <tbody>
                        {c.items.map((item, i) => (
                          <tr key={i}>
                            <td>{item.category}</td>
                            <td>{item.quantity != null ? `${item.quantity} ${item.unit || ""}` : "—"}</td>
                            <td style={{ fontSize: 11, color: "#999", whiteSpace: "pre-line" }}>{item.detail || "—"}</td>
                            <td>{fmtVnd(item.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {pickOptions.length === 0 && (
          <div className={styles.emptyState}>No packages built yet.</div>
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

