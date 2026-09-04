// Small shared helpers — formatting, status colors, pill math. Kept plain
// JS (no framework dependency) so any page can import what it needs.

// Round 60 — Supabase/PostgREST caps a plain select() at 1000 rows by
// default and truncates silently past that (no error) — see DATA_FIXES.md
// round 59 for the bug this caused on the Tickets page counter, and the
// list of other places (Dashboard, notDoneCounts, etc.) that read the
// full `releases`/`tickets` table the same unguarded way. This pages
// through in batches of `pageSize` (Supabase's own cap) via .range()
// until a page comes back short, so callers that genuinely need every row
// (not just a count — use { count: "exact", head: true } instead when you
// only need a number) get everything regardless of table size.
//
// IMPORTANT: `buildQuery` must return a query that's already ordered by
// something unique (e.g. .order("id")) — .range() pagination isn't
// guaranteed stable across separate requests without one, so an unordered
// query could return duplicate or skipped rows across pages.
//
// Usage: const { data, error } = await fetchAllRows(() =>
//   supabase.from("releases").select("*").order("id")
// );
export async function fetchAllRows(buildQuery, pageSize = 1000) {
  let from = 0;
  let all = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { data: all, error };
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

// Chi Tiết breakdowns are stored as "A / B / C" (one segment per
// brand/phase) — that reads as one dense run-on line in a table cell, so
// every read-only display of a Chi Tiết value should route through this
// and pair it with `whiteSpace: "pre-line"` in the cell's style, putting
// each segment on its own line. Editable Chi Tiết inputs (package builder)
// are unaffected — this is a display-only transform, never writes back.
export function formatDetailText(text) {
  if (!text) return text;
  return text.split(/\s*\/\s*/).join("\n");
}

export function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("vi-VN");
}

export function fmtDateTime(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("vi-VN");
}

// Metadata pill: 6 checklist items on a release (Tab 1 of the popup).
export function metadataPercent(release) {
  const keys = ["meta_audio", "meta_artwork", "meta_working_files", "meta_lyric", "meta_mv", "meta_doc"];
  // Tri-state strings ("false"/"true"/"update") — only "true" counts as done.
  const done = keys.filter((k) => release?.[k] === "true").length;
  return Math.round((done / keys.length) * 100);
}

// Mirrors the exact URL fields the Upload workstation tracks (Link LBM,
// Link Share, Smartlink, Pre-order) — UPC and Link Drive live there too
// but aren't URLs OPS is returning, so they're not counted here.
// Pre-order only counts against the release if it was actually requested
// (gate_pre_order = "true") — otherwise a release that never needed a
// pre-order link would unfairly never reach 100%.
export function uploadPercent(release) {
  const keys = ["link_lbm", "link_share", "smartlink"];
  if (release?.gate_pre_order === "true") keys.push("link_preorder");
  const done = keys.filter((k) => release?.[k]).length;
  return Math.round((done / keys.length) * 100);
}

// Ticket status is a real, manually-set field now (matching v1 exactly),
// not computed from timestamps — this just maps whichever vocabulary a
// given ticket type uses to a display color. Covers both the shared
// English vocab (REQUESTED/PROCESS/SUBMITTED/COMPLETE/REFUND/CANCELED)
// and Report Conflict's own real Vietnamese one — they're conceptually
// the same buckets (see ticketConfigs.js's STATUS_BUCKET map), just
// different literal values per type.
// The neutral/idle entries below (REQUESTED, "Chưa bắt đầu", "Hủy", and
// the fallback) used to be a flat rgba(255,255,255,...) white tint + a
// hardcoded grey fg — fine against the dark theme's near-black background,
// but on the light theme a white tint over an already-light eggshell
// background is nearly invisible, and the grey text has poor contrast on
// top of it. Switched to the theme variables so these pills stay visible
// either way. The colored statuses (PROCESS/SUBMITTED/COMPLETE/REFUND/
// CANCELED and their Vietnamese equivalents) are untouched — those hues
// already read fine on both themes.
export function statusColor(status) {
  const map = {
    REQUESTED: { bg: "var(--bg-hover)", fg: "var(--text-faint)" },
    PROCESS: { bg: "rgba(255,193,7,0.15)", fg: "#ffca4d" },
    SUBMITTED: { bg: "rgba(0,150,136,0.15)", fg: "#4dd0c4" },
    COMPLETE: { bg: "rgba(76,175,80,0.15)", fg: "#7ee6a8" },
    REFUND: { bg: "rgba(156,39,176,0.15)", fg: "#d191e0" },
    CANCELED: { bg: "rgba(244,67,54,0.15)", fg: "#ff8a80" },
    // Design's own round-34 vocabulary (REQUEST/PROCESS/PENDING/REVISE/
    // COMPLETE/CANCEL) — PROCESS/COMPLETE reuse the shared colors above.
    REQUEST: { bg: "var(--bg-hover)", fg: "var(--text-faint)" },
    PENDING: { bg: "rgba(156,39,176,0.15)", fg: "#d191e0" },
    REVISE: { bg: "rgba(0,150,136,0.15)", fg: "#4dd0c4" },
    CANCEL: { bg: "rgba(244,67,54,0.15)", fg: "#ff8a80" },
    // Round 41 — Kho Nhạc children item workflow stages.
    UPLOADING: { bg: "rgba(255,193,7,0.15)", fg: "#ffca4d" },
    DELIVERY: { bg: "rgba(0,150,136,0.15)", fg: "#4dd0c4" },
    RECHECKING: { bg: "rgba(156,39,176,0.15)", fg: "#d191e0" },
    // Report Conflict's real vocabulary
    "Chưa bắt đầu": { bg: "var(--bg-hover)", fg: "var(--text-faint)" },
    "Đã submit chờ duyệt": { bg: "rgba(255,193,7,0.15)", fg: "#ffca4d" },
    "Hoàn thành": { bg: "rgba(76,175,80,0.15)", fg: "#7ee6a8" },
    "Từ chối": { bg: "rgba(244,67,54,0.15)", fg: "#ff8a80" },
    "Hủy": { bg: "var(--bg-hover)", fg: "var(--text-faint)" },
  };
  return map[status] || { bg: "var(--bg-hover)", fg: "var(--text-faint)" };
}

// "Is this ticket in a done/terminal state" — covers both vocabularies at
// once (English COMPLETE/REFUND/CANCELED, and Report Conflict's Hoàn
// thành/Từ chối/Hủy), since Summary and other cross-type views need to
// count "done" uniformly regardless of which literal vocabulary a type uses.
export function isTicketDone(status) {
  // "CANCEL" (no D) added for Design's round-34 vocabulary alongside the
  // shared "CANCELED".
  return ["COMPLETE", "REFUND", "CANCELED", "CANCEL", "Hoàn thành", "Từ chối", "Hủy"].includes(status);
}
