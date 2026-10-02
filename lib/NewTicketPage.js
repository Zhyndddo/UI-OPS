"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { TICKET_CONFIGS } from "./ticketConfigs";
import ReleasePicker from "./ReleasePicker";
import RelatedDidField from "./RelatedDidField";
import ProfileSearchField from "./ProfileSearchField";
import { logTicketCreate } from "./auditLog";
import { resolveProfilesByEmail } from "./pingNotification";
import { TIKTOK_CHANNEL_GROUPS, TIKTOK_SUBCHANNELS, ADS_METRICS } from "../app/booking/page";
import styles from "../app/shared.module.css";

// Round 448 — Booking Không Trong Package's category/brand/hangMuc pick,
// scoped to just TikTok Channel + Ads (no Social/Community — those have
// no Nghệ Sĩ Trả equivalent). Same vocabulary Booking Board itself uses,
// imported rather than re-typed so it can't drift out of sync.
const NON_PACKAGE_CATEGORIES = ["TikTok Channel", "Ads"];
const NON_PACKAGE_TIKTOK_BRANDS = [...TIKTOK_CHANNEL_GROUPS["Partner"], ...TIKTOK_CHANNEL_GROUPS["In-house"]];
const NON_PACKAGE_ADS_BRANDS = Object.keys(ADS_METRICS);
// Same link-status vocabulary/order as Booking Board's own BrandCell
// (app/booking/page.js — "Chưa Booking"/"Đã Gửi"/"Done", MUST stay in
// sync with that file's STATUS_ORDER/STATUS_COLOR if it ever changes).
const LINK_STATUS_OPTIONS = ["Chưa Booking", "Đã Gửi", "Done"];
// Same run-status vocabulary as Booking Board's own AdsCell (that file's
// ADS_STATUS_OPTIONS — not exported, so duplicated here; MUST stay in
// sync).
const ADS_RUN_STATUS_OPTIONS = ["Chưa Chạy", "Đang Chạy", "Đã Chạy", "Pending"];
// Keys rendered bespoke below instead of through the generic text-input
// loop — pulled out of the normal per-field render path entirely.
const NON_PACKAGE_BESPOKE_KEYS = new Set(["category", "brand", "hangMuc", "linkUrl", "linkStatus", "soLuong", "adsStatus"]);

function NonPackageBookingFields({ form, update }) {
  const category = form.category || "";
  const brand = form.brand || "";
  const brandOptions = category === "TikTok Channel" ? NON_PACKAGE_TIKTOK_BRANDS : category === "Ads" ? NON_PACKAGE_ADS_BRANDS : [];
  const columnOptions = category === "TikTok Channel" ? TIKTOK_SUBCHANNELS : category === "Ads" ? ADS_METRICS[brand] || [] : [];

  function setCategory(next) {
    // Changing category invalidates whichever brand/column/pair-field
    // values were picked under the old one — same "pick narrows the next
    // pick" shape Booking Board's own filter layers use.
    update("category", next);
    update("brand", "");
    update("hangMuc", "");
    update("linkUrl", "");
    update("linkStatus", "");
    update("soLuong", "");
    update("adsStatus", "");
  }
  function setBrand(next) {
    update("brand", next);
    update("hangMuc", "");
  }

  return (
    <>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Hạng Mục <span className={styles.required}>*</span></label>
        <div style={{ display: "flex", gap: 6 }}>
          {NON_PACKAGE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`${styles.tabBtn} ${category === c ? styles.tabBtnActive : ""}`}
              style={{ border: category === c ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: category === c ? "rgba(255,107,26,0.1)" : "transparent", fontSize: 12 }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {category && (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Brand <span className={styles.required}>*</span></label>
          <select className={styles.input} value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">— pick a brand —</option>
            {brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      )}

      {category && brand && (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{category === "TikTok Channel" ? "Loại Nội Dung" : "Metric"} <span className={styles.required}>*</span></label>
          <select className={styles.input} value={form.hangMuc || ""} onChange={(e) => update("hangMuc", e.target.value)}>
            <option value="">— pick one —</option>
            {columnOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* TikTok Channel entries are a real posted link + its own link
          status, same shape as Booking Board's own BrandCell entries. */}
      {category === "TikTok Channel" && (
        <>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Link</label>
            <input className={styles.input} type="text" value={form.linkUrl || ""} onChange={(e) => update("linkUrl", e.target.value)} placeholder="https://…" />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Trạng Thái Link</label>
            <select className={styles.input} value={form.linkStatus || LINK_STATUS_OPTIONS[0]} onChange={(e) => update("linkStatus", e.target.value)}>
              {LINK_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </>
      )}

      {/* Ads entries are a quantity + Booking Board's own run status,
          same shape as Booking Board's own AdsCell entries. */}
      {category === "Ads" && (
        <>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Số Lượng</label>
            <input className={styles.input} type="number" value={form.soLuong || ""} onChange={(e) => update("soLuong", e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Trạng Thái Chạy</label>
            <select className={styles.input} value={form.adsStatus || ADS_RUN_STATUS_OPTIONS[0]} onChange={(e) => update("adsStatus", e.target.value)}>
              {ADS_RUN_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </>
      )}
    </>
  );
}

// Round 86 item 1 — "__ZHYN__" is a resolution marker (see
// lib/ticketConfigs.js's khac.alsoNotify field), not a real name. "Zhyn"
// has no literal profiles row anywhere in the app; it's the dev-team
// nickname for whoever's login email is an.thien@vieent.vn.
const ZHYN_MARKER = "__ZHYN__";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// A field renders as a full-width textarea if it's explicitly type
// "textarea", or if it's flagged multiline — e.g. Manual Claim's URL
// field, which needs to hold several pasted links, one per line, not a
// single-line input.
function isTextareaField(f) {
  return f.type === "textarea" || f.multiline;
}

// Round 325 — Khác's new "selfTask" checkbox (lib/ticketConfigs.js).
// Rendered as its own thing rather than through the generic text-input
// path, same idea as relatedDid/profileSearch above it.
function isCheckboxField(f) {
  return f.type === "checkbox";
}

export default function NewTicketPage({ typeKey, basePath }) {
  const config = TICKET_CONFIGS[typeKey];
  const router = useRouter();
  const { profile } = useAuth();
  const initial = {};
  (config?.fields || []).forEach((f) => (initial[f.key] = f.defaultValue ?? ""));
  const [form, setForm] = useState(initial);
  const [deadline, setDeadline] = useState("");
  const [deadlineTouched, setDeadlineTouched] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [overload, setOverload] = useState(null);
  const [excludeDids, setExcludeDids] = useState(new Set());

  // Design's Overload same-day-deadline soft lock — only relevant here
  useEffect(() => {
    if (!supabase || typeKey !== "design") return;
    supabase.from("app_settings").select("value").eq("key", "design_overload").maybeSingle()
      .then(({ data }) => setOverload(data?.value || { active: false, date: null }));
  }, [typeKey]);

  // Round 86 item 1 — resolve the ZHYN_MARKER default on Khác's CC field
  // to the real profiles.name for an.thien@vieent.vn, once, on mount. Only
  // swaps it in if the field is still exactly the marker (untouched) by
  // the time the lookup resolves, so it never clobbers something the user
  // already typed or picked in the meantime.
  useEffect(() => {
    if (!supabase || typeKey !== "khac") return;
    supabase.from("profiles").select("name").ilike("email", "an.thien@vieent.vn").maybeSingle()
      .then(({ data }) => {
        if (!data?.name) return;
        setForm((f) => (f.alsoNotify === ZHYN_MARKER ? { ...f, alsoNotify: data.name } : f));
      });
  }, [typeKey]);

  // config.oneTicketPerRelease — types that can ALSO be auto-created from a
  // gate field ("tick Yes -> ticket appears"). Filter releases that already
  // have a non-deleted ticket of this type out of the picker entirely, so a
  // second one can't be created by accident from this manual form. Same
  // excludeDids mechanism Media Booking's bespoke /new page already uses.
  useEffect(() => {
    if (!supabase || !config?.oneTicketPerRelease) return;
    (async () => {
      const { data: tabRow } = await supabase.from("ticket_tabs").select("id").eq("key", typeKey).single();
      if (!tabRow) return;
      const { data: existing } = await supabase.from("tickets").select("data").eq("tab_id", tabRow.id).is("deleted_at", null);
      setExcludeDids(new Set((existing || []).map((t) => t.data?.releaseId).filter(Boolean)));
    })();
  }, [typeKey]);

  // Deadline defaults to config.defaultDeadlineFrom's field (e.g. Phái
  // Sinh's Release Date) until the requester picks a deadline themselves.
  // Clearing the deadline back to blank re-enables auto-fill, so it keeps
  // tracking Release Date edits until an explicit choice is made.
  const defaultDeadlineSrc = config?.defaultDeadlineFrom ? form[config.defaultDeadlineFrom] : null;
  useEffect(() => {
    if (!defaultDeadlineSrc || deadlineTouched) return;
    setDeadline(defaultDeadlineSrc);
  }, [defaultDeadlineSrc, deadlineTouched]);

  function handleDeadlineChange(v) {
    setDeadline(v);
    setDeadlineTouched(v !== "");
  }

  const overloadBlocked = typeKey === "design" && overload?.active && overload.date === todayStr() && deadline === todayStr();

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Fills whichever fields the type's releaseFieldMap declares, from
  // whichever release was picked — e.g. tenBai/artist/label for Phái Sinh.
  function fillFromRelease(release) {
    const map = config.releaseFieldMap?.map || {};
    setForm((f) => {
      const next = { ...f };
      Object.entries(map).forEach(([formKey, releaseKey]) => {
        if (release[releaseKey] != null) next[formKey] = release[releaseKey];
      });
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const missing = config.fields.filter((f) => f.required && !form[f.key]?.trim());
    if (missing.length > 0) {
      setError(`${missing.map((f) => f.label).join(", ")} required.`);
      return;
    }
    // Round 448 — Booking Không Trong Package's category/brand/hangMuc
    // (and whichever of the linkUrl/soLuong pair its category calls for)
    // can't be marked `required` in config (the generic check above would
    // demand BOTH pairs on every submit, since it has no idea they're
    // mutually exclusive) — validated here instead, same per-typeKey
    // special-casing Design's overload lock and Khác's selfTask already
    // use elsewhere in this file.
    if (typeKey === "booking_not_in_package") {
      if (!form.category || !form.brand || !form.hangMuc) {
        setError("Hạng Mục, Brand, and the column pick are all required.");
        return;
      }
      if (form.category === "TikTok Channel" && !form.linkUrl?.trim()) {
        setError("Link is required for a TikTok Channel entry.");
        return;
      }
      if (form.category === "Ads" && !form.soLuong) {
        setError("Số Lượng is required for an Ads entry.");
        return;
      }
    }
    if (overloadBlocked) {
      setError("Design is overloaded today — please choose a later deadline.");
      return;
    }
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", typeKey).single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError(`Couldn't find the ${config.label} ticket type — did schema.sql get redeployed?`);
      return;
    }
    // Belt-and-suspenders re-check right before insert — the picker already
    // filters ticketed releases out, but this catches a race (e.g. an
    // auto-ticket created from New Release in the gap between this form
    // loading and being submitted) with a clear error instead of a silent
    // duplicate.
    if (config.oneTicketPerRelease && config.releaseFieldMap?.attachTo) {
      const releaseIdKey = config.releaseFieldMap.attachTo;
      const releaseIdVal = form[releaseIdKey];
      if (releaseIdVal) {
        const { data: dupe } = await supabase
          .from("tickets")
          .select("id")
          .eq("tab_id", tab.id)
          .is("deleted_at", null)
          .contains("data", { [releaseIdKey]: releaseIdVal })
          .maybeSingle();
        if (dupe) {
          setSubmitting(false);
          setError(`A ${config.label} ticket for this release already exists — only one is allowed per release.`);
          return;
        }
      }
    }
    // Round 325 — a "Self Task" Khác ticket auto-assigns its own requester
    // as PIC (both the modern tag field and the legacy single column, same
    // as every other PIC-writing path in this app keeps them in sync) so
    // it counts toward that person's own Task Table row exactly like any
    // other PIC'd ticket — see app/task-table/page.js. Visibility itself
    // is enforced separately, at fetch time (lib/TicketListPage.js's
    // selfTaskVisibilityFilter), not here.
    const isSelfTask = typeKey === "khac" && !!form.selfTask;
    // Round 455 — some types (today: phu_luc_mg/phu_luc_publishing, a
    // one-person Legal team) default-assign a specific person as PIC at
    // creation via config.defaultPicEmail, same shape as isSelfTask just
    // above — a real human pick on the list page afterward still wins.
    let defaultPicId = null;
    if (config.defaultPicEmail && !isSelfTask) {
      const ids = await resolveProfilesByEmail(config.defaultPicEmail);
      defaultPicId = ids[0] || null;
    }
    const { data: inserted, error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: form,
      deadline: deadline || null,
      status: tab.default_status,
      status_log: { [tab.default_status]: new Date().toISOString() },
      requester_segment: profile?.segment || null,
      requester_name: profile?.name || null,
      // Round 281 — audit log / requester attribution
      requester_profile_id: profile?.id || null,
      ...(isSelfTask ? { pic_profile_id: profile?.id || null, pic_profile_ids: profile?.id ? [profile.id] : [] } : {}),
      ...(defaultPicId ? { pic_profile_id: defaultPicId, pic_profile_ids: [defaultPicId] } : {}),
    }).select("id").single();
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else {
      // Round 281 — audit log / requester attribution
      logTicketCreate({ actor: profile?.id, ticketId: inserted?.id });
      router.push(basePath);
    }
  }

  if (!config) return <div className={styles.page}><div className={styles.container}>Unknown ticket type: {typeKey}</div></div>;

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 640 }}>
        <Link href={basePath} className={styles.backLink}>← Back</Link>
        <div className={styles.eyebrow}>// New Ticket</div>
        <h1 className={styles.title}>{config.label}</h1>

        {error && <div className={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.grid2}>
            {/* Round 448 — Booking Không Trong Package's category/brand/
                hangMuc + TikTok-vs-Ads pair fields render bespoke
                (cascading picks, conditional on category) instead of
                through the generic loop below, which filters them out via
                NON_PACKAGE_BESPOKE_KEYS. */}
            {typeKey === "booking_not_in_package" && <NonPackageBookingFields form={form} update={update} />}
            {config.fields.filter((f) => !isTextareaField(f) && !(typeKey === "booking_not_in_package" && NON_PACKAGE_BESPOKE_KEYS.has(f.key))).map((f) => (
              isCheckboxField(f) ? (
                <div key={f.key} className={styles.field}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!form[f.key]} onChange={(e) => update(f.key, e.target.checked)} />
                    <span className={styles.fieldLabel} style={{ margin: 0 }}>{f.label}</span>
                  </label>
                  {f.helpText && (
                    <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4, marginBottom: 0 }}>{f.helpText}</p>
                  )}
                </div>
              ) : (
              <div key={f.key} className={styles.field}>
                <label className={styles.fieldLabel}>
                  {f.label} {f.required && <span className={styles.required}>*</span>}
                </label>
                <div style={{ position: "relative" }}>
                  {f.type === "relatedDid" ? (
                    <RelatedDidField styles={styles} value={form[f.key]} onChange={(v) => update(f.key, v)} />
                  ) : f.type === "profileSearch" ? (
                    <ProfileSearchField styles={styles} value={form[f.key]} onChange={(v) => update(f.key, v)} placeholder={f.label} />
                  ) : (
                    <>
                      <input
                        type={f.type === "date" ? "date" : "text"}
                        className={styles.input}
                        style={config.releaseFieldMap?.attachTo === f.key ? { paddingRight: 34 } : undefined}
                        value={form[f.key]}
                        onChange={(e) => update(f.key, e.target.value)}
                      />
                      {config.releaseFieldMap?.attachTo === f.key && (
                        <ReleasePicker onSelect={fillFromRelease} excludeDids={config.oneTicketPerRelease ? excludeDids : undefined} />
                      )}
                    </>
                  )}
                </div>
                {f.helpText && (
                  <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4, marginBottom: 0 }}>{f.helpText}</p>
                )}
              </div>
              )
            ))}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Deadline</label>
              <input type="date" className={styles.input} value={deadline} onChange={(e) => handleDeadlineChange(e.target.value)} />
              {overloadBlocked && (
                <p style={{ color: "var(--error-fg)", fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                  ⚠ Design is overloaded today — choose a later date to unlock.
                </p>
              )}
            </div>
          </div>

          {config.fields.filter(isTextareaField).map((f) => (
            <div key={f.key} className={styles.field}>
              <label className={styles.fieldLabel}>
                {f.label} {f.required && <span className={styles.required}>*</span>}
              </label>
              <textarea
                className={styles.textarea}
                style={f.multiline ? { minHeight: 90 } : undefined}
                placeholder={f.placeholder}
                value={form[f.key]}
                onChange={(e) => update(f.key, e.target.value)}
              />
              {f.helpText && (
                <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4, marginBottom: 0 }}>{f.helpText}</p>
              )}
            </div>
          ))}

          <button className={styles.btnPrimary} type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Ticket"}
          </button>
        </form>
      </div>
    </div>
  );
}
