// Round 324 — definitions for the LBL_ tag category's 12 codes (see
// RELEASE_TAG_CATEGORIES in lib/releaseTags.js), admin-editable via
// Config → Label Types, shown as a popup from the Labels page's ("Label
// Reference" table, app/labels/page.js) "LBL Tag" column header so anyone
// referencing that column can see what each code actually means. Per
// explicit request: "the THIẾT LẬP FILE has a definition for the label
// type. Can you add a popup (configurable via config) table in the label
// reference, so anyone referencing know what that mean."
//
// Seeded from the team's own "THIẾT LẬP" reference sheet (ACCOUNT_TYPE /
// Nhóm / Tên dùng chung / Câu khách tự nhận ra mình columns), keyed onto
// this app's existing LBL_ codes — every ACCOUNT_TYPE row in that sheet
// maps 1:1 onto an existing code except ACCOUNT_TYPE=ARTIST, which had no
// home in the app's 11-code LBL_ vocabulary; LBL_ARTIST was added
// alongside this (see releaseTags.js) specifically to carry it. Same
// "app_settings row, admin-editable, defaults if never saved" idiom as
// MILESTONE_HIGHLIGHT_SETTING_KEY (lib/milestoneHighlight.js) — only the
// group/name/description TEXT is editable here; the set of codes/short
// labels/pill colors stays owned by RELEASE_TAG_CATEGORIES in
// releaseTags.js, not duplicated into this config.
export const LABEL_TYPE_DEFINITIONS_SETTING_KEY = "label_type_definitions";

// { group, name, description } per LBL_ code, matching the THIẾT LẬP
// sheet's Nhóm / Tên dùng chung / Câu khách tự nhận ra mình columns
// respectively (last one paraphrased into English isn't done here — kept
// verbatim in Vietnamese, same language the source sheet and the rest of
// this app's label vocabulary already uses).
export const DEFAULT_LABEL_TYPE_DEFINITIONS = {
  LBL_ARTIST: {
    group: "Cá nhân",
    name: "Nghệ sĩ",
    description: "Tôi phát hành nhạc của chính tôi",
  },
  LBL_SONGWRITER: {
    group: "Cá nhân",
    name: "Nhạc sĩ",
    description: "Tôi sáng tác, thuê người hát",
  },
  LBL_PRODUCER: {
    group: "Cá nhân",
    name: "Nhà sản xuất bản ghi",
    description: "Tôi sản xuất bản ghi, ca sĩ hát cho tôi",
  },
  LBL_RECORD_LABEL: {
    group: "Công ty nhạc",
    name: "Hãng đĩa",
    description: "Công ty tôi đầu tư và sở hữu bản ghi",
  },
  LBL_ARTIST_MANAGEMENT: {
    group: "Công ty nhạc",
    name: "Công ty quản lý nghệ sĩ",
    description: "Tôi phát hành thay nghệ sĩ tôi quản lý",
  },
  LBL_MUSIC_COMPANY: {
    group: "Công ty nhạc",
    name: "Công ty âm nhạc tích hợp",
    description: "Công ty tôi vừa sở hữu bản ghi của một số nghệ sĩ, vừa phát hành thay nghệ sĩ mà tôi chỉ quản lý",
  },
  LBL_RIGHTS_ACQUIRER: {
    group: "Công ty nhạc",
    name: "Bên mua lại quyền",
    description: "Tôi mua lại hoặc thừa kế kho nhạc đã có",
  },
  LBL_MEDIA_ORG: {
    group: "Tổ chức khác",
    name: "Đơn vị truyền thông, giải trí",
    description: "Tôi phát hành nhạc từ chương trình, phim, game, quảng cáo do tôi sản xuất",
  },
  LBL_RESELLER: {
    group: "Tổ chức khác",
    name: "Đối tác phân phối",
    description: "Tôi mang khách hàng của tôi vào hệ thống",
  },
  LBL_INTERNAL: {
    group: "Tổ chức khác",
    name: "Nội bộ",
    description: "",
  },
  "LBL_SUB-LABEL": {
    group: "Label phụ",
    name: "",
    description: "",
  },
  LBL_END_CONTRACT: {
    group: "",
    name: "",
    description: "Hợp tác/hợp đồng liên quan label này đã kết thúc",
  },
};

export function parseLabelTypeDefinitions(rawValue) {
  if (!rawValue || typeof rawValue !== "object") return DEFAULT_LABEL_TYPE_DEFINITIONS;
  const merged = {};
  for (const code of Object.keys(DEFAULT_LABEL_TYPE_DEFINITIONS)) {
    const saved = rawValue[code];
    merged[code] = saved && typeof saved === "object"
      ? {
          group: typeof saved.group === "string" ? saved.group : DEFAULT_LABEL_TYPE_DEFINITIONS[code].group,
          name: typeof saved.name === "string" ? saved.name : DEFAULT_LABEL_TYPE_DEFINITIONS[code].name,
          description: typeof saved.description === "string" ? saved.description : DEFAULT_LABEL_TYPE_DEFINITIONS[code].description,
        }
      : DEFAULT_LABEL_TYPE_DEFINITIONS[code];
  }
  return merged;
}
