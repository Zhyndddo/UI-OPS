// Round 86 item 5 — "product tag" pills: small pills shown under a
// release's Name (dashboard) and next to its Name row (detail page),
// one per: Publishing (the round-72 standalone type, NOT Phụ Lục
// Publishing), Splitshare, and Phụ Lục MG — a pill shows only if that
// release currently has an ACTIVE (non-deleted) ticket of that type.
// Ticket existence is the same authority GateTicketLink already uses
// (lib/GateFields.js), not any gate boolean column.
//
// Publishing tickets are matched by data.releaseId === the release's own
// id (its real UUID/PK) — see app/tickets/publishing/page.js. Splitshare
// and Phụ Lục MG (like every other GATE_TICKET_TYPES-driven type) are
// matched by data.releaseId === the release's did. Mixing these two
// lookup keys in one config, rather than assuming "did" for all three, is
// exactly the release.id-vs-did mismatch flagged for item 4 — see
// lib/GateFields.js's GATE_TICKET_TYPES comment on gate_publishing.
export const PRODUCT_TAG_TYPES = [
  { key: "publishing", label: "Publishing", ticketType: "publishing", matchBy: "id", pillClass: "pillPublishing" },
  { key: "splitshare", label: "Splitshare", ticketType: "split_share", matchBy: "did", pillClass: "pillSplitshare" },
  { key: "phu_luc_mg", label: "Phụ Lục MG", ticketType: "phu_luc_mg", matchBy: "did", pillClass: "pillPhuLucMg" },
];

// One batched fetch for all 3 types at once (3 queries total, fixed cost
// regardless of how many releases are on screen) — same N+1-avoidance
// idiom as the gateTicketTypeKeys batch in app/releases/[id]/page.js.
// Returns { publishing: Set<release.id>, splitshare: Set<release.did>,
// phu_luc_mg: Set<release.did> }. Safe to call from either the dashboard
// (many releases) or the release detail page (one release) — the query
// cost is the same either way.
export async function fetchProductTagSets(supabase) {
  const sets = {};
  PRODUCT_TAG_TYPES.forEach((t) => (sets[t.key] = new Set()));
  if (!supabase) return sets;

  const tabKeys = PRODUCT_TAG_TYPES.map((t) => t.ticketType);
  const { data: tabs } = await supabase.from("ticket_tabs").select("id, key").in("key", tabKeys);
  if (!tabs || tabs.length === 0) return sets;

  const tabIdToTag = {};
  tabs.forEach((tab) => {
    const cfg = PRODUCT_TAG_TYPES.find((t) => t.ticketType === tab.key);
    if (cfg) tabIdToTag[tab.id] = cfg;
  });

  // Round 154 — a ticket used to count as "active" for tag purposes just
  // by existing (not soft-deleted), regardless of its status. Reported
  // bug: a mistakenly-ticked Splitshare gate, unticked and its ticket
  // REFUNDED, still showed the "Splitshare" pill on the dashboard — the
  // ticket row still existed, so it still counted. Per explicit request,
  // the fix is a real CANCEL status (added to the split_share ticket
  // type's ticket_tabs.status_options — see the accompanying SQL) rather
  // than repurposing REFUND, since REFUND deliberately means something
  // else elsewhere in the app (see notDoneCounts.js's TERMINAL_EXECUTOR
  // comment — "kicked back, still the requester's problem", not dead). A
  // ticket with status NULL (legacy rows predating a status column) or
  // CANCEL no longer counts as active for any of the 3 tag types sharing
  // this function.
  const { data: tix } = await supabase
    .from("tickets")
    .select("data, tab_id, status")
    .in("tab_id", tabs.map((t) => t.id))
    .is("deleted_at", null);

  (tix || []).forEach((t) => {
    if (!t.status || t.status === "CANCEL") return;
    const cfg = tabIdToTag[t.tab_id];
    const val = t.data?.releaseId;
    if (cfg && val) sets[cfg.key].add(val);
  });

  return sets;
}

// Which PRODUCT_TAG_TYPES entries are active for a given release, given
// the Sets fetchProductTagSets() returned.
export function activeProductTags(release, tagSets) {
  if (!release || !tagSets) return [];
  return PRODUCT_TAG_TYPES.filter((t) => {
    const val = t.matchBy === "id" ? release.id : release.did;
    return val && tagSets[t.key]?.has(val);
  });
}

// Renders the pill row itself — nothing if no tags are active, so callers
// can drop this in unconditionally.
export function ProductTagPills({ styles, release, tagSets, style }) {
  const active = activeProductTags(release, tagSets);
  if (active.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", ...style }}>
      {active.map((t) => (
        <span key={t.key} className={`${styles.pill} ${styles[t.pillClass]}`}>
          {t.label}
        </span>
      ))}
    </div>
  );
}
