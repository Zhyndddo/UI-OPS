"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthContext";
import { fetchAllRows } from "../../../lib/helpers";
import UrlField from "../../../lib/UrlField";
import { TIKTOK_CHANNEL_GROUPS, TIKTOK_SUBCHANNELS, ADS_METRICS, buildPackageByRelease, makeBookedFor } from "../../booking/page";
import styles from "../../shared.module.css";

// Round 315 — new Workstation item, per explicit request + the
// "workstation template.xlsx" reference sheet. A cost-tracking layer on
// top of data that mostly already lives elsewhere: TikTok Channel
// Partner / Ads bookings for the VIEENT TRẢ side (read live via Booking
// Board's own bookedFor(), reused from app/booking/page.js's exports —
// see that file's Round 315 comment), and Booking Không Trong Package
// tickets for the ARTIST TRẢ side (read live from tickets.data). What's
// actually NEW and stored here is the per-release, per-partner/ads-brand
// cost fields — see sql/pending/add-round315-workstation-cost-mkt.sql's
// header for the full breakdown and the explicit clarifications this
// round's design is built on (TOTAL POST = the booked target, read live,
// NOT stored; No. Booking Post / No. Support Post are manually typed,
// not derived; one cost row per release PER partner/ads-brand; Sup
// Cashback is its own column, easy to drop later if it's wrong).
//
// Deliberately NOT the full Booking Board shell — per explicit request,
// this skips that board's big Hạng Mục filter entirely and instead has
// exactly 2 fixed top-level tabs (funded_by) each with exactly 2 fixed
// sub-filters (channel_kind: TikTok Channel / Ads), narrowing further to
// one partner or one ads brand at a time — same "pick a sub-filter, that
// picks the columns" shape Booking Board uses, just with a much smaller,
// fixed set of choices instead of that board's full category list.

const TIKTOK_PARTNERS = TIKTOK_CHANNEL_GROUPS["Partner"];
const ADS_BRANDS = Object.keys(ADS_METRICS);
const BOOKING_NOT_IN_PACKAGE_TAB_KEY = "booking_not_in_package";

function shortPartnerLabel(brand) {
  return (brand || "").replace("EXT TIKTOK - ", "");
}

function fmtVnd(n) {
  if (n === null || n === undefined || n === "") return "0 đ";
  return new Intl.NumberFormat("vi-VN").format(Number(n) || 0) + " đ";
}

function costEntryKey(releaseId, fundedBy, channelKind, brand) {
  return `${releaseId}:${fundedBy}:${channelKind}:${brand}`;
}

// The editable cost fields every row gets, TikTok or Ads alike (Sup
// Cashback included, per this round's explicit follow-up).
const COST_FIELDS = [
  { key: "cost_du_kien", label: "Cost Dự Kiến", type: "number" },
  { key: "cost_thuc_chay", label: "Cost Thực Chạy", type: "number" },
  { key: "thang_chi_tra", label: "Tháng Chi Trả", type: "text", placeholder: "vd: 08/2026" },
  { key: "report_link", label: "Report Link", type: "url" },
  { key: "vieent_ho_tro", label: "Vieent Hỗ Trợ", type: "number" },
  { key: "artist_tra", label: "Artist Trả", type: "number" },
  { key: "sup_cashback", label: "Sup Cashback", type: "number" },
];
// TikTok Channel tables only — per the reference sheet, Ads tables don't
// get these (a metric count isn't a "post").
const POST_FIELDS = [
  { key: "no_booking_post", label: "No. Booking Post" },
  { key: "no_support_post", label: "No. Support Post" },
];

export default function WorkstationCostMkt() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [releases, setReleases] = useState([]);
  const [categories, setCategories] = useState([]);
  const [packages, setPackages] = useState([]);
  const [notInPackageTickets, setNotInPackageTickets] = useState([]);
  const [costEntries, setCostEntries] = useState({}); // costEntryKey -> row

  const [fundedBy, setFundedBy] = useState("vieent"); // "vieent" | "artist"
  const [channelKind, setChannelKind] = useState("tiktok"); // "tiktok" | "ads"
  const [partnerBrand, setPartnerBrand] = useState(TIKTOK_PARTNERS[0]);
  const [adsBrand, setAdsBrand] = useState(ADS_BRANDS[0]);
  const brand = channelKind === "tiktok" ? partnerBrand : adsBrand;

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: rels }, { data: cats }, { data: tabRow }, { data: entries }] = await Promise.all([
      fetchAllRows(() =>
        supabase.from("releases").select("id, did, title, main_artist, release_date, project_type").order("release_date", { ascending: false })
      ),
      supabase.from("package_categories").select("id, name"),
      supabase.from("ticket_tabs").select("id").eq("key", BOOKING_NOT_IN_PACKAGE_TAB_KEY).maybeSingle(),
      fetchAllRows(() => supabase.from("workstation_cost_mkt_entries").select("*")),
    ]);
    const releaseList = rels || [];
    setReleases(releaseList);
    setCategories(cats || []);

    const releaseIds = releaseList.map((r) => r.id);
    const [{ data: pkgs }, ticketRows] = await Promise.all([
      releaseIds.length > 0
        ? supabase
            .from("media_booking_packages")
            .select("id, release_id, name, media_booking_package_lines(category_id, brand, quantity, metric_quantities, brand_column_quantities)")
            .in("release_id", releaseIds)
        : Promise.resolve({ data: [] }),
      tabRow?.id
        ? fetchAllRows(() => supabase.from("tickets").select("id, data").eq("tab_id", tabRow.id).is("deleted_at", null))
        : Promise.resolve({ data: [] }),
    ]);
    setPackages(pkgs || []);
    setNotInPackageTickets(ticketRows?.data || []);

    const byKey = {};
    (entries || []).forEach((e) => { byKey[costEntryKey(e.release_id, e.funded_by, e.channel_kind, e.brand)] = e; });
    setCostEntries(byKey);
    setLoading(false);
  }

  const categoryIdByName = useMemo(() => {
    const map = {};
    categories.forEach((c) => (map[c.name] = c.id));
    return map;
  }, [categories]);
  const packageByRelease = useMemo(() => buildPackageByRelease(releases, packages), [releases, packages]);
  const bookedFor = useMemo(() => makeBookedFor(packageByRelease, categoryIdByName), [packageByRelease, categoryIdByName]);

  // Booking Không Trong Package tickets, indexed by the release DID they
  // point at (ticket.data.relatedDid — see lib/ticketConfigs.js's
  // booking_not_in_package releaseFieldMap) so a lookup by release is a
  // plain object access instead of a filter() per cell.
  const ticketsByDid = useMemo(() => {
    const map = {};
    notInPackageTickets.forEach((t) => {
      const did = t.data?.relatedDid;
      if (!did) return;
      (map[did] = map[did] || []).push(t.data);
    });
    return map;
  }, [notInPackageTickets]);

  // Artist Trả's per-(release, brand, hạng mục) quantity — sum of
  // Số Lượng across every matching ticket (Brand/Hạng Mục are free text
  // on that ticket type, so this only picks up a ticket whose text
  // matches this page's own vocabulary exactly — see this round's
  // clarifying-questions answer).
  function artistQty(release, brandValue, hangMuc) {
    const rows = ticketsByDid[release.did] || [];
    return rows
      .filter((d) => (d.brand || "").trim() === brandValue && (d.hangMuc || "").trim() === hangMuc)
      .reduce((sum, d) => sum + (Number(d.soLuong) || 0), 0);
  }

  const columns = channelKind === "tiktok" ? TIKTOK_SUBCHANNELS : ADS_METRICS[adsBrand] || [];
  const categoryName = channelKind === "tiktok" ? "TikTok Channel" : "Ads";

  // One row per release, with its per-column values + whether it has
  // anything at all worth showing (a real target/qty in any column, OR a
  // cost entry already saved for it — so a manually-entered cost row
  // never disappears just because the underlying booking count changed).
  const rows = useMemo(() => {
    return releases
      .map((r) => {
        const values = columns.map((col) =>
          fundedBy === "vieent"
            ? bookedFor(r, categoryName, brand, channelKind === "ads" ? col : null, channelKind === "tiktok" ? col : null)
            : artistQty(r, brand, col)
        );
        const totalPost = values.reduce((sum, v) => sum + (v || 0), 0);
        const entry = costEntries[costEntryKey(r.id, fundedBy, channelKind, brand)];
        const hasEntry = !!entry && Object.values(entry).some((v) => v !== null && v !== undefined && v !== "" && typeof v !== "object");
        return { release: r, values, totalPost, entry, hasSomething: totalPost > 0 || hasEntry };
      })
      .filter((row) => row.hasSomething);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releases, columns, fundedBy, channelKind, brand, bookedFor, costEntries, ticketsByDid]);

  async function saveField(release, field, value) {
    const key = costEntryKey(release.id, fundedBy, channelKind, brand);
    const existing = costEntries[key];
    const payload = {
      release_id: release.id,
      funded_by: fundedBy,
      channel_kind: channelKind,
      brand,
      no_booking_post: existing?.no_booking_post ?? null,
      no_support_post: existing?.no_support_post ?? null,
      cost_du_kien: existing?.cost_du_kien ?? null,
      cost_thuc_chay: existing?.cost_thuc_chay ?? null,
      thang_chi_tra: existing?.thang_chi_tra ?? null,
      report_link: existing?.report_link ?? null,
      vieent_ho_tro: existing?.vieent_ho_tro ?? null,
      artist_tra: existing?.artist_tra ?? null,
      sup_cashback: existing?.sup_cashback ?? null,
      [field]: value,
      updated_at: new Date().toISOString(),
      updated_by: profile?.id || null,
    };
    // Optimistic — the cell already shows what was typed; this just
    // persists it. onConflict matches the table's own unique constraint
    // (release_id, funded_by, channel_kind, brand), so this both creates
    // the row the first time a cell in it is touched and updates it every
    // time after.
    setCostEntries((prev) => ({ ...prev, [key]: { ...prev[key], ...payload } }));
    const { data, error } = await supabase
      .from("workstation_cost_mkt_entries")
      .upsert(payload, { onConflict: "release_id,funded_by,channel_kind,brand" })
      .select()
      .single();
    if (!error && data) setCostEntries((prev) => ({ ...prev, [key]: data }));
  }

  // ── Top summary card — always all-time, across every entry regardless
  // of the tabs/filters currently selected (per explicit request, "the
  // top (unmoving part)"). Cost totals use Cost Thực Chạy (actual spend),
  // not Cost Dự Kiến (estimate).
  const allEntries = Object.values(costEntries);
  const sumWhere = (pred, field) => allEntries.filter(pred).reduce((s, e) => s + (Number(e[field]) || 0), 0);
  const tiktokBookingTotal = sumWhere((e) => e.channel_kind === "tiktok", "cost_thuc_chay");
  const youtubeAdsTotal = sumWhere((e) => e.channel_kind === "ads" && e.brand === "YouTube Ads", "cost_thuc_chay");
  const metaAdsTotal = sumWhere((e) => e.channel_kind === "ads" && e.brand === "Facebook Ads", "cost_thuc_chay");
  const vieentFundedTotal = allEntries.reduce((s, e) => s + (Number(e.vieent_ho_tro) || 0), 0);
  const artistFundedTotal = allEntries.reduce((s, e) => s + (Number(e.artist_tra) || 0), 0);
  const supCashbackTotal = allEntries.reduce((s, e) => s + (Number(e.sup_cashback) || 0), 0);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1400 }}>
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title}>Cost Marketing</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 20, maxWidth: 760 }}>
            TikTok Channel and Ads bookings, split by who's paying, with cost tracking on top. Post/metric targets
            are read live from Booking Board and Booking Không Trong Package tickets — only the cost fields below
            are stored here.
          </p>

          <SummaryCard
            tiktokBookingTotal={tiktokBookingTotal}
            youtubeAdsTotal={youtubeAdsTotal}
            metaAdsTotal={metaAdsTotal}
            vieentFundedTotal={vieentFundedTotal}
            artistFundedTotal={artistFundedTotal}
            supCashbackTotal={supCashbackTotal}
          />

          <div style={{ display: "flex", gap: 4, marginTop: 24, marginBottom: 12 }}>
            {[["vieent", "BOOKING PACKAGE (VIEENT TRẢ)"], ["artist", "BOOKING KHÔNG PACKAGE (ARTIST TRẢ)"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFundedBy(key)}
                className={`${styles.tabBtn} ${fundedBy === key ? styles.tabBtnActive : ""}`}
                style={{ border: fundedBy === key ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: fundedBy === key ? "rgba(255,107,26,0.1)" : "transparent" }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
            {[["tiktok", "TIKTOK CHANNEL"], ["ads", "ADS"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setChannelKind(key)}
                className={`${styles.tabBtn} ${channelKind === key ? styles.tabBtnActive : ""}`}
                style={{ border: channelKind === key ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: channelKind === key ? "rgba(255,107,26,0.1)" : "transparent", fontSize: 12 }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
            {(channelKind === "tiktok" ? TIKTOK_PARTNERS : ADS_BRANDS).map((b) => (
              <button
                key={b}
                onClick={() => (channelKind === "tiktok" ? setPartnerBrand(b) : setAdsBrand(b))}
                className={`${styles.tabBtn} ${brand === b ? styles.tabBtnActive : ""}`}
                style={{ border: brand === b ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: brand === b ? "rgba(255,107,26,0.1)" : "transparent", fontSize: 12 }}
              >
                {channelKind === "tiktok" ? shortPartnerLabel(b) : b}
              </button>
            ))}
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : rows.length === 0 ? (
            <div className={styles.emptyState}>
              Nothing booked yet for {channelKind === "tiktok" ? shortPartnerLabel(brand) : brand}
              {fundedBy === "artist" ? " (or no Booking Không Trong Package ticket matches this Brand/Hạng Mục yet)." : "."}
            </div>
          ) : (
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Release</th>
                    {columns.map((c) => <th key={c}>{c}</th>)}
                    {channelKind === "tiktok" && <th>Total Post</th>}
                    {channelKind === "tiktok" && POST_FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}
                    {COST_FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ release, values, totalPost, entry }) => (
                    <tr key={release.id}>
                      <td style={{ minWidth: 160 }}>
                        <Link href={`/releases/${release.id}`} className={styles.rowLink}>{release.title}</Link>
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release.main_artist}</div>
                      </td>
                      {values.map((v, i) => (
                        <td key={i} style={{ textAlign: "center", fontSize: 12 }}>{v || "—"}</td>
                      ))}
                      {channelKind === "tiktok" && (
                        <td style={{ textAlign: "center", fontSize: 12, fontWeight: 700 }}>{totalPost || "—"}</td>
                      )}
                      {channelKind === "tiktok" &&
                        POST_FIELDS.map((f) => (
                          <EditableCell key={f.key} field={f} value={entry?.[f.key]} onSave={(v) => saveField(release, f.key, v)} />
                        ))}
                      {COST_FIELDS.map((f) => (
                        <EditableCell key={f.key} field={f} value={entry?.[f.key]} onSave={(v) => saveField(release, f.key, v)} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// One summary-card cell — plain uncolored value under a small caps label,
// matching KpiCard's shape on the Report page closely enough to read as
// the same idiom without importing across pages for one small component.
function SummaryStat({ label, value }) {
  return (
    <div style={{ textAlign: "center", padding: "10px 6px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function SummaryCard({ tiktokBookingTotal, youtubeAdsTotal, metaAdsTotal, vieentFundedTotal, artistFundedTotal, supCashbackTotal }) {
  return (
    <div style={{ border: "1px solid var(--border-strong)", borderRadius: 10, overflow: "hidden", background: "var(--bg-card)" }}>
      <div style={{ background: "var(--accent)", color: "var(--accent-on)", textAlign: "center", fontWeight: 800, fontSize: 13, letterSpacing: 0.4, padding: "8px 12px" }}>
        BẢNG TÓM TẮT TỔNG CHI PHÍ
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <SummaryStat label="TikTok Booking" value={fmtVnd(tiktokBookingTotal)} />
        <SummaryStat label="YouTube Ads" value={fmtVnd(youtubeAdsTotal)} />
        <SummaryStat label="Meta Ads" value={fmtVnd(metaAdsTotal)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", borderTop: "1px solid var(--border)" }}>
        <SummaryStat label="Vieent-Funded" value={fmtVnd(vieentFundedTotal)} />
        <SummaryStat label="Artist-Funded" value={fmtVnd(artistFundedTotal)} />
        <SummaryStat label="Sup Cashback" value={fmtVnd(supCashbackTotal)} />
      </div>
    </div>
  );
}

// One editable cost/post cell — number/text inline input, or UrlField for
// Report Link (same universal URL-field idiom every other url column in
// this app uses). Local state so typing doesn't round-trip through the
// parent on every keystroke; onBlur is when it actually saves.
function EditableCell({ field, value, onSave }) {
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => { setLocal(value ?? ""); }, [value]);

  if (field.type === "url") {
    return (
      <td>
        <UrlField value={local} onChange={setLocal} onBlur={() => onSave(local || null)} styles={styles} placeholder="Report link…" />
      </td>
    );
  }
  return (
    <td>
      <input
        className={styles.input}
        style={{ width: field.type === "number" ? 90 : 110, fontSize: 12 }}
        type={field.type === "number" ? "number" : "text"}
        placeholder={field.placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onSave(local === "" ? null : field.type === "number" ? Number(local) : local)}
      />
    </td>
  );
}
