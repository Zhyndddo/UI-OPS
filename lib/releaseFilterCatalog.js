// Round 590 — Releases dashboard: ADVANCED FILTER catalog + query builder + export columns.
//
// One list of fields (every field on the release detail page) drives three things, so they can never drift apart:
//   1. the "Advanced filter" panel on the dashboard (lib/ReleaseAdvancedFilter.js)
//   2. the Supabase query (applyAdvFilters below) — all server-side, so it works with the dashboard's real pagination
//   3. the widened Excel/CSV export (ADV_EXPORT_COLUMNS / EXPORT_SELECT_COLUMNS)
//
// Field kinds (what the user picks -> what is sent to the database):
//   tri    gate fields stored as text 'true' | 'false' | 'update'       -> Yes / No / TBU
//   yntext checklist fields stored as text 'true' | 'false'             -> Yes / No
//   bool   real boolean columns                                         -> Yes / No
//   url    text columns, "yes" = something is filled in, "no" = null or empty (links, ids, notes)
//   has    non-text columns (dates, numbers, ids)                       -> has a value / empty
//   num    numeric columns, "yes" = greater than 0
//   check  a key inside the copyright_checklist jsonb                   -> filled / empty
//   enum   one of a fixed list (or a lookup list loaded from lookup_options)
//   text   free text, case-insensitive "contains"
//   core   handled by the dashboard itself because the stat cards already set it (type / channel / stage / created / tag)

export const FILTER_GROUPS = [
  { key: "general", label: "General", short: "General" },
  { key: "data", label: "Data & Legal", short: "Data & Legal" },
  { key: "marketing", label: "Marketing", short: "Marketing" },
  { key: "process", label: "Process", short: "Process" },
];

const PITCH_OPTS = [["Chưa thực hiện", "Chưa thực hiện"], ["Đang thực hiện", "Đang thực hiện"], ["Đã pitching", "Đã pitching"], ["Không thực hiện", "Không thực hiện"]];
const PITCH_DOM_OPTS = [["Chưa thực hiện", "Chưa thực hiện"], ["Đã pitching", "Đã pitching"], ["Không hỗ trợ", "Không hỗ trợ"], ["Có gói", "Có gói"]];

function f(group, section, key, label, kind, extra = {}) { return { key, col: key, group, section, label, kind, ...extra }; }
const G = (s, k, l, kind, e) => f("general", s, k, l, kind, e);
const D = (s, k, l, kind, e) => f("data", s, k, l, kind, e);
const M = (s, k, l, kind, e) => f("marketing", s, k, l, kind, e);
const P = (s, k, l, kind, e) => f("process", s, k, l, kind, e);

export const FILTER_FIELDS = [
  // ---------------- GENERAL ----------------
  G("Package", "project_type", "Type / pipeline stage", "core"),
  G("Package", "package_locked", "Package locked", "bool"),
  G("Package", "package_payment_status", "Payment status", "enum", { options: [["Chưa Thực Hiện", "Chưa Thực Hiện"], ["Đã Thanh Toán Một Phần", "Đã Thanh Toán Một Phần"], ["Đã Thanh Toán", "Đã Thanh Toán"]] }),
  G("Package", "package_total_value", "Package value set", "num"),
  G("Package", "package_vieent_support", "VIEENT support set", "num"),
  G("Package", "package_label_payment", "Label payment set", "num"),
  G("Package", "package_ticket_sent", "Package ticket sent", "bool"),
  G("Package", "pseudo_package_parent_did", "Linked to an album package", "url"),
  G("Channel & label", "requester_segment", "Channel", "core"),
  G("Artist", "main_artist", "Main artist contains", "text"),
  G("Artist", "feature_artist", "Feature artist contains", "text"),
  { ...G("Artist", "has_feature_artist", "Has a feature artist", "url"), col: "feature_artist" },
  G("EP / Album", "single_album_ep", "Single / EP / Album", "enum", { options: [["Single", "Single"], ["EP", "EP"], ["Album", "Album"]] }),
  G("EP / Album", "release_category", "Category", "enum", { options: [["New Release", "New Release"], ["Remarketing", "Remarketing"]] }),
  G("Genre & topic", "genre", "Genre", "enum", { lookup: "genre" }),
  G("Genre & topic", "theme", "Topic", "enum", { lookup: "topic" }),
  G("Tags", "tag", "Tag", "core"),
  G("IDs & links", "upc", "UPC", "url"),
  G("IDs & links", "isrc", "ISRC", "url"),
  G("IDs & links", "apple_id", "Apple ID", "url"),
  G("IDs & links", "drive_link", "Drive link", "url"),

  // ---------------- DATA & LEGAL ----------------
  D("Data request", "gate_pitching", "Pitching", "tri"),
  D("Data request", "gate_artist_profile_verify", "Artist Profile Verify", "tri"),
  D("Data request", "gate_co_trong_net_youtube", "Có Trong Net YouTube", "tri"),
  D("Data request", "gate_pre_order", "Pre-order iTunes", "tri"),
  D("Data request", "gate_lyric_musixmatch", "Priority Sync Lyric", "tri"),
  D("Data request", "gate_mv_spotify", "Music Video on Spotify", "tri"),
  D("Data request", "gate_discovery_mode_spotify", "Discovery Mode on Spotify", "tri"),
  D("Data request", "gate_sony_publish", "Sony Publish", "tri"),
  D("Metadata checklist", "meta_audio", "Audio", "yntext"),
  D("Metadata checklist", "meta_artwork", "Artwork", "yntext"),
  D("Metadata checklist", "meta_working_files", "Working files", "yntext"),
  D("Metadata checklist", "meta_lyric", "Lyric", "yntext"),
  D("Metadata checklist", "meta_mv", "MV", "yntext"),
  D("Metadata checklist", "meta_doc", "Doc", "yntext"),
  D("Legal request", "gate_split_share", "Splitshare", "tri"),
  D("Legal request", "gate_phu_luc_mg", "Phụ Lục MG", "tri"),
  D("Legal request", "gate_phu_luc_publishing", "Phụ Lục Publishing", "tri"),
  D("Legal request", "gate_phu_luc_truyen_thong", "Phụ Lục Truyền Thông", "tri"),
  D("Legal request", "gate_publishing", "Publishing", "tri"),
  D("Legal details", "link_phu_luc", "Phụ lục link", "url"),
  D("Legal details", "link_publishing", "Publishing link", "url"),
  D("Legal details", "phu_luc_gia_tri", "Phụ lục value", "url"),
  D("Legal details", "publishing_gia_tri", "Publishing value", "url"),
  D("Legal details", "phu_luc_ngay_gui", "Phụ lục sent date", "has"),
  D("Legal details", "phu_luc_ngay_ky", "Phụ lục signed date", "has"),
  D("Legal details", "publishing_ngay_gui", "Publishing sent date", "has"),
  D("Legal details", "publishing_ngay_ky", "Publishing signed date", "has"),
  { ...D("Copyright checklist", "cc_master_owner", "Master right: owner filled", "check"), col: "copyright_checklist", path: "master->>owner", exportLabel: "Master right - owner" },
  { ...D("Copyright checklist", "cc_master_contract", "Master right: contract filled", "check"), col: "copyright_checklist", path: "master->>contract", exportLabel: "Master right - contract" },
  { ...D("Copyright checklist", "cc_vocal_owner", "Vocal right: owner filled", "check"), col: "copyright_checklist", path: "vocal->>owner", exportLabel: "Vocal right - owner" },
  { ...D("Copyright checklist", "cc_vocal_contract", "Vocal right: contract filled", "check"), col: "copyright_checklist", path: "vocal->>contract", exportLabel: "Vocal right - contract" },
  { ...D("Copyright checklist", "cc_author_owner", "Author right: owner filled", "check"), col: "copyright_checklist", path: "author->>owner", exportLabel: "Author right - owner" },
  { ...D("Copyright checklist", "cc_author_contract", "Author right: contract filled", "check"), col: "copyright_checklist", path: "author->>contract", exportLabel: "Author right - contract" },

  // ---------------- MARKETING ----------------
  M("Checklist", "gate_artist_profile", "Artist Info", "tri"),
  M("Checklist", "gate_artist_photo", "Artist Photo", "tri"),
  M("Checklist", "gate_project_proposal", "Project Proposal", "tri"),
  M("Marketing request", "gate_design", "Design", "tri"),
  M("Marketing request", "gate_goi_ho_tro_truyen_thong", "Gói Hỗ Trợ Truyền Thông", "tri"),
  M("Links", "artist_portfolio_url", "Artist portfolio link", "url"),
  M("Links", "artist_photo_url", "Artist photo link", "url"),
  M("Links", "project_proposal_url", "Project proposal link", "url"),
  M("Links", "promotion_package_url", "Promotion package link", "url"),
  M("Links", "youtube_ads_url", "YouTube Ads link", "url"),
  M("Links", "ads_perform_url", "Ads Perform link", "url"),
  M("Links", "link_ugc", "UGC link", "url"),
  M("Links", "link_media_report", "Media Report link", "url"),
  M("Links", "link_media_report_custom", "Media Report (custom) link", "url"),
  M("Media", "media_report_status", "Media Report status", "enum", { options: [["ready", "ready"], ["sent", "sent"]], emptyOption: true }),
  M("Media", "int_media_requested", "INT MEDIA follow-up sent", "bool"),
  M("Media", "linkshare_tiktok_timing", "Linkshare TikTok timing set", "url"),
  M("Media", "linkshare_facebook_timing", "Linkshare Facebook timing set", "url"),
  M("Media", "youtube_ads_booking_note", "YouTube Ads booking note", "url"),

  // ---------------- PROCESS (done / not done) ----------------
  P("Stage", "stage", "Release stage", "core"),
  P("Stage", "created", "Release date window", "core"),
  P("Stage", "upload_status", "Upload status", "enum", { options: [["Running", "Running"], ["Pending", "Pending"], ["Cancel", "Cancel"]] }),
  P("Stage", "needs_update", "Needs update", "bool"),
  P("Stage", "requested", "Requested", "bool"),
  P("Stage", "ar_pic_profile_id", "AR PIC assigned", "has"),
  P("Upload", "smartlink", "Smartlink", "url"),
  P("Upload", "link_lbm", "LBM link", "url"),
  P("Upload", "link_share", "Share link", "url"),
  P("Upload", "link_preorder", "Pre-order link", "url"),
  P("Pitching", "priority_pitching", "Priority pitching", "enum", { options: PITCH_OPTS, emptyOption: true }),
  P("Pitching", "pitching_status_spotify", "Spotify pitching", "enum", { options: PITCH_OPTS, emptyOption: true }),
  P("Pitching", "pitching_status_spotify_banner", "Spotify Banner pitching", "enum", { options: PITCH_OPTS, emptyOption: true }),
  P("Pitching", "pitching_status_apple", "Apple pitching", "enum", { options: PITCH_OPTS, emptyOption: true }),
  P("Pitching", "pitching_status_nct", "NCT pitching", "enum", { options: PITCH_DOM_OPTS, emptyOption: true }),
  P("Pitching", "pitching_status_zing", "Zing pitching", "enum", { options: PITCH_DOM_OPTS, emptyOption: true }),
  P("Pre-release", "canva_status", "MV type set (Canva)", "url"),
  P("Pre-release", "canva_mv_status", "MV status set (Canva)", "url"),
  P("Pre-release", "musixmatch_status", "Musixmatch status", "enum", { options: [["Catalog", "Catalog"], ["Added", "Added"], ["Sync", "Sync"]], emptyOption: true }),
  P("Pre-release", "musixmatch_link", "Musixmatch link", "url"),
  P("Pre-release", "nct_lyric", "NCT lyric link", "url"),
  P("Pre-release", "zing_lyric", "Zing lyric link", "url"),
  P("Pre-release", "spotify_mv_link", "Spotify MV link", "url"),
  P("Confirm (re-check)", "artist_pick_status", "Artist Pick", "enum", { options: [["Done", "Done"], ["Uneditible", "Uneditible"], ["Skip", "Skip"]], emptyOption: true }),
  P("Confirm (re-check)", "confirm_spotify_correct", "Spotify correct", "bool"),
  P("Confirm (re-check)", "confirm_apple_correct", "Apple correct", "bool"),
  P("Confirm (re-check)", "confirm_zing_correct", "Zing correct", "bool"),
  P("Confirm (re-check)", "confirm_nct_correct", "NCT correct", "bool"),
  P("Confirm (re-check)", "confirm_fb_correct", "Facebook correct", "bool"),
  P("Confirm (re-check)", "confirm_ytb_correct", "YouTube correct", "bool"),
  P("Confirm (re-check)", "confirm_insta_sound", "Instagram sound", "bool"),
  P("Confirm (re-check)", "confirm_lyrics_canva_check", "Lyrics / Canva check", "bool"),
  P("Confirm (re-check)", "confirm_tiktok_sound_updated", "TikTok sound updated", "bool"),
  P("Confirm (re-check)", "confirm_smartlink_updated", "Smartlink updated", "bool"),
  P("Confirm (re-check)", "confirm_tag", "Tag confirmed", "bool"),
];

export const FIELD_BY_KEY = Object.fromEntries(FILTER_FIELDS.map((x) => [x.key, x]));

// What the user can pick, per kind -> [value, label]. "" (any) is always added by the panel.
export function choicesFor(field, dynamic = {}) {
  switch (field.kind) {
    case "tri": return [["true", "Yes"], ["false", "No"], ["update", "TBU"]];
    case "yntext": case "bool": case "num": return [["yes", "Yes"], ["no", "No"]];
    case "check": return [["yes", "Filled"], ["no", "Empty"]];
    case "url": return [["yes", "Has value / link"], ["no", "Empty"]];
    case "has": return [["yes", "Has a value"], ["no", "Empty"]];
    case "enum": {
      const base = field.lookup ? (dynamic[field.lookup] || []) : (field.options || []);
      return field.emptyOption ? [...base, ["__empty", "(not set)"]] : base;
    }
    default: return [];
  }
}

const clean = (s) => String(s).replace(/[%,()*]/g, " ").trim();

// Apply every advanced filter to a Supabase query builder. "core" fields (type / channel / stage / created / tag) are applied by
// the dashboard's own existing code, not here.
export function applyAdvFilters(q, adv) {
  if (!adv) return q;
  for (const fld of FILTER_FIELDS) {
    if (fld.kind === "core") continue;
    const v = adv[fld.key];
    if (v === undefined || v === null || v === "") continue;
    const col = fld.path ? `${fld.col}->${fld.path}` : fld.col;
    switch (fld.kind) {
      case "tri": case "yntext": q = q.eq(col, v); break;
      case "bool": q = q.eq(col, v === "yes"); break;
      case "num": q = v === "yes" ? q.gt(col, 0) : q.or(`${col}.is.null,${col}.eq.0`); break;
      case "has": q = v === "yes" ? q.not(col, "is", null) : q.is(col, null); break;
      case "url": case "check": q = v === "yes" ? q.neq(col, "") : q.or(`${col}.is.null,${col}.eq.`); break;
      case "enum": q = v === "__empty" ? q.or(`${col}.is.null,${col}.eq.`) : q.eq(col, v); break;
      case "text": { const t = clean(v); if (t) q = q.ilike(col, `%${t}%`); break; }
      default: break;
    }
  }
  return q;
}

// ---------------- export ----------------
const TRI_LABEL = { true: "Yes", false: "No", update: "TBU" };
function exportCell(fld, row) {
  if (fld.path) {
    const [k1, k2] = fld.path.split("->>");
    return row?.[fld.col]?.[k1]?.[k2] || "";
  }
  const v = row?.[fld.col];
  if (v === null || v === undefined) return "";
  switch (fld.kind) {
    case "tri": return TRI_LABEL[v] || v;
    case "yntext": return v === "true" ? "Yes" : v === "false" ? "No" : v;
    case "bool": return v ? "Yes" : "No";
    default: return v;
  }
}

const SKIP_IN_EXPORT = new Set(["stage", "created", "tag"]);   // already in the curated first columns (Stage, Tags)
export const ADV_EXPORT_COLUMNS = FILTER_FIELDS.filter((x) => !SKIP_IN_EXPORT.has(x.key)).map((fld) => ({
  key: `adv_${fld.key}`,
  label: `${fld.group === "data" ? "Data&Legal" : fld.group === "general" ? "General" : fld.group === "marketing" ? "Marketing" : "Process"} | ${fld.section} | ${fld.exportLabel || fld.label}`,
  col: fld.col,
  format: (_, row) => exportCell(fld, row),
}));

// plain detail fields that are not filters (notes, long text, amounts, tags, pitch details…)
const j = (v) => (Array.isArray(v) ? v.join(", ") : v ?? "");
export const EXTRA_EXPORT_COLUMNS = [
  { key: "x_release_time", label: "General | Release time", col: "release_time" },
  { key: "x_brief", label: "General | Brief", col: "brief" },
  { key: "x_main_tags", label: "General | Main artist tags", col: "main_artist_tags", format: (v) => j(v) },
  { key: "x_feat_tags", label: "General | Feature artist tags", col: "feature_artist_tags", format: (v) => j(v) },
  { key: "x_requester", label: "General | Requester", col: "requester_name" },
  { key: "x_pkg_total", label: "General | Package total value", col: "package_total_value" },
  { key: "x_pkg_support", label: "General | VIEENT support", col: "package_vieent_support" },
  { key: "x_pkg_label", label: "General | Label payment", col: "package_label_payment" },
  { key: "x_status", label: "Process | Status", col: "status" },
  { key: "x_updated", label: "Process | Updated at", col: "updated_at" },
  { key: "x_design", label: "Marketing | Design content types", col: "design_content_types", format: (v) => j(v) },
  { key: "x_pitch_genre", label: "Process | Pitch genre", col: "pitch_genre" },
  { key: "x_pitch_mood", label: "Process | Pitch mood", col: "pitch_mood" },
  { key: "x_pitch_instr", label: "Process | Pitch instrumental", col: "pitch_instrumental" },
  { key: "x_pitch_note", label: "Process | Pitch note", col: "pitch_note" },
  { key: "x_pitch_memo", label: "Process | Pitch memo", col: "pitch_memo" },
  { key: "x_note_ar", label: "Notes | AR", col: "note_ar" },
  { key: "x_note_mkt", label: "Notes | Marketing", col: "note_marketing" },
  { key: "x_note_ops", label: "Notes | OPS", col: "note_ops" },
  { key: "x_note_legal", label: "Notes | Legal", col: "note_legal" },
  { key: "x_ar_product_note", label: "Notes | AR product note", col: "ar_product_note" },
  { key: "x_pitching_note", label: "Notes | Pitching", col: "pitching_note" },
  { key: "x_confirm_note", label: "Notes | Confirm", col: "confirm_note" },
  { key: "x_prerelease_note", label: "Notes | Pre-release", col: "pre_release_note" },
  { key: "x_booking_note", label: "Notes | Booking", col: "booking_note" },
];

// the export helper reads row[key] unless a format() is given, so every extra column gets one that reads its real database column
const EXTRA_WITH_FORMAT = EXTRA_EXPORT_COLUMNS.map((c) => ({ ...c, format: (_, row) => (c.format ? c.format(row?.[c.col], row) : row?.[c.col] ?? "") }));

export const EXPORT_DETAIL_COLUMNS = [...ADV_EXPORT_COLUMNS, ...EXTRA_WITH_FORMAT];

// every database column the widened export needs (the dashboard unions this with its own RELEASE_COLUMNS)
export const EXPORT_SELECT_COLUMNS = [...new Set(EXPORT_DETAIL_COLUMNS.map((c) => c.col))];
