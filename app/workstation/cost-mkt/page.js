"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthContext";
import { fetchAllRows } from "../../../lib/helpers";
import UrlField from "../../../lib/UrlField";
import PillSwitch from "../../../lib/PillSwitch";
import { TIKTOK_CHANNEL_GROUPS, TIKTOK_SUBCHANNELS, ADS_METRICS, buildPackageByRelease, makeBookedFor, makeAddedFor } from "../../booking/page";
import ExportButton from "../../../lib/spreadsheetExport";
import CostMktImportPopup from "../../../lib/CostMktImport";
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

// Round 436 — "This Month" counter + the Is_thismonth override switch.
// sameMonth compares calendar month+year only (local time, same getter
// idiom app/releases/page.js's calendarBounds() uses), not a 30-day
// window or anything date-range-shaped — matches "this month = release
// month" literally.
function sameMonth(dateLike, now) {
  if (!dateLike) return false;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// Round 445 — This Month's basis moved from release_date to Tháng Chi
// Trả, per explicit request ("change the filter this month from release
// date to check upon the column Tháng chi trả"): release date was the
// wrong signal for "does this belong in this month's cost log" — the
// actual payment month is what matters. Tháng Chi Trả is free text (see
// COST_FIELDS's placeholder, "vd: 08/2026"), so this parses defensively
// rather than assuming one clean value — it pulls out every "M/YYYY" or
// "MM/YYYY" token in the string, which also means a cell already holding
// more than one month (e.g. "08/2026, 09/2026", for a release that needed
// a 2nd payment — see Round 445's pitch doc on tracking that properly)
// just works today, with no format change required.
const MONTH_YEAR_RE = /(\d{1,2})\s*\/\s*(\d{4})/g;
function parseThangChiTraTokens(text) {
  if (!text) return [];
  const out = [];
  let m;
  MONTH_YEAR_RE.lastIndex = 0;
  while ((m = MONTH_YEAR_RE.exec(text))) {
    const month = Number(m[1]);
    const year = Number(m[2]);
    if (month >= 1 && month <= 12) out.push({ month: month - 1, year });
  }
  return out;
}
function thangChiTraMatchesMonth(text, now) {
  return parseThangChiTraTokens(text).some((t) => t.month === now.getMonth() && t.year === now.getFullYear());
}

// Round 446 — once a release has real installment rows (see
// workstation_cost_mkt_installments below), those are the authoritative
// answer: does ANY installment's month match the current calendar month.
// A release that's never been switched into installment mode (or has the
// switch on but hasn't added a month yet) falls back to the old Round 445
// text-parse of Tháng Chi Trả, so nothing that already worked stops
// working just because this round exists. override_month (Round 436)
// still wins outright on top of either — it was never removed from the
// schema, just retired from the UI (the Is_thismonth switch that used to
// set it is now Is_installment and does something else — see
// toggleInstallmentMode below) — a release with a still-active prior
// override keeps counting from it.
function isThisMonth(entry, installments, now) {
  if (overrideActive(entry, now)) return true;
  if (installments && installments.length > 0) {
    return installments.some((inst) => sameMonth(inst.month, now));
  }
  return thangChiTraMatchesMonth(entry?.thang_chi_tra, now);
}

// The Is_thismonth switch's own checked state — deliberately NOT the same
// as isThisMonth() above. isThisMonth() answers "does this row count
// toward This Month right now" (true either from release_date alone, or
// from an active override); this answers "is a manual override
// currently the reason." Using isThisMonth() for the switch would make a
// release whose OWN release_date already falls in this month show
// checked with no override present, and unchecking it would instantly
// snap back to checked next render (falling straight back to
// release_date) — confusing, and not what was asked for. This switch
// only reflects/sets the override itself.
function overrideActive(entry, now) {
  return !!(entry?.override_month && sameMonth(entry.override_month, now));
}

// The editable cost fields every row gets, TikTok or Ads alike (Sup
// Cashback included, per this round's explicit follow-up).
//
// Round 447 — "report_link" is relabeled "URL Ads Perform" and no longer
// its own per-row value: it now reads/writes releases.ads_perform_url —
// the SAME url already shared across Booking Board's Ads popups and the
// release detail page's URL tab (see app/booking/page.js's Round 308
// comment — "exactly ONE url per release"). Per explicit request ("merge
// and link to the url field already in dashboard detail page... all of
// the section in the cost marketing now share this one URL instead of
// fragmented like before"), every funded_by/channel_kind/brand combo for
// a release — TikTok Channel or Ads, Vieent or Artist — now shows and
// edits that one shared value, not a separate url per combo. The `key`
// stays "report_link" for this array's own bookkeeping (column
// matching/order), but it's handled as a special case everywhere it's
// actually read or saved — see saveAdsPerformUrl below and the render
// loop's `f.key === "report_link"` branch, which always uses EditableCell
// against `release.ads_perform_url`, same as Cost Dự Kiến, regardless of
// Is_installment (a url can't be "per payment month").
const COST_FIELDS = [
  { key: "cost_du_kien", label: "Cost Dự Kiến", type: "number" },
  { key: "cost_thuc_chay", label: "Cost Thực Chạy", type: "number" },
  { key: "thang_chi_tra", label: "Tháng Chi Trả", type: "text", placeholder: "vd: 08/2026" },
  { key: "report_link", label: "URL Ads Perform", type: "url" },
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

// Round 446 — the fields that move INTO a per-installment row once a
// release's Is_installment switch is on; everything else in COST_FIELDS
// (Cost Dự Kiến — the estimate, never per-payment; Tháng Chi Trả — now the
// installment picker itself; URL Ads Perform — Round 447, one shared url
// per release, never per-payment either) stays exactly where it was. Same
// key/label/type shape as COST_FIELDS on purpose so InstallmentEditableCell
// can reuse EditableCell's own input rendering unchanged.
const INSTALLMENT_FIELDS = [
  { key: "cost_thuc_chay", label: "Cost Thực Chạy", type: "number" },
  { key: "vieent_ho_tro", label: "Vieent Hỗ Trợ", type: "number" },
  { key: "artist_tra", label: "Artist Trả", type: "number" },
  { key: "sup_cashback", label: "Sup Cashback", type: "number" },
];

// "2026-08-01" -> "08/2026". Installments are always stored at the 1st of
// the month (see the Round 446 SQL migration's comment) — this only ever
// reads the month/year back off that, same display format the old free-
// text field's placeholder already used.
function fmtMonth(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
// "2026-08" (an <input type="month"> value) -> "2026-08-01", the date
// shape the table itself stores.
function monthInputToDate(monthStr) {
  return monthStr ? `${monthStr}-01` : null;
}
function currentMonthInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function WorkstationCostMkt() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [releases, setReleases] = useState([]);
  const [categories, setCategories] = useState([]);
  const [packages, setPackages] = useState([]);
  const [entries, setEntries] = useState([]); // media_booking_entries — Round 316 fix, see below
  const [notInPackageTickets, setNotInPackageTickets] = useState([]);
  const [costEntries, setCostEntries] = useState({}); // costEntryKey -> row
  const [installmentsByKey, setInstallmentsByKey] = useState({}); // costEntryKey -> [row], sorted by month asc

  const [fundedBy, setFundedBy] = useState("vieent"); // "vieent" | "artist"
  const [channelKind, setChannelKind] = useState("tiktok"); // "tiktok" | "ads"
  const [partnerBrand, setPartnerBrand] = useState(TIKTOK_PARTNERS[0]);
  const [adsBrand, setAdsBrand] = useState(ADS_BRANDS[0]);
  const brand = channelKind === "tiktok" ? partnerBrand : adsBrand;

  // Round 445 — Sup Cashback only applies to TikTok Channel partners and
  // the Ads "TikTok Ads" brand, per explicit request ("hide sup cashback
  // for all but tiktok ads and TikTok channel"); every other Ads brand
  // (Facebook/YouTube/Spotify Ads) never shows or edits this column.
  // Doesn't touch saveField's payload shape or SummaryCard's all-time
  // total below — this only hides the column+header for brands it
  // doesn't apply to; any value already stored for another brand (legacy
  // data) is left alone, just no longer editable from here.
  const showSupCashback = channelKind === "tiktok" || brand === "TikTok Ads";
  const costFields = useMemo(
    () => COST_FIELDS.filter((f) => f.key !== "sup_cashback" || showSupCashback),
    [showSupCashback]
  );
  const installmentFields = useMemo(
    () => INSTALLMENT_FIELDS.filter((f) => f.key !== "sup_cashback" || showSupCashback),
    [showSupCashback]
  );

  // Round 436 introduced "This Month" / "All" counters (This Month = the
  // real current calendar month, not pickable). Round 447 replaces "This
  // Month" with an actual month FILTER, per explicit request ("drop the
  // filter this month, instead, add filter for month... click on the
  // button open a popup to pick month, then filter base on that month
  // instead") — filterMonth is the picked "YYYY-MM" (defaults to the
  // current month so the page is still useful before anyone touches the
  // picker), monthFilterActive is still the same on/off switch "All" used
  // to flip, now just driven by picking a month (or clearing back to All)
  // instead of a fixed toggle. Same click-to-filter/click-again-to-clear
  // idiom app/releases/page.js's own stat cards use — "All" still clears
  // it the same way it always did.
  const [filterMonth, setFilterMonth] = useState(() => currentMonthInputValue());
  const [monthFilterActive, setMonthFilterActive] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const filterMonthDate = useMemo(() => {
    const [y, m] = filterMonth.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1);
  }, [filterMonth]);
  const [showOverrideColumn, setShowOverrideColumn] = useState(false);

  // Round 446 — which installment is currently showing per row (keyed by
  // costEntryKey), and which release the "Add Month" popup is open for
  // (null = closed). Defaults to the LATEST installment (highest index
  // once sorted ascending) the first time a row with any installments
  // renders — see the rows memo below for where that default gets
  // applied, since it needs the actual installments array to know how
  // many there are.
  const [activeInstallmentIdx, setActiveInstallmentIdx] = useState({});
  const [addInstallmentFor, setAddInstallmentFor] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: rels }, { data: cats }, { data: tabRow }, { data: costEntryRows }, { data: installmentRows }] = await Promise.all([
      fetchAllRows(() =>
        supabase.from("releases").select("id, did, title, main_artist, release_date, project_type, ads_perform_url").order("release_date", { ascending: false })
      ),
      supabase.from("package_categories").select("id, name"),
      supabase.from("ticket_tabs").select("id").eq("key", BOOKING_NOT_IN_PACKAGE_TAB_KEY).maybeSingle(),
      fetchAllRows(() => supabase.from("workstation_cost_mkt_entries").select("*")),
      // Round 446 — sql/pending/add-round446-cost-mkt-installments.sql.
      // fetchAllRows never throws (it returns { data, error } even when
      // the table doesn't exist yet) — the `data || []` fallback below is
      // what actually keeps this page working before that SQL has been
      // applied: every row just falls back to legacy (non-installment)
      // behavior, same as a release that's never turned Is_installment on.
      fetchAllRows(() => supabase.from("workstation_cost_mkt_installments").select("*")),
    ]);
    const releaseList = rels || [];
    setReleases(releaseList);
    setCategories(cats || []);

    // Round 316 fix — this used to only fetch media_booking_packages
    // (the PLANNED/booked target, only present once a package is locked
    // in on the release) and never media_booking_entries at all — the
    // ACTUAL added links, which is what Booking Board's own cells mostly
    // show and what exists for a release regardless of whether it ever
    // got a locked package. That's why this page came up with nothing
    // hooked to it even for releases with real activity on the board: a
    // release with posted links but no locked package has bookedFor()
    // returning null for everything, so totalPost was always 0. Now
    // fetches entries too and reads added-vs-booked exactly the way
    // Booking Board's own BrandCell does (see makeAddedFor/makeBookedFor
    // in app/booking/page.js, both exported for this page to reuse).
    // Scoped to just the TikTok Channel + Ads categories (the only two
    // this page ever shows) instead of every release id, the same way
    // Booking Board itself scopes to its current page's ids — avoids an
    // .in() list of every release id in the system.
    const tiktokAdsCategoryIds = (cats || []).filter((c) => c.name === "TikTok Channel" || c.name === "Ads").map((c) => c.id);
    const releaseIds = releaseList.map((r) => r.id);
    const [{ data: pkgs }, { data: ents }, ticketRows] = await Promise.all([
      releaseIds.length > 0
        ? supabase
            .from("media_booking_packages")
            .select("id, release_id, name, media_booking_package_lines(category_id, brand, quantity, metric_quantities, brand_column_quantities)")
            .in("release_id", releaseIds)
        : Promise.resolve({ data: [] }),
      tiktokAdsCategoryIds.length > 0
        ? fetchAllRows(() =>
            supabase
              .from("media_booking_entries")
              .select("id, release_id, category_id, channel_name, platform, subchannel_type, quantity")
              .in("category_id", tiktokAdsCategoryIds)
              .order("id")
          )
        : Promise.resolve({ data: [] }),
      tabRow?.id
        ? fetchAllRows(() => supabase.from("tickets").select("id, data").eq("tab_id", tabRow.id).is("deleted_at", null))
        : Promise.resolve({ data: [] }),
    ]);
    setPackages(pkgs || []);
    setEntries(ents || []);
    setNotInPackageTickets(ticketRows?.data || []);

    const byKey = {};
    (costEntryRows || []).forEach((e) => { byKey[costEntryKey(e.release_id, e.funded_by, e.channel_kind, e.brand)] = e; });
    setCostEntries(byKey);

    // Round 446 — same costEntryKey grouping, sorted ascending by month so
    // index 0 is always the earliest payment and the last index is always
    // the most recent — what the ◀/▶ cycling and the default-to-latest
    // starting index both rely on.
    const installmentsByKeyMap = {};
    (installmentRows || []).forEach((row) => {
      const k = costEntryKey(row.release_id, row.funded_by, row.channel_kind, row.brand);
      (installmentsByKeyMap[k] = installmentsByKeyMap[k] || []).push(row);
    });
    Object.values(installmentsByKeyMap).forEach((list) => list.sort((a, b) => new Date(a.month) - new Date(b.month)));
    setInstallmentsByKey(installmentsByKeyMap);
    setLoading(false);
  }

  const categoryIdByName = useMemo(() => {
    const map = {};
    categories.forEach((c) => (map[c.name] = c.id));
    return map;
  }, [categories]);
  const packageByRelease = useMemo(() => buildPackageByRelease(releases, packages), [releases, packages]);
  const bookedFor = useMemo(() => makeBookedFor(packageByRelease, categoryIdByName), [packageByRelease, categoryIdByName]);
  const addedFor = useMemo(() => makeAddedFor(categoryIdByName), [categoryIdByName]);

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
  // anything at all worth showing (real activity in any column, OR a
  // cost entry already saved for it — so a manually-entered cost row
  // never disappears just because the underlying booking count changed).
  //
  // Round 316 fix — each column's value is now { added, booked }, read
  // the exact same way Booking Board's own cells are (added = real
  // posted links from media_booking_entries; booked = the package's
  // target, null when no package is locked yet). Total Post sums ADDED
  // (actual posts), not booked — matches "TOTAL POST" as a literal count
  // of posts made, and means a release shows up here as soon as it has
  // real activity on the board, whether or not it ever got a package
  // locked. A release with only a booked target and 0 posts so far still
  // shows (hasSomething also checks totalBooked), same visibility rule
  // Booking Board itself uses.
  // Round 447 — isThisMonth is now evaluated against the PICKED filter
  // month (filterMonthDate), not always "today" — see filterMonth's own
  // comment above. The field name stays isThisMonth to minimize churn;
  // it now means "matches the currently selected month filter."
  const rows = useMemo(() => {
    return releases
      .map((r) => {
        const values = columns.map((col) => {
          const platform = channelKind === "ads" ? col : null;
          const subchannelType = channelKind === "tiktok" ? col : null;
          // Round 447 — Thru Play (YouTube Ads' one and only metric) now
          // shows ONLY the package's own quantity — the number the artist
          // picked when choosing the package — per explicit request
          // ("take from the package chosen by artist instead of the input
          // from booking board"). Booking Board's own "added" count (what
          // ops actually typed in as the ads ran) is no longer read here
          // at all for this one column; every other Ads metric and every
          // TikTok Channel column is unchanged. Stored in `added` (not
          // `booked`) so the existing "{added}{ / booked}" cell render,
          // totalPost sum, and hasSomething check all keep working with no
          // further changes — pkgSourced just lets the cell pick a
          // different title/tooltip.
          if (channelKind === "ads" && brand === "YouTube Ads" && col === "Thruplay (Views)") {
            return { added: bookedFor(r, categoryName, brand, platform, subchannelType), booked: null, pkgSourced: true };
          }
          if (fundedBy === "vieent") {
            return {
              added: addedFor(r, categoryName, brand, platform, subchannelType, entries),
              booked: bookedFor(r, categoryName, brand, platform, subchannelType),
            };
          }
          return { added: artistQty(r, brand, col), booked: null };
        });
        const totalPost = values.reduce((sum, v) => sum + (v.added || 0), 0);
        const totalBooked = values.reduce((sum, v) => sum + (v.booked || 0), 0);
        const key = costEntryKey(r.id, fundedBy, channelKind, brand);
        const entry = costEntries[key];
        const installments = installmentsByKey[key] || [];
        const hasEntry = !!entry && Object.values(entry).some((v) => v !== null && v !== undefined && v !== "" && typeof v !== "object");
        return {
          release: r,
          values,
          totalPost,
          entry,
          installments,
          hasSomething: totalPost > 0 || totalBooked > 0 || hasEntry || installments.length > 0,
          isThisMonth: isThisMonth(entry, installments, filterMonthDate),
        };
      })
      .filter((row) => row.hasSomething);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releases, columns, fundedBy, channelKind, brand, bookedFor, addedFor, entries, costEntries, installmentsByKey, ticketsByDid, filterMonthDate]);

  // Round 436 introduced This Month / All counters; Round 447 keeps the
  // same two-card/click-to-filter shape but "This Month" is now "the
  // picked month" (thisMonthCount/isThisMonth really mean "matches
  // filterMonth" now — see that state's comment above). Counters are
  // always over the FULL current-tab row set (not already narrowed by
  // monthFilterActive), same "counters don't move just because you
  // clicked them" rule the Releases page's own stat cards follow.
  // displayedRows is what the table actually renders.
  const thisMonthCount = useMemo(() => rows.filter((row) => row.isThisMonth).length, [rows]);
  const allCount = rows.length;
  const displayedRows = monthFilterActive ? rows.filter((row) => row.isThisMonth) : rows;

  // Round 445 — Import/Export, per explicit request ("make an
  // import/export so that the team can easily get a template, add data
  // and import back in quickly"). The "template" IS the export: it's
  // every release currently relevant to this exact tab/brand (same `rows`
  // the table renders, not narrowed by the This Month filter), pre-filled
  // with whatever cost data already exists — so there's no separate blank
  // template to keep in sync with this page's own fields. DID + Release
  // are carried along read-only, purely so a re-imported file can be
  // matched back to the right release; only the fields after them are
  // ever written. Column set follows the same tiktok/ads + Sup Cashback
  // visibility this tab's table already uses (see costFields above), so
  // the file someone downloads always matches what they can see/edit here.
  const importExportColumns = useMemo(() => {
    const cols = [
      { key: "did", label: "DID" },
      { key: "title", label: "Release" },
    ];
    if (channelKind === "tiktok") {
      POST_FIELDS.forEach((f) => cols.push({ key: f.key, label: f.label, kind: "number" }));
    }
    costFields.forEach((f) => cols.push({ key: f.key, label: f.label, kind: f.type === "number" ? "number" : "text" }));
    return cols;
  }, [channelKind, costFields]);

  async function fetchExportRows() {
    return rows.map(({ release, entry }) => {
      const out = { did: release.did, title: release.title };
      importExportColumns.slice(2).forEach((c) => {
        // Round 447 — URL Ads Perform exports/imports from the release
        // itself (releases.ads_perform_url), not the per-row cost entry —
        // see COST_FIELDS' report_link comment.
        out[c.key] = c.key === "report_link" ? (release.ads_perform_url ?? "") : (entry?.[c.key] ?? "");
      });
      return out;
    });
  }

  const [showImport, setShowImport] = useState(false);

  // Bulk-apply what CostMktImportPopup parsed — merges into local state the
  // same way the live `load()` → costEntries map does, so the table
  // reflects an import immediately without a full page reload.
  function handleImported(updatedRows) {
    setCostEntries((prev) => {
      const next = { ...prev };
      updatedRows.forEach((row) => { next[costEntryKey(row.release_id, row.funded_by, row.channel_kind, row.brand)] = row; });
      return next;
    });
  }

  // Round 447 — the Import popup's other half: URL Ads Perform values it
  // parsed land on `releases`, not a cost entry (see
  // lib/CostMktImport.js's adsPerformUrlByReleaseId) — merge those into
  // local `releases` state the same immediate way.
  function handleAdsPerformUrlsImported(updatedReleases) {
    setReleases((prev) => {
      const byId = {};
      updatedReleases.forEach((r) => { byId[r.id] = r.ads_perform_url; });
      return prev.map((r) => (r.id in byId ? { ...r, ads_perform_url: byId[r.id] } : r));
    });
  }

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
      // Round 447 — report_link retired from this table; see
      // saveAdsPerformUrl below. No longer included in this payload at
      // all (not even carried forward), so this column just stops moving
      // for every row going forward — whatever a row already had here is
      // simply unused now, not overwritten.
      vieent_ho_tro: existing?.vieent_ho_tro ?? null,
      artist_tra: existing?.artist_tra ?? null,
      sup_cashback: existing?.sup_cashback ?? null,
      // Round 436 — still here, still consulted by isThisMonth() as a
      // last-resort override, but no longer user-settable from this page
      // (see toggleInstallmentMode below) — preserved so a release that
      // already had one active before Round 446 doesn't lose it.
      override_month: existing?.override_month ?? null,
      // Round 446 — the Is_installment switch's own stored value; see
      // toggleInstallmentMode below. Included here like every other field
      // so toggling anything else on this row doesn't clobber it.
      is_installment: existing?.is_installment ?? false,
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

  // Round 447 — URL Ads Perform (the old "Report Link" cell) now reads/
  // writes releases.ads_perform_url directly — the one url already shared
  // across Booking Board's Ads popups and the release detail page's URL
  // tab (app/booking/page.js's Round 308 "exactly ONE url per release").
  // Saving here updates that SAME column, so a value typed from Cost
  // Marketing shows up in those other 2 places too, and vice versa —
  // that's the whole point of merging onto one field instead of each
  // surface keeping its own copy. Optimistic update touches local
  // `releases` state (not costEntries — this was never a cost-entry
  // field) so every row/tab referencing this release re-renders with the
  // new value immediately.
  async function saveAdsPerformUrl(release, value) {
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, ads_perform_url: value } : r)));
    await supabase.from("releases").update({ ads_perform_url: value }).eq("id", release.id);
  }

  // Round 446 — Is_thismonth (Round 436) is now Is_installment: checking
  // it on no longer forces "this month" by itself — it switches that
  // row's Tháng Chi Trả cell (and the cost fields beside it) from the old
  // flat/legacy fields over to the new per-month installment picker/mini-
  // table (see the table body below). Unchecking it switches back to the
  // flat fields — any installments already added are NOT deleted, just
  // not shown while it's off, so re-checking it later picks up right
  // where it left off.
  function toggleInstallmentMode(release, checked) {
    saveField(release, "is_installment", checked);
  }

  // Round 446 — persists one field on ONE installment row (not the whole
  // release/brand's cost entry). Same optimistic-update-then-reconcile
  // shape as saveField, just against workstation_cost_mkt_installments
  // and addressed by the installment's own id rather than the
  // release/funded_by/channel_kind/brand compound key.
  async function saveInstallmentField(release, installment, field, value) {
    if (!installment) return;
    const key = costEntryKey(release.id, fundedBy, channelKind, brand);
    const patch = { [field]: value, updated_at: new Date().toISOString(), updated_by: profile?.id || null };
    setInstallmentsByKey((prev) => ({
      ...prev,
      [key]: (prev[key] || []).map((inst) => (inst.id === installment.id ? { ...inst, ...patch } : inst)),
    }));
    const { data, error } = await supabase
      .from("workstation_cost_mkt_installments")
      .update(patch)
      .eq("id", installment.id)
      .select()
      .single();
    if (!error && data) {
      setInstallmentsByKey((prev) => ({
        ...prev,
        [key]: (prev[key] || []).map((inst) => (inst.id === data.id ? data : inst)),
      }));
    }
  }

  // Round 446 — "Add Month" popup's Save action. Upserts (so re-picking a
  // month that already exists for this release/brand just re-selects it
  // rather than erroring on the unique constraint) and always jumps the
  // newly-added/re-selected month into view.
  async function addInstallment(release, monthInputValue) {
    const key = costEntryKey(release.id, fundedBy, channelKind, brand);
    const payload = {
      release_id: release.id,
      funded_by: fundedBy,
      channel_kind: channelKind,
      brand,
      month: monthInputToDate(monthInputValue),
      updated_at: new Date().toISOString(),
      updated_by: profile?.id || null,
    };
    const { data, error } = await supabase
      .from("workstation_cost_mkt_installments")
      .upsert(payload, { onConflict: "release_id,funded_by,channel_kind,brand,month" })
      .select()
      .single();
    if (error || !data) return;
    setInstallmentsByKey((prev) => {
      const next = (prev[key] || []).filter((inst) => inst.id !== data.id).concat(data);
      next.sort((a, b) => new Date(a.month) - new Date(b.month));
      const newIdx = next.findIndex((inst) => inst.id === data.id);
      setActiveInstallmentIdx((p) => ({ ...p, [key]: newIdx }));
      return { ...prev, [key]: next };
    });
    setAddInstallmentFor(null);
  }

  // ── Top summary card. Round 436/446 had this always all-time, across
  // every entry regardless of the tabs/filters currently selected ("the
  // top (unmoving part)"). Round 447 — per explicit follow-up ("make the
  // counter (the sum at the top of the workstation) also count based on
  // the month"), it now respects the SAME month filter as the per-tab
  // table below (filterMonth/monthFilterActive) — "All" still shows the
  // all-time sum, same as before, since that filter state is shared.
  // Cost totals use Cost Thực Chạy (actual spend), not Cost Dự Kiến
  // (estimate).
  //
  // A release in Is_installment mode (Round 446) keeps its money fields
  // on its installment rows instead of these flat entry columns — summed
  // here from installmentsByKey instead, matched against filterMonth the
  // same way the per-tab table's own InstallmentEditableCell picks which
  // installment is "active." A non-installment release is matched by
  // parsing its Tháng Chi Trả free text, same as isThisMonth() does for
  // the per-tab table.
  const allEntryPairs = useMemo(
    () => Object.entries(costEntries).map(([key, entry]) => ({ entry, installments: installmentsByKey[key] || [] })),
    [costEntries, installmentsByKey]
  );
  function sumField(pred, field) {
    return allEntryPairs.reduce((sum, { entry, installments }) => {
      if (!entry || !pred(entry)) return sum;
      if (entry.is_installment) {
        const matching = monthFilterActive ? installments.filter((inst) => sameMonth(inst.month, filterMonthDate)) : installments;
        return sum + matching.reduce((s, inst) => s + (Number(inst[field]) || 0), 0);
      }
      if (!monthFilterActive) return sum + (Number(entry[field]) || 0);
      return sum + (thangChiTraMatchesMonth(entry.thang_chi_tra, filterMonthDate) ? Number(entry[field]) || 0 : 0);
    }, 0);
  }
  const tiktokBookingTotal = sumField((e) => e.channel_kind === "tiktok", "cost_thuc_chay");
  const youtubeAdsTotal = sumField((e) => e.channel_kind === "ads" && e.brand === "YouTube Ads", "cost_thuc_chay");
  const metaAdsTotal = sumField((e) => e.channel_kind === "ads" && e.brand === "Facebook Ads", "cost_thuc_chay");
  const vieentFundedTotal = sumField(() => true, "vieent_ho_tro");
  const artistFundedTotal = sumField(() => true, "artist_tra");
  const supCashbackTotal = sumField(() => true, "sup_cashback");

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

          {/* Round 436 — counters scoped to the currently selected
              tab/brand above (same rows the table below shows), not
              all-time like SummaryCard (SummaryCard itself now follows
              this same filter too, as of Round 447 — see its own comment
              below). Round 447 — "This Month" replaced with an actual
              month picker: click the month card to open the popup and
              pick (or re-pick) a month, filtering the table to just that
              month; click "All" to clear back to everything. */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <MonthStatCard
                label={`📅 ${fmtMonth(monthInputToDate(filterMonth))}`}
                value={thisMonthCount}
                active={monthFilterActive}
                onClick={() => setShowMonthPicker(true)}
              />
              <MonthStatCard label="All" value={allCount} active={!monthFilterActive} onClick={() => setMonthFilterActive(false)} />
            </div>
            <button
              onClick={() => setShowOverrideColumn((v) => !v)}
              className={`${styles.tabBtn} ${showOverrideColumn ? styles.tabBtnActive : ""}`}
              style={{ border: showOverrideColumn ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: showOverrideColumn ? "rgba(255,107,26,0.1)" : "transparent", fontSize: 12 }}
              title="Show a per-row switch to track Tháng Chi Trả as real per-month installment rows instead of one free-text cell"
            >
              Is_installment
            </button>
            {/* Round 445 — Import/Export, scoped to the current tab/brand
                (same rows as the counters/table above). Export doubles as
                the template: download it, edit cells in Excel, re-import. */}
            <ExportButton
              columns={importExportColumns}
              filename={`cost-mkt-${fundedBy}-${channelKind}-${brand}`}
              fetchRows={fetchExportRows}
              label="Export / Template"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowImport(true)}
              disabled={loading}
              className={styles.tabBtn}
              style={{ border: "1px solid var(--border-strong)", borderRadius: 6, fontSize: 11, color: "var(--text-faint)", padding: "6px 12px" }}
            >
              ⬆ Import
            </button>
          </div>

          {showMonthPicker && (
            <MonthFilterPopup
              styles={styles}
              defaultMonth={filterMonth}
              onApply={(m) => { setFilterMonth(m); setMonthFilterActive(true); setShowMonthPicker(false); }}
              onClose={() => setShowMonthPicker(false)}
            />
          )}

          {showImport && (
            <CostMktImportPopup
              styles={styles}
              profile={profile}
              columns={importExportColumns}
              releases={releases}
              fundedBy={fundedBy}
              channelKind={channelKind}
              brand={brand}
              costEntries={costEntries}
              scopeLabel={`${fundedBy === "vieent" ? "Booking Package" : "Booking Không Package"} — ${channelKind === "tiktok" ? "TikTok Channel" : "Ads"} — ${channelKind === "tiktok" ? shortPartnerLabel(brand) : brand}`}
              onClose={() => setShowImport(false)}
              onImported={(updatedRows) => { handleImported(updatedRows); setShowImport(false); }}
              onAdsPerformUrlsImported={handleAdsPerformUrlsImported}
            />
          )}

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : displayedRows.length === 0 ? (
            <div className={styles.emptyState}>
              {monthFilterActive
                ? `No releases counted for this month yet for ${channelKind === "tiktok" ? shortPartnerLabel(brand) : brand}.`
                : <>Nothing booked yet for {channelKind === "tiktok" ? shortPartnerLabel(brand) : brand}
                  {fundedBy === "artist" ? " (or no Booking Không Trong Package ticket matches this Brand/Hạng Mục yet)." : "."}</>}
            </div>
          ) : (
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {/* Round 436 — "pops out" on the left when Is_installment
                        is toggled on, ahead of Release. */}
                    {showOverrideColumn && <th title="Track Tháng Chi Trả as real per-month installment rows for this release">Is_installment?</th>}
                    <th>Release</th>
                    {columns.map((c) => <th key={c}>{c}</th>)}
                    {channelKind === "tiktok" && <th>Total Post</th>}
                    {channelKind === "tiktok" && POST_FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}
                    {costFields.map((f) => <th key={f.key}>{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map(({ release, values, totalPost, entry, installments }) => {
                    const key = costEntryKey(release.id, fundedBy, channelKind, brand);
                    const isInstallment = !!entry?.is_installment;
                    const activeIdx = installments.length > 0
                      ? Math.min(activeInstallmentIdx[key] ?? installments.length - 1, installments.length - 1)
                      : -1;
                    const activeInstallment = activeIdx >= 0 ? installments[activeIdx] : null;
                    function setActiveIdx(idx) {
                      setActiveInstallmentIdx((prev) => ({ ...prev, [key]: idx }));
                    }
                    return (
                      <tr key={release.id}>
                        {showOverrideColumn && (
                          <td style={{ textAlign: "center" }} title="On = Tháng Chi Trả becomes a mini-table of per-month installments instead of one free-text cell">
                            <PillSwitch
                              size="sm"
                              checked={isInstallment}
                              onChange={(checked) => toggleInstallmentMode(release, checked)}
                            />
                          </td>
                        )}
                        <td style={{ minWidth: 160 }}>
                          <Link href={`/releases/${release.id}`} className={styles.rowLink}>{release.title}</Link>
                          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release.main_artist}</div>
                        </td>
                        {values.map((v, i) => (
                          <td key={i} style={{ textAlign: "center", fontSize: 12 }} title={v.pkgSourced ? "from the chosen package" : "added / booked target"}>
                            {v.added || v.booked != null ? `${v.added}${v.booked != null ? ` / ${v.booked}` : ""}` : "—"}
                          </td>
                        ))}
                        {channelKind === "tiktok" && (
                          <td style={{ textAlign: "center", fontSize: 12, fontWeight: 700 }}>{totalPost || "—"}</td>
                        )}
                        {channelKind === "tiktok" &&
                          POST_FIELDS.map((f) => (
                            <EditableCell key={f.key} field={f} value={entry?.[f.key]} onSave={(v) => saveField(release, f.key, v)} />
                          ))}
                        {costFields.map((f) => {
                          if (f.key === "cost_du_kien") {
                            return <EditableCell key={f.key} field={f} value={entry?.[f.key]} onSave={(v) => saveField(release, f.key, v)} />;
                          }
                          if (f.key === "report_link") {
                            // Round 447 — one shared url per release
                            // (releases.ads_perform_url), same cell
                            // regardless of Is_installment — see
                            // saveAdsPerformUrl and this field's comment on
                            // COST_FIELDS above.
                            return <EditableCell key={f.key} field={f} value={release.ads_perform_url} onSave={(v) => saveAdsPerformUrl(release, v)} />;
                          }
                          if (f.key === "thang_chi_tra") {
                            return isInstallment ? (
                              <InstallmentMonthCell
                                key={f.key}
                                installments={installments}
                                activeIdx={activeIdx}
                                onNav={setActiveIdx}
                                onAdd={() => setAddInstallmentFor(release)}
                              />
                            ) : (
                              <EditableCell key={f.key} field={f} value={entry?.[f.key]} onSave={(v) => saveField(release, f.key, v)} />
                            );
                          }
                          return isInstallment ? (
                            <InstallmentEditableCell
                              key={f.key}
                              field={f}
                              installment={activeInstallment}
                              activeIdx={activeIdx}
                              onSave={(v) => saveInstallmentField(release, activeInstallment, f.key, v)}
                            />
                          ) : (
                            <EditableCell key={f.key} field={f} value={entry?.[f.key]} onSave={(v) => saveField(release, f.key, v)} />
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {addInstallmentFor && (
            <AddInstallmentPopup
              styles={styles}
              release={addInstallmentFor}
              defaultMonth={currentMonthInputValue()}
              onAdd={(monthInputValue) => addInstallment(addInstallmentFor, monthInputValue)}
              onClose={() => setAddInstallmentFor(null)}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

// Round 436 — This Month / All counter, click-to-filter. Small version of
// app/releases/page.js's own StatCard (same active/click idiom — click to
// select, click the active one again to go back to "All" — but no
// separate ✕ clear button since there are only ever these two states).
function MonthStatCard({ label, value, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: "pointer",
        minWidth: 90,
        background: active ? "rgba(255,107,26,0.08)" : undefined,
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 14px",
      }}
      className={active ? undefined : styles.statCard}
    >
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
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

// Round 446 — replaces the Tháng Chi Trả free-text cell for a release
// that has Is_installment on. ◀/▶ cycle through that row's installment
// months (click-to-change-in-order, per the user's own call on "either
// we go with click to change in order or pick the specific, your
// choice on easier code" — order is simplest to wire up since
// installments are already kept sorted ascending by month); "+ Add
// Month" opens the date-picker popup for a new one. The .flipPerspective/
// .flipFace pair (shared.module.css) gives the "rectangle cube turning
// side" feel on every month change — keyed by activeIdx so React
// remounts (and thus re-plays) the animation each time.
function InstallmentMonthCell({ installments, activeIdx, onNav, onAdd }) {
  const current = activeIdx >= 0 ? installments[activeIdx] : null;
  return (
    <td>
      <div className={styles.flipPerspective} style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 110 }}>
        <button
          type="button"
          onClick={() => onNav(Math.max(0, activeIdx - 1))}
          disabled={activeIdx <= 0}
          style={{ background: "none", border: "none", cursor: activeIdx <= 0 ? "default" : "pointer", color: "var(--text-faint)", opacity: activeIdx <= 0 ? 0.3 : 1, fontSize: 12, padding: "0 2px" }}
          title="Previous month"
        >
          ◀
        </button>
        <div key={activeIdx} className={styles.flipFace} style={{ fontSize: 12, fontWeight: 700, minWidth: 54, textAlign: "center" }}>
          {current ? fmtMonth(current.month) : <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>—</span>}
        </div>
        <button
          type="button"
          onClick={() => onNav(Math.min(installments.length - 1, activeIdx + 1))}
          disabled={activeIdx < 0 || activeIdx >= installments.length - 1}
          style={{ background: "none", border: "none", cursor: activeIdx >= installments.length - 1 ? "default" : "pointer", color: "var(--text-faint)", opacity: activeIdx >= installments.length - 1 ? 0.3 : 1, fontSize: 12, padding: "0 2px" }}
          title="Next month"
        >
          ▶
        </button>
        <button
          type="button"
          onClick={onAdd}
          style={{ background: "none", border: "1px dashed var(--border-strong)", borderRadius: 4, cursor: "pointer", color: "var(--text-faint)", fontSize: 11, padding: "2px 6px", marginLeft: 2 }}
          title="Add a payment month"
        >
          + Month
        </button>
      </div>
    </td>
  );
}

// Round 446 — same shape as EditableCell, but reads/writes the row's
// CURRENTLY ACTIVE installment (per InstallmentMonthCell's ◀/▶ above)
// instead of the flat workstation_cost_mkt_entries columns. Flip-
// animated in step with the month cell so the whole row visually turns
// together. Disabled with a placeholder when Is_installment is on but
// no month has been added yet — nothing to attach a value to.
function InstallmentEditableCell({ field, installment, activeIdx, onSave }) {
  const [local, setLocal] = useState(installment?.[field.key] ?? "");
  useEffect(() => { setLocal(installment?.[field.key] ?? ""); }, [installment, field.key]);

  if (!installment) {
    return (
      <td key={activeIdx}>
        <input className={styles.input} style={{ width: field.type === "number" ? 90 : 110, fontSize: 12 }} disabled placeholder="Add a month first" />
      </td>
    );
  }

  if (field.type === "url") {
    return (
      <td key={activeIdx} className={styles.flipFace}>
        <UrlField value={local} onChange={setLocal} onBlur={() => onSave(local || null)} styles={styles} placeholder="Report link…" />
      </td>
    );
  }
  return (
    <td key={activeIdx} className={styles.flipFace}>
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

// Round 447 — the per-tab "pick a month to filter by" popup (replaces
// the old fixed "This Month" toggle). Same bare <input type="month">
// idiom as AddInstallmentPopup below, just applying to the page's
// filterMonth state instead of adding an installment row.
function MonthFilterPopup({ styles, defaultMonth, onApply, onClose }) {
  const [monthValue, setMonthValue] = useState(defaultMonth);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 399, background: "rgba(0,0,0,0.5)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 400,
          width: "min(360px, calc(100vw - 32px))",
          background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10,
          padding: 20, boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 10 }}>
          Filter By Month
        </div>
        <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 0, marginBottom: 14 }}>
          Pick the month to filter this tab's table — and the summary totals above — by.
        </p>
        <input
          type="month"
          className={styles.input}
          value={monthValue}
          onChange={(e) => setMonthValue(e.target.value)}
          style={{ width: "100%", marginBottom: 16 }}
          autoFocus
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!monthValue}
            onClick={() => monthValue && onApply(monthValue)}
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}

// Round 446 — the literal "date picker but only mm/yyyy" ask: a bare
// <input type="month">, browser-native, defaulting to the current month.
// Small modal, same idiom as CostMktImportPopup's overlay below it.
function AddInstallmentPopup({ styles, release, defaultMonth, onAdd, onClose }) {
  const [monthValue, setMonthValue] = useState(defaultMonth);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 399, background: "rgba(0,0,0,0.5)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 400,
          width: "min(360px, calc(100vw - 32px))",
          background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10,
          padding: 20, boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 10 }}>
          Add Payment Month
        </div>
        <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 0, marginBottom: 14 }}>
          {release.title} — pick the month this installment covers.
        </p>
        <input
          type="month"
          className={styles.input}
          value={monthValue}
          onChange={(e) => setMonthValue(e.target.value)}
          style={{ width: "100%", marginBottom: 16 }}
          autoFocus
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!monthValue}
            onClick={() => monthValue && onAdd(monthValue)}
          >
            Add
          </button>
        </div>
      </div>
    </>
  );
}
