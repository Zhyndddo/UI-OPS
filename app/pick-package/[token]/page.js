"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { formatDetailText } from "../../../lib/helpers";
import { TRO_GIA_BOOKING_SETTING_KEY, DEFAULT_TRO_GIA_BOOKING_ITEMS, parseTroGiaBookingItems } from "../../../lib/troGiaBooking";
import { useIsMobile } from "../../../lib/useIsMobile";
import styles from "../../shared.module.css";

function fmtVnd(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

// Only "Chỉ Phát Hành" remains as an always-offered plain pick (no
// itemized breakdown) — "Không Độc Quyền" was removed entirely per
// request. "Int Media" used to be a 3rd entry here as a fake quick-pick;
// it's now a real buildable package type (see BuildPackagePopup) AND, as
// of the INT MEDIA follow-up flow, a special add-on that overrides the
// Chỉ Phát Hành card below once built — see the intMediaOverride logic
// further down.
const SIMPLE_OPTIONS = ["Chỉ Phát Hành"];
const BOOKING_ROUNDS = ["INT", "Đợt 1", "Đợt 2"];

// Hardcoded, identical for every package (not per-package terms_text, not
// DB-driven like the Shared Terms blocks above) — this is VIEENT's fixed
// partner-benefits sheet, shown once regardless of which package is
// selected. Transcribed from the reference sheet; ping if any wording here
// needs correcting and it'll get fixed in this same constant.
const PARTNER_BENEFITS = [
  // Round 65 — RECORDING STUDIO removed from here (was an always-shown
  // fixed row). Round 68 — moved again: for a while it lived as an
  // opt-in per-PACKAGE line item, but that was wrong per explicit
  // correction — it's picked per PRODUCT (this release), not per package,
  // so it now conditionally prepends to this same list from
  // PartnerBenefits() below (see recordingStudioIncluded), driven by
  // releases.recording_studio_included instead of living in this array at
  // all.
  { label: "19 CREATIVE SPACE", detail: "Không gian miễn phí để thực hiện quay phỏng vấn, live session, MV ..." },
  { label: "PITCHING PLAYLIST/BANNER", detail: "Nền Tảng : Zingmp3, NCT, Spotify, Apple Music\nKết quả Pitching sẽ được cập nhật sau khi nền tảng trả kết quả về" },
  // Round 68 — item 2a: TRỢ GIÁ BOOKING and TRỢ GIÁ BOOKING ADS YOUTUBE
  // NGOÀI GÓI HTTT rows removed per explicit request.
  { label: "HỆ THỐNG QUẢN LÝ PHÁT HÀNH VÀ DOANH THU", detail: "Cung cấp tài khoản truy cập để kiểm tra\n- Catalog : VIEENT Music Dashboard\n- Xem Báo cáo Doanh thu : Royalties Analytics" },
  { label: "BẢO VỆ BẢN QUYỀN & ĐỊNH DANH NGHỆ SĨ:", detail: "- Tối ưu hóa Hồ sơ nghệ sĩ (Mapping/Verification) trên mọi nền tảng.\n- Giám sát, xử lý vi phạm bản quyền (Claim/Report) trên các nền tảng.\n- Tư vấn pháp lý các vấn đề liên quan đến quyền tác giả, quyền bản ghi." },
  { label: "THEO DÕI & BÁO CÁO ĐỊNH KỲ", detail: "- Báo cáo định kỳ về chỉ số lượt nghe của dự án và profile của nghệ sĩ.\n- Đánh giá dữ liệu để tư vấn điều chỉnh kế hoạch truyền thông kịp thời, đảm bảo hiệu quả tối đa." },
];
// Round 68 — the row PartnerBenefits() prepends when
// release.recording_studio_included is true, regardless of which package
// was picked (it's a per-product flag, not tied to any one package's
// terms).
const RECORDING_STUDIO_ROW = { label: "RECORDING STUDIO", detail: "Thu âm miễn phí tại VIEENT Studio" };
const MEDIA_PARTNER_NOTE = {
  intro: "***Logo VIEENT sẽ xuất hiện trên các tài liệu truyền thông chính thức như:\n– Bài đăng Facebook\n– Thumbnail YouTube\n*** Chia sẻ các bài đăng về artist post /congrats post hoặc tag tên VIEENT trong bài đăng Congrats/Thank You Post",
  logoLink: "https://drive.google.com/drive/folders/1Pqx0wQAssoWe2aZcilI-N9bGzZXuDjIF",
  hashtag: "Hashtag chính thức #vieentmusic sẽ được sử dụng trên các nền tảng TikTok, Facebook và các nội dung liên quan đến bài hát.",
};

// Shared Terms Block B ("Chỉ áp dụng cho gói 5 năm và 2 năm…") is only
// ever relevant to these 2 tiers — Vĩnh Viễn (or anything else) never
// shows it, even though Block A still shows for every real package.
const SHARED_B_TIERS = ["độc quyền 5 năm", "độc quyền 2 năm"];

// Any terms line containing one of these phrases gets highlighted in the
// accent color instead of the default muted grey — Marketing wants "HỖ TRỢ
// 100% CHI PHÍ" / "KHÔNG CẦN TRỪ DOANH THU" (wherever it appears across the
// Intro / Conditions / per-package terms text, all admin-edited in Config →
// Shared Terms) to stand out. var(--accent-soft) is already bright orange
// in dark mode and a darker, still-readable-on-white orange in light mode —
// no separate light/dark branching needed here. Round 68 — item 4a added
// the second line ("KHÔNG CẦN TRỪ DOANH THU" sits on its own line, right
// after "HỖ TRỢ 100% CHI PHÍ", and wasn't matching the old single phrase).
const HIGHLIGHT_PHRASES = ["hỗ trợ 100%", "không cần trừ doanh thu"];

// Round 68 — item 4b: bold, no color change. Round 72 — item 4b: the two
// "Điều kiện N: ..." lines moved here too (used to be BOLD_NUMBERS_PHRASES
// below, with their numbers colored orange — per explicit correction,
// that's gone now, they're just bold like this line, normal color
// everywhere including the numbers).
const BOLD_ONLY_PHRASES = ["điều kiện cam kết", "điều kiện 1", "điều kiện 2"];

// Round 72 — item 4c: any "NN năm" duration (05 năm, 02 năm, 01 năm, …)
// gets its number+"năm" colored orange, wherever it shows up — replaces
// the old digit-only BOLD_NUMBERS_PHRASES/withColoredNumbers pair (that
// colored ANY number on the điều kiện lines above; those are now plain
// bold instead, see BOLD_ONLY_PHRASES). Applied to every line by default
// (not gated by a phrase list) since duration text appears in different
// packages' own terms_text with different wording around it.
function withColoredYears(line) {
  const parts = line.split(/(\d+\s*năm)/gi);
  return parts.map((part, i) => (/^\d+\s*năm$/i.test(part) ? <span key={i} style={{ color: "var(--accent-soft)" }}>{part}</span> : part));
}

// Streaming & Milestone section, below Booking Progress — read-only
// display of release_stream_metrics (the real, actively-maintained
// numbers table behind the Streaming workstation's Today/Monthly/Bổ Sung
// tabs; NOT dsp_metrics_snapshots, which the release detail page's own
// "Stream Numbers" section reads from but is still an unused/future
// automated-fetch path per schema.sql — always empty in practice today).
// Field label list mirrors STREAM workstation's METRIC_GROUPS values, just
// flattened and only rendering whichever fields actually have something in
// them rather than a fixed grid, since most releases only ever fill in a
// handful of these.
const STREAM_FIELD_LABELS = {
  current_spotify: "Spotify — Current", playlist_spotify: "Spotify — Playlist",
  views_tiktok: "TikTok — Views", creations_tiktok: "TikTok — Creations",
  current_zing: "Zing — Current", homepage_banner_zing: "Zing — Homepage Banner", bxh_nhac_moi: "Zing — BXH Nhạc Mới", album_hot_zing: "Zing — Album Hot", cover_playlist_zing: "Zing — Cover Playlist", playlist_zing: "Zing — Playlist",
  current_nct: "NCT — Current", banner_homepage_nct: "NCT — Homepage Banner", cover_playlist_nct: "NCT — Cover Playlist", playlist_nct: "NCT — Playlist",
  current_ytb: "YouTube — Current", youtube_trending: "YouTube — Trending",
  current_ytb_music: "YTB Music — Current",
  views_fb: "Facebook — Views", creations_fb: "Facebook — Creations",
};

// Round 72 — item 4: "make the package term also HTML format" — any text
// admin-pastes into Config → Shared Terms / Per-Package Terms / Trợ Giá
// Booking that itself contains real HTML tags (<br/>, <a href>, <b>,
// <span>, …) now renders as actual HTML instead of literal text, so admin
// can hand-format a block (e.g. embed a real clickable link) without
// needing a new phrase rule added here every time. Detected by a simple
// tag-shaped regex — plain text with no "<...>" in it is completely
// unaffected and keeps going through the line-by-line phrase logic below,
// so nothing already in Config needs to change.
const HTML_TAG_RE = /<\/?[a-z][\s\S]*>/i;

// Renders a terms blob line-by-line so specific lines can carry their own
// formatting — everything else renders exactly as before (same font
// size/color/line-height), just broken into per-line divs instead of one
// whiteSpace:"pre-line" block. Round 68 — item 4 added bold-only/
// bold-with-colored-numbers line rules on top of the original
// HIGHLIGHT_PHRASES one; round 72 — item 4 replaced the colored-numbers
// rule with a colored-years rule (see withColoredYears above) and added
// the raw-HTML passthrough above.
function TermsText({ text, baseStyle }) {
  if (!text) return null;
  if (HTML_TAG_RE.test(text)) {
    return <div style={baseStyle} dangerouslySetInnerHTML={{ __html: text }} />;
  }
  return text.split("\n").map((line, i) => {
    const lower = line.toLowerCase();
    if (HIGHLIGHT_PHRASES.some((p) => lower.includes(p))) {
      return <div key={i} style={{ ...baseStyle, color: "var(--accent-soft)", fontWeight: 700 }}>{line || " "}</div>;
    }
    if (BOLD_ONLY_PHRASES.some((p) => lower.includes(p))) {
      return <div key={i} style={{ ...baseStyle, fontWeight: 700 }}>{line || " "}</div>;
    }
    // Round 75 — item 3: any line with a "NN năm" duration in it (e.g.
    // "Bản ghi gốc...: 02 năm") now goes bold too, not just the number
    // colored — per explicit request.
    const hasYear = /\d+\s*năm/i.test(line);
    return <div key={i} style={{ ...baseStyle, fontWeight: hasYear ? 700 : baseStyle?.fontWeight }}>{withColoredYears(line || " ")}</div>;
  });
}

export default function PickPackagePage() {
  const { token } = useParams();
  const [magicLink, setMagicLink] = useState(null);
  const [release, setRelease] = useState(null);
  const [pickOptions, setPickOptions] = useState([]); // real built packages + the 3 simple ones
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [selectedValue, setSelectedValue] = useState(null); // local pick, not yet committed
  const [confirmed, setConfirmed] = useState(false);
  const [categories, setCategories] = useState([]); // package_categories — for the booking-progress summary
  const [packageItems, setPackageItems] = useState([]); // release_package_items — the confirmed/locked package's real breakdown
  const [bookingEntries, setBookingEntries] = useState([]);
  const [round, setRound] = useState("INT");
  const [sharedTerms, setSharedTerms] = useState({ a: "", conditions: "", b: "" }); // global_settings' canned blocks, shown alongside any real package's own terms_text
  // Round 84 — global Trợ Giá Booking list (Config → Trợ Giá Booking),
  // distinct from the per-package tro_gia_booking_text above — see
  // lib/troGiaBooking.js and the TroGiaBookingSection component below.
  const [troGiaBookingItems, setTroGiaBookingItems] = useState(DEFAULT_TRO_GIA_BOOKING_ITEMS);
  // The Media Booking ticket behind this link — its status_log gates
  // whether any real (built) package shows here at all (see load(): a
  // package only ever appears once the ticket has reached COMPLETE at
  // least once), and its id is where Feed Back submissions get written.
  const [mediaBookingTicket, setMediaBookingTicket] = useState(null);
  const [showFeedbackBox, setShowFeedbackBox] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [streamMetrics, setStreamMetrics] = useState(null); // release_stream_metrics row, or null
  const [milestones, setMilestones] = useState([]); // milestone_chart_entries, matched by DID
  // Confirm button now opens a warning popup instead of committing
  // directly — per explicit request, to prevent a misclick locking in the
  // wrong package (Cancel here just closes the popup, the earlier
  // selection is untouched; Confirm inside it is what actually calls
  // confirmChoice()).
  const [showConfirmWarning, setShowConfirmWarning] = useState(false);
  // Round 88 follow-up 4 — mobile fix for the itemized package table below
  // (Số Lượng/Thành Tiền are white-space:nowrap so their own short numbers
  // never wrap — on a narrow phone width their column just isn't wide
  // enough for that nowrap text, so it visibly overflows the cell and
  // bleeds on top of the neighboring Chi Tiết column's text instead of
  // wrapping to a second line).
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!supabase || !token) return;
    load();
  }, [token]);

  // Round 54 — browser tab title follows the same "Package Offer" →
  // "Media Report" rename as everywhere else this link's name shows up.
  useEffect(() => {
    if (!release) return;
    document.title = `${release.media_report_status ? "Media Report" : "Package Offer"} — ${release.title}`;
  }, [release?.title, release?.media_report_status]);

  async function load() {
    setLoading(true);
    setError(null);

    const { data: link, error: linkErr } = await supabase
      .from("magic_links")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (linkErr || !link) {
      setError("This link doesn't look valid. Double-check the URL you were sent.");
      setLoading(false);
      return;
    }
    setMagicLink(link);

    const { data: rel } = await supabase.from("releases").select("*").eq("id", link.release_id).single();
    setRelease(rel);

    // Media Booking ticket for this release — its status_log is the real
    // gate for whether a built package should show here at all ("magic
    // link goes live + notification fires simultaneously" only once
    // Marketing sets it COMPLETE). Once it has EVER reached COMPLETE, keep
    // showing whatever's in media_booking_packages even while a rebook is
    // in progress (ticket back to REQUESTED) — a rebook is a purely
    // internal do-over, this page only needs to update once the new build
    // reaches COMPLETE again, not the moment a reopen starts.
    const { data: mbTab } = await supabase.from("ticket_tabs").select("id").eq("key", "media_booking").single();
    let ticketRow = null;
    if (mbTab) {
      const { data: mbTix } = await supabase
        .from("tickets")
        .select("id, status, status_log, data")
        .eq("tab_id", mbTab.id)
        .eq("data->>releaseId", rel?.did)
        .is("deleted_at", null)
        .limit(1);
      ticketRow = mbTix?.[0] || null;
      setMediaBookingTicket(ticketRow);
    }
    const packagesEverCompleted = !!ticketRow?.status_log?.COMPLETE;

    // Round 65 — item 4: the nested media_booking_package_lines(*) embed
    // had no explicit order, so PostgREST returned each package's lines in
    // whatever order the DB felt like (not necessarily insertion order),
    // which is why this page's Hạng Mục row order didn't match the
    // drag-to-reorder order set in the Package Builder ticket. The outer
    // .order("sort_order") only orders the packages themselves, not their
    // nested lines — needs its own foreignTable-scoped .order() too.
    const { data: realPackagesRaw } = await supabase
      .from("media_booking_packages")
      .select("*, media_booking_package_lines(*)")
      .eq("release_id", link.release_id)
      .order("sort_order")
      .order("sort_order", { foreignTable: "media_booking_package_lines" });
    const realPackages = packagesEverCompleted ? realPackagesRaw : [];
    const { data: pkgCategories } = await supabase.from("package_categories").select("id, name");
    const categoryNameById = {};
    (pkgCategories || []).forEach((c) => (categoryNameById[c.id] = c.name));

    // terms_text per contract type — matched against the package's own
    // (free-typed) name. Only the 3 real Độc Quyền tiers carry one; a
    // custom-named package just shows nothing extra here.
    // Round 72 — item 4d: tro_gia_booking_text added alongside terms_text,
    // same per-package/admin-edited pattern (Config → Package Terms) — a
    // separate block so Marketing can add/edit these rows without wading
    // through the main terms_text blob, and per package like they asked.
    const { data: termsRows } = await supabase.from("contract_type_packages").select("contract_type, terms_text, tro_gia_booking_text");
    const termsByName = {};
    const troGiaByName = {};
    (termsRows || []).forEach((t) => {
      const key = t.contract_type.trim().toLowerCase();
      if (t.terms_text) termsByName[key] = t.terms_text;
      if (t.tro_gia_booking_text) troGiaByName[key] = t.tro_gia_booking_text;
    });

    // Round 84 — added TRO_GIA_BOOKING_SETTING_KEY to this same
    // already-batched global_settings read rather than a separate query.
    const { data: settingsRows } = await supabase.from("global_settings").select("key, value").in("key", ["package_terms_shared_a", "package_terms_conditions", "package_terms_shared_b", TRO_GIA_BOOKING_SETTING_KEY]);
    const settingsByKey = {};
    (settingsRows || []).forEach((s) => (settingsByKey[s.key] = s.value));
    setSharedTerms({
      a: settingsByKey.package_terms_shared_a || "",
      conditions: settingsByKey.package_terms_conditions || "",
      b: settingsByKey.package_terms_shared_b || "",
    });
    setTroGiaBookingItems(parseTroGiaBookingItems(settingsByKey[TRO_GIA_BOOKING_SETTING_KEY]));

    const realOptions = (realPackages || []).map((p) => {
      // Round 86 follow-up — INT MEDIA used to be a mushed package (Hạng
      // Mục names only, never a price or calculation) both on the build
      // side and here. Per explicit request, it now looks exactly like
      // Vĩnh Viễn/other real packages on this magic-link page too — full
      // itemized table with quantities and Thành Tiền, same as the
      // internal Package Builder already shows it. `kind` stays
      // "intMedia" (still distinct from "real") since other logic below
      // keys off it, but rendering no longer branches on it.
      const isIntMedia = p.name === "INT MEDIA";
      const matchedTier = (p.name || "").trim().toLowerCase();
      return {
        value: p.name,
        label: p.name,
        kind: isIntMedia ? "intMedia" : "real",
        termsText: termsByName[matchedTier] || null,
        troGiaBookingText: troGiaByName[matchedTier] || null,
        showSharedB: SHARED_B_TIERS.includes(matchedTier),
        totalValue: !(p.media_booking_package_lines || []).some((l) => l.amount != null)
          ? null
          : p.media_booking_package_lines.reduce((sum, l) => sum + (l.amount || 0), 0),
        items: (p.media_booking_package_lines || []).map((l) => {
          const categoryName = categoryNameById[l.category_id] || null;
          // Round 78 (3) — every Ads brand except YouTube Ads has never
          // carried a real `quantity` at the package-line level (it's
          // priced per-entry, then mushed into one lump amount — see
          // media-booking/page.js's syncPackageLine comment), so this was
          // rendering as a bare "—" here even though the internal package
          // builder shows "1 Gói" for the exact same line. Not a
          // regression from the recent YouTube Ads fixes — this table has
          // always read the raw DB quantity — but it should match what
          // the builder already shows instead of looking like missing
          // data. YouTube Ads keeps showing its real quantity as before.
          const isNonYoutubeAdsLine = categoryName === "Ads" && l.brand !== "YouTube Ads";
          return {
            category: (categoryName || l.platform || "—") + (l.brand ? ` — ${l.brand}` : ""),
            unit: l.unit, quantity: l.quantity, detail: l.detail, amount: l.amount,
            isNonYoutubeAdsLine,
          };
        }),
      };
    });
    const simpleOptions = SIMPLE_OPTIONS.map((name) => ({ value: name, label: name, kind: "simple", totalValue: null, items: [] }));

    // INT MEDIA follow-up override: once Marketing has built an "INT
    // MEDIA" package for a release that was locked in as "Chỉ Phát Hành",
    // INT MEDIA REPLACES the plain Chỉ Phát Hành card here — same
    // underlying lock, richer display. This never touches
    // releases.project_type (the historical "AR locked Chỉ Phát Hành"
    // fact stays true) — purely what's shown on this page.
    const intMediaBuilt = rel?.project_type === "Chỉ Phát Hành" && realOptions.find((o) => o.value === "INT MEDIA");
    const options = intMediaBuilt
      ? [...realOptions, ...simpleOptions.filter((o) => o.value !== "Chỉ Phát Hành")]
      : [...realOptions, ...simpleOptions];
    setPickOptions(options);

    if (intMediaBuilt) {
      setSelectedValue("INT MEDIA");
      setConfirmed(true);
    } else if (rel && !["BRIEF & DATA", "SENT TO MARKETING", "DEALING"].includes(rel.project_type)) {
      setSelectedValue(rel.project_type);
      setConfirmed(true);
    }

    const { data: cats } = await supabase.from("package_categories").select("id, name").order("sort_order");
    setCategories(cats || []);
    // Same ordering fix as the media_booking_package_lines embed above —
    // this table also carries a sort_order column (set at copy-time in
    // confirmChoice() below) that was never actually being asked for.
    const { data: items } = await supabase.from("release_package_items").select("*").eq("release_id", link.release_id).order("sort_order");
    setPackageItems(items || []);
    const { data: entries } = await supabase.from("media_booking_entries").select("*").eq("release_id", link.release_id);
    setBookingEntries(entries || []);

    const { data: streamRow } = await supabase.from("release_stream_metrics").select("*").eq("release_id", link.release_id).maybeSingle();
    setStreamMetrics(streamRow || null);
    if (rel?.did) {
      const { data: chart } = await supabase.from("milestone_chart_entries").select("*").eq("did", rel.did).order("entry_date", { ascending: false });
      setMilestones(chart || []);
    }

    supabase.from("magic_links").update({ last_used_at: new Date().toISOString() }).eq("id", link.id);
    setLoading(false);
  }

  // Same aggregate "All" filter the Booking Board and the release detail
  // page's Media Booking tab both use — one ratio per Hạng Mục, no brand/
  // platform breakdown, read-only. Lets whoever's on the other end of this
  // magic link (the artist/label) see booking progress alongside the
  // package they picked, without exposing the internal Booking Board.
  function bookedFor(categoryName) {
    const matching = packageItems.filter((it) => it.category === categoryName || (it.category || "").startsWith(`${categoryName} — `));
    if (matching.length === 0) return null;
    return matching.reduce((sum, it) => sum + (it.quantity || 0), 0);
  }

  function addedFor(categoryId) {
    return bookingEntries.filter((e) => e.booking_round === round && e.category_id === categoryId).length;
  }

  // Clicking a card only selects it locally now — nothing commits until
  // Confirm is pressed. This also removes the old race condition where a
  // click could land while isLocked was flipping true (e.g. admin hitting
  // "Lock editing" around the same moment), leaving project_type stuck.
  function selectPackage(value) {
    if (isLocked) return;
    setSelectedValue(value);
    setConfirmed(false);
  }

  // The actual commit — resolves project_type out of the pipeline, locks
  // in the package, and auto-creates the Phụ Lục ticket (once). A real
  // package's lines get copied into release_package_items (matching how
  // the old template flow worked); a simple option just sets project_type
  // with no itemized breakdown at all.
  async function confirmChoice() {
    if (isLocked || !selectedValue) return;
    setPicking(true);
    const wasPipelineStage = ["BRIEF & DATA", "SENT TO MARKETING", "DEALING"].includes(release?.project_type);
    const option = pickOptions.find((o) => o.value === selectedValue);
    const { error: err } = await supabase
      .from("releases")
      .update({
        project_type: selectedValue,
        package_total_value: option?.totalValue ?? null,
        // The artist confirming their own pick now locks it in directly —
        // no more separate manual "Lock editing" step for AR on this path
        // (AR's toggle still exists for everything else, e.g. correcting
        // a pick made on the artist's behalf).
        package_locked: true,
      })
      .eq("id", release.id);
    setPicking(false);
    if (err) { setError(err.message); return; }
    setRelease((r) => ({ ...r, project_type: selectedValue, package_total_value: option?.totalValue ?? null, package_locked: true }));
    setConfirmed(true);

    if (wasPipelineStage) {
      const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "phu_luc").single();
      if (tab) {
        await supabase.from("tickets").insert({
          tab_id: tab.id,
          data: { releaseId: release.id },
        });
      }
    }

    // Real packages (including INT MEDIA, which still carries the full
    // underlying quantity/detail data even though it's hidden from this
    // client-facing view) have items to seed release_package_items with —
    // simple options (Chỉ Phát Hành etc.) genuinely have none.
    if ((option?.kind === "real" || option?.kind === "intMedia") && option.items.length > 0) {
      const { data: existingItems } = await supabase.from("release_package_items").select("id").eq("release_id", release.id).limit(1);
      if (!existingItems || existingItems.length === 0) {
        const rows = option.items.map((it, i) => ({
          release_id: release.id, category: it.category, unit: it.unit,
          quantity: it.quantity, detail: it.detail, amount: it.amount, sort_order: i,
        }));
        await supabase.from("release_package_items").insert(rows);
      }
    }
  }

  // Feed Back — the artist's alternative to confirming: leaves a note for
  // AR instead of picking a package outright. Writes straight onto the
  // Media Booking ticket (data.feedback) so AR sees it on the release page
  // and can re-send to Marketing with that text carried along, and fires
  // a notification to the AR team with the literal phrase the workflow
  // asked for so it's easy to search/recognize in the notification list.
  async function submitFeedback() {
    if (!mediaBookingTicket || !feedbackText.trim() || submittingFeedback) return;
    setSubmittingFeedback(true);
    const newData = { ...(mediaBookingTicket.data || {}), feedback: { text: feedbackText.trim(), submittedAt: new Date().toISOString() } };
    const { error: err } = await supabase.from("tickets").update({ data: newData }).eq("id", mediaBookingTicket.id);
    if (err) {
      setSubmittingFeedback(false);
      setError(err.message);
      return;
    }
    setMediaBookingTicket((t) => ({ ...t, data: newData }));
    await supabase.rpc("fanout_notification", {
      p_team: "AR",
      p_type: "media_booking_feedback",
      p_title: "Artist request package changed",
      p_body: `${release?.main_artist || "An artist"} left feedback on ${release?.title || "their release"}'s media booking package.`,
      p_link: `/releases/${release.id}?focus=media_booking`,
      p_ticket_id: mediaBookingTicket.id,
    });
    setSubmittingFeedback(false);
    setFeedbackSent(true);
    setShowFeedbackBox(false);
    setFeedbackText("");
  }

  if (loading) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 640 }}>Loading…</div></div>;
  if (error) return <div className={styles.page}><div className={styles.container} style={{ maxWidth: 640 }}><div className={styles.errorBox}>{error}</div></div></div>;

  const isLocked = magicLink?.locked || release?.package_locked;
  // Round 54 — this same link is "Package Offer" until the Booking Board's
  // "Convert Media Report" button is clicked for this release, then
  // "Media Report" from then on (see release.media_report_status). Also
  // gates item B.3's default-collapsed sections below.
  const isMediaReport = !!release?.media_report_status;
  const linkName = isMediaReport ? "Media Report" : "Package Offer";
  const isPipelineStage = ["BRIEF & DATA", "SENT TO MARKETING", "DEALING"].includes(release?.project_type);
  const hasOtherRounds = bookingEntries.some((e) => e.booking_round === "Đợt 1" || e.booking_round === "Đợt 2");

  // "Rich" cards (real built packages, incl. INT MEDIA) get the wide
  // itemized-table treatment; "compact" ones (the always-offered simple
  // pick, Chỉ Phát Hành — no breakdown) are just small stacked pills off
  // to the side instead of eating a full card's worth of width for a
  // single line of text. Once locked, every OTHER option is hidden
  // entirely (not just disabled) — there's nothing left to compare once
  // the choice is final.
  const visibleOptions = isLocked ? pickOptions.filter((c) => c.value === selectedValue) : pickOptions;
  const richOptions = visibleOptions.filter((c) => c.kind !== "simple");
  const compactOptions = visibleOptions.filter((c) => c.kind === "simple");

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 1320 }}>
        {/* Per explicit request (picture 1) — "Quyền Lợi Dành Cho Đơn Vị
            Truyền Thông" moves to the very top, split side-by-side with
            the product info instead of living further down the page.
            "Quyền Lợi Dành Riêng Cho Đối Tác Phát Hành VIEENT" (the big
            partner-benefits table) is untouched, still further down via
            PartnerBenefits(). */}
        {/* Round 69 — item 1: header text enlarged ~1.4x (eyebrow 12->17,
            title 28->39, artist/date line 13->18) — overridden inline
            rather than touching styles.eyebrow/.title globally, since
            those are shared classes used across every other page. Column
            widened (320px -> 420px min) so the bigger title still has room
            to stay on one line instead of wrapping. */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ flex: "1 1 420px" }}>
            <div className={styles.eyebrow} style={{ fontSize: 17 }}>// {linkName.toLowerCase()}</div>
            <h1 className={styles.title} style={{ marginBottom: 4, fontSize: 39, whiteSpace: "nowrap" }}>
              {release?.title}
            </h1>
            <div style={{ color: "var(--text-faint)", fontSize: 18 }}>
              {/* Round 69 — item 2: feature artist added, "Main ft. Feature" */}
              {release?.main_artist}{release?.feature_artist ? ` ft. ${release.feature_artist}` : ""} · {release?.release_date} {release?.release_time}
            </div>
          </div>
          <div style={{ flex: "1 1 360px" }}>
            <MediaPartnerNote defaultCollapsed={isMediaReport} />
          </div>
        </div>

        {isLocked && (
          <div className={styles.errorBox} style={{ background: "var(--bg-hover)", borderColor: "var(--border-strong)", color: "var(--text-muted)" }}>
            Selection is locked for this release — contact your OPS/AR contact if you need to change it.
          </div>
        )}

        {!isLocked && isPipelineStage && (
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 16, marginTop: 0 }}>
            Current stage: <span style={{ color: "#ff9d5c" }}>{release?.project_type}</span>
          </p>
        )}

        {/* Round 54 — item B.3: once this link has been converted to a
            Media Report (release.media_report_status set from the Booking
            Board), the package-picking UI below is no longer actionable
            (selection's already locked) — collapse it by default so the
            report content is what's in front of whoever opens the link,
            while still leaving it one click away if anyone wants to check
            back on what was picked. */}
        <CollapsibleSection title="Package" defaultCollapsed={isMediaReport}>
        <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
          Each contract type comes with its own package — compare them side by side below, then confirm
          your choice.
        </p>

        {/* All options shown at once, full breakdown always expanded — a
            side-by-side comparison, not a stack of collapsible cards. Rich
            (itemized) packages get a wide grid on the left; the always-
            offered simple picks stack narrowly on the right so they don't
            burn a whole card's width on one line of text. */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {richOptions.length > 0 && (
        <div style={{ flex: "3 1 640px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 12, alignItems: "start" }}>
          {richOptions.map((c) => {
            const selected = selectedValue === c.value;
            return (
              <div
                key={c.value}
                style={{
                  // Round 68 — item 3 hardcoded this to a fixed cream
                  // (#f7f3ee) regardless of site theme, because back then
                  // var(--bg-card) + the hardcoded near-white title text
                  // combined to go invisible in light mode. Round 78 — per
                  // explicit request, reverted to theme-aware var(--bg-card)
                  // now that the title text below is also theme-aware
                  // (var(--text)) instead of a second hardcoded color — the
                  // two vars are always a correctly-contrasted pair in both
                  // themes today, so this card is a real black plate again
                  // in dark mode instead of always-light.
                  background: selected ? "rgba(255,107,26,0.1)" : "var(--bg-card)",
                  // Every package card gets an orange stroke now (not just
                  // the selected one) so they read as a set of options to
                  // compare, not a plain grey list — selected still stands
                  // out via a thicker/brighter border plus the tinted
                  // background above.
                  border: selected ? "2px solid #ff6b1a" : "1px solid rgba(255,107,26,0.5)",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                {/* Round 69 — item: the whole header used to be one big
                    clickable button (click-anywhere-to-select). Per
                    explicit request, that's removed for clarity — this is
                    now a plain, non-clickable info block, and the only way
                    to pick this package is the explicit button on the
                    right (was previously duplicated at the bottom of the
                    card too; consolidated to just this one). */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: 16, opacity: isLocked && !selected ? 0.5 : 1 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: selected ? "#ff9d5c" : "var(--text)" }}>
                      {c.label || c.value}
                    </span>
                    {selected && <span style={{ fontSize: 11, color: "#ff6b1a", fontWeight: 700 }}>{confirmed ? "CONFIRMED" : "SELECTED — not confirmed yet"}</span>}
                    {c.totalValue != null && (
                      <span style={{ fontSize: 13, color: "var(--text-faint)" }}>{fmtVnd(c.totalValue)}</span>
                    )}
                  </div>
                  {!isLocked && (
                    <button
                      onClick={() => selectPackage(c.value)}
                      disabled={picking}
                      style={{
                        flexShrink: 0, padding: "8px 14px", fontSize: 12, fontWeight: 800, borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap",
                        border: selected ? "1px solid #ff6b1a" : "1px solid var(--border-strong)",
                        background: selected ? "#ff6b1a" : "var(--bg-hover)",
                        color: selected ? "#0a0a0a" : "var(--text-muted)",
                      }}
                    >
                      {selected ? "✓ Đã Chọn" : "Chọn Gói Này"}
                    </button>
                  )}
                </div>
                {(c.termsText || sharedTerms.a || sharedTerms.conditions) && (
                  // Fixed order: intro (a) -> conditions -> this package's
                  // own terms (c, e.g. VĨNH VIỄN/03 năm). The 5/2-năm note
                  // (Shared B) used to render here too, but that broke the
                  // Hạng Mục rows lining up horizontally across cards when
                  // one package had the note and its neighbor didn't (or
                  // had a different-length one) — it now renders AFTER the
                  // items table below instead, still inside this same card.
                  <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px", background: "rgba(255,107,26,0.04)", display: "grid", gap: 8 }}>
                    {sharedTerms.a && <TermsText text={sharedTerms.a} baseStyle={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }} />}
                    {sharedTerms.conditions && <TermsText text={sharedTerms.conditions} baseStyle={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }} />}
                    {c.termsText && <TermsText text={c.termsText} baseStyle={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }} />}
                  </div>
                )}
                {c.items?.length > 0 ? (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "8px 16px" }}>
                    <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
                    <table className={styles.table} style={{ marginTop: 8, tableLayout: "fixed", width: "100%" }}>
                      {/* Round 68 — item 3: Số Lượng (14% -> 16%, ~1.15x)
                          and Thành Tiền (18% -> 21%, ~1.15x) were clipping/
                          wrapping their own numbers ("32 Bài Đăng" and
                          "22.400.000 đ" breaking onto 2 lines). Chi Tiết
                          gives up the difference (46% -> 41%) — it already
                          has the most room to spare and wraps fine. */}
                      <colgroup>
                        <col style={{ width: "22%" }} />
                        <col style={{ width: "16%" }} />
                        <col style={{ width: "41%" }} />
                        <col style={{ width: "21%" }} />
                      </colgroup>
                      <thead>
                        <tr style={isMobile ? { fontSize: 10 } : undefined}><th>Hạng Mục</th><th>Số Lượng</th><th>Chi Tiết</th><th>Thành Tiền</th></tr>
                      </thead>
                      <tbody>
                        {c.items.map((item, i) => (
                          <tr key={i} style={isMobile ? { fontSize: 11 } : undefined}>
                            <td style={{ wordBreak: "break-word" }}>{item.category}</td>
                            {/* Round 88 follow-up 4 — nowrap dropped on mobile so a
                                narrow column wraps this onto a 2nd line instead of
                                overflowing sideways on top of Chi Tiết's text. */}
                            <td style={isMobile ? { wordBreak: "break-word" } : { whiteSpace: "nowrap" }}>{item.isNonYoutubeAdsLine ? "1 Gói" : item.quantity != null ? `${item.quantity} ${item.unit || ""}` : "—"}</td>
                            <td style={{ fontSize: isMobile ? 10 : 11, color: "var(--text-faint)", whiteSpace: "pre-line", lineHeight: 1.4 }}>{formatDetailText(item.detail) || "—"}</td>
                            <td style={isMobile ? { wordBreak: "break-word" } : { whiteSpace: "nowrap" }}>{fmtVnd(item.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                ) : null}
                {c.showSharedB && sharedTerms.b && (
                  <div style={{ borderTop: "1px dashed var(--border-strong)", padding: "8px 16px" }}>
                    <TermsText text={sharedTerms.b} baseStyle={{ fontSize: 10, color: "var(--text-faint)", lineHeight: 1.5 }} />
                  </div>
                )}
                {/* Round 72 — item 4d: "TRỢ GIÁ BOOKING" as its own block,
                    per package, admin-edited in Config → Package Terms
                    (Marketing can add/edit rows there, HTML-formatted —
                    see TermsText's HTML passthrough above). Replaces the
                    old always-shown TRỢ GIÁ BOOKING / TRỢ GIÁ BOOKING ADS
                    YOUTUBE rows that were removed from PARTNER_BENEFITS in
                    round 68 — this is the "move it here" destination. */}
                {c.troGiaBookingText && (
                  <div style={{ borderTop: "1px solid var(--border)" }}>
                    <div style={{ background: "#ff6b1a", color: "#0a0a0a", fontWeight: 800, fontSize: 12, letterSpacing: 0.3, padding: "6px 16px", textTransform: "uppercase" }}>
                      Trợ Giá Booking
                    </div>
                    <div style={{ padding: "10px 16px" }}>
                      <TermsText text={c.troGiaBookingText} baseStyle={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}

        {compactOptions.length > 0 && (
          // No rich (built) packages at all — the only pickable option
          // shouldn't be stranded off in the narrow right-hand rail with
          // nothing else on the page; give it the wide left-aligned
          // treatment instead so it just reads as "the option", not an
          // afterthought next to empty space.
          <div style={richOptions.length === 0 ? { flex: "1 1 320px", display: "grid", gap: 10, maxWidth: 360 } : { flex: "0 0 200px", display: "grid", gap: 10 }}>
            {compactOptions.map((c) => {
              const selected = selectedValue === c.value;
              return (
                <button
                  key={c.value}
                  onClick={() => selectPackage(c.value)}
                  disabled={isLocked || picking}
                  style={{
                    textAlign: "left",
                    // Round 78 — same revert as the rich options cards
                    // above: theme-aware var(--bg-card) instead of the
                    // fixed cream round 68 introduced.
                    background: selected ? "rgba(255,107,26,0.1)" : "var(--bg-card)",
                    border: selected ? "1px solid #ff6b1a" : "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "14px 16px",
                    cursor: isLocked ? "not-allowed" : "pointer",
                    opacity: isLocked && !selected ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: selected ? "#ff9d5c" : "var(--text)" }}>
                      {c.label || c.value}
                    </span>
                    {selected && <span style={{ fontSize: 10, color: "#ff6b1a", fontWeight: 700 }}>{confirmed ? "CONFIRMED" : "SELECTED — not confirmed yet"}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        </div>{/* end options flex row */}

        {!isLocked && selectedValue && (
          <button
            onClick={() => setShowConfirmWarning(true)}
            disabled={picking || confirmed}
            style={{
              marginTop: 20,
              width: "100%",
              background: confirmed ? "var(--bg-hover)" : "#ff6b1a",
              color: confirmed ? "#7ee6a8" : "#0a0a0a",
              border: confirmed ? "1px solid #2e7d32" : "none",
              borderRadius: 8,
              padding: "14px 0",
              fontSize: 14,
              fontWeight: 800,
              cursor: confirmed ? "default" : "pointer",
              letterSpacing: 0.4,
            }}
          >
            {picking ? "Confirming…" : confirmed ? "✓ Package Confirmed" : "Xác Nhận Gói Đã Chọn"}
          </button>
        )}

        {/* Confirm warning popup — per explicit request, to prevent a
            misclick locking in the wrong package. Cancel just closes this
            (selection is untouched, nothing committed); Confirm is the
            only path that actually calls confirmChoice(). */}
        {showConfirmWarning && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 24, maxWidth: 440, width: "100%" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#ff9d5c", marginBottom: 12 }}>⚠ Xác nhận lựa chọn</div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.5 }}>
                Bấm nút confirm bên dưới sẽ khóa tính năng chọn gói hỗ trợ truyền thông, vui lòng kiểm tra lại lựa chọn của bạn.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className={styles.btnSecondary} onClick={() => setShowConfirmWarning(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={picking}
                  onClick={async () => {
                    setShowConfirmWarning(false);
                    await confirmChoice();
                  }}
                >
                  {picking ? "Confirming…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Feed Back — the alternative to confirming a pick. Sends a note
            to AR instead of/alongside picking, rather than committing to
            a choice right now. Round 68 — item 1: also gated on !confirmed
            now, not just !isLocked. A release confirmed via the Package
            Runner import (Chỉ Phát Hành) sets project_type directly, which
            flips `confirmed` true on load — but isLocked depends on
            magicLink.locked / release.package_locked, which weren't
            reliably true in the same moment for an imported pick, so Feed
            Back was staying visible next to an already-"✓ Package
            Confirmed" card. Checking !confirmed directly closes that gap
            regardless of the isLocked timing. */}
        {!isLocked && !confirmed && mediaBookingTicket && (
          <div style={{ marginTop: 12 }}>
            {feedbackSent ? (
              <div className={styles.successBox}>Feedback sent — your OPS/AR contact has been notified.</div>
            ) : showFeedbackBox ? (
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, fontWeight: 700 }}>Gửi phản hồi về gói</div>
                <textarea
                  className={styles.input}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Nhập phản hồi của bạn về gói…"
                  rows={4}
                  style={{ width: "100%", resize: "vertical", fontSize: 13, marginBottom: 8 }}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={submitFeedback}
                    disabled={!feedbackText.trim() || submittingFeedback}
                  >
                    {submittingFeedback ? "Đang gửi…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    className={styles.btnSmall}
                    onClick={() => { setShowFeedbackBox(false); setFeedbackText(""); }}
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={styles.btnSmall} onClick={() => setShowFeedbackBox(true)}>
                Feed Back
              </button>
            )}
          </div>
        )}

        </CollapsibleSection>

        {/* Round 84 — global Trợ Giá Booking list, admin-edited in
            Config → Trợ Giá Booking (lib/troGiaBooking.js), seated right
            above Partner Benefits per explicit request. */}
        <TroGiaBookingSection items={troGiaBookingItems} defaultCollapsed={isMediaReport} />

        {/* Fixed partner-benefits block — same for every package, shown
            once (not duplicated per card) right under the package
            cards/confirm button, above the Booking Progress numbers when
            that section is showing. Round 54 — collapsed by default once
            this is a Media Report, same reasoning as the Package section
            above. */}
        <PartnerBenefits defaultCollapsed={isMediaReport} recordingStudioIncluded={!!release?.recording_studio_included} />

        {confirmed && (
          <div style={{ marginTop: 32 }}>
            <div className={styles.subheading} style={{ marginTop: 0 }}>Booking Progress</div>
            {/* Only show the round switcher when there's actually
                something to switch to — a release that never got a Đợt 1
                or Đợt 2 booking entry has nothing behind those tabs, so
                showing them just invites clicking into an empty view. */}
            {hasOtherRounds && (
              <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                {BOOKING_ROUNDS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRound(r)}
                    className={`${styles.tabBtn} ${round === r ? styles.tabBtnActive : ""}`}
                    style={{ border: "1px solid var(--border)", borderRadius: 6 }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              {categories.map((c) => {
                const booked = bookedFor(c.name);
                const added = addedFor(c.id);
                const isDone = booked != null && booked > 0 && added >= booked;
                return (
                  <div key={c.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", marginBottom: 8, textTransform: "uppercase" }}>
                      {c.name}
                    </div>
                    {isDone ? (
                      <span style={{ color: "#7ee6a8", fontWeight: 800, fontSize: 13 }}>DONE</span>
                    ) : booked != null ? (
                      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{added} / {booked}</span>
                    ) : (
                      <span style={{ color: "var(--text-faint)", fontSize: 13 }}>{added} / —</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Promotion Package link — right under the booking numbers,
                same field/link shown on the release detail page's
                Streaming & Milestone tab, surfaced here too so the
                artist/label doesn't need internal access to reach it. */}
            {release?.promotion_package_url && (
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", textTransform: "uppercase" }}>Promotion Package</span>
                <a
                  href={release.promotion_package_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open Promotion Package link"
                  style={{ fontSize: 18 }}
                >
                  🔗
                </a>
              </div>
            )}
          </div>
        )}

        {/* Streaming & Milestone — read-only, same data the internal
            Streaming workstation and the release detail page's Milestone
            section track, just surfaced here too so the artist/label can
            see it without a separate report being sent. */}
        {confirmed && (streamMetrics || milestones.length > 0) && (
          <div style={{ marginTop: 32 }}>
            <div className={styles.subheading} style={{ marginTop: 0 }}>Streaming & Milestone</div>

            {streamMetrics && Object.keys(STREAM_FIELD_LABELS).some((k) => streamMetrics[k]) ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: milestones.length > 0 ? 20 : 0 }}>
                {Object.entries(STREAM_FIELD_LABELS)
                  .filter(([key]) => streamMetrics[key])
                  .map(([key, label]) => (
                    <div key={key} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#f4f4f4" }}>{streamMetrics[key]}</div>
                    </div>
                  ))}
              </div>
            ) : (
              milestones.length === 0 && <p style={{ color: "var(--text-faint)", fontSize: 12 }}>No streaming or milestone data yet.</p>
            )}

            {milestones.length > 0 && (
              <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead><tr><th>Chart</th><th>Date</th><th>Rank</th><th>Platform</th></tr></thead>
                <tbody>
                  {milestones.map((m) => (
                    <tr key={m.id}>
                      <td>{m.chart}</td>
                      <td>{m.entry_date}</td>
                      <td>{m.rank}</td>
                      <td>{m.platform || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Round 54 — item B.3: generic collapsible wrapper for the "Package"
// section (used inline, wrapping the whole options grid). PartnerBenefits
// and MediaPartnerNote below have the same orange-header look already, so
// they grow their own inline toggle instead of using this — kept separate
// so their existing headers don't have to change shape.
function CollapsibleSection({ title, defaultCollapsed, children }) {
  const [open, setOpen] = useState(!defaultCollapsed);
  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: open ? 10 : 0, color: "var(--text-faint)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}
      >
        <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▸</span>
        {title}
        <span style={{ fontWeight: 400, textTransform: "none", color: "var(--text-dim)" }}>{open ? "(click to collapse)" : "(click to expand)"}</span>
      </button>
      {open && children}
    </div>
  );
}

// Round 84 — same collapsible orange-header treatment as PartnerBenefits/
// MediaPartnerNote below, for visual consistency, but its rows come live
// from Config → Trợ Giá Booking (global_settings, see lib/troGiaBooking.js)
// instead of a hardcoded array — items[] can be empty if an admin removes
// every row, in which case the whole section just doesn't render.
function TroGiaBookingSection({ items, defaultCollapsed }) {
  const [open, setOpen] = useState(!defaultCollapsed);
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: 28 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", textAlign: "left", background: "#ff6b1a", color: "#0a0a0a", fontWeight: 800, fontSize: 12, letterSpacing: 0.3, padding: "8px 14px", textTransform: "uppercase", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        Trợ Giá Booking
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ border: "1px solid var(--border)", borderTop: "none" }}>
          {items.map((it, i) => (
            <div
              key={i}
              style={{
                padding: "10px 14px",
                background: i % 2 === 0 ? "rgba(255,107,26,0.05)" : "transparent",
                borderTop: i === 0 ? "none" : "1px solid #1c1c1c",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: "#ff9d5c", marginBottom: 4 }}>{it.title}</div>
              {it.desc && <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-line", lineHeight: 1.5, marginBottom: it.href ? 4 : 0 }}>{it.desc}</div>}
              {it.href && (
                <a href={it.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#5b9dff", wordBreak: "break-all" }}>
                  {it.href}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PartnerBenefits({ defaultCollapsed, recordingStudioIncluded }) {
  const [open, setOpen] = useState(!defaultCollapsed);
  // Round 88 follow-up 4 — desktop keeps the 2-column label|detail grid;
  // mobile stacks label above detail instead (same one-column-concat
  // layout TroGiaBookingSection already uses above), so the fixed 220px
  // label column doesn't crush the detail column on a phone. Desktop is
  // completely untouched — this only swaps the grid's own template.
  const isMobile = useIsMobile();
  // Round 68 — prepended, not part of PARTNER_BENEFITS itself, since
  // whether it shows depends on this release's own flag rather than being
  // fixed for every release.
  const rows = recordingStudioIncluded ? [RECORDING_STUDIO_ROW, ...PARTNER_BENEFITS] : PARTNER_BENEFITS;
  return (
    <div style={{ marginTop: 28 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", textAlign: "left", background: "#ff6b1a", color: "#0a0a0a", fontWeight: 800, fontSize: 12, letterSpacing: 0.3, padding: "8px 14px", textTransform: "uppercase", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        Quyền Lợi Dành Riêng Cho Đối Tác Phát Hành VIEENT
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
      <div style={{ border: "1px solid var(--border)", borderTop: "none" }}>
        {rows.map((row, i) => (
          <div
            key={row.label}
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "220px 1fr",
              gap: isMobile ? 4 : 16,
              padding: "10px 14px",
              background: i % 2 === 0 ? "rgba(255,107,26,0.05)" : "transparent",
              borderTop: i === 0 ? "none" : "1px solid #1c1c1c",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: "#ff9d5c" }}>{row.label}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-line", lineHeight: 1.5 }}>
              {row.detail}
              {row.link && (
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontWeight: 700 }}>{row.link.text}</span>
                  {" : "}
                  <a href={row.link.href} target="_blank" rel="noopener noreferrer" style={{ color: "#5b9dff", wordBreak: "break-all" }}>{row.link.href}</a>
                </div>
              )}
              {row.detailAfterLink && <div style={{ marginTop: 8 }}>{row.detailAfterLink}</div>}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

// "Quyền Lợi Dành Cho Đơn Vị Truyền Thông" — split out from PartnerBenefits
// so it can render at the top of the page (next to the product info)
// instead of down with the rest of the partner-benefits content. Same
// content/styling as before, just its own component now.
function MediaPartnerNote({ defaultCollapsed }) {
  const [open, setOpen] = useState(!defaultCollapsed);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", textAlign: "left", background: "#ff6b1a", color: "#0a0a0a", fontWeight: 800, fontSize: 12, letterSpacing: 0.3, padding: "8px 14px", textTransform: "uppercase", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        Quyền Lợi Dành Cho Đơn Vị Truyền Thông
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
      <div style={{ border: "1px solid var(--border)", borderTop: "none", padding: "12px 14px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
        <div style={{ whiteSpace: "pre-line" }}>{MEDIA_PARTNER_NOTE.intro}</div>
        <div style={{ marginTop: 8 }}>
          🔗 Logo: <a href={MEDIA_PARTNER_NOTE.logoLink} target="_blank" rel="noopener noreferrer" style={{ color: "#5b9dff", wordBreak: "break-all" }}>{MEDIA_PARTNER_NOTE.logoLink}</a>
        </div>
        <div style={{ marginTop: 8 }}>{MEDIA_PARTNER_NOTE.hashtag}</div>
      </div>
      )}
    </div>
  );
}

