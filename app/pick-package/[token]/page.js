"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import styles from "../../shared.module.css";

function fmtVnd(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

// Only "Chỉ Phát Hành" remains as an always-offered plain pick (no
// itemized breakdown) — "Không Độc Quyền" was removed entirely per
// request. "Int Media" used to be a 3rd entry here as a fake quick-pick;
// it's now a real buildable package type (see BuildPackagePopup) AND, as
// of the INT MEDIA follow-up flow, a special add-on that overrides the
// Chỉ Phát Hành card below once built — see the intMediaOverride logic
// further down.
const SIMPLE_OPTIONS = ["Chỉ Phát Hành"];
const BOOKING_ROUNDS = ["INT", "Đợt 1", "Đợt 2"];

// Shared Terms Block B ("Chỉ áp dụng cho gói 5 năm và 2 năm…") is only
// ever relevant to these 2 tiers — Vĩnh Viễn (or anything else) never
// shows it, even though Block A still shows for every real package.
const SHARED_B_TIERS = ["độc quyền 5 năm", "độc quyền 2 năm"];

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
  const [categories, setCategories] = useState([]); // package_categories — for the booking-progress summary
  const [packageItems, setPackageItems] = useState([]); // release_package_items — the confirmed/locked package's real breakdown
  const [bookingEntries, setBookingEntries] = useState([]);
  const [round, setRound] = useState("INT");
  const [sharedTerms, setSharedTerms] = useState({ a: "", conditions: "", b: "" }); // global_settings' canned blocks, shown alongside any real package's own terms_text

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

    // terms_text per contract type — matched against the package's own
    // (free-typed) name. Only the 3 real Độc Quyền tiers carry one; a
    // custom-named package just shows nothing extra here.
    const { data: termsRows } = await supabase.from("contract_type_packages").select("contract_type, terms_text");
    const termsByName = {};
    (termsRows || []).forEach((t) => { if (t.terms_text) termsByName[t.contract_type.trim().toLowerCase()] = t.terms_text; });

    const { data: settingsRows } = await supabase.from("global_settings").select("key, value").in("key", ["package_terms_shared_a", "package_terms_conditions", "package_terms_shared_b"]);
    const settingsByKey = {};
    (settingsRows || []).forEach((s) => (settingsByKey[s.key] = s.value));
    setSharedTerms({
      a: settingsByKey.package_terms_shared_a || "",
      conditions: settingsByKey.package_terms_conditions || "",
      b: settingsByKey.package_terms_shared_b || "",
    });

    const realOptions = (realPackages || []).map((p) => {
      // INT MEDIA is a mushed package — Hạng Mục names only, never a
      // price or a calculation, on the build side or here.
      const isIntMedia = p.name === "INT MEDIA";
      const matchedTier = (p.name || "").trim().toLowerCase();
      return {
        value: p.name,
        label: p.name,
        kind: isIntMedia ? "intMedia" : "real",
        termsText: termsByName[matchedTier] || null,
        showSharedB: SHARED_B_TIERS.includes(matchedTier),
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

    // INT MEDIA follow-up override: once Marketing has built an "INT
    // MEDIA" package for a release that was locked in as "Chỉ Phát Hành",
    // INT MEDIA REPLACES the plain Chỉ Phát Hành card here — same
    // underlying lock, richer display. This never touches
    // releases.project_type (the historical "AR locked Chỉ Phát Hành"
    // fact stays true) — purely what's shown on this page.
    const intMediaBuilt = rel?.project_type === "Chỉ Phát Hành" && realOptions.find((o) => o.value === "INT MEDIA");
    const options = intMediaBuilt
      ? [...realOptions, ...simpleOptions.filter((o) => o.value !== "Chỉ Phát Hành")]
      : [...realOptions, ...simpleOptions];
    setPickOptions(options);

    if (intMediaBuilt) {
      setSelectedValue("INT MEDIA");
      setConfirmed(true);
    } else if (rel && !["BRIEF & DATA", "DEALING"].includes(rel.project_type)) {
      setSelectedValue(rel.project_type);
      setConfirmed(true);
    }

    const { data: cats } = await supabase.from("package_categories").select("id, name").order("sort_order");
    setCategories(cats || []);
    const { data: items } = await supabase.from("release_package_items").select("*").eq("release_id", link.release_id);
    setPackageItems(items || []);
    const { data: entries } = await supabase.from("media_booking_entries").select("*").eq("release_id", link.release_id);
    setBookingEntries(entries || []);

    supabase.from("magic_links").update({ last_used_at: new Date().toISOString() }).eq("id", link.id);
    setLoading(false);
  }

  // Same aggregate "All" filter the Booking Board and the release detail
  // page's Media Booking tab both use — one ratio per Hạng Mục, no brand/
  // platform breakdown, read-only. Lets whoever's on the other end of this
  // magic link (the artist/label) see booking progress alongside the
  // package they picked, without exposing the internal Booking Board.
  function bookedFor(categoryName) {
    const matching = packageItems.filter((it) => it.category === categoryName || (it.category || "").startsWith(`${categoryName} — `));
    if (matching.length === 0) return null;
    return matching.reduce((sum, it) => sum + (it.quantity || 0), 0);
  }

  function addedFor(categoryId) {
    return bookingEntries.filter((e) => e.booking_round === round && e.category_id === categoryId).length;
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

  // "Rich" cards (real built packages, incl. INT MEDIA) get the wide
  // itemized-table treatment; "compact" ones (the always-offered simple
  // pick, Chỉ Phát Hành — no breakdown) are just small stacked pills off
  // to the side instead of eating a full card's worth of width for a
  // single line of text. Once locked, every OTHER option is hidden
  // entirely (not just disabled) — there's nothing left to compare once
  // the choice is final.
  const visibleOptions = isLocked ? pickOptions.filter((c) => c.value === selectedValue) : pickOptions;
  const richOptions = visibleOptions.filter((c) => c.kind !== "simple");
  const compactOptions = visibleOptions.filter((c) => c.kind === "simple");

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 1320 }}>
        <div className={styles.eyebrow}>// chọn gói hỗ trợ truyền thông</div>
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
            side-by-side comparison, not a stack of collapsible cards. Rich
            (itemized) packages get a wide grid on the left; the always-
            offered simple picks stack narrowly on the right so they don't
            burn a whole card's width on one line of text. */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "3 1 640px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 12, alignItems: "start" }}>
          {richOptions.map((c) => {
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
                {(c.termsText || sharedTerms.a || sharedTerms.conditions) && (
                  // Fixed order: intro (a) -> conditions -> this package's
                  // own terms (c, e.g. VĨNH VIỄN/03 năm) -> the 5/2-năm
                  // note, only for the tiers it applies to.
                  <div style={{ borderTop: "1px solid #262626", padding: "10px 16px", background: "rgba(255,107,26,0.04)", display: "grid", gap: 8 }}>
                    {sharedTerms.a && <div style={{ fontSize: 11, color: "#ccc", whiteSpace: "pre-line", lineHeight: 1.5 }}>{sharedTerms.a}</div>}
                    {sharedTerms.conditions && <div style={{ fontSize: 11, color: "#ccc", whiteSpace: "pre-line", lineHeight: 1.5 }}>{sharedTerms.conditions}</div>}
                    {c.termsText && <div style={{ fontSize: 11, color: "#ccc", whiteSpace: "pre-line", lineHeight: 1.5 }}>{c.termsText}</div>}
                    {c.showSharedB && sharedTerms.b && (
                      <div style={{ paddingTop: 8, borderTop: "1px dashed #333" }}>
                        <div style={{ fontSize: 10, color: "#888", whiteSpace: "pre-line", lineHeight: 1.5 }}>{sharedTerms.b}</div>
                      </div>
                    )}
                  </div>
                )}
                {c.kind === "intMedia" ? (
                  // INT MEDIA — Hạng Mục names only, no numbers or pricing.
                  <div style={{ borderTop: "1px solid #262626", padding: "10px 16px", display: "grid", gap: 6 }}>
                    {c.items.map((item, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#ccc" }}>{item.category}</div>
                    ))}
                  </div>
                ) : c.items?.length > 0 ? (
                  <div style={{ borderTop: "1px solid #262626", padding: "8px 16px" }}>
                    <table className={styles.table} style={{ marginTop: 8, tableLayout: "fixed", width: "100%" }}>
                      <colgroup>
                        <col style={{ width: "22%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "46%" }} />
                        <col style={{ width: "18%" }} />
                      </colgroup>
                      <thead>
                        <tr><th>Hạng Mục</th><th>Số Lượng</th><th>Chi Tiết</th><th>Thành Tiền</th></tr>
                      </thead>
                      <tbody>
                        {c.items.map((item, i) => (
                          <tr key={i}>
                            <td style={{ wordBreak: "break-word" }}>{item.category}</td>
                            <td>{item.quantity != null ? `${item.quantity} ${item.unit || ""}` : "—"}</td>
                            <td style={{ fontSize: 11, color: "#999", whiteSpace: "pre-line", lineHeight: 1.4 }}>{item.detail || "—"}</td>
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
          {richOptions.length === 0 && (
            <div className={styles.emptyState}>No packages built yet.</div>
          )}
        </div>

        {compactOptions.length > 0 && (
          <div style={{ flex: "0 0 200px", display: "grid", gap: 10 }}>
            {compactOptions.map((c) => {
              const selected = selectedValue === c.value;
              return (
                <button
                  key={c.value}
                  onClick={() => selectPackage(c.value)}
                  disabled={isLocked || picking}
                  style={{
                    textAlign: "left",
                    background: selected ? "rgba(255,107,26,0.1)" : "#121212",
                    border: selected ? "1px solid #ff6b1a" : "1px solid #262626",
                    borderRadius: 10,
                    padding: "14px 16px",
                    cursor: isLocked ? "not-allowed" : "pointer",
                    opacity: isLocked && !selected ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: selected ? "#ff9d5c" : "#f4f4f4" }}>
                      {c.label || c.value}
                    </span>
                    {selected && <span style={{ fontSize: 10, color: "#ff6b1a", fontWeight: 700 }}>{confirmed ? "CONFIRMED" : "SELECTED — not confirmed yet"}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        </div>{/* end options flex row */}

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

        {confirmed && (
          <div style={{ marginTop: 32 }}>
            <div className={styles.subheading} style={{ marginTop: 0 }}>Booking Progress</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
              {BOOKING_ROUNDS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRound(r)}
                  className={`${styles.tabBtn} ${round === r ? styles.tabBtnActive : ""}`}
                  style={{ border: "1px solid #262626", borderRadius: 6 }}
                >
                  {r}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              {categories.map((c) => {
                const booked = bookedFor(c.name);
                const added = addedFor(c.id);
                const isDone = booked != null && booked > 0 && added >= booked;
                return (
                  <div key={c.id} style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", marginBottom: 8, textTransform: "uppercase" }}>
                      {c.name}
                    </div>
                    {isDone ? (
                      <span style={{ color: "#7ee6a8", fontWeight: 800, fontSize: 13 }}>DONE</span>
                    ) : booked != null ? (
                      <span style={{ color: "#ccc", fontSize: 13 }}>{added} / {booked}</span>
                    ) : (
                      <span style={{ color: "#666", fontSize: 13 }}>{added} / —</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

