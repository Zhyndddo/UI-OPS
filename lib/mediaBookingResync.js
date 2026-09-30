import { supabase } from "./supabaseClient";

// Round 418 — "simulate clicking Summarize" per explicit request. Grew out
// of the HIRAKI II "no number again" investigation: "Clone from another
// product" (app/tickets/media-booking/page.js's cloneFromRelease, Round 79)
// copies media_booking_package_lines wholesale from the source release —
// including whatever brand_column_quantities/metric_quantities those lines
// had (or didn't have) at clone time. If the source package predates this
// per-platform-breakdown feature, or was itself never re-Summarized after
// its own grid was edited, the clone carries that gap forward untouched.
// Editing the destination release's own DSP grid afterward doesn't fix it
// either — only clicking Summarize (per Hạng Mục, per brand bracket) pushes
// the grid's numbers back into the rollup + package line, and there's no
// small/automatic way to do that for every Hạng Mục/brand at once from the
// UI.
//
// This file is the shared, component-free version of that recompute: same
// math as handleSummarize in app/tickets/media-booking/page.js (kept
// duplicated here, not imported, since that file is a page component, not
// a module — MUST stay in sync with it, same convention already used for
// TIKTOK_SUBCHANNELS between that page and app/booking/page.js), but able
// to run over one release's already-saved media_booking_content_entries
// instead of a single category's on-screen `entries` state. Two callers:
//   1. cloneFromRelease — runs this on the destination release right after
//      a "Clone from another product", so a freshly-cloned package already
//      reflects whatever's in the copied grid instead of the source's
//      possibly-stale numbers. No separate resync step needed for a brand
//      new clone.
//   2. Config → Media Booking Pricing's "Resync Package Quantities" panel
//      (MediaBookingResyncSection) — a manual, admin-gated bulk pass over
//      every release with a built package, for existing releases that got
//      cloned/edited before this fix existed, and for whatever import
//      process is used for old/legacy releases.
//
// Deliberately conservative: this only ever REFRESHES an existing rollup
// row / package line's quantity + breakdown columns (and, for Ads, the
// YouTube Ads Chi Tiết text) — it never inserts a brand-new package line,
// never creates a package, and never touches unit_price, a line's own
// (freely-edited) Chi Tiết for non-YouTube-Ads brands, or is_package_priced/
// package_count. A brand/category bracket with zero grid entries is left
// completely alone (whatever rollup/line it already has, including a
// deliberate "Skip"), so this can never silently un-skip or zero out a
// bracket nobody has touched — it only refreshes brackets that actually
// have grid rows.

const PLATFORMS = ["Facebook", "Instagram", "TikTok", "YouTube", "Thread"];
const PHASES = ["count_tung_hint", "count_out_now", "count_listen_now", "count_addin_post"];
const BRANDS = ["VIEENT", "ENVI"];
const COMMUNITY_BRANDS = ["PAGE BOLERO / MT", "PAGE VPOP", "PAGE INDIE"];
const TIKTOK_GROUPS = {
  "In-house": ["TIKTOK BOLERO / MT", "TIKTOK VPOP", "TIKTOK INDIE", "CAPCUT"],
  "Partner": ["EXT TIKTOK - BK MUSIC", "EXT TIKTOK - DUCTH", "EXT TIKTOK - BK GROUP", "EXT TIKTOK - CTV MẪU"],
};
const TIKTOK_ALL_BRANDS = Object.values(TIKTOK_GROUPS).flat();
const ADS_BRANDS = ["Facebook Ads", "YouTube Ads", "TikTok Ads", "Spotify Ads"];
const YOUTUBE_ADS_DEFAULT_DETAIL = "Áp dụng kênh youtube nghệ sĩ thuộc MCN, MV thời lượng dưới 5 phút";

// Same formula as computeLineAmount() in app/tickets/media-booking/page.js.
function computeLineAmount(line) {
  if (line.unit_price == null) return null;
  const qty = line.is_package_priced ? line.package_count : line.quantity;
  if (qty == null) return null;
  return line.unit_price * qty;
}

// entries → { totalPosts, platformTotals } for a Social/Community-shaped
// (or any other plain, no-special-formula) Hạng Mục bracket — same formula
// as handleSummarize's generic byPlatform loop.
function summarizePlainBracket(entries) {
  const byPlatform = {};
  PLATFORMS.forEach((p) => (byPlatform[p] = { platform: p, totalPosts: 0, channelCount: 0 }));
  entries.forEach((e) => {
    if (!e.platform || !byPlatform[e.platform]) return;
    const rowChannels = e.channel_count || 1;
    const rowPosts = PHASES.reduce((sum, key) => sum + (e[key] || 0), 0);
    byPlatform[e.platform].channelCount += rowChannels;
    byPlatform[e.platform].totalPosts += rowChannels * rowPosts;
  });
  const rows = PLATFORMS.map((p) => byPlatform[p]).filter((r) => r.channelCount > 0);
  const totalPosts = rows.reduce((sum, r) => sum + r.totalPosts, 0);
  const platformTotals = {};
  rows.forEach((r) => { platformTotals[r.platform] = r.totalPosts; });
  return { totalPosts, platformTotals: Object.keys(platformTotals).length > 0 ? platformTotals : null };
}

// entries (one TikTok Channel sub-brand's rows) → { totalPosts, subchannelTotals }
function summarizeTiktokBrand(entries) {
  let totalPosts = 0;
  const subchannelTotals = {};
  entries.forEach((e) => {
    const rowTotal = (e.channel_count || 0) * (e.count_posts || 0);
    totalPosts += rowTotal;
    if (e.platform) subchannelTotals[e.platform] = (subchannelTotals[e.platform] || 0) + rowTotal;
  });
  return { totalPosts, subchannelTotals: Object.keys(subchannelTotals).length > 0 ? subchannelTotals : null };
}

// entries (one Ads brand's rows) → { totalQty, totalMoney, detailText, metricQuantities }
function summarizeAdsBrand(entries) {
  const rows = entries.map((e) => ({ ...e, amount: (e.count_posts || 0) * (e.unit_price || 0) }));
  const totalMoney = rows.reduce((sum, r) => sum + r.amount, 0);
  const totalQty = rows.reduce((sum, r) => sum + (r.count_posts || 0), 0);
  const detailText = rows.filter((r) => (r.count_posts || 0) > 0).map((r) => `SL ${r.count_posts} ${r.platform}`).join("; ");
  const metricQuantities = {};
  rows.forEach((r) => { if ((r.count_posts || 0) > 0) metricQuantities[r.platform] = r.count_posts; });
  return { totalQty, totalMoney, detailText, metricQuantities: Object.keys(metricQuantities).length > 0 ? metricQuantities : null };
}

// Round 433 — same resolution logic as buildPackageByRelease() in
// app/booking/page.js (kept duplicated here for the same reason
// TIKTOK_SUBCHANNELS/computeLineAmount are: this file has no component to
// import from). Finds which single package is "the" Booking Board package
// for a release — INT MEDIA (only when project_type is Chỉ Phát Hành) beats
// Internal Package (no precondition) beats a plain exact-name match. MUST
// stay in sync with the app/booking/page.js version.
function resolveLockedPackageId(release, packagesForRelease) {
  if (!release) return null;
  let pkg = null;
  if (release.project_type === "Chỉ Phát Hành") {
    pkg = packagesForRelease.find((p) => p.name === "INT MEDIA") || null;
  }
  if (!pkg) pkg = packagesForRelease.find((p) => p.name === "Internal Package") || null;
  if (!pkg) pkg = packagesForRelease.find((p) => p.name === release.project_type) || null;
  return pkg ? pkg.id : null;
}

// Recomputes every Hạng Mục/brand bracket for ONE release from its current
// media_booking_content_entries, refreshes media_booking_package_categories
// rollups for whichever brackets actually have entries, then pushes the
// combined totals into every already-existing matching line across every
// package this release has built — EXCEPT the one package that's actually
// "locked in" and shown on the Booking Board (see resolveLockedPackageId
// above). Returns a small summary for reporting — never throws on a
// release with nothing to do, just returns zeroed counts.
//
// Round 433 — per explicit user report: "Resync All Releases" was silently
// overwriting a release's already artist-confirmed/locked package's numbers
// too, even a bracket the user had deliberately chosen a specific (often
// smallest) quantity for. The user was explicit this was never the intent
// ("not really a 'working as designed'... it was to only resync whichever
// package that has the number in but not showing in the bookingboard") —
// i.e. the bulk admin tool should only ever touch a package that ISN'T the
// one the Booking Board reads from. The locked package's own numbers should
// only ever change via a human clicking Summarize while that package is
// active (syncPackageLine, scoped to activePackage.id) — never via a
// release-wide bulk tool.
//
// skipLockedPackage defaults to true (the bulk/admin "Resync All Releases"
// use case). cloneFromRelease (app/tickets/media-booking/page.js) passes
// false: right after a clone, EVERY package on the destination release —
// including whichever one happens to share a name with the release's own
// project_type — is carrying the SOURCE release's possibly-stale numbers
// and needs the fresh recompute; nothing on a brand-new clone has actually
// been human-confirmed yet, so there's no "locked" package to protect there.
export async function resyncReleasePackages(releaseId, { skipLockedPackage = true } = {}) {
  const report = { releaseId, rollupsWritten: 0, linesUpdated: 0, categoriesTouched: [], lockedPackageId: null, lockedLinesSkipped: 0 };
  if (!releaseId) return report;

  const [{ data: categories }, { data: entries }, { data: existingRollups }, { data: packages }, { data: release }] = await Promise.all([
    supabase.from("package_categories").select("id, name").order("sort_order"),
    // Round 442 — media_booking_content_entries is now package-scoped
    // (package_id NOT NULL); still fetched once for the whole release and
    // then filtered per package below (cheaper than one query per package).
    supabase.from("media_booking_content_entries").select("*").eq("release_id", releaseId),
    supabase.from("media_booking_package_categories").select("*").eq("release_id", releaseId),
    supabase.from("media_booking_packages").select("id, name, media_booking_package_lines(*)").eq("release_id", releaseId),
    supabase.from("releases").select("id, project_type").eq("id", releaseId).maybeSingle(),
  ]);
  if (!categories || categories.length === 0 || !packages || packages.length === 0) return report;

  const lockedPackageId = resolveLockedPackageId(release, packages);
  report.lockedPackageId = lockedPackageId;

  const allEntries = entries || [];
  const allRollups = existingRollups || [];
  const categoriesTouchedSet = new Set();

  // Round 442 — content_entries/package_categories are now package-scoped,
  // so the whole per-category/per-brand recompute below now runs ONCE PER
  // PACKAGE, each package reading only ITS OWN entries/rollups and writing
  // only INTO ITS OWN rollup rows and ITS OWN lines — never pushed across
  // to any other package's lines the way the old release-wide version did
  // (that release-wide push was exactly the bug this round fixes: two
  // packages summarizing the same category+brand used to converge on one
  // shared rollup). skipLockedPackage still means "don't touch the locked/
  // Booking-Board package at all" (rollup included, not just its lines,
  // since a package's rollup is its own now, not shared).
  for (const pkg of packages) {
    if (skipLockedPackage && pkg.id === lockedPackageId) {
      report.lockedLinesSkipped += (pkg.media_booking_package_lines || []).length;
      continue;
    }

    const pkgEntries = allEntries.filter((e) => e.package_id === pkg.id);
    const rollupByKey = new Map(allRollups.filter((r) => r.package_id === pkg.id).map((r) => [`${r.category_id}::${r.brand || ""}`, r]));
    const rollupUpserts = [];
    // categoryId -> { brand: patch } — the merged, ready-to-apply line update
    // per category (brand "" for everything but Ads, which keys by its real
    // ad-platform brand — same shape lineFor()/syncPackageLine() use).
    const lineUpdatesByCategory = new Map();

    for (const category of categories) {
      const categoryEntries = pkgEntries.filter((e) => e.category_id === category.id);
      if (categoryEntries.length === 0) continue; // nothing entered here — leave whatever's already saved alone

      if (category.name === "TikTok Channel") {
        let combinedTotal = 0;
        const brandColumnQuantities = {};
        let anyFresh = false;
        for (const tiktokBrand of TIKTOK_ALL_BRANDS) {
          const brandEntries = categoryEntries.filter((e) => e.brand === tiktokBrand);
          const key = `${category.id}::${tiktokBrand}`;
          if (brandEntries.length > 0) {
            const { totalPosts, subchannelTotals } = summarizeTiktokBrand(brandEntries);
            rollupUpserts.push({ release_id: releaseId, package_id: pkg.id, category_id: category.id, brand: tiktokBrand, total_posts: totalPosts, platform_quantities: subchannelTotals, skipped: false, updated_at: new Date().toISOString() });
            combinedTotal += totalPosts;
            if (subchannelTotals) Object.entries(subchannelTotals).forEach(([col, qty]) => { brandColumnQuantities[`${tiktokBrand}::${col}`] = qty; });
            anyFresh = true;
          } else {
            const existing = rollupByKey.get(key);
            if (existing && !existing.skipped) {
              combinedTotal += existing.total_posts || 0;
              if (existing.platform_quantities) Object.entries(existing.platform_quantities).forEach(([col, qty]) => { brandColumnQuantities[`${tiktokBrand}::${col}`] = qty; });
            }
          }
        }
        if (anyFresh) {
          lineUpdatesByCategory.set(category.id, { "": { quantity: combinedTotal, brand_column_quantities: Object.keys(brandColumnQuantities).length > 0 ? brandColumnQuantities : null } });
          categoriesTouchedSet.add(category.name);
        }
        continue;
      }

      if (category.name === "Ads") {
        const patchByBrand = {};
        for (const adsBrand of ADS_BRANDS) {
          const brandEntries = categoryEntries.filter((e) => e.brand === adsBrand);
          if (brandEntries.length === 0) continue;
          const { totalQty, totalMoney, detailText, metricQuantities } = summarizeAdsBrand(brandEntries);
          if (totalQty === 0 && !detailText) continue; // matches handleSummarize's own "nothing filled in" skip
          rollupUpserts.push({ release_id: releaseId, package_id: pkg.id, category_id: category.id, brand: adsBrand, total_posts: totalQty, total_money: totalMoney, detail_text: detailText || null, metric_quantities: metricQuantities, skipped: false, updated_at: new Date().toISOString() });
          const isYoutubeAds = adsBrand === "YouTube Ads";
          patchByBrand[adsBrand] = {
            quantity: isYoutubeAds ? totalQty : null,
            amount: totalMoney,
            metric_quantities: metricQuantities,
            ...(isYoutubeAds ? { detail: YOUTUBE_ADS_DEFAULT_DETAIL } : {}),
          };
        }
        if (Object.keys(patchByBrand).length > 0) {
          lineUpdatesByCategory.set(category.id, patchByBrand);
          categoriesTouchedSet.add(category.name);
        }
        continue;
      }

      // Everything else (Social, Community, and any other Hạng Mục that uses
      // the plain PLATFORMS grid) — Social/Community bracket by their real
      // brand list, anything without one (e.g. Design) is a single "" bucket.
      const brands = category.name === "Social" ? BRANDS : category.name === "Community" ? COMMUNITY_BRANDS : [""];
      let combinedTotal = 0;
      const brandColumnQuantities = {};
      let anyFresh = false;
      for (const b of brands) {
        const brandEntries = categoryEntries.filter((e) => (e.brand || "") === b);
        const key = `${category.id}::${b}`;
        if (brandEntries.length > 0) {
          const { totalPosts, platformTotals } = summarizePlainBracket(brandEntries);
          rollupUpserts.push({ release_id: releaseId, package_id: pkg.id, category_id: category.id, brand: b, total_posts: totalPosts, platform_quantities: platformTotals, skipped: false, updated_at: new Date().toISOString() });
          combinedTotal += totalPosts;
          if (platformTotals) Object.entries(platformTotals).forEach(([col, qty]) => { brandColumnQuantities[`${b}::${col}`] = qty; });
          anyFresh = true;
        } else {
          const existing = rollupByKey.get(key);
          if (existing && !existing.skipped) {
            combinedTotal += existing.total_posts || 0;
            if (existing.platform_quantities) Object.entries(existing.platform_quantities).forEach(([col, qty]) => { brandColumnQuantities[`${b}::${col}`] = qty; });
          }
        }
      }
      if (anyFresh) {
        lineUpdatesByCategory.set(category.id, { "": { quantity: combinedTotal, brand_column_quantities: Object.keys(brandColumnQuantities).length > 0 ? brandColumnQuantities : null } });
        categoriesTouchedSet.add(category.name);
      }
    }

    if (rollupUpserts.length > 0) {
      // Round 442 — onConflict target grows to include package_id, matching
      // the new unique constraint (release_id, package_id, category_id, brand)
      // added in sql/pending/add-round442-package-scope-content-entries.sql.
      await supabase.from("media_booking_package_categories").upsert(rollupUpserts, { onConflict: "release_id,package_id,category_id,brand" });
      report.rollupsWritten += rollupUpserts.length;
    }

    // Push into this SAME package's own lines only — never any other
    // package's lines (that cross-package push was the bug). Never inserts
    // a new line — a category/brand with no line yet in this package was
    // never synced into it via Summarize either, so leaving it alone
    // matches what re-clicking Summarize while this package wasn't active
    // would have done.
    for (const line of pkg.media_booking_package_lines || []) {
      const patchByBrand = lineUpdatesByCategory.get(line.category_id);
      if (!patchByBrand) continue;
      const patch = patchByBrand[line.brand || ""];
      if (!patch) continue;
      const fullPatch = "brand_column_quantities" in patch ? { ...patch, amount: computeLineAmount({ ...line, ...patch }) } : patch;
      await supabase.from("media_booking_package_lines").update(fullPatch).eq("id", line.id);
      report.linesUpdated += 1;
    }
  }

  report.categoriesTouched = Array.from(categoriesTouchedSet);
  return report;
}

// Every release with at least one built package — the universe a bulk
// resync should scan. Cheap projection (id only), the real work happens
// per-release above.
export async function releasesWithPackages() {
  const { data } = await supabase.from("media_booking_packages").select("release_id");
  return Array.from(new Set((data || []).map((p) => p.release_id)));
}

// Runs resyncReleasePackages over a list of release ids sequentially
// (deliberately not parallel — this is an admin bulk maintenance action,
// not something latency-sensitive, and sequential keeps Supabase write
// load predictable). onProgress(i, total, releaseId) fires before each one
// so a caller can show a live counter.
export async function resyncManyReleases(releaseIds, { onProgress } = {}) {
  const reports = [];
  for (let i = 0; i < releaseIds.length; i++) {
    onProgress?.(i, releaseIds.length, releaseIds[i]);
    reports.push(await resyncReleasePackages(releaseIds[i]));
  }
  return reports;
}
