// SERVER-ONLY (imported from app/api/magic/route.js). Round 541 — everything
// the public pick-package page used to do straight from the browser with the
// anon key, now done here with the service role, scoped to ONE magic-link
// token. The browser sends only the token (+ the choice / feedback text); the
// release, the package prices and the ticket are all re-derived on the server
// from the token, so a caller can't touch any release other than the one the
// link was issued for, and can't send its own price.
import { supabaseAdmin } from "./supabaseAdmin";
import { TRO_GIA_BOOKING_SETTING_KEY } from "./troGiaBooking";

const SIMPLE_OPTIONS = ["Chỉ Phát Hành"]; // keep in sync with the page's SIMPLE_OPTIONS
const SETTING_KEYS = ["package_terms_shared_a", "package_terms_conditions", "package_terms_shared_b", TRO_GIA_BOOKING_SETTING_KEY];

async function linkFor(token) {
  const { data } = await supabaseAdmin.from("magic_links").select("*").eq("token", token).maybeSingle();
  return data || null;
}

async function mediaBookingTicketFor(rel) {
  const { data: tab } = await supabaseAdmin.from("ticket_tabs").select("id").eq("key", "media_booking").maybeSingle();
  if (!tab || !rel?.did) return null;
  const { data } = await supabaseAdmin
    .from("tickets")
    .select("id, status, status_log, data")
    .eq("tab_id", tab.id)
    .eq("data->>releaseId", rel.did)
    .is("deleted_at", null)
    .limit(1);
  return data?.[0] || null;
}

// Everything load() on the page needs, in one round trip. Returns null for an
// unknown token.
export async function loadPickPackage(token) {
  const link = await linkFor(token);
  if (!link) return null;
  const { data: rel } = await supabaseAdmin.from("releases").select("*").eq("id", link.release_id).maybeSingle();
  if (!rel) return { link, release: null };

  const ticket = await mediaBookingTicketFor(rel);

  const [pk, cats, terms, settings, entries, stream, viral] = await Promise.all([
    supabaseAdmin
      .from("media_booking_packages")
      .select("*, media_booking_package_lines(*)")
      .eq("release_id", link.release_id)
      .order("sort_order")
      .order("sort_order", { foreignTable: "media_booking_package_lines" }),
    supabaseAdmin.from("package_categories").select("id, name, sort_order").order("sort_order"),
    supabaseAdmin.from("contract_type_packages").select("contract_type, terms_text, tro_gia_booking_text"),
    supabaseAdmin.from("global_settings").select("key, value").in("key", SETTING_KEYS),
    supabaseAdmin.from("media_booking_entries").select("*").eq("release_id", link.release_id),
    supabaseAdmin.from("release_stream_metrics").select("*").eq("release_id", link.release_id).maybeSingle(),
    supabaseAdmin.from("milestone_viral_posts").select("*").eq("release_id", link.release_id).order("created_at", { ascending: false }),
  ]);

  let chart = [];
  let youtubeAdsTickets = [];
  if (rel.did) {
    const { data: c } = await supabaseAdmin.from("milestone_chart_entries").select("*").eq("did", rel.did).order("entry_date", { ascending: false });
    chart = c || [];
    const { data: yaTab } = await supabaseAdmin.from("ticket_tabs").select("id").eq("key", "youtube_ads").maybeSingle();
    if (yaTab) {
      const { data: ya } = await supabaseAdmin
        .from("tickets")
        .select("id, status, data")
        .eq("tab_id", yaTab.id)
        .eq("data->>relatedDid", rel.did)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      youtubeAdsTickets = ya || [];
    }
  }

  // Best-effort "last opened" stamp (was a fire-and-forget client update).
  await supabaseAdmin.from("magic_links").update({ last_used_at: new Date().toISOString() }).eq("id", link.id).then(() => {}, () => {});

  return {
    link,
    release: rel,
    mediaBookingTicket: ticket,
    packages: pk.data || [],
    categories: cats.data || [],
    termsRows: terms.data || [],
    settingsRows: settings.data || [],
    bookingEntries: entries.data || [],
    streamMetrics: stream.data || null,
    milestones: chart,
    youtubeAdsTickets,
    viralPosts: viral.data || [],
  };
}

// Mirrors the page's own price/item mapping so the server never trusts a
// client-sent total or item list.
function optionFromPackage(p, categoryNameById) {
  const lines = p.media_booking_package_lines || [];
  const totalValue = !lines.some((l) => l.amount != null) ? null : lines.reduce((s, l) => s + (l.amount || 0), 0);
  const items = lines.map((l) => {
    const categoryName = categoryNameById[l.category_id] || null;
    return {
      category: (categoryName || l.platform || "—") + (l.brand ? ` — ${l.brand}` : ""),
      unit: l.unit, quantity: l.quantity, detail: l.detail, amount: l.amount,
    };
  });
  return { totalValue, items };
}

// The artist confirms a package. Re-implements confirmChoice()'s DB work.
export async function confirmPick(token, value) {
  const link = await linkFor(token);
  if (!link) return { status: 404, error: "not_found" };
  const { data: rel } = await supabaseAdmin.from("releases").select("*").eq("id", link.release_id).maybeSingle();
  if (!rel) return { status: 404, error: "not_found" };
  if (link.locked || rel.package_locked) return { status: 409, error: "This package is already locked in." };

  const ticket = await mediaBookingTicketFor(rel);
  const everCompleted = !!ticket?.status_log?.COMPLETE;

  let option; // { kind, totalValue, items }
  if (SIMPLE_OPTIONS.includes(value)) {
    option = { kind: "simple", totalValue: null, items: [] };
  } else if (everCompleted) {
    const [{ data: pk }, { data: cats }] = await Promise.all([
      supabaseAdmin.from("media_booking_packages").select("*, media_booking_package_lines(*)").eq("release_id", rel.id).eq("name", value).order("sort_order", { foreignTable: "media_booking_package_lines" }),
      supabaseAdmin.from("package_categories").select("id, name"),
    ]);
    const p = pk?.[0];
    if (!p) return { status: 400, error: "That package isn't available on this link." };
    const names = {};
    (cats || []).forEach((c) => (names[c.id] = c.name));
    option = { kind: "real", ...optionFromPackage(p, names) };
  } else {
    return { status: 400, error: "That package isn't available on this link." };
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from("releases")
    .update({ project_type: value, package_total_value: option.totalValue ?? null, package_locked: true })
    .eq("id", rel.id)
    .or("package_locked.is.null,package_locked.eq.false") // guard against a double-submit race
    .select("id");
  if (updErr) return { status: 500, error: updErr.message };
  if (!updated || updated.length === 0) return { status: 409, error: "This package is already locked in." };

  const out = { ok: true, totalValue: option.totalValue ?? null, ticketCompleted: false, phuLuc: null };

  if (option.kind === "simple" && ticket && ticket.status !== "COMPLETE") {
    const newLog = { ...(ticket.status_log || {}), COMPLETE: new Date().toISOString() };
    const { error } = await supabaseAdmin.from("tickets").update({ status: "COMPLETE", status_log: newLog }).eq("id", ticket.id);
    if (!error) { out.ticketCompleted = true; out.statusLog = newLog; }
  }

  out.phuLuc = await ensurePhuLuc(rel);

  if (option.kind === "real" && option.items.length > 0) {
    const { data: existing } = await supabaseAdmin.from("release_package_items").select("id").eq("release_id", rel.id).limit(1);
    if (!existing || existing.length === 0) {
      const rows = option.items.map((it, i) => ({
        release_id: rel.id, category: it.category, unit: it.unit,
        quantity: it.quantity, detail: it.detail, amount: it.amount, sort_order: i,
      }));
      await supabaseAdmin.from("release_package_items").insert(rows);
    }
  }
  return out;
}

// Server twin of lib/ensurePhuLucTicket.js + lib/phuLucCounter.js (those are
// client modules on the anon/browser client; this one uses the service role).
async function ensurePhuLuc(release) {
  try {
    const { data: tab } = await supabaseAdmin.from("ticket_tabs").select("id").eq("key", "phu_luc").maybeSingle();
    if (!tab) return { ok: false, error: "phu_luc tab not found" };
    const { data: dup } = await supabaseAdmin.from("tickets").select("id").eq("tab_id", tab.id).is("deleted_at", null).eq("data->>releaseId", release.id).limit(1);
    if (dup && dup.length > 0) return { ok: true, existed: true };

    const { data: tickets } = await supabaseAdmin.from("tickets").select("data").eq("tab_id", tab.id).is("deleted_at", null);
    const releaseIds = [...new Set((tickets || []).map((t) => t.data?.releaseId).filter(Boolean))];
    const targetLabel = release.label || "";
    let max = 0;
    if (releaseIds.length > 0) {
      const { data: rels } = await supabaseAdmin.from("releases").select("id, label").in("id", releaseIds);
      const labelById = {};
      (rels || []).forEach((r) => (labelById[r.id] = r.label || ""));
      (tickets || []).forEach((t) => {
        if ((labelById[t.data?.releaseId] || "") !== targetLabel) return;
        const m = /^PL_(\d+)$/.exec(t.data?.maPL || "");
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
    }
    const { error } = await supabaseAdmin.from("tickets").insert({ tab_id: tab.id, data: { releaseId: release.id, maPL: `PL_${max + 1}` } });
    if (error) { console.error("[pick-package] phu luc insert failed", release.id, error.message); return { ok: false, error: error.message }; }
    return { ok: true, created: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// Feed Back: the artist leaves a note for AR instead of confirming.
export async function submitPickFeedback(token, text) {
  const clean = String(text || "").trim().slice(0, 4000);
  if (!clean) return { status: 400, error: "Feedback is empty." };
  const link = await linkFor(token);
  if (!link) return { status: 404, error: "not_found" };
  const { data: rel } = await supabaseAdmin.from("releases").select("*").eq("id", link.release_id).maybeSingle();
  if (!rel) return { status: 404, error: "not_found" };
  const ticket = await mediaBookingTicketFor(rel);
  if (!ticket) return { status: 404, error: "not_found" };

  const newData = { ...(ticket.data || {}), feedback: { text: clean, submittedAt: new Date().toISOString() } };
  const { error } = await supabaseAdmin.from("tickets").update({ data: newData }).eq("id", ticket.id);
  if (error) return { status: 500, error: error.message };
  await supabaseAdmin.rpc("fanout_notification", {
    p_team: "AR",
    p_type: "media_booking_feedback",
    p_title: "Artist request package changed",
    p_body: `${rel.main_artist || "An artist"} left feedback on ${rel.title || "their release"}'s media booking package.`,
    p_link: `/releases/${rel.id}?focus=media_booking`,
    p_ticket_id: ticket.id,
  });
  return { ok: true, data: newData };
}

// Used by app/pick-package/[token]/layout.js (server) for social-card metadata.
export async function pickPackageMeta(token) {
  const link = await linkFor(token);
  if (!link) return null;
  const { data } = await supabaseAdmin.from("releases").select("title, main_artist, media_report_status").eq("id", link.release_id).maybeSingle();
  return data || null;
}
