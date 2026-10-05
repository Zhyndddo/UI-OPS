import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { computeTicketKpis, computeWorkstationBacklog, WORKSTATION_DONE_RULES, WORKSTATION_KPI_CUTOFF, picIdsOf } from "../../../../lib/kpiMetrics";
import { loadKpiTicketRows, loadKpiWorkstationRows, bucketToSnapshotRow, mergeKpiMaps } from "../../../../lib/kpiData";

// Round 461 — Phase 3: daily KPI snapshot. Fires once/day (vercel.json),
// writes yesterday's closed-ticket metrics + today's live gauges into
// task_kpi_daily_snapshots (sql/pending/add-round461-task-kpi-snapshots.sql)
// and records workstation not-done -> done flips (task_kpi_workstation_state).
//
//   GET /api/cron/task-kpi-snapshot                 normal daily run
//   GET ...?from=YYYY-MM-DD&to=YYYY-MM-DD           ticket-side backfill
//        (inclusive). Tickets carry status_log timestamps so past days can
//        be rebuilt; gauges (open/overdue) and workstation flips CANNOT, so
//        backfilled rows get gauges 0 and no workstation rows.
// Idempotent (upsert on the primary key) — safe to re-run a day.
export const maxDuration = 60;
const CRON_SECRET = process.env.CRON_SECRET;

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const todayUTC = () => new Date().toISOString().slice(0, 10);

async function upsertRows(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin.from("task_kpi_daily_snapshots").upsert(rows.slice(i, i + 500), { onConflict: "snapshot_date,profile_id,type" });
    if (error) return error;
  }
  return null;
}

export async function GET(request) {
  if (CRON_SECRET) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${CRON_SECRET}`) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: "Service role not configured." }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const backfill = !!(from && to);
  const today = todayUTC();
  const yesterday = addDays(today, -1);
  const days = [];
  if (backfill) {
    for (let d = from; d <= to && days.length < 400; d = addDays(d, 1)) days.push(d);
  } else {
    days.push(yesterday);
  }

  const { tickets, batchItems } = await loadKpiTicketRows(supabaseAdmin);
  const rows = [];

  days.forEach((day) => {
    const opts = { periodStart: day, periodEnd: addDays(day, 1) };
    const m = mergeKpiMaps(
      computeTicketKpis(tickets, opts),
      computeTicketKpis(batchItems, { ...opts, deadlineEligibleTypes: ["batch_phai_sinh"] })
    );
    // Gauges only on the real daily run, stored against the run's closed day.
    const includeGauges = !backfill;
    m.forEach((byType, pid) => byType.forEach((b, type) => {
      const hasActivity = b.throughput > 0 || (includeGauges && (b.openCount > 0 || b.overdueCount > 0));
      if (hasActivity) rows.push(bucketToSnapshotRow(day, pid, type, b, { includeGauges }));
    }));
  });

  let wsFlips = 0;
  if (!backfill) {
    // Workstation: compare current done state to remembered state.
    const ws = await loadKpiWorkstationRows(supabaseAdmin);
    const relById = new Map(ws.releases.map((r) => [r.id, r]));
    const { data: stateRows } = await supabaseAdmin.from("task_kpi_workstation_state").select("workstation, release_id, done").limit(100000);
    const prev = new Map((stateRows || []).map((s) => [`${s.workstation}|${s.release_id}`, s.done]));
    const stateUpserts = [];
    const flipBuckets = new Map(); // `${pid}|ws:key` -> throughput
    const seen = new Set();
    ws.assignments.forEach((a) => {
      const rule = WORKSTATION_DONE_RULES[a.workstation];
      const r = relById.get(a.release_id);
      if (!rule || !r || a.release_id == null) return;
      if (r.release_date && r.release_date < WORKSTATION_KPI_CUTOFF) return;
      if (a.workstation === "upload" && !r.requested) return;
      const k = `${a.workstation}|${a.release_id}`;
      if (seen.has(k)) return;
      seen.add(k);
      const done = !!rule(r);
      const before = prev.get(k);
      if (before === undefined || before !== done) {
        stateUpserts.push({ workstation: a.workstation, release_id: a.release_id, done, updated_at: new Date().toISOString() });
      }
      if (before === false && done) {
        wsFlips += 1;
        picIdsOf(a).forEach((pid) => {
          const key = `${pid}|ws:${a.workstation}`;
          flipBuckets.set(key, (flipBuckets.get(key) || 0) + 1);
        });
      }
    });
    // Open-now gauges for workstations.
    const openMap = computeWorkstationBacklog(ws.releases, ws.assignments);
    openMap.forEach((byType, pid) => byType.forEach((b, type) => {
      const flips = flipBuckets.get(`${pid}|${type}`) || 0;
      flipBuckets.delete(`${pid}|${type}`);
      rows.push(bucketToSnapshotRow(yesterday, pid, type, { ...b, throughput: flips }, { includeGauges: true }));
    }));
    flipBuckets.forEach((count, key) => {
      const [pid, type] = key.split("|");
      rows.push(bucketToSnapshotRow(yesterday, pid, type, { throughput: count, onTimeEligible: 0, onTimeCount: 0, cycleTimesMs: [], openCount: 0, overdueCount: 0 }, { includeGauges: false }));
    });
    for (let i = 0; i < stateUpserts.length; i += 500) {
      const { error } = await supabaseAdmin.from("task_kpi_workstation_state").upsert(stateUpserts.slice(i, i + 500), { onConflict: "workstation,release_id" });
      if (error) return NextResponse.json({ error: `state upsert failed: ${error.message}` }, { status: 500 });
    }
  }

  // Merge rows that share a key (ticket gauges row + workstation rows never
  // collide on type, but guard anyway) — last write wins is fine since the
  // types are disjoint.
  const err = await upsertRows(rows);
  if (err) return NextResponse.json({ error: `snapshot upsert failed: ${err.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, days: days.length, rows: rows.length, workstationFlips: wsFlips, backfill });
}
