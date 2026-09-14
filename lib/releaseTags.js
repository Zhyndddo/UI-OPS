"use client";

import { useState } from "react";
import { MARKETING_SUBTEAM_TAGS } from "./projectTags";

// Round 319 — unified release tag system. Replaces the single-purpose
// PRJ-only mechanism (lib/projectRightsType.js, releases.project_rights_type)
// with one array field (releases.tags text[]) holding:
//   - exactly one active tag from each of 3 REQUIRED categories below
//     (PRJ/PUB/LBL — "a requisition", single-select within the category,
//     same shape the old PRJ tag already had), and
//   - any number of freeform tags outside those categories ("then they
//     can choose whatever").
// Per explicit spec. lib/projectRightsType.js and the old PRJ column are
// DELIBERATELY left untouched — they're still the real, independent
// storage for 3 OTHER things that were never meant to fold into this:
// app/new-release/page.js's own project_rights_type field on new
// releases, batch_phai_sinh_items.project_rights_type (its own column,
// no DID/UPC to backfill against), and tickets.data.projectRightsType on
// the Phái Sinh ticket itself. Only releases.tags is new here.
//
// PRJ's 3 codes (PRJ_INHOUSE/PRJ_LICENSED/PRJ_OWNED) carry over exactly
// as they were, widened with PRJ_UNKNOWN and PRJ_END per explicit
// request. Older/discontinued codes not listed here (to be backfilled
// later) still render correctly if already stored on a release — see
// releaseTagInfo's fallback below, same "never silently drop a value"
// convention this app already uses for group/column labels.
//
// Reused existing shared.module.css pill tokens (pillGreen/pillOrange/
// pillPublishing/pillGray/pillSplitshare/pillPhuLucMg) rather than adding
// new CSS — PUB and LBL just cycle through the same small palette PRJ
// already used.
export const RELEASE_TAG_CATEGORIES = [
  {
    key: "PRJ",
    label: "Loại Dự Án",
    prefix: "PRJ_",
    options: [
      { code: "PRJ_INHOUSE", label: "Dự án tự sản xuất", short: "In-house", requirement: "Chỉ cần Xác nhận và ghi credit đúng thông tin của label.", pillClass: "pillGreen" },
      { code: "PRJ_LICENSED", label: "Dự án mua cấp phép", short: "Licensed", requirement: "Cung cấp HĐ Cấp Phép đủ 3 quyền từ chủ sở hữu hoặc đơn vị quản lý quyền (có đủ thông tin người cấp và thời hạn cấp phép).", pillClass: "pillOrange" },
      { code: "PRJ_OWNED", label: "Dự án mua đứt quyền sở hữu vĩnh viễn", short: "Owned outright", requirement: "Cung cấp các HĐ Mua Bán đủ 3 quyền (có đủ thông tin người chuyển nhượng và thời hạn sở hữu).", pillClass: "pillPublishing" },
      { code: "PRJ_UNKNOWN", label: "Chưa xác định", short: "Unknown", requirement: "Chưa xác định loại dự án — cập nhật khi có thông tin.", pillClass: "pillGray" },
      { code: "PRJ_END", label: "Đã kết thúc hợp tác", short: "Ended", requirement: "Hợp tác/hợp đồng liên quan dự án này đã kết thúc.", pillClass: "pillSplitshare" },
    ],
  },
  {
    key: "PUB",
    label: "Publishing",
    prefix: "PUB_",
    options: [
      { code: "PUB_AUTHOR", label: "Tác giả tự quản lý publishing", short: "Author", pillClass: "pillGreen" },
      { code: "PUB_VIEENT", label: "VIEENT quản lý publishing", short: "VIEENT", pillClass: "pillOrange" },
      { code: "PUB_VCPMC", label: "VCPMC quản lý publishing", short: "VCPMC", pillClass: "pillPublishing" },
      { code: "PUB_OWNER", label: "Chủ sở hữu khác quản lý publishing", short: "Owner", pillClass: "pillGray" },
    ],
  },
  {
    key: "LBL",
    label: "Label Relationship",
    prefix: "LBL_",
    options: [
      { code: "LBL_SONGWRITER", label: "Songwriter", short: "Songwriter", pillClass: "pillGreen" },
      { code: "LBL_PRODUCER", label: "Producer", short: "Producer", pillClass: "pillOrange" },
      { code: "LBL_RECORD_LABEL", label: "Record Label", short: "Record Label", pillClass: "pillPublishing" },
      { code: "LBL_ARTIST_MANAGEMENT", label: "Artist Management", short: "Artist Mgmt", pillClass: "pillSplitshare" },
      { code: "LBL_MUSIC_COMPANY", label: "Music Company", short: "Music Co.", pillClass: "pillPhuLucMg" },
      { code: "LBL_RIGHTS_ACQUIRER", label: "Rights Acquirer", short: "Rights Acquirer", pillClass: "pillOrange" },
      { code: "LBL_MEDIA_ORG", label: "Media Org", short: "Media Org", pillClass: "pillGreen" },
      { code: "LBL_RESELLER", label: "Reseller", short: "Reseller", pillClass: "pillPublishing" },
      { code: "LBL_INTERNAL", label: "Internal", short: "Internal", pillClass: "pillGray" },
      { code: "LBL_SUB-LABEL", label: "Sub-label", short: "Sub-label", pillClass: "pillSplitshare" },
      { code: "LBL_END_CONTRACT", label: "End Contract", short: "End Contract", pillClass: "pillGray" },
    ],
  },
];

const CATEGORY_BY_PREFIX = RELEASE_TAG_CATEGORIES.reduce((m, c) => ((m[c.prefix] = c), m), {});

function categoryForCode(code) {
  if (!code) return null;
  return RELEASE_TAG_CATEGORIES.find((c) => code.startsWith(c.prefix)) || null;
}

// Info for ANY code, including one that's since been retired from a
// category's `options` list — still renders with its raw code as the
// label rather than disappearing, matching the header comment's
// "never silently drop a value" convention.
export function releaseTagInfo(code) {
  const cat = categoryForCode(code);
  const opt = cat?.options.find((o) => o.code === code);
  if (opt) return { ...opt, category: cat.key };
  if (cat) return { code, label: code, short: code.slice(cat.prefix.length), pillClass: "pillGray", category: cat.key };
  return { code, label: code, short: code, pillClass: "pillGray", category: null };
}

export function releaseTagPillClass(styles, code) {
  const info = releaseTagInfo(code);
  return styles[info.pillClass] || styles.pillGray;
}

// Backward-compat read: a release that hasn't been through the SQL
// backfill yet (sql/pending/add-round319-release-tags.sql) has an empty
// `tags` array but still has its old single-select project_rights_type
// value — treat that as this release's effective PRJ tag until the
// backfill runs (or until someone edits any tag here, which writes the
// real array going forward). Never mutates the release, just what's
// DISPLAYED.
export function effectiveReleaseTags(release) {
  const tags = release?.tags;
  if (Array.isArray(tags) && tags.length > 0) return tags;
  if (release?.project_rights_type) return [release.project_rights_type];
  return [];
}

// Round 320 — LBL's label-side "reference" default (labels.default_lbl_tag,
// see sql/pending/add-round320-labels-default-lbl-tag.sql). A release's
// own LBL tag always wins if it has one; the label row's default is only
// the fallback for a release that doesn't. Pass `labelRow` as whatever
// was fetched from `labels` for this release's `label` name (or null/
// undefined if not loaded/found — resolves to null just like "no tag").
export function resolveLblTag(tags, labelRow) {
  return getCategoryTag(tags, "LBL") || labelRow?.default_lbl_tag || null;
}

// Round 320 — for a read-only display list (the Releases index's Tags
// column) rather than a single category picker: returns `tags` with the
// label's reference LBL default appended IF this release has no LBL tag
// of its own. Never touches an LBL tag the release already has.
export function displayTagsWithLblFallback(tags, labelRow) {
  if (getCategoryTag(tags, "LBL")) return tags || [];
  const fallback = labelRow?.default_lbl_tag;
  return fallback ? [...(tags || []), fallback] : tags || [];
}

export function getCategoryTag(tags, categoryKey) {
  const cat = RELEASE_TAG_CATEGORIES.find((c) => c.key === categoryKey);
  if (!cat) return null;
  return (tags || []).find((t) => t.startsWith(cat.prefix)) || null;
}

// Round 321 — Marketing's per-subteam tags (lib/projectTags.js's
// MARKETING_SUBTEAM_TAGS — INDIE/VPOP/ENVI/VIEENT; releases.subteam_tags,
// a {name: boolean} map going back to Round 261/262) folded into this
// SAME releases.tags array for storage, per explicit spec ("fold into
// this for storage and appearance in the detail page, the index page
// stay the same"). Unlike PRJ/PUB/LBL these are NOT single-select —
// any number can be on at once — and unlike freeform tags they must
// stay invisible/uneditable outside Marketing (lib/permissions.js's
// canViewSubteamColumn/visibleSubteamsFor — left completely unchanged
// by this), so getFreeTags() below explicitly excludes them: they must
// never show up as a plain removable chip in ReleaseTagsRow for an
// OPS/AR/Legal viewer, and the index page/detail page's own existing
// subteam UI (unchanged in appearance) is still the only place they're
// shown or edited.
//
// SUBTEAM_MIGRATED_MARKER is a private, never-displayed entry appended
// to `tags` the first time a release's subteam data is folded in (by
// the SQL backfill, or lazily on first edit here) — its ONLY job is to
// disambiguate "migrated, and every subteam tag happens to be off" from
// "never migrated yet, trust the legacy subteam_tags column instead."
// Without it, a release with exactly one subteam tag on would look
// indistinguishable from a fresh/never-migrated release the moment that
// one tag was turned back off (both have zero subteam names left in
// `tags`), and reads would silently revert to the (by then stale)
// legacy column.
const SUBTEAM_MIGRATED_MARKER = "_subteam_migrated";

function seededSubteamTags(release) {
  const rawTags = release?.tags || [];
  if (rawTags.includes(SUBTEAM_MIGRATED_MARKER)) return rawTags;
  return [
    ...rawTags,
    SUBTEAM_MIGRATED_MARKER,
    ...MARKETING_SUBTEAM_TAGS.filter((name) => !!(release?.subteam_tags || {})[name]),
  ];
}

// Backward-compat read, same shape as effectiveReleaseTags() above — a
// release that hasn't been through sql/pending/add-round321-fold-
// subteam-tags.sql yet still reads its old subteam_tags column until
// the first edit here (or that migration) writes the real array.
export function effectiveSubteamTags(release) {
  const tags = release?.tags || [];
  if (tags.includes(SUBTEAM_MIGRATED_MARKER)) {
    return MARKETING_SUBTEAM_TAGS.filter((name) => tags.includes(name));
  }
  return MARKETING_SUBTEAM_TAGS.filter((name) => !!(release?.subteam_tags || {})[name]);
}

// Returns a NEW tags array with `name` explicitly set on/off — seeds the
// migration marker + any true legacy values first if this release hasn't
// been folded in yet, so a not-yet-backfilled release's OTHER already-
// true subteam tags are never silently dropped by an edit to just one of
// them.
export function setSubteamTagValue(release, name, on) {
  const seeded = seededSubteamTags(release);
  const without = seeded.filter((t) => t !== name);
  return on ? [...without, name] : without;
}

// The additive toggle the header/index buttons actually call — flips
// whatever effectiveSubteamTags() currently reads as this release's
// state for `name`.
export function toggledSubteamTags(release, name) {
  return setSubteamTagValue(release, name, !effectiveSubteamTags(release).includes(name));
}

// Freeform tags — anything in the array that isn't one of the 3 fixed
// categories' codes, one of Marketing's subteam names, or the private
// migration marker above.
export function getFreeTags(tags) {
  return (tags || []).filter(
    (t) => !categoryForCode(t) && !MARKETING_SUBTEAM_TAGS.includes(t) && t !== SUBTEAM_MIGRATED_MARKER
  );
}

// Returns a NEW tags array with `categoryKey`'s active tag replaced by
// `code` (or removed entirely if code is null/empty) — single-select
// within a category, same "picking a different one of N" shape the old
// PRJ tag always had, not an additive toggle.
export function setCategoryTag(tags, categoryKey, code) {
  const cat = RELEASE_TAG_CATEGORIES.find((c) => c.key === categoryKey);
  if (!cat) return tags || [];
  const next = (tags || []).filter((t) => !t.startsWith(cat.prefix));
  if (code) next.push(code);
  return next;
}

export function addFreeTag(tags, text) {
  const t = String(text || "").trim();
  if (!t) return tags || [];
  if ((tags || []).includes(t)) return tags || [];
  return [...(tags || []), t];
}

export function removeFreeTag(tags, text) {
  return (tags || []).filter((t) => t !== text);
}

// One category's picker pill + popup — same "small popup anchored right
// under the pill" pattern as the old lib/ProjectRightsTypeTag.js (which
// this generalizes; that file is untouched, still serving its 3
// independent call sites — see the header comment above).
export function ReleaseTagCategoryPicker({ styles, category, value, canEdit, onChange, align = "left" }) {
  const [open, setOpen] = useState(false);
  const info = value ? releaseTagInfo(value) : null;

  if (!canEdit) {
    return info ? (
      <span className={`${styles.pill} ${styles[info.pillClass] || styles.pillGray}`} title={info.requirement || info.label}>{info.short}</span>
    ) : (
      <span style={{ color: "var(--text-faint)", fontSize: 11 }}>—</span>
    );
  }

  return (
    <span style={{ position: "relative", display: "inline-block" }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={info ? `${styles.pill} ${styles[info.pillClass] || styles.pillGray}` : undefined}
        style={
          info
            ? { border: "none", cursor: "pointer" }
            : { fontSize: 11, color: "var(--text-faint)", background: "none", border: "1px dashed var(--border-strong)", borderRadius: 10, padding: "2px 8px", cursor: "pointer" }
        }
        title={info ? (info.requirement || info.label) : `Click to set ${category.label}`}
      >
        {info ? info.short : `+ ${category.label}`}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 449 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: "absolute", top: "calc(100% + 4px)", [align]: 0, zIndex: 450,
              minWidth: 240, maxWidth: 320, background: "var(--bg-card)", border: "1px solid var(--border-strong)",
              borderRadius: 8, padding: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            {category.options.map((o) => (
              <button
                key={o.code}
                type="button"
                onClick={() => { onChange(o.code); setOpen(false); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: value === o.code ? "rgba(255,255,255,0.06)" : "none",
                  border: "none", borderRadius: 6, padding: "6px 8px", marginBottom: 2, cursor: "pointer", color: "var(--text)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  <span className={`${styles.pill} ${styles[o.pillClass] || styles.pillGray}`}>{o.short}</span>
                  {o.label}
                </div>
                {o.requirement && <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>{o.requirement}</div>}
              </button>
            ))}
            {value && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid var(--border-strong)", marginTop: 4, paddingTop: 6, fontSize: 11, color: "var(--text-faint)", cursor: "pointer" }}
              >
                Clear tag
              </button>
            )}
          </div>
        </>
      )}
    </span>
  );
}

// The full header "Tags" row — every required category's picker
// (editable or read-only pill, per canEdit) plus freeform extra tags as
// removable chips and a small "+ tag" text input to add more. `tags` is
// the release's effective array (pass effectiveReleaseTags(release), not
// release.tags directly, so a not-yet-backfilled release still shows its
// legacy PRJ value here).
// `resolvedValues` (optional): { [categoryKey]: code } — overrides what's
// DISPLAYED for that category's picker (e.g. LBL falling back to the
// label's reference default via resolveLblTag when the release has no
// LBL tag of its own — see app/releases/[id]/page.js). Editing still
// only ever writes the release's own explicit tag, never the fallback
// value itself.
export function ReleaseTagsRow({ styles, tags, canEdit, onChange, resolvedValues = {} }) {
  const [addingFree, setAddingFree] = useState(false);
  const [freeDraft, setFreeDraft] = useState("");
  const freeTags = getFreeTags(tags);

  function commitFreeTag() {
    const next = addFreeTag(tags, freeDraft);
    setFreeDraft("");
    setAddingFree(false);
    if (next !== tags) onChange(next);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {RELEASE_TAG_CATEGORIES.map((cat) => (
        <ReleaseTagCategoryPicker
          key={cat.key}
          styles={styles}
          category={cat}
          value={resolvedValues[cat.key] !== undefined ? resolvedValues[cat.key] : getCategoryTag(tags, cat.key)}
          canEdit={canEdit}
          onChange={(code) => onChange(setCategoryTag(tags, cat.key, code))}
        />
      ))}
      {freeTags.map((t) => (
        <span key={t} className={`${styles.pill} ${styles.pillGray}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {t}
          {canEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(removeFreeTag(tags, t)); }}
              title={`Remove "${t}"`}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontSize: 11, lineHeight: 1, opacity: 0.7 }}
            >
              ✕
            </button>
          )}
        </span>
      ))}
      {canEdit && (
        addingFree ? (
          <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input
              autoFocus
              value={freeDraft}
              onChange={(e) => setFreeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitFreeTag();
                if (e.key === "Escape") { setFreeDraft(""); setAddingFree(false); }
              }}
              onBlur={commitFreeTag}
              placeholder="Tag name…"
              style={{ fontSize: 11, padding: "2px 6px", borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--bg)", color: "var(--text)", width: 100 }}
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setAddingFree(true); }}
            style={{ fontSize: 11, color: "var(--text-faint)", background: "none", border: "1px dashed var(--border-strong)", borderRadius: 10, padding: "2px 8px", cursor: "pointer" }}
          >
            + tag
          </button>
        )
      )}
    </div>
  );
}
