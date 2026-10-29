// Round 564 — public/SEO side of the channel-reference share page (/channels/<token>).
// Everything the page shows is public EXCEPT the rate tables (Google Sheets) and the links that lead to them.
// Those are never put in the server-rendered HTML nor in any data the page loads by itself: they are fetched only
// after a visitor presses "View rates" (the "prices=1" flag below). Crawlers never press buttons.
export const SITE_URL = "https://internal.vieent.com";

// Tokens that Google may index (listed in sitemap.xml, robots.txt allows them, no noindex).
// Every other /channels/<token> link stays unindexed. Add a token here to make another link searchable.
export const SEO_INDEXED_TOKENS = ["vsounder"];

// Same string as DISTRIBUTION_GROUP in app/channels/[token]/ChannelReferenceClient.js — that group's one row only
// carries the "Click for more detail" link to the rate sheet.
export const DISTRIBUTION_GROUP = "Distribution Support - MEDIA BOOKING CHANNEL";

const parse = (v) => { if (v == null) return null; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return null; } };

// Channel rows as the public sees them before "View rates": the rate-sheet link is removed.
export function publicChannelRows(rows, prices = false) {
  if (prices) return rows || [];
  return (rows || []).map((r) => (r.channel_group === DISTRIBUTION_GROUP ? { ...r, url: null } : r));
}

// Intro as the public sees it before "View rates": sheet URLs removed, flags say whether they exist.
export function publicIntro(intro, prices = false) {
  const i = intro || {};
  if (prices) return { ...i, hasSheet: !!i.sheetUrl, hasSheet2: !!i.sheetUrl2 };
  return { title: i.title || "", text: i.text || "", canvaUrl: i.canvaUrl || "", sheetUrl: "", sheetUrl2: "", hasSheet: !!i.sheetUrl, hasSheet2: !!i.sheetUrl2 };
}

// Raw global_settings value (JSON string) -> value safe to hand out before "View rates".
export function publicSettingValue(key, rawValue, prices = false) {
  if (prices) return rawValue;
  if (key === "channel_reference_intro") {
    const p = parse(rawValue);
    if (!p) return rawValue;
    return JSON.stringify({ ...p, sheetUrl: "", sheetUrl2: "", hasSheet: !!p.sheetUrl, hasSheet2: !!p.sheetUrl2 });
  }
  if (key === "channel_reference_sheet_snapshot") {
    const p = parse(rawValue);
    if (!p) return rawValue;
    return JSON.stringify({ ...p, sheetUrl: "" });
  }
  return rawValue;
}
