// Round 465 — which Booking Board brand columns count toward each Marketing
// subteam's task list (Task Table's "Booking Board" column). Per explicit
// request:
//   VIEENT — Social / VIEENT only
//   INDIE  — every Community / TikTok Channel brand that is INDIE
//            (PAGE INDIE, TIKTOK INDIE)
//   ENVI   — Social / ENVI, plus the BOLERO brands: PAGE BOLERO / MT
//            (Community) and TIKTOK BOLERO / MT (TikTok Channel)
//   CAPCUT — only the CAPCUT brand inside TikTok Channel
//   VPOP   — PAGE VPOP (Community) and TIKTOK VPOP (TikTok Channel)
// Not counted for any team: Ads brands and the EXT TIKTOK partner brands
// (no owner was given for them).
//
// The column shapes below mirror app/booking/page.js's `columns` useMemo
// (the same objects that page hands the booking_board_page() RPC), so the
// Done/Not-Done meaning here is the Booking Board's own — only the scope
// differs. If that useMemo's shapes ever change, change these too.
import { TIKTOK_SUBCHANNELS, PLATFORM_COLUMNS } from "../app/booking/page";

export const BOOKING_ROUNDS = ["INT", "Đợt 1", "Đợt 2"];

export const BOOKING_TEAM_SCOPES = {
  VIEENT: [{ category: "Social", brand: "VIEENT" }],
  INDIE: [
    { category: "Community", brand: "PAGE INDIE" },
    { category: "TikTok Channel", brand: "TIKTOK INDIE" },
  ],
  ENVI: [
    { category: "Social", brand: "ENVI" },
    { category: "Community", brand: "PAGE BOLERO / MT" },
    { category: "TikTok Channel", brand: "TIKTOK BOLERO / MT" },
  ],
  CAPCUT: [{ category: "TikTok Channel", brand: "CAPCUT" }],
  VPOP: [
    { category: "Community", brand: "PAGE VPOP" },
    { category: "TikTok Channel", brand: "TIKTOK VPOP" },
  ],
};

export function bookingColumnsForScope(scope) {
  return scope.flatMap(({ category, brand }) => {
    if (category === "TikTok Channel") {
      return TIKTOK_SUBCHANNELS.map((sub) => ({ key: `${category}:${brand}:${sub}`, label: sub, categoryName: category, brand, platform: null, subchannelType: sub }));
    }
    if (category === "Community") {
      return PLATFORM_COLUMNS.map((p) => ({ key: `${category}:${brand}:${p}`, label: p, categoryName: category, brand, platform: null, subchannelType: p }));
    }
    // Social
    return PLATFORM_COLUMNS.map((p) => ({ key: `${category}:${brand}:${p}`, label: p, categoryName: category, brand, platform: p, subchannelType: null }));
  });
}
