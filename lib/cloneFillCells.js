// Round 512 — narrow replacement for the removed post-clone resync.
//
// After "Clone from another product", a copied line that carries a total but NO per-column Cells
// (brand_column_quantities) shows "—" on the Booking Board — that is what HIRAKI II hit (Round 418).
// This fills ONLY those missing Cells, from the tier's own DSP grid rows, and ONLY when the grid's
// total equals the line's existing total. It never changes a total, amount, price, Chi Tiết or any
// line that already has Cells or is locked (manual_lock), and never touches another tier.
//
// Constants + math mirror handleSummarize in app/tickets/media-booking/page.js (keep in sync).

const PLATFORMS = ["Facebook", "Instagram", "TikTok", "YouTube", "Thread"];
const PHASES = ["count_tung_hint", "count_out_now", "count_listen_now", "count_addin_post"];
const BRANDS = ["VIEENT", "ENVI"];
const COMMUNITY_BRANDS = ["PAGE BOLERO / MT", "PAGE VPOP", "PAGE INDIE"];
const TIKTOK_ALL_BRANDS = ["TIKTOK BOLERO / MT", "TIKTOK VPOP", "TIKTOK INDIE", "CAPCUT", "EXT TIKTOK - BK MUSIC", "EXT TIKTOK - DUCTH", "EXT TIKTOK - BK GROUP", "EXT TIKTOK - CTV MẪU"];

// entries = one tier's grid rows for ONE category. Returns { total, cells } or null if not computable.
export function computeCellsFromGrid(categoryName, entries) {
  const cells = {};
  let total = 0;
  if (categoryName === "TikTok Channel") {
    for (const brand of TIKTOK_ALL_BRANDS) {
      for (const e of entries.filter((x) => x.brand === brand)) {
        const rowTotal = (e.channel_count || 0) * (e.count_posts || 0);
        total += rowTotal;
        if (e.platform) cells[`${brand}::${e.platform}`] = (cells[`${brand}::${e.platform}`] || 0) + rowTotal;
      }
    }
  } else if (categoryName === "Social" || categoryName === "Community") {
    const brands = categoryName === "Social" ? BRANDS : COMMUNITY_BRANDS;
    for (const b of brands) {
      for (const e of entries.filter((x) => (x.brand || "") === b)) {
        if (!e.platform || !PLATFORMS.includes(e.platform)) continue;
        const rowPosts = PHASES.reduce((sum, key) => sum + (e[key] || 0), 0);
        const rowTotal = (e.channel_count || 1) * rowPosts;
        total += rowTotal;
        cells[`${b}::${e.platform}`] = (cells[`${b}::${e.platform}`] || 0) + rowTotal;
      }
    }
  } else {
    return null;
  }
  return Object.keys(cells).length > 0 ? { total, cells } : null;
}

// supabase = the app client. packageIds = the NEW packages created by the clone.
export async function fillMissingCellsAfterClone(supabase, packageIds, categories) {
  const report = { filled: 0, skippedTotalMismatch: 0 };
  if (!packageIds || packageIds.length === 0) return report;
  const catName = new Map((categories || []).map((c) => [c.id, c.name]));
  const [{ data: lines }, { data: entries }] = await Promise.all([
    supabase.from("media_booking_package_lines").select("id, package_id, category_id, brand, quantity, brand_column_quantities, manual_lock").in("package_id", packageIds),
    supabase.from("media_booking_content_entries").select("*").in("package_id", packageIds),
  ]);
  for (const line of lines || []) {
    const name = catName.get(line.category_id);
    if (!["Social", "Community", "TikTok Channel"].includes(name)) continue;
    if ((line.brand || "") !== "" || line.manual_lock) continue;
    if (line.brand_column_quantities && Object.keys(line.brand_column_quantities).length > 0) continue;
    if (!(line.quantity > 0)) continue;
    const rows = (entries || []).filter((e) => e.package_id === line.package_id && e.category_id === line.category_id);
    const computed = computeCellsFromGrid(name, rows);
    if (!computed) continue;
    if (computed.total !== line.quantity) { report.skippedTotalMismatch += 1; continue; }
    const { error } = await supabase.from("media_booking_package_lines").update({ brand_column_quantities: computed.cells }).eq("id", line.id);
    if (!error) report.filled += 1;
  }
  return report;
}
