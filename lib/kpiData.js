// Round 461 — shared source-row loading + snapshot/rollup helpers for the
// KPI layer, used by BOTH app/kpi/page.js (browser client) and
// app/api/cron/task-kpi-snapshot/route.js (service-role client), so the two
// can't drift. `client` is whichever supabase client the caller has.
import { fetchAllRows } from "./helpers";
import { TICKET_ROUTES } from "./teamTypes";
import { computeTicketKpis, computeWorkstationBacklog, WORKSTATION_DONE_RULES, WORKSTATION_KPI_CUTOFF } from "./kpiMetrics";

export const KPI_TICKET_KEYS = Object.keys(TICKET_ROUTES).filter((k) => k !== "batch_phai_sinh");

// All tickets (tagged with `type`) + batch_phai_sinh child items (tagged
// type "batch_phai_sinh").
export async function loadKpiTicketRows(client) {
  const { data: tabs } = await client.from("ticket_tabs").select("id, key").in("key", KPI_TICKET_KEYS);
  const results = await Promise.all(
    (tabs || []).map((tab) =>
      fetchAllRows(() =>
        client
          .from("tickets")
          .select("id, status, status_log, deadline, pic_profile_id, pic_profile_ids, created_at, updated_at")
          .eq("tab_id", tab.id)
          .is("deleted_at", null)
      ).then(({ data }) => (data || []).map((t) => ({ ...t, type: tab.key })))
    )
  );
  const { data: items } = await fetchAllRows(() =>
    client
      .from("phai_sinh_batch_items")
      .select("id, status, status_log, deadline, pic_profile_id, pic_profile_ids, created_at, updated_at")
      .is("deleted_at", null)
  );
  return {
    tickets: results.flat(),
    batchItems: (items || []).map((i) => ({ ...i, type: "batch_phai_sinh" })),
  };
}

export const WS_KEYS = Object.keys(WORKSTATION_DONE_RULES);
const WS_RELEASE_FIELDS = "id, release_date, requested, upload_status, link_lbm, link_share, smartlink, link_preorder, gate_pre_order, confirm_spotify_correct, confirm_apple_correct, confirm_zing_correct, confirm_nct_correct, confirm_fb_correct, confirm_ytb_correct, confirm_tag, confirm_insta_sound, confirm_tiktok_sound_updated, confirm_smartlink_updated, canva_mv_status, canva_status, musixmatch_link, musixmatch_status, nct_lyric, zing_lyric";

export async function loadKpiWorkstationRows(client) {
  const [{ data: assignments }, { data: releases }] = await Promise.all([
    fetchAllRows(() => client.from("workstation_assignments").select("workstation, release_id, pic_profile_id, pic_profile_ids").in("workstation", WS_KEYS)),
    fetchAllRows(() => client.from("releases").select(WS_RELEASE_FIELDS).order("id")),
  ]);
  return { assignments: assignments || [], releases: releases || [] };
}

// Merge Map<profileId, Map<type, bucket>> results (types disjoint per source).
export function mergeKpiMaps(...maps) {
  const out = new Map();
  maps.forEach((m) => m.forEach((byType, pid) => {
    if (!out.has(pid)) out.set(pid, new Map());
    byType.forEach((b, type) => out.get(pid).set(type, b));
  }));
  return out;
}

// Live compute for [periodStart, periodEnd) — what /kpi's Live mode uses.
export async function computeLiveKpis(client, { periodStart, periodEnd }) {
  const [{ tickets, batchItems }, ws] = await Promise.all([loadKpiTicketRows(client), loadKpiWorkstationRows(client)]);
  return mergeKpiMaps(
    computeTicketKpis(tickets, { periodStart, periodEnd }),
    computeTicketKpis(batchItems, { periodStart, periodEnd, deadlineEligibleTypes: ["batch_phai_sinh"] }),
    computeWorkstationBacklog(ws.releases, ws.assignments)
  );
}

// bucket -> snapshot row columns
export function bucketToSnapshotRow(date, profileId, type, b, { includeGauges }) {
  const cycle = b.cycleTimesMs || [];
  return {
    snapshot_date: date,
    profile_id: profileId,
    type,
    throughput: b.throughput,
    on_time_eligible: b.onTimeEligible,
    on_time_count: b.onTimeCount,
    cycle_ms_sum: Math.round(cycle.reduce((a, c) => a + c, 0)),
    cycle_ms_count: cycle.length,
    open_count: includeGauges ? b.openCount : 0,
    overdue_count: includeGauges ? b.overdueCount : 0,
  };
}

// Rollup of stored daily rows over a range -> same Map shape the table
// renders. Sums are re-averaged (mean cycle time = sum/count; no p50 from
// sums — history shows mean). Open/overdue are gauges, so take the LATEST
// snapshot day that has gauge data per (profile,type), not a sum.
export function rollupSnapshots(rows) {
  const out = new Map();
  const gaugeDay = new Map();
  (rows || []).forEach((r) => {
    if (!out.has(r.profile_id)) out.set(r.profile_id, new Map());
    const byType = out.get(r.profile_id);
    if (!byType.has(r.type)) byType.set(r.type, { throughput: 0, onTimeEligible: 0, onTimeCount: 0, cycleSumMs: 0, cycleCount: 0, openCount: 0, overdueCount: 0, cycleTimesMs: [] });
    const b = byType.get(r.type);
    b.throughput += r.throughput;
    b.onTimeEligible += r.on_time_eligible;
    b.onTimeCount += r.on_time_count;
    b.cycleSumMs += Number(r.cycle_ms_sum);
    b.cycleCount += r.cycle_ms_count;
    if (r.open_count > 0 || r.overdue_count > 0) {
      const k = `${r.profile_id}|${r.type}`;
      if (!gaugeDay.has(k) || r.snapshot_date > gaugeDay.get(k)) {
        gaugeDay.set(k, r.snapshot_date);
        b.openCount = r.open_count;
        b.overdueCount = r.overdue_count;
      }
    }
  });
  return out;
}

export { WORKSTATION_KPI_CUTOFF };
