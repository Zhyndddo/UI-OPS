// Round 294 — project rights-type tag, per explicit request from AR/OPS:
// "add tag cho toàn bộ product: new và phái sinh" — classifies every
// product (New Release AND Phái Sinh alike) into exactly ONE of 3 rights
// situations. Single-select (unlike Marketing's independent subteam_tags
// booleans, Round 261) — one column holding one of these 3 codes (or
// null/unset), not a column-per-type toggle set.
export const PROJECT_RIGHTS_TYPES = [
  {
    code: "PRJ_INHOUSE",
    label: "Dự án tự sản xuất",
    short: "In-house",
    requirement: "Chỉ cần Xác nhận và ghi credit đúng thông tin của label.",
  },
  {
    code: "PRJ_LICENSED",
    label: "Dự án mua cấp phép",
    short: "Licensed",
    requirement: "Cung cấp HĐ Cấp Phép đủ 3 quyền từ chủ sở hữu hoặc đơn vị quản lý quyền (có đủ thông tin người cấp và thời hạn cấp phép).",
  },
  {
    code: "PRJ_OWNED",
    label: "Dự án mua đứt quyền sở hữu vĩnh viễn",
    short: "Owned outright",
    requirement: "Cung cấp các HĐ Mua Bán đủ 3 quyền (có đủ thông tin người chuyển nhượng và thời hạn sở hữu).",
  },
];

export function projectRightsTypeInfo(code) {
  return PROJECT_RIGHTS_TYPES.find((t) => t.code === code) || null;
}

// Reuses shared.module.css's existing pill color tokens (same ones
// lib/projectTags.js's subteamTagPillClass already draws from) rather
// than inventing new ones.
const PILL_CLASS = {
  PRJ_INHOUSE: "pillGreen",
  PRJ_LICENSED: "pillOrange",
  PRJ_OWNED: "pillPublishing",
};

export function projectRightsTypePillClass(styles, code) {
  return styles[PILL_CLASS[code]] || styles.pillGray;
}
