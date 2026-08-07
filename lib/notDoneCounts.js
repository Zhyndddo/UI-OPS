import { supabase } from "./supabaseClient";
import { isExecutorSegment } from "./teamTypes";
import { isKhoNhacType } from "./phaiSinhTypes";

// Terminal statuses for the shared English vocab (REQUESTED/PROCESS/
// COMPLETE/REFUND/CANCELED). REFUND is terminal from the executor's side
// (they've handled it, kicked it back) but NOT from the requester's side
// (it's still their problem — needs fixing and resubmitting), so it
// counts toward "not done" only in the requester view.
const TERMINAL_EXECUTOR = ["COMPLETE", "CANCELED", "REFUND"];
const TERMINAL_REQUESTER = ["COMPLETE", "CANCELED"];

// Report Conflict uses its own Vietnamese vocab — "Từ chối" (Rejected) is
// its REFUND-equivalent, same asymmetric rule applies.
const TERMINAL_REPORT_CONFLICT_EXECUTOR = ["Hoàn thành", "Từ chối", "Hủy"];
const TERMINAL_REPORT_CONFLICT_REQUESTER = ["Hoàn thành", "Hủy"];

// Round 34 — Design's own vocabulary (REQUEST/PROCESS/PENDING/REVISE/
// COMPLETE/CANCEL, see lib/designFlow.js) doesn't fit TERMINAL_EXECUTOR/
// TERMINAL_REQUESTER above: "CANCEL" (no D) wouldn't match the generic
// "CANCELED" literal, and PENDING/REVISE are active work states (not a
// REFUND-style "kicked back, requester's problem now" state) — both count
// as "not done" for BOTH sides, no asymmetry like the generic types have.
const TERMINAL_DESIGN = ["COMPLETE", "CANCEL"];

// Which generic ticket types have a real requester/executor split, and
// which team is the executor — matches ticketConfigs.js. Bespoke types
// (design, media_booking, newrelease_upload, phu_luc) have no dual view
// of their own, always counted the executor way.
const DUAL_VIEW_EXECUTOR_TEAM = {
  // Round 41 — Phái Sinh (Batch) merged into "phai_sinh" (Type = Kho
  // nhạc / Chuyển net / Takedown drives the batch flow within this one
  // tab now, see lib/phaiSinhTypes.js). Same OPS-executes/AR-requests
  // split as before; its "not done" COUNT is bespoke (see
  // ticketNotDoneCount below) — per explicit request, each Kho Nhạc-
  // family ticket's songs count as their own workload items, not the
  // parent ticket as one, while plain Phái sinh tickets still count 1
  // each same as any other generic type.
  phai_sinh: "OPS",
  manual_claim: "OPS",
  report_conflict: "OPS",
  artist_profile: "OPS",
  pitching_info: "AR",
  // Pitching now also has a dedicated ticket page (app/tickets/pitching)
  // in addition to the OPS-only Pitching Workstation — same dual view as
  // every other generic type: OPS executes, AR requests.
  pitching: "OPS",
  // New Data Request / Legal Request sub-tickets — matches
  // executorTeam in lib/ticketConfigs.js for each.
  co_trong_net_youtube: "OPS",
  pre_order_itunes: "OPS",
  priority_sync_lyric: "OPS",
  mv_spotify: "OPS",
  discovery_mode_spotify: "OPS",
  sony_publish: "OPS",
  split_share: "Legal",
  phu_luc_mg: "Legal",
  phu_luc_publishing: "Legal",
  // phu_luc_truyen_thong retired (merged into "phu_luc" — see
  // GATE_TICKET_TYPES's comment in lib/GateFields.js). "phu_luc" itself
  // deliberately stays OUT of this map — no dual-view change requested,
  // it keeps its existing single flat view for everyone.
};

function isExecutorView(typeKey, profile) {
  const team = DUAL_VIEW_EXECUTOR_TEAM[typeKey];
  if (!team) return true; // no dual view for this type — always "executor" rules
  return profile?.role === "dev" || isExecutorSegment(profile?.segment, team);
}

async function ticketNotDoneCount(typeKey, profile) {
  // Round 41 — Phái Sinh merged with the former Phái Sinh (Batch): plain
  // Phái sinh tickets count 1 each (normal terminal-status rule below);
  // Kho Nhạc-family tickets (Type = Kho nhạc / Chuyển net / Takedown)
  // instead count their phai_sinh_batch_items children — "treat each
  // children row a workload row aka N item rather 1 item per batch" per
  // the original explicit request, carried over unchanged by the merge.
  // Children have no REFUND-equivalent state, so COMPLETE/CANCELED are
  // terminal for both sides, same as before.
  if (typeKey === "phai_sinh") {
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "phai_sinh").single();
    if (!tab) return null;
    const { data: tickets } = await supabase.from("tickets").select("id, status, data").eq("tab_id", tab.id).is("deleted_at", null);
    if (!tickets) return 0;
    const executor = isExecutorView("phai_sinh", profile);
    const terminal = executor ? TERMINAL_EXECUTOR : TERMINAL_REQUESTER;
    const plainCount = tickets.filter((t) => !isKhoNhacType(t.data?.typeRequest) && !terminal.includes(t.status)).length;
    const batchTicketIds = tickets.filter((t) => isKhoNhacType(t.data?.typeRequest)).map((t) => t.id);
    let batchCount = 0;
    if (batchTicketIds.length > 0) {
      const { data: items } = await supabase.from("phai_sinh_batch_items").select("status").in("batch_ticket_id", batchTicketIds).is("deleted_at", null);
      batchCount = (items || []).filter((i) => !["COMPLETE", "CANCELED"].includes(i.status)).length;
    }
    return plainCount + batchCount;
  }

  const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", typeKey).single();
  if (!tab) return null;
  const { data: tickets } = await supabase.from("tickets").select("status").eq("tab_id", tab.id).is("deleted_at", null);
  if (!tickets) return 0;

  const executor = isExecutorView(typeKey, profile);
  if (typeKey === "report_conflict") {
    const terminal = executor ? TERMINAL_REPORT_CONFLICT_EXECUTOR : TERMINAL_REPORT_CONFLICT_REQUESTER;
    return tickets.filter((t) => !terminal.includes(t.status)).length;
  }
  if (typeKey === "design") {
    return tickets.filter((t) => !TERMINAL_DESIGN.includes(t.status)).length;
  }
  const terminal = executor ? TERMINAL_EXECUTOR : TERMINAL_REQUESTER;
  return tickets.filter((t) => !terminal.includes(t.status)).length;
}

// Workstations have no shared status field — "done" is bespoke per page,
// re-implemented here to match each page's own rule exactly.
const DSP_CHECK_FIELDS = ["confirm_spotify_correct", "confirm_apple_correct", "confirm_zing_correct", "confirm_nct_correct", "confirm_fb_correct", "confirm_ytb_correct"];
const PITCHING_DONE_VALUE = "Đã pitching";
const PITCHING_CANCEL_VALUES = ["Không thực hiện", "Không hỗ trợ"];

async function workstationNotDoneCount(typeKey) {
  if (typeKey === "upload") {
    const { data } = await supabase.from("releases").select("upload_status, link_lbm, link_share, smartlink, link_preorder, gate_pre_order").eq("requested", true);
    if (!data) return 0;
    return data.filter((r) => {
      if (r.upload_status === "Cancel") return false; // cancelled isn't "not done" work
      const keys = ["link_lbm", "link_share", "smartlink"];
      if (r.gate_pre_order === "true") keys.push("link_preorder");
      const pct = keys.filter((k) => r[k]).length / keys.length;
      return pct < 1;
    }).length;
  }

  if (typeKey === "pitching") {
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "pitching").single();
    if (!tab) return 0;
    const { data: tickets } = await supabase.from("tickets").select("data").eq("tab_id", tab.id).is("deleted_at", null);
    const dids = [...new Set((tickets || []).map((t) => t.data?.releaseId).filter(Boolean))];
    if (dids.length === 0) return 0;
    const { data: rels } = await supabase.from("releases").select("did, upc, priority_pitching, pitching_status_spotify, pitching_status_nct, pitching_status_zing").in("did", dids);
    const releaseMap = {};
    (rels || []).forEach((r) => (releaseMap[r.did] = r));
    const rows = (tickets || []).map((t) => ({ ticket: t, release: releaseMap[t.data?.releaseId] })).filter((row) => row.release?.upc);

    function statusFor(release, key) {
      if (key === "priority") return release?.priority_pitching;
      if (key === "spotify") return release?.pitching_status_spotify;
      if (key === "nct") return release?.pitching_status_nct;
      if (key === "zing") return release?.pitching_status_zing;
    }
    return rows.filter((row) => {
      const types = ["priority", "spotify", "nct", "zing"].filter((k) => row.ticket.data?.[k]);
      if (types.length === 0) return false;
      const allCancel = types.every((k) => PITCHING_CANCEL_VALUES.includes(statusFor(row.release, k)));
      if (allCancel) return false;
      const allDone = types.every((k) => statusFor(row.release, k) === PITCHING_DONE_VALUE);
      return !allDone;
    }).length;
  }

  if (typeKey === "confirm") {
    // "Re-Check" is one TypeSwitcher tab covering both phases internally
    // — combine both phases' outstanding work into one figure.
    const { data } = await supabase.from("releases").select([...DSP_CHECK_FIELDS, "link_lbm", "smartlink", "confirm_insta_sound", "confirm_tiktok_sound_updated", "confirm_smartlink_updated"].join(", "));
    if (!data) return 0;
    const phase1NotDone = data.filter((r) => !(DSP_CHECK_FIELDS.every((f) => r[f]) && !!r.link_lbm)).length;
    const phase2NotDone = data.filter((r) => !(r.smartlink && r.confirm_smartlink_updated && r.confirm_insta_sound && r.confirm_tiktok_sound_updated)).length;
    return phase1NotDone + phase2NotDone;
  }

  if (typeKey === "pre_release") {
    const { data } = await supabase.from("releases").select("canva_mv_status, canva_status, artist_pick_status, musixmatch_link, musixmatch_status, nct_lyric, zing_lyric");
    if (!data) return 0;
    return data.filter((r) => !(r.canva_mv_status && r.canva_status && r.artist_pick_status && r.musixmatch_link && r.musixmatch_status && r.nct_lyric && r.zing_lyric)).length;
  }

  return null; // booking, package_price, stream, milestone — no "done" concept defined, skip
}

// Returns null (meaning "don't show a count") for anything without a
// defined done-rule, rather than a misleading 0.
export async function getNotDoneCount(kind, typeKey, profile) {
  try {
    if (kind === "ticket") return await ticketNotDoneCount(typeKey, profile);
    return await workstationNotDoneCount(typeKey);
  } catch {
    return null;
  }
}
