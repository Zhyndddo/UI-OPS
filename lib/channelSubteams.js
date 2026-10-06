// Round 466 — which Marketing subteam a Booking Channels row belongs to,
// for the "My subteam" view on /booking-channels. Same brand->subteam rules
// as the Booking Board scopes (lib/bookingTeamScopes.js), applied to the
// channel's free-text `brand` (the reference sheet's own grouping), falling
// back to its `channel_group` text when brand is blank:
//   CAPCUT -> CAPCUT          (checked first: "capcut" must not fall to VPOP/ENVI)
//   ENVI, BOLERO (incl. "ENVI - MIỀN TÂY/BOLERO") -> ENVI
//   INDIE -> INDIE   VPOP -> VPOP   VIEENT -> VIEENT
// Returns null when nothing matches (no brand/group, or an unknown one) —
// those rows are "unassigned" and stay visible to everyone, never hidden.
export function subteamOfChannel(c) {
  const text = `${c?.brand || ""} ${c?.channel_group || ""}`.toUpperCase();
  const brandOnly = (c?.brand || "").toUpperCase();
  const pick = (t) => {
    if (/CAPCUT/.test(t)) return "CAPCUT";
    if (/ENVI|BOLERO/.test(t)) return "ENVI";
    if (/INDIE/.test(t)) return "INDIE";
    if (/VPOP/.test(t)) return "VPOP";
    if (/VIEENT/.test(t)) return "VIEENT";
    return null;
  };
  return (brandOnly.trim() ? pick(brandOnly) : null) || pick(text);
}

// The existing family tab (Vpop / Indie / Envi) a subteam's channels mostly
// live in — used only to open on a sensible tab. CAPCUT / VIEENT have no
// tab of their own: VIEENT groups sit in the Envi tab, CAPCUT stays on the
// default tab.
export const FAMILY_TAB_FOR_SUBTEAM = { VPOP: "vpop", INDIE: "indie", ENVI: "envi", VIEENT: "envi" };
