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
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [justPicked, setJustPicked] = useState(false);

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

    // Best-effort — record that the link was opened. Not blocking on failure.
    supabase.from("magic_links").update({ last_used_at: new Date().toISOString() }).eq("id", link.id);

    setLoading(false);
  }

  async function choosePackage(pkg) {
    if (magicLink.locked || release.package_locked) return;
    setPicking(true);
    const { error: err } = await supabase
      .from("releases")
      .update({ selected_package_id: pkg.id })
      .eq("id", release.id);
    setPicking(false);
    if (err) {
      setError(err.message);
      return;
    }
    setRelease((r) => ({ ...r, selected_package_id: pkg.id }));
    setJustPicked(true);
  }

  if (loading) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 640 }}>Loading…</div></div>;
  if (error) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 640 }}><div className={styles.errorBox}>{error}</div></div></div>;

  const isLocked = magicLink?.locked || release?.package_locked;

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
            Package selection is locked for this release — contact your OPS/AR contact if you need to change it.
          </div>
        )}

        {justPicked && !isLocked && (
          <div className={styles.successBox}>Your package selection has been saved.</div>
        )}

        <div style={{ display: "grid", gap: 14 }}>
          {packages.map((pkg) => {
            const selected = release?.selected_package_id === pkg.id;
            return (
              <button
                key={pkg.id}
                onClick={() => choosePackage(pkg)}
                disabled={isLocked || picking}
                style={{
                  textAlign: "left",
                  background: selected ? "rgba(255,107,26,0.1)" : "#121212",
                  border: selected ? "1px solid #ff6b1a" : "1px solid #262626",
                  borderRadius: 10,
                  padding: 18,
                  cursor: isLocked ? "not-allowed" : "pointer",
                  opacity: isLocked && !selected ? 0.5 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: selected ? "#ff9d5c" : "#f4f4f4" }}>
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
        </div>

        {packages.length === 0 && (
          <div className={styles.emptyState}>No packages configured yet — ask an admin to add some to release_packages.</div>
        )}
      </div>
    </div>
  );
}
