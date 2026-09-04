"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, metadataPercent, uploadPercent } from "../../lib/helpers";
import { buildProductNote } from "../../lib/releaseNotes";
import SortableTh, { ResetSortButton } from "../../lib/SortableTh";
import Pagination, { PAGE_SIZE_OPTIONS } from "../../lib/Pagination";
import { fetchProductTagSets, ProductTagPills } from "../../lib/productTags";
import { copyrightChecklistSummary } from "../../lib/copyrightChecklist";
import DateRangeFilter, { matchesDateRange } from "../../lib/DateRangeFilter";
import styles from "../shared.module.css";

const CHANNELS = ["VIEENT", "ENVI"];

// Round 224 — "remember position" for this page: filters, search, date
// range, sort, page/page size, and scroll position, so clicking into a
// release and hitting Back lands you exactly where you left off instead
// of resetting to defaults. Purely a per-tab browser convenience —
// sessionStorage only (clears when the tab closes, never written to or
// read from the database, so this costs nothing beyond a few bytes in
// the browser and is per-device by nature — nobody else's session is
// affected).
const DASHBOARD_STATE_KEY = "vieent-releases-dashboard-v1";

function readDashboardState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DASHBOARD_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDashboardState(state) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DASHBOARD_STATE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage can throw in private-browsing/storage-full edge cases —
    // this is a pure convenience, not worth surfacing an error for.
  }
}

// Round 247 — real server-side pagination (see project doc
// "server-side-pagination-pitch.md"). This page used to pull the ENTIRE
// releases table (fetchAllRows, no .range()) on every visit, then do
// EVERYTHING client-side: the 6 stat cards, search (regex-first against
// title/artist/label), every filter, sort, and the page slice itself all
// read the one full in-memory array. That doesn't scale with table size —
// see the pitch doc for the full case.
//
// What changed:
//  - The row fetch now uses .range() + { count: "exact" } — only the
//    current page's rows (and columns — RELEASE_COLUMNS below, unchanged)
//    cross the wire, with an exact total for Pagination's "Page X / Y".
//    Chosen over Postgres's cheaper estimated count per explicit request —
//    this page's numbers get reported off of, so exact was worth the extra
//    real scan.
//  - The 6 stat cards + the 2 channel cards are now 9 independent
//    `{ count: "exact", head: true }` queries instead of a client .reduce()
//    over the full array — see loadStats() below. These are INTENTIONALLY
//    independent of the active filters (matches the original behavior:
//    the old `stats` useMemo depended only on the unfiltered `releases`
//    array, never on statusFilter/channelFilter/etc.), so they're fetched
//    once on load/refresh, not on every filter change.
//  - Search moved server-side via Postgres regex (`imatch`, the `~*`
//    operator) across title/main_artist/label — per explicit request, kept
//    genuinely regex-capable rather than downgrading to plain substring
//    matching, matching the client's old "regex-first" behavior as closely
//    as PostgREST allows. An invalid regex previously fell back to a plain
//    substring match client-side (a JS try/catch around `new RegExp`) —
//    the server can't try/catch a bad pattern the same way, so an invalid
//    pattern here triggers a SECOND query using `ilike` (substring) as the
//    fallback instead. Debounced 350ms so normal typing doesn't fire a
//    query per keystroke.
//  - Sort now drives `.order()` instead of a client array sort
//    (useSortableRows) — every sortable column here (did, requester_segment,
//    release_category... see the <SortableTh> list below) is a real
//    `releases` column, not a computed/joined value, so this is a clean
//    1:1 swap with zero behavior change.
//  - bookingPct / pitchingData / albumNameByDid — previously joined against
//    ALL releases; now scoped to just the current page's release ids/DIDs
//    once that page's rows are known (see loadPageJoins below). Smaller
//    queries, same displayed values.
//  - The old 30s whole-page cache (loadDashboardData's dashboardCache) is
//    gone — each filter/sort/page change is its own small query now rather
//    than a slice of one giant cached blob, so there's no single blob left
//    to cache. Trade-off worth knowing about: a "click Back" revisit is no
//    longer free/instant the way it was within that 30s window — it's a
//    fresh (but now cheap) query every time.
//  - typeFilter's dropdown options used to come from `[...new
//    Set(releases.map(r => r.project_type))]` over the full loaded table —
//    with only one page in memory now that would silently shrink to
//    whatever types happen to be on the current page. loadTypeOptions()
//    below fetches just the `project_type` column (capped, deduped
//    client-side) once on load instead — see its own comment.
const RELEASE_COLUMNS = [
  "id", "did", "title", "main_artist", "label", "media_report_status", "project_type",
  "pseudo_package_parent_did", "release_category", "release_date", "release_time",
  "requester_segment", "status", "created_at",
  // metadataPercent()
  "meta_audio", "meta_artwork", "meta_working_files", "meta_lyric", "meta_mv", "meta_doc",
  // uploadPercent()
  "link_lbm", "link_share", "smartlink", "gate_pre_order", "link_preorder",
  // pitchingSummary()/pitchingStatusFor()
  "priority_pitching", "pitching_status_spotify", "pitching_status_apple", "pitching_status_nct", "pitching_status_zing",
  // Round 88 — Copyright Checklist compiled summary subrow
  "copyright_checklist",
].join(", ");

// Mirrors app/workstation/pitching/page.js's DONE_VALUE/CANCEL_VALUES so the
// dashboard's "Status Pitching" column agrees with the Pitching workstation
// about what "done"/"cancelled" mean, instead of drifting into its own
// definition.
const PITCHING_DONE_VALUE = "Đã pitching";
const PITCHING_CANCEL_VALUES = ["Không thực hiện", "Không hỗ trợ"];
const PITCHING_TYPE_KEYS = ["priority", "spotify", "apple", "nct", "zing"]; // round 79 — Apple joined as a real tracked platform

function pitchingStatusFor(release, key) {
  if (key === "priority") return release?.priority_pitching;
  if (key === "spotify") return release?.pitching_status_spotify;
  if (key === "apple") return release?.pitching_status_apple;
  if (key === "nct") return release?.pitching_status_nct;
  if (key === "zing") return release?.pitching_status_zing;
  return null;
}

// "Status Pitching" summary for a release, given the selected types from its
// Pitching ticket (ticket.data — see app/releases/[id]/page.js's
// pitchingTypesDraft) and the per-type status columns on the release itself.
function pitchingSummary(release, ticketData) {
  if (!ticketData) return { label: "Not requested", tone: "gray" };
  const types = PITCHING_TYPE_KEYS.filter((k) => ticketData[k]);
  if (types.length === 0) return { label: "Not requested", tone: "gray" };
  if (types.every((k) => pitchingStatusFor(release, k) === PITCHING_DONE_VALUE)) return { label: "Done", tone: "orange" };
  if (types.every((k) => PITCHING_CANCEL_VALUES.includes(pitchingStatusFor(release, k)))) return { label: "Cancelled", tone: "gray" };
  return { label: "In Progress", tone: "yellow" };
}

// Local-calendar boundaries, same math the old client `stats` useMemo used
// (now.getDate()/getDay()/getMonth() are all local-time getters) — just
// converted to ISO instants for use as query bounds instead of compared
// against in JS. NOTE: this assumes the database compares a `date` column
// against a timestamptz bound the same way `new Date(release_date) > now`
// does client-side (both effectively UTC-midnight for the date side) —
// that held in the original client code because `new Date("YYYY-MM-DD")`
// parses as UTC per the JS spec. Worth a real smoke-test against live data
// (compare these 6 stat cards' numbers to what the old client-computed
// version showed) before trusting this at the edges — session couldn't
// verify DB timezone handling without a live connection.
function calendarBounds() {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfToday.getDate() + 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfNextWeek = new Date(startOfWeek);
  startOfNextWeek.setDate(startOfWeek.getDate() + 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { now, startOfToday, startOfTomorrow, startOfWeek, startOfNextWeek, startOfMonth, startOfNextMonth, sevenDaysAgo };
}

async function countReleases(build) {
  let q = supabase.from("releases").select("id", { count: "exact", head: true });
  q = build(q);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

// The 6 stat cards + 2 channel cards — 9 independent head-only counts,
// fired together. Deliberately does NOT depend on the page's active
// filters (statusFilter/channelFilter/etc.) — matches the original
// behavior where these always reflected the WHOLE table, not the current
// filtered view (a stat card's job here is "how many total", the filters
// below are a separate, independent lens onto the list).
async function loadStats() {
  const b = calendarBounds();
  const iso = (d) => d.toISOString();
  const [total, today, thisWeek, thisMonth, preRelease, released, postRelease, viennt, envi] = await Promise.all([
    countReleases((q) => q),
    countReleases((q) => q.gte("release_date", iso(b.startOfToday)).lt("release_date", iso(b.startOfTomorrow))),
    countReleases((q) => q.gte("release_date", iso(b.startOfWeek)).lt("release_date", iso(b.startOfNextWeek))),
    countReleases((q) => q.gte("release_date", iso(b.startOfMonth)).lt("release_date", iso(b.startOfNextMonth))),
    countReleases((q) => q.gt("release_date", iso(b.now))),
    countReleases((q) => q.lte("release_date", iso(b.now)).gte("release_date", iso(b.sevenDaysAgo))),
    countReleases((q) => q.lt("release_date", iso(b.sevenDaysAgo))),
    countReleases((q) => q.eq("requester_segment", "VIEENT")),
    countReleases((q) => q.eq("requester_segment", "ENVI")),
  ]);
  return {
    total, today, thisWeek, thisMonth, preRelease, released, postRelease,
    byChannel: { VIEENT: viennt, ENVI: envi },
  };
}

// Real SELECT DISTINCT isn't exposed through the Supabase JS client — this
// pulls just the `project_type` column (one skinny column, not the whole
// row) capped at a generous row count and dedupes client-side. Good enough
// for a filter dropdown: project_type is a small, reused vocabulary (a
// handful of literal pipeline-stage/package-type strings — see
// PIPELINE_STAGES in app/releases/[id]/page.js), so any real value is
// overwhelmingly likely to show up well within this cap even on a huge
// table — this is NOT a guarantee of true completeness the way a real
// `SELECT DISTINCT` would be, just a practical stand-in.
async function loadTypeOptions() {
  const { data } = await supabase.from("releases").select("project_type").not("project_type", "is", null).limit(5000);
  return [...new Set((data || []).map((r) => r.project_type).filter(Boolean))].sort();
}

// PostgREST's `.or()` filter syntax uses `,` to separate conditions and
// `(`/`)` to group them — both are completely ordinary characters in real
// release titles ("State Lines, Pt. 2", "Deluxe (2024)"), so the raw search
// text can't go into the filter string unescaped or it desyncs PostgREST's
// own parser (not just a wrong-match risk — a real query error). PostgREST's
// fix for this is documented: wrap the value in double quotes, and escape
// any literal backslash/double-quote inside it. Applies to both the ilike
// substring value and the imatch regex pattern — quoting only affects how
// PostgREST's filter-string tokenizer reads the value, not what the
// operator itself receives, so a regex pattern that legitimately uses ()
// or {1,2} still works as a regex once unquoted server-side.
function escapeOrFilterValue(v) {
  return `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Builds the filtered/sorted/paginated releases query. Shared by the real
// fetch and by the regex-invalid-pattern fallback below.
function buildListQuery({ page, pageSize, sort, filters, searchMode, searchQuery }) {
  let q = supabase.from("releases").select(RELEASE_COLUMNS, { count: "exact" });

  const b = calendarBounds();
  const iso = (d) => d.toISOString();
  if (filters.createdFilter === "today") q = q.gte("release_date", iso(b.startOfToday)).lt("release_date", iso(b.startOfTomorrow));
  if (filters.createdFilter === "week") q = q.gte("release_date", iso(b.startOfWeek)).lt("release_date", iso(b.startOfNextWeek));
  if (filters.createdFilter === "month") q = q.gte("release_date", iso(b.startOfMonth)).lt("release_date", iso(b.startOfNextMonth));
  if (filters.statusFilter === "preRelease") q = q.gt("release_date", iso(b.now));
  if (filters.statusFilter === "released") q = q.lte("release_date", iso(b.now)).gte("release_date", iso(b.sevenDaysAgo));
  if (filters.statusFilter === "postRelease") q = q.lt("release_date", iso(b.sevenDaysAgo));
  if (filters.channelFilter) q = q.eq("requester_segment", filters.channelFilter);
  if (filters.typeFilter) q = q.eq("project_type", filters.typeFilter);
  if (filters.labelFilter) q = q.eq("label", filters.labelFilter);
  if (filters.dateRangeStart) q = q.gte("release_date", filters.dateRangeStart);
  if (filters.dateRangeEnd) q = q.lte("release_date", filters.dateRangeEnd);

  if (searchQuery) {
    const op = searchMode === "regex" ? "imatch" : "ilike";
    const rawVal = searchMode === "regex" ? searchQuery : `%${searchQuery}%`;
    const val = escapeOrFilterValue(rawVal);
    q = q.or(`title.${op}.${val},main_artist.${op}.${val},label.${op}.${val}`);
  }

  const sortKey = sort?.key || "release_date";
  const sortAsc = sort ? sort.dir === "asc" : false; // default: release date, newest first — matches the old useSortableRows default
  q = q.order(sortKey, { ascending: sortAsc }).order("id", { ascending: true });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return q.range(from, to);
}

// Round 224 restore/save (see the two effects near the bottom of the
// component) still needs a plain object shape to read/write — unchanged
// from before other than dropping the fields that no longer exist
// (nothing removed here, sort/page/filters are all still real state).
function currentDashboardState({ search, statusFilter, createdFilter, channelFilter, typeFilter, labelFilter, dateRangeStart, dateRangeEnd, page, pageSize, sort }) {
  return { search, statusFilter, createdFilter, channelFilter, typeFilter, labelFilter, dateRangeStart, dateRangeEnd, page, pageSize, sort };
}

export default function ReleasesDashboard() {
  const [releases, setReleases] = useState([]); // current PAGE only, not the whole table
  const [totalRows, setTotalRows] = useState(0);
  const [bookingPct, setBookingPct] = useState({}); // release_id -> %, scoped to current page
  const [pitchingData, setPitchingData] = useState({}); // did -> pitching ticket's data, scoped to current page
  const [albumNameByDid, setAlbumNameByDid] = useState(new Map()); // scoped to current page's parent DIDs
  const [labels, setLabels] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);
  const [productTagSets, setProductTagSets] = useState({}); // small, unfiltered — see fetchProductTagSets
  const [stats, setStats] = useState({ total: 0, today: 0, thisWeek: 0, thisMonth: 0, preRelease: 0, released: 0, postRelease: 0, byChannel: { VIEENT: 0, ENVI: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingChannel, setSavingChannel] = useState(null); // release id currently being saved

  const [statusFilter, setStatusFilter] = useState(null); // "preRelease" | "released" | "postRelease"
  const [createdFilter, setCreatedFilter] = useState(null); // "today" | "week" | "month"
  const [channelFilter, setChannelFilter] = useState(null); // "VIEENT" | "ENVI" (from stat click or dropdown, same state)
  const [typeFilter, setTypeFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [search, setSearch] = useState(""); // regex tested server-side against main_artist, title, label
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateRangeStart, setDateRangeStart] = useState("");
  const [dateRangeEnd, setDateRangeEnd] = useState("");
  const [hoverRelease, setHoverRelease] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const [sort, setSort] = useState(null); // null = default (release date desc) | { key, dir }
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [refreshing, setRefreshing] = useState(false);

  function toggleSort(key) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
    setPage(1);
  }
  function resetSort() {
    setSort(null);
  }
  const isDefault = sort === null;

  // Debounce search — 350ms of no typing before it becomes a query. Also
  // resets to page 1 whenever the effective search term actually changes
  // (a stale page number past the new, smaller result set would otherwise
  // render empty).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo(
    () => ({ statusFilter, createdFilter, channelFilter, typeFilter, labelFilter, dateRangeStart, dateRangeEnd }),
    [statusFilter, createdFilter, channelFilter, typeFilter, labelFilter, dateRangeStart, dateRangeEnd]
  );

  // Fires the actual list query, with the invalid-regex fallback baked in.
  // Returns { rows, total } so the caller (both the main effect and the
  // sessionStorage-restore path) can share one implementation.
  async function fetchListPage({ page, pageSize, sort, filters, searchTerm }) {
    if (searchTerm) {
      const attempt = await buildListQuery({ page, pageSize, sort, filters, searchMode: "regex", searchQuery: searchTerm });
      if (!attempt.error) return { rows: attempt.data || [], total: attempt.count || 0 };
      // Invalid regex (Postgres rejects it as a bad `~*` pattern) — same
      // "fall back to a plain substring match" the old client try/catch
      // around `new RegExp` did.
      const fallback = await buildListQuery({ page, pageSize, sort, filters, searchMode: "substring", searchQuery: searchTerm });
      if (fallback.error) throw fallback.error;
      return { rows: fallback.data || [], total: fallback.count || 0 };
    }
    const result = await buildListQuery({ page, pageSize, sort, filters, searchMode: "substring", searchQuery: "" });
    if (result.error) throw result.error;
    return { rows: result.data || [], total: result.count || 0 };
  }

  // Booking %, pitching status, and parent-album title — scoped to just
  // the rows actually on screen, instead of the whole table (see the
  // Round 247 comment block above RELEASE_COLUMNS for why).
  async function loadPageJoins(rows) {
    const releaseIds = rows.map((r) => r.id);
    const dids = rows.map((r) => r.did).filter(Boolean);
    const parentDids = [...new Set(rows.map((r) => r.pseudo_package_parent_did).filter(Boolean))];

    const [bookingsResult, pitchTabResult, parentsResult] = await Promise.all([
      releaseIds.length ? supabase.from("media_booking_entries").select("release_id, status").in("release_id", releaseIds) : Promise.resolve({ data: [] }),
      supabase.from("ticket_tabs").select("id").eq("key", "pitching").single(),
      parentDids.length ? supabase.from("releases").select("did, title").in("did", parentDids) : Promise.resolve({ data: [] }),
    ]);

    const grouped = {};
    (bookingsResult.data || []).forEach((b) => {
      if (!grouped[b.release_id]) grouped[b.release_id] = { total: 0, done: 0 };
      grouped[b.release_id].total++;
      if (b.status === "Done") grouped[b.release_id].done++;
    });
    const pctMap = {};
    Object.entries(grouped).forEach(([id, g]) => (pctMap[id] = Math.round((g.done / g.total) * 100)));

    let pitchingMap = {};
    const { data: pitchTab } = pitchTabResult;
    if (pitchTab && dids.length) {
      const { data: pitchTix } = await supabase
        .from("tickets")
        .select("data")
        .eq("tab_id", pitchTab.id)
        .is("deleted_at", null)
        .filter("data->>releaseId", "in", `(${dids.join(",")})`);
      (pitchTix || []).forEach((t) => {
        const did = t.data?.releaseId;
        if (did) pitchingMap[did] = t.data;
      });
    }

    const albumMap = new Map();
    (parentsResult.data || []).forEach((r) => { if (r.did) albumMap.set(r.did, r.title); });

    return { bookingPct: pctMap, pitchingData: pitchingMap, albumNameByDid: albumMap };
  }

  async function runLoad({ page, pageSize, sort, filters, searchTerm, isRefresh } = {}) {
    try {
      const { rows, total } = await fetchListPage({ page, pageSize, sort, filters, searchTerm });
      const joins = await loadPageJoins(rows);
      setReleases(rows);
      setTotalRows(total);
      setBookingPct(joins.bookingPct);
      setPitchingData(joins.pitchingData);
      setAlbumNameByDid(joins.albumNameByDid);
      // A filter/search narrowed things (or pageSize changed) while sitting
      // on a later page — snap back into range instead of an empty table
      // with no obvious way back. Same guard usePagination used to do
      // client-side.
      const totalPagesNow = Math.max(1, Math.ceil(total / pageSize));
      if (page > totalPagesNow) setPage(totalPagesNow);
    } catch (err) {
      setError(err.message || "Failed to load.");
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }

  // Restore remembered filters/sort/page — applied once, right after
  // mount, before the first fetch ever fires (see the skip-first-run guard
  // on the main fetch effect below), same "no visible flicker" ordering as
  // before. Deliberately NOT a useState lazy initializer — this page
  // prerenders statically (no sessionStorage at build time), so seeding
  // state at construction time would disagree with the prerendered HTML
  // and trip a hydration mismatch.
  const restoredRef = useRef(false);
  const pendingScrollRef = useRef(null);
  useEffect(() => {
    const saved = readDashboardState();
    if (saved) {
      if (saved.search) { setSearch(saved.search); setDebouncedSearch(saved.search); }
      if (saved.statusFilter) setStatusFilter(saved.statusFilter);
      if (saved.createdFilter) setCreatedFilter(saved.createdFilter);
      if (saved.channelFilter) setChannelFilter(saved.channelFilter);
      if (saved.typeFilter) setTypeFilter(saved.typeFilter);
      if (saved.labelFilter) setLabelFilter(saved.labelFilter);
      if (saved.dateRangeStart) setDateRangeStart(saved.dateRangeStart);
      if (saved.dateRangeEnd) setDateRangeEnd(saved.dateRangeEnd);
      if (saved.page) setPage(saved.page);
      if (saved.pageSize) setPageSize(saved.pageSize);
      if (saved.sort) setSort(saved.sort);
      if (typeof saved.scrollY === "number") pendingScrollRef.current = saved.scrollY;
    }
    restoredRef.current = true;
    if (!supabase) return;
    Promise.all([supabase.from("labels").select("label_name").order("label_name"), loadTypeOptions(), fetchProductTagSets(supabase), loadStats()]).then(
      ([labelsResult, types, tagSets, statsResult]) => {
        setLabels(labelsResult.data || []);
        setTypeOptions(types);
        setProductTagSets(tagSets);
        setStats(statsResult);
      }
    );
    const restored = readDashboardState();
    runLoad({
      page: restored?.page || 1,
      pageSize: restored?.pageSize || 50,
      sort: restored?.sort || null,
      filters: {
        statusFilter: restored?.statusFilter || null,
        createdFilter: restored?.createdFilter || null,
        channelFilter: restored?.channelFilter || null,
        typeFilter: restored?.typeFilter || "",
        labelFilter: restored?.labelFilter || "",
        dateRangeStart: restored?.dateRangeStart || "",
        dateRangeEnd: restored?.dateRangeEnd || "",
      },
      searchTerm: restored?.search || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every subsequent filter/sort/page/search change — skips the very first
  // run (mount is handled above, using the restored values directly, so
  // this doesn't double-fetch on load).
  useEffect(() => {
    if (!restoredRef.current) return;
    setLoading(true);
    runLoad({ page, pageSize, sort, filters, searchTerm: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sort, filters, debouncedSearch]);

  // Any filter/search/sort change (not a page/pageSize change) snaps back
  // to page 1 — same behavior the old client-side filtering had for free
  // (a narrower array just naturally re-clamped via usePagination's own
  // effect); now explicit since filters and page are independent queries.
  const firstFilterRunRef = useRef(true);
  useEffect(() => {
    if (firstFilterRunRef.current) { firstFilterRunRef.current = false; return; }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, debouncedSearch, sort]);

  function refresh() {
    setRefreshing(true);
    runLoad({ page, pageSize, sort, filters, searchTerm: debouncedSearch, isRefresh: true });
    loadStats().then(setStats);
  }

  // Scroll restore has to wait for the real content to actually be on the
  // page (rows rendered) — applying it while still showing "Loading…"
  // would just get overwritten by the layout shift once data arrives.
  useEffect(() => {
    if (loading || pendingScrollRef.current == null) return;
    const y = pendingScrollRef.current;
    pendingScrollRef.current = null;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, [loading]);

  // Latest filter/sort/page state, mirrored into a ref on every render so
  // the unmount-time write below (a stable-identity effect, see its own
  // empty dep array) always sees the CURRENT values instead of whatever
  // they were at mount.
  const latestDashboardStateRef = useRef(null);
  latestDashboardStateRef.current = currentDashboardState({ search, statusFilter, createdFilter, channelFilter, typeFilter, labelFilter, dateRangeStart, dateRangeEnd, page, pageSize, sort });
  useEffect(() => {
    return () => {
      writeDashboardState({ ...latestDashboardStateRef.current, scrollY: window.scrollY });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const anyStatClickFilter = statusFilter || channelFilter || createdFilter;

  // Round 79's updateTrackDid (inline-editable EP/Album DID straight from
  // this dashboard row) was removed in round 86 item 2 — the column it fed
  // is now hidden here entirely (see the "Album Name" column below); the
  // field itself is untouched and still editable from the release detail
  // page.
  async function updateChannel(release, value) {
    setSavingChannel(release.id);
    const { error: err } = await supabase.from("releases").update({ requester_segment: value || null }).eq("id", release.id);
    if (!err) {
      setReleases((rows) => rows.map((r) => (r.id === release.id ? { ...r, requester_segment: value || null } : r)));
    }
    setSavingChannel(null);
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 1400 }}>
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Overview</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>New Release</h1>
          </div>
          <Link href="/new-release" className={styles.btnPrimary}>+ New Release</Link>
        </div>

        <div className={styles.statRow}>
          <StatCard label="Total Releases" value={stats.total} active={!createdFilter} onClick={() => setCreatedFilter(null)} onClear={() => setCreatedFilter(null)} hideClear />
          <StatCard label="Today" value={stats.today} active={createdFilter === "today"} onClick={() => setCreatedFilter((f) => (f === "today" ? null : "today"))} onClear={() => setCreatedFilter(null)} />
          <StatCard label="This Week" value={stats.thisWeek} active={createdFilter === "week"} onClick={() => setCreatedFilter((f) => (f === "week" ? null : "week"))} onClear={() => setCreatedFilter(null)} />
          <StatCard label="This Month" value={stats.thisMonth} active={createdFilter === "month"} onClick={() => setCreatedFilter((f) => (f === "month" ? null : "month"))} onClear={() => setCreatedFilter(null)} />
          <StatCard label="Pre-release" value={stats.preRelease} active={statusFilter === "preRelease"} onClick={() => setStatusFilter((f) => (f === "preRelease" ? null : "preRelease"))} onClear={() => setStatusFilter(null)} />
          <StatCard label="Release" value={stats.released} active={statusFilter === "released"} onClick={() => setStatusFilter((f) => (f === "released" ? null : "released"))} onClear={() => setStatusFilter(null)} />
          <StatCard label="Post-release" value={stats.postRelease} active={statusFilter === "postRelease"} onClick={() => setStatusFilter((f) => (f === "postRelease" ? null : "postRelease"))} onClear={() => setStatusFilter(null)} />
        </div>

        <div className={styles.subheading} style={{ marginTop: 4 }}>By Media Channel</div>
        <div className={styles.statRow} style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 24 }}>
          <StatCard label="All" value={stats.total} active={!channelFilter} onClick={() => setChannelFilter(null)} onClear={() => setChannelFilter(null)} hideClear />
          {CHANNELS.map((c) => (
            <StatCard key={c} label={c} value={stats.byChannel[c] || 0} active={channelFilter === c} onClick={() => setChannelFilter((f) => (f === c ? null : c))} onClear={() => setChannelFilter(null)} />
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className={styles.input}
            style={{ width: 260 }}
            placeholder="Tìm nghệ sĩ, bài hát, label… (hỗ trợ regex)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <DateRangeFilter start={dateRangeStart} end={dateRangeEnd} onStartChange={setDateRangeStart} onEndChange={setDateRangeEnd} />
          <select className={styles.select} style={{ maxWidth: 200 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Type — all</option>
            {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={styles.select} style={{ maxWidth: 200 }} value={channelFilter || ""} onChange={(e) => setChannelFilter(e.target.value || null)}>
            <option value="">Channel — all</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={styles.select} style={{ maxWidth: 200 }} value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)}>
            <option value="">Label — all</option>
            {labels.map((l) => <option key={l.label_name} value={l.label_name}>{l.label_name}</option>)}
          </select>
          {(typeFilter || labelFilter || search || dateRangeStart || dateRangeEnd || anyStatClickFilter) && (
            <button
              onClick={() => { setStatusFilter(null); setChannelFilter(null); setCreatedFilter(null); setTypeFilter(""); setLabelFilter(""); setSearch(""); setDateRangeStart(""); setDateRangeEnd(""); }}
              style={{ background: "none", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "6px 12px", fontSize: 11, color: "var(--text-faint)", cursor: "pointer" }}
            >
              ✕ Clear all filters
            </button>
          )}
          <ResetSortButton isDefault={isDefault} onReset={resetSort} styles={styles} />
          <button
            onClick={refresh}
            disabled={refreshing}
            title="Re-run the current search/filters/page against the database"
            style={{ background: "none", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "6px 12px", fontSize: 11, color: "var(--text-faint)", cursor: refreshing ? "default" : "pointer" }}
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : releases.length === 0 ? (
          <div className={styles.emptyState}>No releases match these filters.</div>
        ) : (
          <>
          <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortableTh label="DID" sortKey="did" sort={sort} onToggle={toggleSort} />
                <SortableTh label="Channel" sortKey="requester_segment" sort={sort} onToggle={toggleSort} />
                <SortableTh label="Package" sortKey="release_category" sort={sort} onToggle={toggleSort} />
                <SortableTh label="Label" sortKey="label" sort={sort} onToggle={toggleSort} />
                {/* Round 86 follow-up items 1 & 2 — widened to ~1.5x its old
                    natural (unset) width (item 2), now that both the
                    product tag pills (item 5) and the Album Name subtitle
                    (item 1 — see below) live in this column and need room.
                    Album Name started as its own column (round 86 item 2)
                    but per follow-up item 1 is now a subtitle line under
                    the title instead, freeing up a column. */}
                <SortableTh label="Name" sortKey="title" sort={sort} onToggle={toggleSort} style={{ minWidth: 260 }} />
                <SortableTh label="Artist" sortKey="main_artist" sort={sort} onToggle={toggleSort} />
                {/* Round 86 follow-up item 5 — merged Release Date +
                    Release Time into one column per explicit request
                    ("Merge into one 'Release' column"). Still sorts by
                    release_date — release_time is just appended for
                    display, not a separate sortable dimension anymore. */}
                <SortableTh label="Release" sortKey="release_date" sort={sort} onToggle={toggleSort} />
                <SortableTh label="Status" sortKey="status" sort={sort} onToggle={toggleSort} />
                <th>Status Pitching</th>
                <th>Metadata</th>
                <th>Booking</th>
                <th>Upload</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => {
                const pct = metadataPercent(r);
                const bpct = bookingPct[r.id] ?? 0;
                const upct = uploadPercent(r);
                const pitching = pitchingSummary(r, pitchingData[r.did]);
                return (
                  <tr key={r.id}>
                    <td
                      onMouseEnter={(e) => { setHoverRelease(r); setHoverPos({ x: e.clientX, y: e.clientY }); }}
                      onMouseLeave={() => setHoverRelease(null)}
                    >
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.did || "—"}</Link>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className={styles.select}
                        style={{ minWidth: 100, opacity: savingChannel === r.id ? 0.5 : 1 }}
                        value={r.requester_segment || ""}
                        disabled={savingChannel === r.id}
                        onChange={(e) => updateChannel(r, e.target.value)}
                        title={
                          r.requester_segment && !CHANNELS.includes(r.requester_segment)
                            ? `Imported value doesn't match VIEENT/ENVI exactly — pick one to fix it`
                            : undefined
                        }
                      >
                        <option value="">—</option>
                        {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                        {/* An imported/legacy value that isn't exactly "VIEENT" or "ENVI"
                            (different casing, a typo, a different word entirely from the
                            source sheet) used to just render blank here — the data was
                            really in requester_segment, this <select> just had no <option>
                            for it. Surfacing it as its own option instead of silently
                            dropping it — see scripts/audit-release-channel.js to find every
                            release affected this way. */}
                        {r.requester_segment && !CHANNELS.includes(r.requester_segment) && (
                          <option value={r.requester_segment}>{r.requester_segment} (unrecognized — pick to fix)</option>
                        )}
                      </select>
                    </td>
                    <td style={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.release_category ? `${r.release_category} - ${r.project_type || "—"}` : (r.project_type || "—")}
                    </td>
                    <td>{r.label || "—"}</td>
                    <td
                      onMouseEnter={(e) => { setHoverRelease(r); setHoverPos({ x: e.clientX, y: e.clientY }); }}
                      onMouseLeave={() => setHoverRelease(null)}
                    >
                      <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                      {/* Round 86 follow-up item 1 — Album Name as a
                          subtitle line here instead of its own column
                          (was a separate "Album Name" column in the first
                          round-86 pass). */}
                      {r.pseudo_package_parent_did && albumNameByDid.get(r.pseudo_package_parent_did) && (
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                          {albumNameByDid.get(r.pseudo_package_parent_did)}
                        </div>
                      )}
                      {/* Round 86 item 5 — product tag pills */}
                      <ProductTagPills styles={styles} release={r} tagSets={productTagSets} style={{ marginTop: 4 }} />
                      {/* Round 88 item 1d — Copyright Checklist compiled
                          into one small subrow line ("Q1: Tự SX · Q2:
                          HTĐQ · …"), layer-1 choice only per explicit
                          spec. Hidden entirely once nothing's been filled
                          in yet. */}
                      {copyrightChecklistSummary(r.copyright_checklist) && (
                        <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4 }}>
                          {copyrightChecklistSummary(r.copyright_checklist)}
                        </div>
                      )}
                    </td>
                    <td>{r.main_artist}</td>
                    <td>{fmtDate(r.release_date)}{r.release_time ? ` ${r.release_time}` : ""}</td>
                    <td>
                      <span className={styles.statusBadge} style={{ background: "rgba(255,107,26,0.12)", color: "#ff9d5c" }}>{r.status}</span>
                      {/* Round 54 — item B.1: surfaces the Booking Board's
                          "Convert Media Report" state here on the New
                          Release Dashboard too, per "add tab booking status
                          (NEW RELEASE DASHBOARD): Đã có media report" — the
                          board itself is where Convert/Send Artist actually
                          happen (fixed "Media Report" column), this is just
                          the read-only marker showing up here as well. */}
                      {r.media_report_status && (
                        <span
                          className={styles.statusBadge}
                          style={{ display: "block", marginTop: 4, background: r.media_report_status === "sent" ? "rgba(126,230,168,0.14)" : "rgba(255,202,77,0.14)", color: r.media_report_status === "sent" ? "#7ee6a8" : "#ffca4d" }}
                        >
                          {r.media_report_status === "sent" ? "Media Report — Artist Sent" : "Đã có media report"}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={styles.statusBadge}
                        style={
                          pitching.tone === "orange"
                            ? { background: "rgba(255,107,26,0.12)", color: "#ff9d5c" }
                            : pitching.tone === "yellow"
                            ? { background: "rgba(234,179,8,0.14)", color: "#eab308" }
                            : { background: "rgba(148,163,184,0.14)", color: "var(--text-faint)" }
                        }
                      >
                        {pitching.label}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${pct > 0 ? styles.pillOrange : styles.pillGray}`}>{pct}%</span>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${bpct > 0 ? styles.pillOrange : styles.pillGray}`}>{bpct}%</span>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${upct > 0 ? styles.pillOrange : styles.pillGray}`}>{upct}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
          </>
        )}
      </div>
    </div>

    {hoverRelease && (
      <div
        style={{
          position: "fixed",
          left: Math.min(hoverPos.x + 16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 380),
          top: hoverPos.y + 16,
          zIndex: 500,
          width: 360,
          maxHeight: 420,
          overflow: "hidden",
          background: "var(--bg-card)",
          border: "1px solid var(--border-strong)",
          borderRadius: 8,
          padding: 14,
          pointerEvents: "none",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, marginBottom: 4 }}>{hoverRelease.did}</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{hoverRelease.title}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{hoverRelease.main_artist} · {hoverRelease.label}</div>
        {/* Round 78 — per explicit request, this now shows the same
            generated product note as the New Release Setup workstation's
            Note popup (lib/releaseNotes.js's buildProductNote — title,
            artist, release date/time, channel, then LINK DRIVE/LINK
            SHARE/SMARTLINK/LINKDASH/UPC/LINK UGC/MEDIA REPORT, whichever
            are filled in) instead of the previous Genre/Topic/Stage/
            Metadata/Booking/Upload summary. */}
        <pre style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>
{buildProductNote(hoverRelease)}
        </pre>
      </div>
    )}
    </AppShell>
  );
}

function StatCard({ label, value, active, onClick, onClear, hideClear }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        cursor: "pointer",
        background: active ? "rgba(255,107,26,0.08)" : undefined,
        border: active ? "1px solid var(--accent)" : undefined,
        borderRadius: active ? 8 : undefined,
      }}
      className={active ? undefined : styles.statCard}
    >
      {active && !hideClear && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          style={{ position: "absolute", top: 6, right: 6, background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 12, padding: 0 }}
        >
          ✕
        </button>
      )}
      <div className={styles.statLabel} style={active ? { padding: "16px 16px 0" } : undefined}>{label}</div>
      <div className={styles.statValue} style={active ? { padding: "0 16px 16px" } : undefined}>{value}</div>
    </div>
  );
}
