// Round 84 — single source of truth for the "Trợ Giá Booking" content
// (title/description/link rows), shared by 3 places that used to disagree
// with each other:
//   1. Config → Trợ Giá Booking (app/config/page.js) — where it's now
//      actually edited, live, in global_settings.
//   2. The internal staff-only reference page (app/tro-gia-booking/page.js)
//      — used to be a hardcoded copy of this same content.
//   3. The artist-facing magic link (app/pick-package/[token]/page.js) —
//      new this round, sits right above the Partner Benefits section.
//
// DEFAULT_TRO_GIA_BOOKING_ITEMS is both the initial seed (see
// add-round84-tro-gia-booking-config.sql, which writes this exact array
// into global_settings so nothing regresses before an admin ever opens
// Config) and the in-app fallback shown while a read is still loading.
export const TRO_GIA_BOOKING_SETTING_KEY = "tro_gia_booking_items";

export const DEFAULT_TRO_GIA_BOOKING_ITEMS = [
  {
    title: "TRỢ GIÁ BOOKING TIKTOK CHANNEL",
    desc: "HỖ TRỢ 10% - 70% CHI PHÍ TRUYỀN THÔNG\n(KHÔNG GIỚI HẠN SỐ LẦN HỖ TRỢ)",
    href: "https://docs.google.com/spreadsheets/d/1Jyuy_QjrDAk3ToG70Ql4O-6w2WMwVPi5IFRJJjWh9JQ/edit?gid=388080288#gid=388080288",
  },
  {
    title: "TRỢ GIÁ BOOKING MẪU CAPCUT (CHỈ XUẤT MẪU)",
    desc: "HỖ TRỢ 50%/MẪU CAPCUT\n(KHÔNG GIỚI HẠN SỐ LẦN HỖ TRỢ)",
    href: "https://docs.google.com/spreadsheets/d/1Jyuy_QjrDAk3ToG70Ql4O-6w2WMwVPi5IFRJJjWh9JQ/edit?gid=1000267329#gid=1000267329",
  },
  {
    title: "RATE CARD ADS VIEENT",
    desc: "Báo giá quảng cáo các nền tảng: Youtube, Facebook, Tiktok",
    href: "https://docs.google.com/spreadsheets/d/1vC-T1Vst4O0CtexP5LSJ2MGGWNQST72xK_vLCcrRJhM/edit?gid=0#gid=0",
  },
];

// Parses the raw global_settings.value text column into an item array,
// falling back to the hardcoded defaults on anything unexpected (missing
// row, malformed JSON) rather than rendering blank.
export function parseTroGiaBookingItems(rawValue) {
  if (!rawValue) return DEFAULT_TRO_GIA_BOOKING_ITEMS;
  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return DEFAULT_TRO_GIA_BOOKING_ITEMS;
  } catch {
    return DEFAULT_TRO_GIA_BOOKING_ITEMS;
  }
}
