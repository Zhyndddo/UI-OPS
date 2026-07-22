"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import styles from "../../shared.module.css";

export default function PickPackagePage() {
  const { token } = useParams();
  const [magicLink, setMagicLink] = useState(null);
  const [release, setRelease] = useState(null);
  const [packages, setPackages] = useState([]);
  const [contractTypes, setContractTypes] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pickingPackage, setPickingPackage] = useState(false);
  const [pickingContract, setPickingContract] = useState(false);

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

    const { data: pkgs } = await supabase.from("release_packages").select("*").eq("active", true).order("sort_order");
    setPackages(pkgs || []);

    const { data: contracts } = await supabase
      .from("lookup_options")
      .select("value, label")
      .eq("category", "contract_type")
      .eq("active", true)
      .order("sort_order");
    setContractTypes(contracts || []);

    // Best-effort — record that the link was opened. Not blocking on failure.
    supabase.from("magic_links").update({ last_used_at: new Date().toISOString() }).eq("id", link.id);

    setLoading(false);
  }

  // Marketing package (Cơ Bản/Nâng Cao/...) — feeds the Media Booking
  // auto-generated "Project" note. Independent from the contract type below.
  async function choosePackage(pkg) {
    if (isLocked) return;
    setPickingPackage(true);
    const { error: err } = await supabase.from("releases").update({ selected_package_id: pkg.id }).eq("id", release.id);
    setPickingPackage(false);
    if (err) { setError(err.message); return; }
    setRelease((r) => ({ ...r, selected_package_id: pkg.id }));
  }

  // Contract type (Chỉ Phát Hành/Độc Quyền.../etc.) — THIS is what actually
  // resolves project_type out of the pipeline (BRIEF & DATA -> DEALING ->
  // LEGAL). It's the "Chốt Gói Hỗ Trợ Truyền Thông" task from the master
  // plan, done by the artist through this link — independent of which
  // marketing package they picked above.
  async function chooseContract(value) {
    if (isLocked) return;
    setPickingContract(true);
    const { error: err } = await supabase.from("releases").update({ project_type: value }).eq("id", release.id);
    setPickingContract(false);
    if (err) { setError(err.message); return; }
    setRelease((r) => ({ ...r, project_type: value }));
  }

  if (loading) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 640 }}>Loading…</div></div>;
  if (error) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 640 }}><div className={styles.errorBox}>{error}</div></div></div>;

  const isLocked = magicLink?.locked || release?.package_locked;
  const isPipelineStage = ["BRIEF & DATA", "DEALING", "LEGAL"].includes(release?.project_type);

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 640 }}>
        <div className={styles.eyebrow}>// Chọn Gói</div>
        <h1 className={styles.title} style={{ marginBottom: 4 }}>
          {release?.title}
        </h1>
        <div style={{ color: "#888", fontSize: 13, marginBottom: 28 }}>
          {release?.main_artist} · {release?.release_date} {release?.release_time}
        </div>

        {isLocked && (
          <div className={styles.errorBox} style={{ background: "#1a1a1a", borderColor: "#333", color: "#aaa" }}>
            Selection is locked for this release — contact your OPS/AR contact if you need to change it.
          </div>
        )}

        <div className={styles.subheading} style={{ marginTop: 0 }}>Gói Hỗ Trợ Truyền Thông (Marketing Package)</div>
        <div style={{ display: "grid", gap: 12, marginBottom: 32 }}>
          {packages.map((pkg) => {
            const selected = release?.selected_package_id === pkg.id;
            return (
              <button
                key={pkg.id}
                onClick={() => choosePackage(pkg)}
                disabled={isLocked || pickingPackage}
                style={{
                  textAlign: "left",
                  background: selected ? "rgba(255,107,26,0.1)" : "#121212",
                  border: selected ? "1px solid #ff6b1a" : "1px solid #262626",
                  borderRadius: 10,
                  padding: 16,
                  cursor: isLocked ? "not-allowed" : "pointer",
                  opacity: isLocked && !selected ? 0.5 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: selected ? "#ff9d5c" : "#f4f4f4" }}>
                    {pkg.name}
                  </span>
                  {selected && <span style={{ fontSize: 11, color: "#ff6b1a", fontWeight: 700 }}>SELECTED</span>}
                </div>
                {pkg.description && (
                  <div style={{ fontSize: 12, color: "#999", whiteSpace: "pre-line" }}>{pkg.description}</div>
                )}
              </button>
            );
          })}
          {packages.length === 0 && (
            <div className={styles.emptyState}>No packages configured yet.</div>
          )}
        </div>

        <div className={styles.subheading}>Loại Hợp Đồng (Contract Type)</div>
        {!isLocked && isPipelineStage && (
          <p style={{ color: "#666", fontSize: 12, marginTop: -4, marginBottom: 12 }}>
            Current stage: <span style={{ color: "#ff9d5c" }}>{release?.project_type}</span>
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {contractTypes.map((c) => {
            const selected = release?.project_type === c.value;
            return (
              <button
                key={c.value}
                onClick={() => chooseContract(c.value)}
                disabled={isLocked || pickingContract}
                style={{
                  textAlign: "left",
                  background: selected ? "rgba(255,107,26,0.1)" : "#121212",
                  border: selected ? "1px solid #ff6b1a" : "1px solid #262626",
                  borderRadius: 8,
                  padding: 12,
                  cursor: isLocked ? "not-allowed" : "pointer",
                  opacity: isLocked && !selected ? 0.5 : 1,
                  fontSize: 13,
                  fontWeight: selected ? 700 : 400,
                  color: selected ? "#ff9d5c" : "#ccc",
                }}
              >
                {c.label || c.value}
              </button>
            );
          })}
        </div>

        {!isLocked && !isPipelineStage && (
          <div className={styles.successBox} style={{ marginTop: 20 }}>
            Selections saved — {release.project_type} / {packages.find((p) => p.id === release.selected_package_id)?.name || "no package chosen yet"}.
          </div>
        )}
      </div>
    </div>
  );
}
