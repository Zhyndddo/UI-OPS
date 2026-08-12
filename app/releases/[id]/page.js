"use client";

import AppShell from "../../../lib/AppShell";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, formatDetailText } from "../../../lib/helpers";
import { GateFields, GateToggle, GateGrid, MARKETING_CHECKLIST_FIELDS, GATE_TICKET_TYPES, CO_TRONG_NET_DRAFT_DEFAULTS } from "../../../lib/GateFields";
import QuickCreate from "../../../lib/QuickCreate";
import { LabelInput, ArtistInput } from "../../../lib/ReferenceInputs";
import UrlField from "../../../lib/UrlField";
import { validateLabelNameEdit } from "../../../lib/labelHelpers";
import { MV_TYPE_OPTIONS, LABEL_HOP_TAC_OPTIONS } from "../../../lib/pickerOptions";
import { hopTacTagStatus, hopTacStatusColor, publishingHdDone } from "../../../lib/labelHopTacStatus";
import PickSelect from "../../../lib/PickSelect";
import { TICKET_TYPE_LABELS, TEAMS, REPORTING_TEAMS } from "../../../lib/teamTypes";
import { buildProductNote, buildLinkshareNote, LINKSHARE_TIKTOK_OPTIONS, LINKSHARE_FACEBOOK_OPTIONS, PRIORITY_MODE_WARNING } from "../../../lib/releaseNotes";
import { useAuth } from "../../../lib/AuthContext";
import { isDev } from "../../../lib/permissions";
import { runOne } from "../../../lib/packageSimulator";
import { fetchProductTagSets, ProductTagPills } from "../../../lib/productTags";
import { recomputeDid } from "../../../lib/didHelpers";
import RelatedDidField from "../../../lib/RelatedDidField";
import CopyrightChecklistFields from "../../../lib/CopyrightChecklistFields";
import styles from "../../shared.module.css";

const TABS = [
  { key: "overview", label: "Tổng Hợp" },
  { key: "copyrights", label: "Copyrights" },
  { key: "url", label: "URL" },
  { key: "media_booking", label: "Media Booking" },
  { key: "pitching", label: "Pitching" },
  { key: "pre_release", label: "Pre-release & Note" },
  { key: "streaming_milestone", label: "Streaming/Milestone" },
  { key: "tasklist", label: "Tasklist" },
];

// Round 80 — "SENT TO MARKETING" is the new interlude stage between
// BRIEF & DATA and DEALING: entered the moment the Package Ticket is sent
// to Marketing, held while Marketing is still building it, and left for
// DEALING only once that Media Booking ticket is marked COMPLETE (see the
// media-booking ticket list's updateStatus). Treated identically to the
// other two pipeline stages everywhere in this file (still "no real
// package resolved yet").
const PIPELINE_STAGES = ["BRIEF & DATA", "SENT TO MARKETING", "DEALING"];

const META_ITEMS = [
  { key: "meta_audio", label: "Audio" },
  { key: "meta_artwork", label: "Artwork" },
  { key: "meta_working_files", label: "Working Files" },
  { key: "meta_lyric", label: "Lyric" },
  { key: "meta_mv", label: "MV" },
  { key: "meta_doc", label: "Metadata" },
];

// Send Upload only actually needs these 4 — Working Files and MV are
// tracked here for completeness but no longer gate the ticket. Keeping
// this as a subset of META_ITEMS (by key) instead of a separate list so
// the two can never drift out of sync on labels.
const REQUIRED_META_KEYS = ["meta_audio", "meta_artwork", "meta_lyric", "meta_doc"];

export default function ReleaseDetailPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  // Round 77 — item 4: both new Package Actions buttons below run the same
  // "simulation" commit Package Runner uses (lib/packageSimulator.js),
  // originally restricted to dev only (item 4a) to keep this access point
  // consistent with the dev-only Package Runner page.
  //
  // Round 83 item 1 — per explicit request, opened up to every AR team
  // member (any role tier, not just dev) since these buttons are AR's own
  // day-to-day tool, not a dev-only simulation shortcut. Package Runner
  // itself (the standalone page, see lib/permissions.js's
  // canRunPackageSimulator) is untouched — still dev/admin+Marketing only.
  const canSimulate = isDev(profile) || profile?.segment === "AR";
  const [release, setRelease] = useState(null);
  const [form, setForm] = useState(null);
  const [pitchingTicket, setPitchingTicket] = useState(null);
  const [pitchingTypesDraft, setPitchingTypesDraft] = useState({ priority: false, spotify: false, apple: false, nct: false, zing: false });
  const [artistProfileTicket, setArtistProfileTicket] = useState(null);
  const [artistProfileTypesDraft, setArtistProfileTypesDraft] = useState({ spotify: false, tiktok: false, apple: false });
  const [tab, setTab] = useState("overview");
  // Round 86 follow-up item 3 — which team's note the top-right
  // ReleaseNotePanel is currently showing/editing (see NOTE_PANEL_TEAMS
  // below). Lives here, not in OverviewTab, since the panel itself renders
  // from this component.
  const [topNoteTeam, setTopNoteTeam] = useState(NOTE_PANEL_TEAMS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [packageItems, setPackageItems] = useState([]);
  const [bookingEntries, setBookingEntries] = useState([]);
  const [bookingCategories, setBookingCategories] = useState([]); // package_categories — for the Media Booking tab's per-Hạng-Mục summary
  const [magicLinkUrl, setMagicLinkUrl] = useState(null);
  const [hasMediaBookingTicket, setHasMediaBookingTicket] = useState(false);
  // Full Media Booking ticket row (not just the existence boolean above) —
  // needed for the reopen/rebook cycle: reading its live status (to know
  // whether "Send Package" should be clickable again) and its data.feedback
  // (the artist's Feed Back submission from the magic link page, shown here
  // in a small box so AR can see what changed before resending).
  const [mediaBookingTicket, setMediaBookingTicket] = useState(null);
  const [pitchingInfoTicket, setPitchingInfoTicket] = useState(null);
  // One ticket per Data Request/Marketing Request/Legal Request field that
  // has a related ticket type (see lib/GateFields.js GATE_TICKET_TYPES) —
  // keyed by ticket TYPE key (e.g. "co_trong_net_youtube"), not gate field
  // key, so it can be handed straight to <GateFields ticketMap=.../>.
  const [gateTicketMap, setGateTicketMap] = useState({});
  // ticket_tabs row (id + default_status) per GATE_TICKET_TYPES ticket
  // type, keyed by ticket TYPE key — fetched once on load alongside
  // gateTicketMap above, so saveTab() below can create any missing gate
  // tickets without an extra read per type on every single save.
  const [gateTabsMap, setGateTabsMap] = useState({});
  // Round 86 item 5 — see lib/productTags.js
  const [productTagSets, setProductTagSets] = useState({});
  // Có Trong Net YouTube's own draft (Teaser/Official/Short from-to/Mô Tả)
  // — same "local draft state, only written on Save" pattern as
  // pitchingTypesDraft/artistProfileTypesDraft above, seeded once from the
  // existing ticket's data (if any) once the batched gate-ticket fetch
  // below resolves.
  const [coTrongNetDraft, setCoTrongNetDraft] = useState(CO_TRONG_NET_DRAFT_DEFAULTS);
  const searchParams = useSearchParams();
  const mediaBookingSectionRef = useRef(null);
  const [autoScrolled, setAutoScrolled] = useState(false);

  // Round 79 — item 2: "pseudo package" — a single spun off from an EP/
  // Album can be linked (via Track DID, on the Overview tab) to its parent
  // product instead of going through the whole booking process itself.
  // Live-linked per explicit request: this always re-reads the parent's
  // CURRENT package/magic-link fresh, never a one-time copy, so it stays
  // accurate if the parent's package changes later. Debounced since the
  // search field's onChange fires on every keystroke.
  const [pseudoParent, setPseudoParent] = useState(null);
  const [pseudoParentMagicLink, setPseudoParentMagicLink] = useState(null);
  const [pseudoParentError, setPseudoParentError] = useState(null);
  useEffect(() => {
    if (!supabase) return;
    const did = (form?.pseudo_package_parent_did || "").trim();
    if (!did) { setPseudoParent(null); setPseudoParentMagicLink(null); setPseudoParentError(null); return; }
    const t = setTimeout(async () => {
      const { data: parent } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, project_type, package_total_value, package_locked, pseudo_package_parent_did")
        .eq("did", did)
        .maybeSingle();
      if (!parent) { setPseudoParent(null); setPseudoParentMagicLink(null); setPseudoParentError("No release found with that DID."); return; }
      if (form?.did && parent.did === form.did) { setPseudoParent(null); setPseudoParentMagicLink(null); setPseudoParentError("A release can't be its own parent."); return; }
      if (parent.pseudo_package_parent_did) { setPseudoParent(null); setPseudoParentMagicLink(null); setPseudoParentError("That release is itself a pseudo-package track — link straight to the real EP/Album instead, not another track."); return; }
      setPseudoParent(parent);
      setPseudoParentError(null);
      const { data: link } = await supabase.from("magic_links").select("token").eq("release_id", parent.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      setPseudoParentMagicLink(link ? `${window.location.origin}/pick-package/${link.token}` : null);
    }, 400);
    return () => clearTimeout(t);
  }, [form?.pseudo_package_parent_did, form?.did]);

  // Round 86 item 5 — same batched fetch the dashboard uses, just for this
  // one release's pills.
  useEffect(() => {
    if (!supabase) return;
    fetchProductTagSets(supabase).then(setProductTagSets);
  }, []);

  useEffect(() => {
    if (!supabase || !id) return;
    supabase
      .from("releases")
      .select("*")
      .eq("id", id)
      .single()
      .then(async ({ data, error: err }) => {
        if (err) { setError(err.message); return; }
        setRelease(data);
        setForm(data);
        // Fetch the real Pitching ticket for this release, if one exists —
        // needs the DID, so this waits on the release itself loading first.
        const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "pitching").single();
        if (tab) {
          const { data: tix } = await supabase
            .from("tickets")
            .select("*")
            .eq("tab_id", tab.id)
            .eq("data->>releaseId", data.did)
            .is("deleted_at", null)
            .limit(1);
          const found = tix?.[0] || null;
          setPitchingTicket(found);
          if (found) setPitchingTypesDraft({ priority: false, spotify: false, apple: false, nct: false, zing: false, ...found.data });
        }
        // Pitching Info (AR's genre/mood/DSP tagging ticket) — the New
        // Release create form already auto-sends this the moment Priority
        // or Spotify is ticked, but that side effect didn't exist here on
        // the detail page, so releases edited after creation could tick
        // Priority later and nothing would ever notify AR. Fetch existing
        // state so the button below can tell "already sent" from "not yet".
        const { data: piTab } = await supabase.from("ticket_tabs").select("id").eq("key", "pitching_info").single();
        if (piTab) {
          const { data: piTix } = await supabase
            .from("tickets")
            .select("id")
            .eq("tab_id", piTab.id)
            .eq("data->>releaseId", data.did)
            .is("deleted_at", null)
            .limit(1);
          setPitchingInfoTicket(piTix?.[0] || null);
        }
        // Same idempotency check for Artist Profile — releaseId-matched,
        // not name-matched, since two releases can share an artist.
        const { data: apTab } = await supabase.from("ticket_tabs").select("id").eq("key", "artist_profile").single();
        if (apTab) {
          const { data: apTix } = await supabase
            .from("tickets")
            .select("*")
            .eq("tab_id", apTab.id)
            .eq("data->>releaseId", data.did)
            .is("deleted_at", null)
            .limit(1);
          const foundAp = apTix?.[0] || null;
          setArtistProfileTicket(foundAp);
          if (foundAp) setArtistProfileTypesDraft({ spotify: false, tiktok: false, apple: false, ...foundAp.data });
        }
        // The real gate for "Send Package Ticket" — whether a Media
        // Booking ticket for this release ACTUALLY exists right now, not
        // the release.package_ticket_sent flag (imported releases don't
        // always have that flag mapped, so it can't be trusted alone).
        const { data: mbTab } = await supabase.from("ticket_tabs").select("id").eq("key", "media_booking").single();
        if (mbTab) {
          const { data: mbTix } = await supabase
            .from("tickets")
            .select("id, status, status_log, data")
            .eq("tab_id", mbTab.id)
            .eq("data->>releaseId", data.did)
            .is("deleted_at", null)
            .limit(1);
          const found = mbTix?.[0] || null;
          setHasMediaBookingTicket(!!found);
          setMediaBookingTicket(found);
        }
        // Data Request / Marketing Request / Legal Request sub-tickets —
        // one batched fetch for all 10 mapped types at once (see
        // GATE_TICKET_TYPES in lib/GateFields.js), rather than 10 separate
        // round trips like the older per-field fetches above.
        const gateTicketTypeKeys = [...new Set(Object.values(GATE_TICKET_TYPES))];
        const { data: gateTabs } = await supabase.from("ticket_tabs").select("id, key, default_status").in("key", gateTicketTypeKeys);
        if (gateTabs && gateTabs.length > 0) {
          const tabIdToKey = {};
          const tabsMap = {};
          gateTabs.forEach((t) => {
            tabIdToKey[t.id] = t.key;
            tabsMap[t.key] = { id: t.id, default_status: t.default_status };
          });
          setGateTabsMap(tabsMap);
          const { data: gateTix } = await supabase
            .from("tickets")
            .select("*")
            .in("tab_id", gateTabs.map((t) => t.id))
            .eq("data->>releaseId", data.did)
            .is("deleted_at", null);
          const map = {};
          (gateTix || []).forEach((t) => {
            const key = tabIdToKey[t.tab_id];
            // If somehow more than one exists for a type, keep the newest.
            if (key && (!map[key] || new Date(t.created_at) > new Date(map[key].created_at))) map[key] = t;
          });
          // Round 86 item 4 — Publishing is matched by data.releaseId ===
          // the release's own id (its real UUID/PK), NOT its did like
          // every other gate-linked type above — see
          // app/tickets/publishing/page.js. The batched fetch just above
          // filters on data->>releaseId = data.did, so it can never match
          // a real Publishing ticket; this second lookup (only runs when
          // the batched ticket_tabs fetch found a "publishing" tab, so it
          // adds zero extra round trips when that type doesn't exist) gets
          // it right and merges into the same map.
          if (tabsMap.publishing) {
            const { data: pubTix } = await supabase
              .from("tickets")
              .select("*")
              .eq("tab_id", tabsMap.publishing.id)
              .eq("data->>releaseId", data.id)
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
              .limit(1);
            if (pubTix && pubTix[0]) map.publishing = pubTix[0];
          }
          setGateTicketMap(map);
          if (map.co_trong_net_youtube) {
            setCoTrongNetDraft({ ...CO_TRONG_NET_DRAFT_DEFAULTS, ...map.co_trong_net_youtube.data });
          }
        }
      });
    supabase
      .from("release_package_items")
      .select("*")
      .eq("release_id", id)
      .order("sort_order")
      .then(({ data }) => setPackageItems(data || []));
    supabase
      .from("media_booking_entries")
      .select("*")
      .eq("release_id", id)
      .then(({ data }) => setBookingEntries(data || []));
    supabase
      .from("package_categories")
      .select("id, name")
      .order("sort_order")
      .then(({ data }) => setBookingCategories(data || []));
    // Magic links never expire once created — fetch the most recent one so
    // it shows up on return visits instead of only right after generating.
    supabase
      .from("magic_links")
      .select("token")
      .eq("release_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.token) setMagicLinkUrl(`${window.location.origin}/pick-package/${data.token}`);
      });

    // Live updates — e.g. an artist picking a package on the magic-link
    // page should show up here without a manual refresh. Only patches
    // fields the user isn't actively editing, so it won't stomp on
    // in-progress typing in another tab.
    const channel = supabase
      .channel(`release-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "releases", filter: `id=eq.${id}` },
        (payload) => {
          setRelease(payload.new);
          setForm((f) => (f ? { ...f, ...payload.new } : payload.new));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  // Clicking the "artist request package changed" notification links here
  // with ?focus=media_booking — jump straight to the tab and scroll the
  // package section into view instead of leaving AR to find it themselves.
  useEffect(() => {
    if (searchParams?.get("focus") === "media_booking") setTab("media_booking");
  }, [searchParams]);

  // "PHỤ LỤC TRUYỀN THÔNG (CHỌN GÓI TỰ ĐỘNG CHỌN YES)" — the moment the
  // release leaves BRIEF & DATA/DEALING (i.e. a real package/contract type
  // has been picked), auto-flip this to "true" if it's still at its
  // untouched default. Never overwrites an explicit "No"/"TBU" someone
  // already set — only fires from the true default, once.
  useEffect(() => {
    // `form` starts out as `null` (useState(null) above) and only becomes
    // an object once the Supabase fetch in the load effect resolves. This
    // effect runs on EVERY render including the very first one, and a bare
    // `form.id` / `form.project_type` in the dependency array is evaluated
    // during render itself — reading `.id` off `null` throws
    // "TypeError: Cannot read properties of null (reading 'id')" and
    // crashes the whole page before the "if (!form) return Loading…" guard
    // further down ever gets a chance to help (that guard runs after hooks,
    // but hooks — including this dependency array — always run first, on
    // every mount, per React's rules). This was crashing literally every
    // release detail page on first load. Optional-chaining both the guard
    // and the dependency array fixes it: on that first null render the
    // effect just does nothing and re-fires once `form` is actually set.
    if (!form) return;
    if (!PIPELINE_STAGES.includes(form.project_type) && form.gate_phu_luc_truyen_thong === "false") {
      update("gate_phu_luc_truyen_thong", "true");
    }
  }, [form?.id, form?.project_type]);

  // Gói Hỗ Trợ Truyền Thông is now a read-only, continuously-recomputed
  // status (not a manual toggle — see LEGAL... no, MARKETING_REQUEST_FIELDS
  // in lib/GateFields.js), so unlike the one-time flip above this keeps
  // recomputing on every relevant change rather than only firing once from
  // a default: TBU while still in BRIEF & DATA/DEALING; NO once the artist
  // has locked "Chỉ Phát Hành" UNLESS the INT MEDIA follow-up has been sent
  // (form.int_media_requested, set by the "Send INT MEDIA Follow-up"
  // button below); YES for every other resolved package.
  useEffect(() => {
    if (!form) return;
    const computed = PIPELINE_STAGES.includes(form.project_type)
      ? "update"
      : form.project_type === "Chỉ Phát Hành" && !form.int_media_requested
      ? "false"
      : "true";
    if (form.gate_goi_ho_tro_truyen_thong !== computed) {
      update("gate_goi_ho_tro_truyen_thong", computed);
    }
  }, [form?.id, form?.project_type, form?.int_media_requested]);

  useEffect(() => {
    if (tab === "media_booking" && searchParams?.get("focus") === "media_booking" && mediaBookingSectionRef.current && !autoScrolled) {
      mediaBookingSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      setAutoScrolled(true);
    }
  }, [tab, searchParams, autoScrolled]);

  // The one and only place Pitching/Artist Profile tickets get created or
  // updated from this page now — no more immediate-on-click side effects.
  // Both are idempotent per release (checked via pitchingTicket/
  // artistProfileTicket, fetched on load) so clicking Save more than once
  // never creates a second ticket for the same product.
  async function saveTab() {
    setSaving(true);
    setError(null);

    // Round 86 follow-up item 7 — DID re-check. Computed ahead of the
    // release write (same idea as sonyPublishReady below) so the new DID
    // can ride the same write instead of a second round trip. Only the
    // PREFIX (title/artist initials + release date) is re-derived from
    // current field values — the trailing sequence suffix from creation
    // is kept as-is, so this can never collide with another release. See
    // recomputeDid()'s comment in lib/didHelpers.js for why this exists
    // and what it deliberately breaks (the DID's earlier "never changes"
    // guarantee) — accepted per explicit request.
    const newDid = recomputeDid(form.did, form.title, form.main_artist, form.release_date);
    const didChanged = newDid !== form.did;
    const oldDid = form.did;

    // Sony Publish is special-cased ahead of the write: unlike every
    // other gate-linked ticket, per explicit request it only auto-creates
    // once the 4 required metadata fields (REQUIRED_META_KEYS) are ALL
    // filled in — until then, ticking "Yes" and saving just saves the
    // gate field itself, with no ticket, same "loop until ready" idea as
    // the generic gate tickets below but gated on metadata instead of
    // just existence. The moment it IS ready, creating the ticket also
    // sends the release to the Upload workstation (same effect as the
    // SEND UPLOAD button — a newrelease_upload ticket + requested=true —
    // deliberately NOT the Priority Pitching shortcut or Media Booking
    // cascade, neither of which Sony Publish asked for), if it hasn't
    // already gone out via the normal button. Computed here (against the
    // in-memory form, not yet-saved DB state) so the requested:true flag
    // can ride the same release write below instead of a second round
    // trip.
    const sonyPublishReady =
      form.gate_sony_publish === "true" && !gateTicketMap.sony_publish && REQUIRED_META_KEYS.every((k) => form[k] === "true");
    const sonyPublishSendsUpload = sonyPublishReady && !form.requested;
    const releasePatch = { ...form, ...(sonyPublishSendsUpload ? { requested: true } : {}), ...(didChanged ? { did: newDid } : {}) };

    // Round 86 item 4 — Publishing, same "loop until ready" idea as Sony
    // Publish just above, but gated on the inline Giá Trị Publishing value
    // (see TEXT_GATE_FIELDS in lib/GateFields.js) instead of the Metadata
    // Checklist. Once ready, the ticket is created with data.releaseId set
    // to the release's own id (its real UUID/PK) — deliberately NOT
    // form.did like every other gate-linked ticket type — matching what
    // app/tickets/publishing/page.js's list actually looks up by.
    const publishingReady =
      form.gate_publishing === "true" && !gateTicketMap.publishing && (form.publishing_gia_tri || "").trim() !== "";

    const { error: err } = await supabase.from("releases").update(releasePatch).eq("id", id);
    if (err) {
      setSaving(false);
      setError(err.message);
      return;
    }

    // Round 86 follow-up item 7 — since most ticket types store this
    // release's DID as a point-in-time snapshot string in their own data
    // (data.releaseId), not a live foreign key, a DID prefix change here
    // would silently orphan every ticket already pointing at the old one
    // (Pitching, Splitshare, Media Booking, Upload, etc. — anything NOT
    // matched by release.id, like Publishing — see lib/productTags.js's
    // comment on that same id-vs-did split). Per explicit request, migrate
    // every ticket's stored data.releaseId from old → new in the same
    // save, so nothing loses its link to this release. Scans across ALL
    // ticket types at once (no tab_id filter) rather than one query per
    // type, and doesn't filter out deleted_at — a deleted ticket's
    // historical record should still point at a DID that actually existed.
    if (didChanged) {
      const { data: staleTix } = await supabase.from("tickets").select("id, data").eq("data->>releaseId", oldDid);
      if (staleTix && staleTix.length > 0) {
        await Promise.all(
          staleTix.map((t) => supabase.from("tickets").update({ data: { ...t.data, releaseId: newDid } }).eq("id", t.id))
        );
      }
    }

    if (form.gate_pitching === "true") {
      if (pitchingTicket) {
        if (JSON.stringify(pitchingTicket.data) !== JSON.stringify(pitchingTypesDraft)) {
          await supabase.from("tickets").update({ data: pitchingTypesDraft }).eq("id", pitchingTicket.id);
          setPitchingTicket((t) => ({ ...t, data: pitchingTypesDraft }));
        }
      } else {
        const { data: tab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "pitching").single();
        if (tab) {
          const newData = { releaseId: newDid, priority: false, spotify: false, apple: false, nct: false, zing: false, ...pitchingTypesDraft };
          const { data: created } = await supabase
            .from("tickets")
            .insert({
              tab_id: tab.id,
              data: newData,
              status: tab.default_status,
              status_log: { [tab.default_status]: new Date().toISOString() },
              requester_segment: form.requester_segment || null,
            })
            .select()
            .single();
          if (created) setPitchingTicket(created);
        }
      }
    }

    if (form.gate_artist_profile === "true") {
      if (artistProfileTicket) {
        // Same "only write if the draft actually changed" idea as
        // Pitching just above — the Spotify/Tiktok/Apple picker only
        // ever touches this ticket's data, so a plain JSON compare is
        // enough to know whether a write is needed.
        if (JSON.stringify(artistProfileTicket.data) !== JSON.stringify({ ...artistProfileTicket.data, ...artistProfileTypesDraft })) {
          const newData = { ...artistProfileTicket.data, ...artistProfileTypesDraft };
          await supabase.from("tickets").update({ data: newData }).eq("id", artistProfileTicket.id);
          setArtistProfileTicket((t) => ({ ...t, data: newData }));
        }
      } else {
        const { data: tab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "artist_profile").single();
        if (tab) {
          const { data: created } = await supabase
            .from("tickets")
            .insert({
              tab_id: tab.id,
              data: { releaseId: newDid, artistName: form.main_artist, email: "", ...artistProfileTypesDraft },
              status: tab.default_status,
              status_log: { [tab.default_status]: new Date().toISOString() },
              requester_segment: form.requester_segment || null,
            })
            .select()
            .single();
          if (created) setArtistProfileTicket(created);
        }
      }
    }

    // Có Trong Net YouTube — write-if-changed only now. Round 92, per
    // explicit request: creating the ticket in the first place moved OFF
    // Save entirely, onto the real "SET UP YOUTUBE" button in
    // CoTrongNetYoutubePanel (see sendCoTrongNetYoutube below) — Save here
    // only keeps an ALREADY-SENT ticket's Teaser/Official/Short/Mô Tả draft
    // in sync with whatever's been edited since, same as before.
    if (form.gate_co_trong_net_youtube === "true") {
      const ctnTicket = gateTicketMap.co_trong_net_youtube;
      if (ctnTicket) {
        const newData = { ...ctnTicket.data, ...coTrongNetDraft };
        if (JSON.stringify(ctnTicket.data) !== JSON.stringify(newData)) {
          await supabase.from("tickets").update({ data: newData }).eq("id", ctnTicket.id);
          setGateTicketMap((m) => ({ ...m, co_trong_net_youtube: { ...ctnTicket, data: newData } }));
        }
      }
    }

    // Data Request / Marketing Request / Legal Request sub-tickets (see
    // GATE_TICKET_TYPES in lib/GateFields.js) — folded into Save instead of
    // a separate manual "Send Ticket" click, same idempotent-on-save
    // pattern as Pitching/Artist Profile just above. This also closes a
    // real bug the manual button had: it read live off local form state, so
    // clicking it before Save created a ticket referencing a gate field
    // that hadn't actually been persisted yet. Uses gateTabsMap (fetched
    // once on load, alongside gateTicketMap) instead of a fresh
    // ticket_tabs lookup per type, so this adds zero extra reads per save —
    // only a write for whichever types are newly "Yes" and don't have a
    // ticket yet.
    // gate_sony_publish is excluded here — it has its own metadata-gated
    // block right below instead of the unconditional "Yes + no ticket yet"
    // rule every other gate type follows. gate_phu_luc_truyen_thong is
    // also excluded — it maps to the existing "phu_luc" ticket type for
    // DISPLAY purposes only (see GATE_TICKET_TYPES's comment in
    // lib/GateFields.js); that ticket is created by the pick-package
    // magic-link flow with real required data, never auto-created from
    // here.
    // gate_co_trong_net_youtube is also excluded from the generic loop
    // below — it carries its own Teaser/Official/Short/Mô Tả draft (see
    // coTrongNetDraft above), handled by its own block right after, same
    // reason Pitching/Artist Profile aren't in this generic loop either.
    // gate_publishing is also excluded — see publishingReady's bespoke
    // block below, same "gated on real required data, plus a different
    // releaseId key" reason Sony Publish is excluded.
    const missingGateEntries = Object.entries(GATE_TICKET_TYPES).filter(
      ([gateKey, ticketType]) =>
        gateKey !== "gate_sony_publish" &&
        gateKey !== "gate_phu_luc_truyen_thong" &&
        gateKey !== "gate_co_trong_net_youtube" &&
        gateKey !== "gate_publishing" &&
        form[gateKey] === "true" &&
        !gateTicketMap[ticketType] &&
        gateTabsMap[ticketType]
    );
    if (missingGateEntries.length > 0) {
      const created = await Promise.all(
        missingGateEntries.map(async ([, ticketType]) => {
          const tab = gateTabsMap[ticketType];
          const { data: row } = await supabase
            .from("tickets")
            .insert({
              tab_id: tab.id,
              data: { releaseId: newDid },
              status: tab.default_status,
              status_log: { [tab.default_status]: new Date().toISOString() },
              requester_segment: form.requester_segment || null,
            })
            .select()
            .single();
          return row ? [ticketType, row] : null;
        })
      );
      const newlyCreated = created.filter(Boolean);
      if (newlyCreated.length > 0) {
        setGateTicketMap((m) => {
          const next = { ...m };
          newlyCreated.forEach(([ticketType, row]) => (next[ticketType] = row));
          return next;
        });
      }
    }

    // Sony Publish — fires only when sonyPublishReady (computed above,
    // before the write) was true. Creates the ticket, then — the "special"
    // part — also sends the release to the Upload workstation exactly
    // like the SEND UPLOAD button would (newrelease_upload ticket +
    // requested=true, the latter already folded into releasePatch above)
    // if it hasn't already been sent some other way.
    if (sonyPublishReady) {
      const spTab = gateTabsMap.sony_publish;
      if (spTab) {
        const { data: spCreated } = await supabase
          .from("tickets")
          .insert({
            tab_id: spTab.id,
            data: { releaseId: newDid },
            status: spTab.default_status,
            status_log: { [spTab.default_status]: new Date().toISOString() },
            requester_segment: form.requester_segment || null,
          })
          .select()
          .single();
        if (spCreated) setGateTicketMap((m) => ({ ...m, sony_publish: spCreated }));
      }
      if (sonyPublishSendsUpload) {
        const { data: uploadTab } = await supabase.from("ticket_tabs").select("id").eq("key", "newrelease_upload").single();
        if (uploadTab) {
          await supabase.from("tickets").insert({
            tab_id: uploadTab.id,
            data: { releaseId: newDid, project: form.title, artist: form.main_artist, label: form.label },
          });
        }
      }
    }

    // Publishing — fires only when publishingReady (computed above, before
    // the write) was true. data.releaseId is the release's own id, not its
    // did — see publishingReady's comment above.
    if (publishingReady) {
      const pubTab = gateTabsMap.publishing;
      if (pubTab) {
        const { data: pubCreated } = await supabase
          .from("tickets")
          .insert({
            tab_id: pubTab.id,
            data: { releaseId: form.id, giaTri: form.publishing_gia_tri },
            status: pubTab.default_status,
            status_log: { [pubTab.default_status]: new Date().toISOString() },
            requester_segment: form.requester_segment || null,
          })
          .select()
          .single();
        if (pubCreated) setGateTicketMap((m) => ({ ...m, publishing: pubCreated }));
      }
    }

    setSaving(false);
    setForm(releasePatch);
    setRelease(releasePatch);
    setSaved(true);
  }

  // Asymmetric on purpose: SEND UPLOAD sends both (Newrelease Upload +
  // Media Booking), but Send Package Ticket only ever sends itself — it
  // never touches Upload. Upload keeps its own one-time gate (`requested`)
  // so this whole function — including the sendPackageTicket() call below
  // — only ever runs once per release from this path; Send Package
  // Ticket's own button is a separate, repeatable action (see its comment).
  async function sendUpload() {
    if (form.requested) return;

    const { data: uploadTab } = await supabase.from("ticket_tabs").select("id").eq("key", "newrelease_upload").single();
    if (uploadTab) {
      await supabase.from("tickets").insert({
        tab_id: uploadTab.id,
        data: { releaseId: form.did, project: form.title, artist: form.main_artist, label: form.label },
      });
    }

    const patch = { requested: true };
    // Went out via the Priority Pitching shortcut (required checklist items
    // not yet all filled in, only allowed through because Priority is
    // ticked — see uploadReady above). priority_pitching_used records that
    // the shortcut was actually used; needs_update is the live "still
    // incomplete" flag everything else (Smartlink lock, the warning banner)
    // reads — cleared by unlockNeedsUpdate() once the required items are
    // genuinely filled in.
    if (requiredMetaDone < REQUIRED_META_KEYS.length) {
      patch.priority_pitching_used = true;
      patch.needs_update = true;
    }
    await supabase.from("releases").update(patch).eq("id", id);
    setForm((f) => ({ ...f, ...patch }));
    setRelease((r) => ({ ...r, ...patch }));

    await sendPackageTicket();
  }

  // The only way Smartlink unlocks again once the priority shortcut set
  // needs_update — requires the checklist to actually be 6/6 first, so
  // this can't be used to just wave the warning away.
  async function unlockNeedsUpdate() {
    if (requiredMetaDone < REQUIRED_META_KEYS.length) return;
    const patch = { needs_update: false };
    await supabase.from("releases").update(patch).eq("id", id);
    setForm((f) => ({ ...f, ...patch }));
    setRelease((r) => ({ ...r, ...patch }));
  }

  // Gated on hasMediaBookingTicket (a real existence check), not on
  // release.package_ticket_sent — that flag isn't reliably set for
  // imported releases, which was letting duplicate tickets slip through.
  //
  // No longer a strict one-shot button: once the ticket reaches COMPLETE,
  // this same button doubles as the "resend" action for both branches of
  // the new booking cycle —
  //   - artist sent feedback via the magic link's Feed Back box (ticket.
  //     data.feedback is set) -> tags the reopened ticket with the hidden
  //     proposedPackage "Artist request package changed" so Marketing can
  //     tell it apart from a first-time request, and clears the feedback
  //     flag (consumed once AR acts on it)
  //   - AR just wants an internal rebook, no artist feedback involved ->
  //     reopens with no special tag, proposedPackage left as-is
  // Either way it's the SAME ticket flipped back to REQUESTED (never a
  // second ticket — trg_prevent_duplicate_media_booking would reject that
  // anyway), and it's a purely internal do-over: the magic link keeps
  // showing whatever package last reached COMPLETE until Marketing
  // finishes the rebuild and completes it again (see pick-package's
  // packagesEverCompleted gating, which reads status_log.COMPLETE ever
  // having been set, not the live status).
  async function sendPackageTicket() {
    if (mediaBookingTicket) {
      // Re-fetch the ticket row fresh right before acting on it instead of
      // trusting the component's `mediaBookingTicket` state — the artist's
      // Feed Back submission on the magic link page writes data.feedback
      // straight to the DB from a completely separate page/session, so if
      // this page was already open (loaded before that write happened),
      // the in-memory state here is stale and would silently reopen the
      // ticket without the feedback tag, or bail out entirely if the
      // stale status wasn't "COMPLETE" yet.
      const { data: freshTicket, error: fetchErr } = await supabase
        .from("tickets")
        .select("id, status, status_log, data")
        .eq("id", mediaBookingTicket.id)
        .single();
      if (fetchErr) { setError(fetchErr.message); return; }
      if (freshTicket.status !== "COMPLETE") {
        // Reflect whatever's actually in the DB now, so the button/label
        // above stop showing a stale "ready to resend" state.
        setMediaBookingTicket(freshTicket);
        return; // already in progress — nothing to (re)send yet
      }
      const hasFeedback = !!freshTicket.data?.feedback;
      const newData = { ...(freshTicket.data || {}) };
      if (hasFeedback) {
        newData.proposedPackage = "Artist request package changed";
        newData.feedback = null;
      }
      const newLog = { ...(freshTicket.status_log || {}), REQUESTED: new Date().toISOString() };
      const { error: updErr } = await supabase.from("tickets").update({ status: "REQUESTED", status_log: newLog, data: newData }).eq("id", freshTicket.id);
      if (updErr) { setError(updErr.message); return; }
      setMediaBookingTicket((t) => ({ ...t, status: "REQUESTED", status_log: newLog, data: newData }));
      // Reopening is an UPDATE, not an INSERT, so trg_notify_on_ticket_insert
      // never fires for it — fire the same "Marketing has new work" fanout
      // by hand via the existing helper function.
      await supabase.rpc("fanout_notification", {
        p_team: "Marketing",
        p_type: "new_ticket",
        p_title: "Media Booking ticket reopened",
        p_body: hasFeedback
          ? `${form.title || "A release"}: artist requested a package change.`
          : `${form.title || "A release"} needs a package rebuild.`,
        p_link: "/tickets/media-booking",
        p_ticket_id: freshTicket.id,
      });
      return;
    }

    const { data: mbTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "media_booking").single();
    if (mbTab) {
      const { data: created, error: insertErr } = await supabase
        .from("tickets")
        .insert({
          tab_id: mbTab.id,
          data: { releaseId: form.did, proposedPackage: null },
          status: mbTab.default_status,
          status_log: { [mbTab.default_status]: new Date().toISOString() },
          // AR is always the requester of a Media Booking ticket — sets
          // trg_notify_on_ticket_complete up to notify AR the moment
          // Marketing marks it COMPLETE (the "magic link goes live +
          // notification fires simultaneously" step of the new cycle).
          requester_segment: "AR",
        })
        .select()
        .single();
      // trg_prevent_duplicate_media_booking (add-media-booking-dedup.sql)
      // rejects this if one already exists for this release — that should
      // only happen if hasMediaBookingTicket's own lookup was stale, but
      // don't mark the state/project stage as advanced if the insert
      // itself didn't actually go through.
      if (insertErr) {
        setError(insertErr.message.includes("only one is allowed per release") ? "A Media Booking ticket for this release already exists." : insertErr.message);
        setHasMediaBookingTicket(true);
        return;
      }
      setMediaBookingTicket(created);
    }
    setHasMediaBookingTicket(true);

    const patch = { package_ticket_sent: true };
    // Round 80 — sending the Package Ticket now moves BRIEF & DATA into
    // the new SENT TO MARKETING interlude, not straight to DEALING —
    // DEALING is reached once Marketing actually marks that ticket
    // COMPLETE (see media-booking ticket list's updateStatus).
    if (form.project_type === "BRIEF & DATA") patch.project_type = "SENT TO MARKETING";
    await supabase.from("releases").update(patch).eq("id", id);
    setForm((f) => ({ ...f, ...patch }));
    setRelease((r) => ({ ...r, ...patch }));
  }

  // Ticking a pitching type only updates the local draft now — it's
  // persisted (created or updated, idempotently) by saveTab() above, same
  // as every other field on this page. No more save-button bypass.
  function handlePitchingToggle(key, checked) {
    setPitchingTypesDraft((d) => ({ ...d, [key]: checked }));
  }

  // Explicit button rather than auto-firing on the Priority checkbox —
  // ticking the box is just a draft edit until Save (like everything else
  // here), and this needs the Pitching ticket to exist first anyway, so an
  // automatic send right on click would either race Save or silently do
  // nothing. Mirrors app/new-release/page.js's create-time logic (send
  // Pitching Info the moment Priority or Spotify is wanted), just as an
  // explicit action here instead of an implicit one at creation time.
  async function sendPitchingInfoTicket() {
    if (pitchingInfoTicket) return;
    const { data: piTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "pitching_info").single();
    if (!piTab) return;
    const { data: created } = await supabase
      .from("tickets")
      .insert({
        tab_id: piTab.id,
        data: { releaseId: form.did },
        status: piTab.default_status,
        status_log: { [piTab.default_status]: new Date().toISOString() },
        requester_segment: form.requester_segment || null,
      })
      .select()
      .single();
    if (created) setPitchingInfoTicket(created);
  }

  // The standalone "Send Ticket" click for Data Request/Marketing
  // Request/Legal Request sub-tickets (see GATE_TICKET_TYPES in
  // lib/GateFields.js) is gone — folded into saveTab() above instead, same
  // idempotent-on-save pattern as Pitching/Artist Profile. GateTicketLink
  // now only ever displays state (sent vs. not yet), never triggers a
  // write itself. Có Trong Net YouTube is the one exception (Round 92) —
  // see sendCoTrongNetYoutube right below, mirroring sendPitchingInfoTicket
  // above: a real manual button instead of an auto-create-on-Save.

  // Round 92 — "Set Up YouTube" button (CoTrongNetYoutubePanel), per
  // explicit request: ticking Có Trong Net YouTube to Yes used to
  // silently create this ticket the next time Save succeeded — same
  // pattern as every other Data/Marketing/Legal Request field. That's
  // fine for a plain "log this request" ticket, but this one starts a
  // real handoff (Operation or the label needs to go set YouTube Ads up
  // and come back with a URL), so it now needs an explicit click, same
  // idiom as SEND UPLOAD. Same idempotent-on-click guard as every other
  // manual send here — a second click after the ticket already exists is
  // a no-op. Save still keeps this ticket's Teaser/Official/Short/Mô Tả
  // draft in sync afterward (see saveTab() above), same as before — only
  // the FIRST creation moved off Save.
  async function sendCoTrongNetYoutube() {
    if (gateTicketMap.co_trong_net_youtube) return;
    const tab = gateTabsMap.co_trong_net_youtube;
    if (!tab) return;
    const { data: created } = await supabase
      .from("tickets")
      .insert({
        tab_id: tab.id,
        data: { releaseId: form.did, ...coTrongNetDraft },
        status: tab.default_status,
        status_log: { [tab.default_status]: new Date().toISOString() },
        requester_segment: form.requester_segment || null,
      })
      .select()
      .single();
    if (created) setGateTicketMap((m) => ({ ...m, co_trong_net_youtube: created }));
  }

  // Magic link generation moved to Marketing's package spec builder (not
  // built yet) — this page only reads/displays an existing link now,
  // fetched on load below, never creates one.

  // INT MEDIA follow-up — special, not a normal "create a package" flow.
  // Only ever offered after AR has locked in "Chỉ Phát Hành" (see the
  // button's gating below). Reopens the SAME media_booking ticket rather
  // than creating a duplicate — pulls it out of COMPLETE back to
  // REQUESTED and pre-fills Propose Package = INT MEDIA, so Marketing
  // sees it land back on their queue as new work. The magic-link page
  // picks up the built INT MEDIA package automatically once it exists
  // (see app/pick-package/[token]/page.js) — nothing else to wire here.
  async function sendIntMediaTicket() {
    if (form.int_media_requested) return;
    const { data: mbTab } = await supabase.from("ticket_tabs").select("id").eq("key", "media_booking").single();
    if (mbTab) {
      const { data: existing } = await supabase
        .from("tickets")
        .select("id, data, status_log")
        .eq("tab_id", mbTab.id)
        .contains("data", { releaseId: form.did })
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        const newLog = { ...(existing.status_log || {}), REQUESTED: new Date().toISOString() };
        const newData = { ...(existing.data || {}), proposedPackage: "INT MEDIA" };
        await supabase
          .from("tickets")
          .update({ status: "REQUESTED", status_log: newLog, data: newData })
          .eq("id", existing.id);
        setMediaBookingTicket((t) => (t && t.id === existing.id ? { ...t, status: "REQUESTED", status_log: newLog, data: newData } : t));
        // Same as sendPackageTicket's reopen path — an UPDATE never fires
        // trg_notify_on_ticket_insert, so tell Marketing by hand.
        await supabase.rpc("fanout_notification", {
          p_team: "Marketing",
          p_type: "new_ticket",
          p_title: "Media Booking ticket reopened",
          p_body: `${form.title || "A release"} needs an INT MEDIA add-on package.`,
          p_link: "/tickets/media-booking",
          p_ticket_id: existing.id,
        });
      } else {
        // No prior ticket somehow — fall back to creating one fresh
        // rather than silently doing nothing.
        await supabase.from("tickets").insert({
          tab_id: mbTab.id,
          data: { releaseId: form.did, proposedPackage: "INT MEDIA" },
          status: "REQUESTED",
          status_log: { REQUESTED: new Date().toISOString() },
        });
      }
    }

    const patch = { int_media_requested: true };
    await supabase.from("releases").update(patch).eq("id", id);
    setForm((f) => ({ ...f, ...patch }));
    setRelease((r) => ({ ...r, ...patch }));
  }

  // Round 77 — item 4b: "SEND INT SUPPORT PACKAGE" (round 83 item 1 —
  // opened up from dev-only to dev + any AR team member, see canSimulate
  // above). Runs the same "simulation" commit Package Runner
  // uses (lib/packageSimulator.js's runOne — the exact 3 writes
  // confirmChoice() does on the real artist-facing magic link), but with
  // contractType "INT MEDIA" instead of "Chỉ Phát Hành" — this is the
  // "lock the package name to INTERNAL" part of the ask: the real package
  // name for the internal-support tier is "INT MEDIA" (see
  // media_booking_packages.name in app/tickets/media-booking/page.js —
  // matched against release.project_type the same way every other package
  // is), there's no separate "INTERNAL" value anywhere in the schema.
  // Then reuses sendIntMediaTicket() verbatim for the "resend for internal
  // support" half — that function already reopens the SAME existing Media
  // Booking ticket rather than creating a second one (or creates exactly
  // one if none exists yet), so running these two steps back-to-back here
  // sends the ticket exactly once, not twice.
  async function sendIntSupportPackage() {
    if (!canSimulate || form.int_media_requested) return;
    const r = await runOne({ did: form.did, legacyDid: "", contractType: "INT MEDIA" }, { allowOverwrite: false });
    if (!r.ok) { setError(r.reason); return; }
    const patch = { project_type: "INT MEDIA", package_locked: true, package_total_value: null };
    setForm((f) => ({ ...f, ...patch }));
    setRelease((rel) => ({ ...rel, ...patch }));
    await sendIntMediaTicket();
  }

  // Round 77 — item 4b: "ONLY PH" (round 83 item 1 — opened up from
  // dev-only to dev + any AR team member, see canSimulate above). Runs
  // the same simulation as Package Runner's default Chỉ Phát Hành pick —
  // "the artist chose no package" — WITHOUT touching the Media Booking
  // ticket at all (a Chỉ Phát Hành pick never has one in the real flow
  // either, so there's nothing to send). Still gets the same auto-created
  // Phụ Lục ticket runOne() already handles if this release was sitting in
  // BRIEF & DATA/DEALING — that's "set the package for the product" doing
  // its normal job, not an extra step bolted on here.
  async function sendOnlyPh() {
    if (!canSimulate || form.package_locked) return;
    const r = await runOne({ did: form.did, legacyDid: "", contractType: "Chỉ Phát Hành" }, { allowOverwrite: false });
    if (!r.ok) { setError(r.reason); return; }
    const patch = { project_type: "Chỉ Phát Hành", package_locked: true, package_total_value: null };
    setForm((f) => ({ ...f, ...patch }));
    setRelease((rel) => ({ ...rel, ...patch }));
  }

  async function togglePackageLock() {
    const newVal = !form.package_locked;
    setForm((f) => ({ ...f, package_locked: newVal }));
    await supabase.from("releases").update({ package_locked: newVal }).eq("id", id);
    setRelease((r) => ({ ...r, package_locked: newVal }));
  }

  if (error && !release) return <div className={styles.page}><div className={styles.container}><div className={styles.errorBox}>{error}</div></div></div>;
  if (!form) return <div className={styles.page}><div className={styles.container}>Loading…</div></div>;

  const metaDone = META_ITEMS.filter((m) => form[m.key] === "true").length;
  // Send Upload only actually requires 4 of the 6 checklist items (Audio,
  // Artwork, Lyric, Metadata) — Working Files and MV are still tracked in
  // the checklist above for visibility, they just don't gate the ticket.
  // Gated on the SAVED release (release), not the live form draft — same
  // "must hit Save first" rule already applied to Priority Pitching below.
  // Ticking a checklist box is a draft edit like every other field on this
  // page; it must not unlock Send Upload until Save actually persists it.
  // requiredMetaDoneLive tracks the live/unsaved count purely to show a
  // "you have unsaved checklist changes" hint near the button.
  const requiredMetaDone = REQUIRED_META_KEYS.filter((k) => release?.[k] === "true").length;
  const requiredMetaDoneLive = REQUIRED_META_KEYS.filter((k) => form[k] === "true").length;
  const nameGroupFilled = form.title && form.main_artist && form.release_date;
  // Priority Pitching is the one exception to "must have the required
  // checklist items before Send Upload" — a priority release needs to
  // reach OPS before its data is complete, that's the whole point of it
  // being priority. requiredMetaDone still isn't required, but the basic
  // name/date group still is (the upload ticket needs those to mean
  // anything).
  // Reads the SAVED priority flag (pitchingTicket.data), not the live
  // pitchingTypesDraft — ticking the Priority checkbox alone must not
  // unlock Send Upload; only hitting Save (saveTab persisting the draft
  // into pitchingTicket) does.
  const priorityConfirmed = !!pitchingTicket?.data?.priority;
  const uploadReady = nameGroupFilled && (requiredMetaDone === REQUIRED_META_KEYS.length || priorityConfirmed);

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <Link href="/releases" className={styles.backLink}>
          ← Back to New Release
        </Link>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, alignItems: "start", marginBottom: 20 }}>
          <div>
            <div className={styles.eyebrow}>{form.did || "—"}</div>
            {firstUrl(form.link_lbm) ? (
              <a
                href={firstUrl(form.link_lbm)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "block", textDecoration: "none" }}
                title={firstUrl(form.link_lbm)}
              >
                <h1 className={styles.title} style={{ marginBottom: 4, color: "inherit" }}>
                  {form.title} — {form.main_artist}
                </h1>
              </a>
            ) : (
              <h1 className={styles.title} style={{ marginBottom: 4 }}>
                {form.title} — {form.main_artist}
              </h1>
            )}
            {/* Round 86 item 5 — product tag pills, right next to the Name row */}
            <ProductTagPills styles={styles} release={form} tagSets={productTagSets} style={{ marginBottom: 8 }} />
            <div style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: form.upc ? 4 : 14 }}>
              {form.release_date} {form.release_time}
            </div>
            {form.upc && (
              <div style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 14 }}>
                UPC: <span style={{ color: "var(--text-faint)" }}>{form.upc}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <LinkPill label="Link Drive" href={firstUrl(form.drive_link)} />
              <span style={{ color: "#444" }}>|</span>
              <LinkPill label="Smartlink" href={firstUrl(form.smartlink)} />
              <span style={{ color: "#444" }}>|</span>
              {/* Round 66 — item 1: same "Package Offer" -> "Media Report"
                  label swap already used below for the Link Media Report
                  field (see form.media_report_status), applied here too —
                  UI label only, doesn't touch what the link actually is. */}
              <LinkPill label={form.media_report_status ? "Media Report" : "Package Offer"} href={magicLinkUrl} />
              <span style={{ color: "#444" }}>|</span>
              <LinkPill label="Promotion Package" href={firstUrl(form.promotion_package_url)} />
            </div>
          </div>

          <ReleaseNotePanel form={form} update={update} team={topNoteTeam} setTeam={setTopNoteTeam} />
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}
        {saved && <div className={styles.successBox}>Saved.</div>}

        <div className={styles.tabBar}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`${styles.tabBtn} ${tab === t.key ? styles.tabBtnActive : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <OverviewTab
            form={form}
            update={update}
            metaDone={metaDone}
            requiredMetaDone={requiredMetaDone}
            requiredMetaDoneLive={requiredMetaDoneLive}
            uploadReady={uploadReady}
            onSave={saveTab}
            saving={saving}
            onUpload={sendUpload}
            onUnlockNeedsUpdate={unlockNeedsUpdate}
            packageItems={packageItems}
            magicLinkUrl={magicLinkUrl}
            onToggleLock={togglePackageLock}
            onSendPackageTicket={sendPackageTicket}
            hasMediaBookingTicket={hasMediaBookingTicket}
            mediaBookingTicket={mediaBookingTicket}
            onSendIntMediaTicket={sendIntMediaTicket}
            canSimulate={canSimulate}
            onSendIntSupportPackage={sendIntSupportPackage}
            onSendOnlyPh={sendOnlyPh}
            pseudoParent={pseudoParent}
            pseudoParentMagicLink={pseudoParentMagicLink}
            pseudoParentError={pseudoParentError}
            pitchingTicket={pitchingTicket}
            pitchingTypesDraft={pitchingTypesDraft}
            onPitchingToggle={handlePitchingToggle}
            pitchingInfoTicket={pitchingInfoTicket}
            onSendPitchingInfoTicket={sendPitchingInfoTicket}
            artistProfileTypesDraft={artistProfileTypesDraft}
            onArtistProfileToggle={(key, checked) => setArtistProfileTypesDraft((p) => ({ ...p, [key]: checked }))}
            coTrongNetDraft={coTrongNetDraft}
            onCoTrongNetChange={(key, value) => setCoTrongNetDraft((p) => ({ ...p, [key]: value }))}
            onSendCoTrongNetYoutube={sendCoTrongNetYoutube}
            gateTicketMap={gateTicketMap}
            setTab={setTab}
          />
        )}
        {tab === "copyrights" && <CopyrightsTab form={form} update={update} onSave={saveTab} saving={saving} />}
        {tab === "url" && <UrlTab form={form} update={update} onSave={saveTab} saving={saving} did={form.did} releaseId={id} />}
        {tab === "media_booking" && (
          <MediaBookingTab
            form={form}
            update={update}
            onSave={saveTab}
            saving={saving}
            entries={bookingEntries}
            categories={bookingCategories}
            packageItems={packageItems}
            mediaBookingTicket={mediaBookingTicket}
            sectionRef={mediaBookingSectionRef}
            pseudoParent={pseudoParent}
          />
        )}
        {tab === "pitching" && <PitchingTab form={form} update={update} onSave={saveTab} saving={saving} />}
        {tab === "pre_release" && <PreReleaseTab form={form} update={update} onSave={saveTab} saving={saving} />}
        {tab === "streaming_milestone" && <StreamingMilestoneTab form={form} />}
        {tab === "tasklist" && <TasklistTab form={form} bookingEntries={bookingEntries} />}
      </div>
    </div>
    </AppShell>
  );
}


// First non-empty URL out of a newline-joined multi-URL field (the same
// storage convention UrlField/QuickCreate use everywhere) — used wherever
// only ONE representative link is needed (the title hyperlink, the
// Link Drive/Smartlink pills), not the full list.
function firstUrl(value) {
  const urls = (value || "").split("\n").map((s) => s.trim()).filter(Boolean);
  return urls[0] || null;
}

// Short label-as-hyperlink — "Link Drive" / "Smartlink" / "Magic Link"
// text itself is the link, not the raw URL. Dims to plain text (no href)
// when there's nothing to link to yet. A small dot in front makes the
// available/not-available state scannable at a glance without having to
// notice the text color/underline — green + filled when a URL is set,
// grey + hollow when it isn't.
function LinkPill({ label, href }) {
  const dot = (
    <span
      title={href ? "Link available" : "No link set yet"}
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        marginRight: 5,
        background: href ? "#3ddc84" : "transparent",
        border: href ? "1px solid #3ddc84" : "1px solid #555",
      }}
    />
  );
  if (!href) {
    return (
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>
        {dot}
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", textDecoration: "none" }}
    >
      {dot}
      {label}
    </a>
  );
}

// Top-right note panel, sitting next to the header — same two-pane shape
// as the notification bell dropdown (lib/NotificationBell.js: fixed-width
// list on the left, content on the right).
//
// Round 68 — item 4: this used to be ONE shared field (releases.brief) for
// every team, by an earlier explicit decision. Per a later explicit
// correction, each team now has its own real note — clicking a different
// team here actually changes what's shown now, backed by
// releases.note_ar/note_marketing/note_ops/note_legal (round 68 migration;
// see NOTE_FIELD_BY_TEAM below). The old shared releases.brief column
// still exists and its prior content was copied into all 4 new columns as
// a one-time backfill (see the migration) so nothing already written was
// lost — it's just not read/written from here anymore.
// Round 86 follow-up item 3 — swapped roles with the Overview/near-Save
// field per explicit request: THIS panel is now the editable, team-tabbed
// one (every team's note, one at a time via the tabs below — same picker
// idiom the near-Save field used to have). The near-Save field (see
// SaveBar's caller below) is now a plain single-team AR-only textbox, no
// tabs — matches every other team's note living in "their corresponding
// workstation" instead. Like the rest of this page's fields, edits here
// only land in local form state — Save (the same button further down the
// page) is still what persists them.
// "possibly the ticket in the future too" (per the original request) is a
// noted extension point, not built yet — there's no per-ticket note source
// to pull from at the moment.
// Design excluded from this panel's team list per explicit request ("they
// don't really note anything for the product") — Design still exists as a
// real team everywhere else (its own ticket type, TEAMS, etc.), this is
// just a display-only filter local to the note panel.
// Round 34 item 2: was TEAMS.filter(...), which listed Youtube/Publishing/
// Operation as 3 separate note tabs. REPORTING_TEAMS already folds those
// into one combined "OPS" entry (same list the Summary page's dev tab
// picker uses), so switching to it compiles the note panel down to one
// OPS tab instead of three.
const NOTE_PANEL_TEAMS = REPORTING_TEAMS.filter((t) => t !== "Design");
const NOTE_FIELD_BY_TEAM = { AR: "note_ar", Marketing: "note_marketing", OPS: "note_ops", Legal: "note_legal" };

function ReleaseNotePanel({ form, update, team, setTeam }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, minWidth: 240, maxWidth: 340, background: "var(--bg-card)", padding: 10 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {NOTE_PANEL_TEAMS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTeam(t)}
            className={styles.tabBtn}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 11,
              padding: "3px 8px",
              fontWeight: team === t ? 700 : 400,
              color: team === t ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <textarea
        className={styles.textarea}
        style={{ minHeight: 90 }}
        value={form?.[NOTE_FIELD_BY_TEAM[team]] || ""}
        onChange={(e) => update(NOTE_FIELD_BY_TEAM[team], e.target.value)}
        placeholder="Tình trạng data, xác nhận gói HTTT..."
      />
    </div>
  );
}

// Round 88 item 3 — floating Save button. Every tab on this page ends
// with a SaveBar, and the form itself can run long (Overview especially),
// so per explicit request Save now also floats bottom-right — "where
// nothing live" — so it's reachable without scrolling all the way down.
// It only shows up once the REAL (inline) Save button has scrolled out of
// view, via IntersectionObserver on that real button — the moment it's
// back in view (i.e. actually at the bottom), the floating one disappears
// so there's never two Save buttons visible at once, per "if they have a
// view on the button, show it where it is as current instead".
function SaveBar({ onSave, saving }) {
  const btnRef = useRef(null);
  const [showFloating, setShowFloating] = useState(false);

  useEffect(() => {
    const el = btnRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setShowFloating(!entry.isIntersecting), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div style={{ marginTop: 20 }}>
        <button ref={btnRef} className={styles.btnPrimary} onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {showFloating && (
        <button
          className={styles.btnPrimary}
          onClick={onSave}
          disabled={saving}
          style={{ position: "fixed", bottom: 24, right: 24, zIndex: 250, boxShadow: "0 4px 16px rgba(0,0,0,0.45)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      )}
    </>
  );
}

function Field({ label, children, style }) {
  return (
    <div className={styles.field} style={style}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

// Loại Dự Án is no longer a static dropdown — it's the booking pipeline:
// BRIEF & DATA -> SENT TO MARKETING (once the Package Ticket is sent) ->
// DEALING (once Marketing marks that ticket COMPLETE, persists until
// artist locks in) -> a real resolved package (set once the artist locks
// one in via the magic link). Shows the current stage — no manual
// "Advance" action anymore; sending the package ticket to Marketing
// (below, in the Package section) is what moves BRIEF & DATA -> SENT TO
// MARKETING, and Marketing completing that ticket is what moves SENT TO
// MARKETING -> DEALING. Once resolved to a real package, shows that value
// read-only plus the derived Phụ Lục requirement.
function PipelineControl({ form, update, setTab }) {
  const stage = form.project_type;
  const isPipelineStage = PIPELINE_STAGES.includes(stage);

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className={styles.statusBadge} style={{ background: "rgba(255,107,26,0.15)", color: "#ff9d5c" }}>
          {stage}
        </span>
        {!isPipelineStage && (
          <button
            onClick={() => setTab?.("media_booking")}
            title="Jump to the chosen package's full details"
            style={{ background: "none", border: "none", color: "#ff9d5c", fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline" }}
          >
            View package details →
          </button>
        )}
        {stage === "BRIEF & DATA" && (
          <span style={{ color: "var(--text-faint)", fontSize: 11 }}>
            Moves to SENT TO MARKETING automatically once a Package Ticket is sent (see Package section below)
          </span>
        )}
        {stage === "SENT TO MARKETING" && (
          <span style={{ color: "var(--text-faint)", fontSize: 11 }}>
            Waiting on Marketing to build and complete the package — moves to DEALING automatically once that Media Booking ticket is marked COMPLETE
          </span>
        )}
        {stage === "DEALING" && (
          <span style={{ color: "var(--text-faint)", fontSize: 11 }}>
            Waiting on artist to pick a package via the magic link (see Package section below)
          </span>
        )}
      </div>
      {!isPipelineStage && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-faint)" }}>
          Resolved package — <span style={{ color: "#ffca4d" }}>Phụ Lục required, see URL tab.</span>
        </div>
      )}
      <p style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 8, marginBottom: 0 }}>
        Click Save below to persist a stage change.
      </p>
    </div>
  );
}

function fmtVnd(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

function OverviewTab({ form, update, metaDone, requiredMetaDone, requiredMetaDoneLive, uploadReady, onSave, saving, onUpload, onUnlockNeedsUpdate, packageItems, magicLinkUrl, onToggleLock, onSendPackageTicket, hasMediaBookingTicket, mediaBookingTicket, onSendIntMediaTicket, canSimulate, onSendIntSupportPackage, onSendOnlyPh, pitchingTicket, pitchingTypesDraft, onPitchingToggle, pitchingInfoTicket, onSendPitchingInfoTicket, artistProfileTypesDraft, onArtistProfileToggle, coTrongNetDraft, onCoTrongNetChange, onSendCoTrongNetYoutube, gateTicketMap, setTab, pseudoParent, pseudoParentMagicLink, pseudoParentError }) {
  const [genres, setGenres] = useState([]);
  const [topics, setTopics] = useState([]);
  const [channels, setChannels] = useState([]);
  const [artistsList, setArtistsList] = useState([]);
  const [labelsList, setLabelsList] = useState([]);
  const [labelDraft, setLabelDraft] = useState(form.label || "");

  useEffect(() => {
    setLabelDraft(form.label || "");
  }, [form.label]);

  // Hợp Tác lives on the labels table, not the release — same
  // denormalized-text lookup pattern the old Curve ID field used (matches
  // by label_name). Shown read-only right below Label, in the space that
  // opened up once Curve ID was removed from this column.
  // Round 87 — now pulls hop_tac_status (not just hop_tac) so this can show
  // the same white/grey/gold/green status colors as the Label List itself
  // (item 4: "This will also apply the view to the detail new release
  // page"), and so Phụ Lục Publishing can be force-locked once this
  // label's Hợp Đồng Publishing is done (item 6).
  const [labelRow, setLabelRow] = useState(null);
  useEffect(() => {
    if (!supabase || !form.label) { setLabelRow(null); return; }
    supabase.from("labels").select("hop_tac_status").eq("label_name", form.label).maybeSingle()
      .then(({ data }) => setLabelRow(data || null));
  }, [form.label]);

  const publishingHdLocked = publishingHdDone(labelRow);
  useEffect(() => {
    if (publishingHdLocked && form.gate_phu_luc_publishing !== "false") {
      update("gate_phu_luc_publishing", "false");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishingHdLocked]);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("lookup_options")
      .select("category, value, label")
      .eq("active", true)
      .in("category", ["genre", "topic", "channel"])
      .order("sort_order")
      .then(({ data }) => {
        setGenres((data || []).filter((r) => r.category === "genre"));
        setTopics((data || []).filter((r) => r.category === "topic"));
        setChannels((data || []).filter((r) => r.category === "channel"));
      });
    supabase.from("artists").select("stage_name, labels(label_name)").order("stage_name").then(({ data }) => setArtistsList(data || []));
    supabase.from("labels").select("label_name").order("label_name").then(({ data }) => setLabelsList(data || []));
  }, []);

  return (
    <div>
      <div className={styles.grid2}>
        <Field label="Media Channel">
          <select className={styles.select} value={form.requester_segment || ""} onChange={(e) => update("requester_segment", e.target.value)}>
            <option value="">— Chọn —</option>
            {channels.map((opt) => <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select className={styles.select} value={form.release_category || "New Release"} onChange={(e) => update("release_category", e.target.value)}>
            <option value="New Release">New Release</option>
            <option value="Remarketing">Remarketing</option>
          </select>
        </Field>
        <Field label="Thể Loại (Genre)">
          <select className={styles.select} value={form.genre || ""} onChange={(e) => update("genre", e.target.value)}>
            <option value="">— Chọn thể loại —</option>
            {genres.map((opt) => <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>)}
          </select>
        </Field>
        <Field label="Chủ Đề (Topic)">
          <select className={styles.select} value={form.theme || ""} onChange={(e) => update("theme", e.target.value)}>
            <option value="">— Chọn chủ đề —</option>
            {topics.map((opt) => <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>)}
          </select>
        </Field>
        <Field label="Single/Album/EP">
          <select className={styles.select} value={form.single_album_ep || "Single"} onChange={(e) => update("single_album_ep", e.target.value)}>
            <option value="Single">Single</option>
            <option value="EP">EP</option>
            <option value="Album">Album</option>
          </select>
        </Field>
      </div>

      {form.single_album_ep !== "Single" && (
        <TracklistSection releaseId={form.id} />
      )}

      {/* UPC/ISRC/Apple ID hidden from Overview ("ẩn đi, không hiện ở dự án")
          — they're redundant here: UPC already lives on the URL tab
          (:1219), ISRC/Apple ID already live on the Pitching tab (:1516,
          :1519). Same form.upc/isrc/apple_id columns, just one fewer place
          showing them. */}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "start" }}>
        <div>
          {/* Round 83 item 3 — gap fix: this whole block (pipeline stage +
              the "Package (Gói Hỗ Trợ Truyền Thông)" summary) used to
              render unconditionally even for a pseudo-linked track, so it
              kept showing that track's OWN (stuck-at-BRIEF-&-DATA, never
              actually going anywhere) package status right above the
              correctly-hidden Package Actions section below — misleading,
              since this release's package flow is supposed to be fully
              replaced by the parent's. Now swapped for a short pointer to
              the inherited package instead, same as everywhere else this
              page already handles the pseudoParent case. */}
          {pseudoParent ? (
            <>
              <div className={styles.subheading} style={{ marginTop: 0 }}>Trạng Thái Gói (Loại Dự Án)</div>
              <p style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 0 }}>
                This release inherits its package from{" "}
                <Link href={`/releases/${pseudoParent.id}`} className={styles.rowLink}>{pseudoParent.title} ({pseudoParent.did})</Link>
                {" "}— see "Package (Inherited)" below.
              </p>
            </>
          ) : (
            <>
              <div className={styles.subheading} style={{ marginTop: 0 }}>Trạng Thái Gói (Loại Dự Án)</div>
              <PipelineControl form={form} update={update} setTab={setTab} />

              {/* Round 72 — item 3: moved here from further down the page
                  (used to sit right before the Upload section, well below
                  this box) — per explicit request, right under the package
                  status box instead. The rest of that section (Tổng Giá Trị
                  Gói, Lock/Send Ticket buttons, magic link box) stays where
                  it was. */}
              <div className={styles.subheading}>Package (Gói Hỗ Trợ Truyền Thông)</div>
              {PIPELINE_STAGES.includes(form.project_type) ? (
                <p style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 0 }}>
                  No contract type resolved yet — package details will show once the artist locks one in.
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 0 }}>
                  Contract type: <strong style={{ color: "#ff9d5c" }}>{form.project_type}</strong>
                  {form.package_locked && <span style={{ color: "var(--text-faint)" }}> (locked)</span>}
                </p>
              )}
            </>
          )}
        </div>
        <div>
          <Field label="Label">
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <LabelInput
                  styles={styles}
                  value={labelDraft}
                  onChange={setLabelDraft}
                  onBlur={(e) => {
                    const check = validateLabelNameEdit(form.label, e.target.value);
                    if (!check.ok) {
                      window.alert(check.message);
                      setLabelDraft(form.label || "");
                      return;
                    }
                    update("label", e.target.value);
                  }}
                  labels={labelsList}
                  placeholder="Tên label"
                />
              </div>
              <QuickCreate kind="label" onCreated={(newLabel) => { setLabelsList((prev) => [...prev, newLabel]); setLabelDraft(newLabel.label_name); update("label", newLabel.label_name); }} />
            </div>
          </Field>
          {/* Blank space that opened up below Label once Curve ID was
              removed from this column — now shows the label's Hợp Tác
              tags (read-only; edited on the Label List itself), colored by
              status the same way the Label List shows them (Round 87). */}
          {labelRow && (
            <div style={{ marginTop: -8, marginBottom: 16 }}>
              <label className={styles.fieldLabel}>Hợp Tác</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {LABEL_HOP_TAC_OPTIONS.map((tag) => {
                  const status = hopTacTagStatus(labelRow, tag);
                  const color = hopTacStatusColor(status);
                  return (
                    <span key={tag} style={{ padding: "3px 10px", fontSize: 11, fontWeight: 700, borderRadius: 999, background: color.bg, color: color.fg, border: "1px solid var(--border)" }}>
                      {tag}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Round 79 — moved Package Actions (and the Track DID / pseudo-
          package section that gates it) up here, right under the Package
          (Gói Hỗ Trợ Truyền Thông) summary box above — per explicit
          request, everything about the package should live in one place
          instead of Package Actions sitting far down the page below
          Metadata/Marketing/Upload. */}
      {/* Round 79 — item 2: "pseudo package" — a single spun off from an
          EP/Album can link here to its parent product instead of going
          through the whole booking process itself. Always shown (not
          hidden behind a toggle) since clearing it is just erasing this
          field's text. */}
      <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
        {/* Round 83 item 3 — relabeled from "Track DID (Pseudo Package)"
            per explicit request, to say what's actually being entered
            here: the PARENT EP/Album's DID, not this track's own. Field
            name/behavior unchanged (still releases.pseudo_package_parent_did). */}
        <div className={styles.subheading} style={{ marginTop: 0 }}>EP/Album DID (Pseudo Package)</div>
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8, maxWidth: 520 }}>
          If this release is a single spun off from an EP/Album, enter that parent EP/Album's DID here
          — it removes this release's own package flow entirely and inherits the parent's package and
          magic link instead, skips Package Actions below entirely, and won't show up on the Booking Board.
        </p>
        <div style={{ maxWidth: 420 }}>
          <RelatedDidField styles={styles} value={form.pseudo_package_parent_did || ""} onChange={(v) => update("pseudo_package_parent_did", v)} />
        </div>
        {pseudoParentError && (
          <p style={{ fontSize: 11, color: "var(--error-fg, #e57373)", marginTop: 6 }}>⚠ {pseudoParentError}</p>
        )}
        {pseudoParent && (
          <p style={{ fontSize: 11, color: "var(--success-fg, #7ee6a8)", marginTop: 6 }}>
            ✓ Linked to <Link href={`/releases/${pseudoParent.id}`} className={styles.rowLink}>{pseudoParent.title} ({pseudoParent.did})</Link> — package/magic link below are inherited live from that release, not saved separately here.
          </p>
        )}
      </div>

      {pseudoParent ? (
        <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
          <div className={styles.subheading} style={{ marginTop: 0 }}>Package (Inherited)</div>
          <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 8 }}>
            This is a pseudo-package track — its package always mirrors its parent EP/Album's live,
            it's never its own. Build/edit the package on the parent release, not here.
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Contract type: <strong>{pseudoParent.project_type || "—"}</strong>
            {pseudoParent.package_total_value != null && <> · Tổng Giá Trị Gói: <strong>{fmtVnd(pseudoParent.package_total_value)}</strong></>}
          </p>
          {pseudoParentMagicLink ? (
            <div style={{ marginTop: 10, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
                Inherited link — this is the parent's own magic link; this track doesn't get its own:
              </div>
              <a href={pseudoParentMagicLink} target="_blank" rel="noopener noreferrer" style={{ color: "#ff6b1a", fontSize: 13, wordBreak: "break-all" }}>
                {pseudoParentMagicLink}
              </a>
            </div>
          ) : (
            <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>
              The parent release doesn't have a magic link yet — one will show here automatically
              once it's built and confirmed on the parent.
            </p>
          )}
        </div>
      ) : (
      <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
        {/* Round 72 — item 3: heading + contract-type line moved up to
            right under the package status box (see above) — kept this
            smaller continuation heading so the actions below still read
            as belonging to the Package section instead of dangling with
            no context. */}
        <div className={styles.subheading} style={{ marginTop: 0 }}>Package Actions</div>

        {form.package_total_value != null && (
          <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 12 }}>
            Tổng Giá Trị Gói: <strong style={{ color: "var(--text-muted)" }}>{fmtVnd(form.package_total_value)}</strong>
            {" · "}Thanh Toán: <strong style={{ color: "var(--text-muted)" }}>{form.package_payment_status}</strong>
            {" · "}<span style={{ color: "var(--text-faint)" }}>Full item breakdown is on the Media Booking tab.</span>
          </p>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className={styles.btnSmall}
            onClick={onToggleLock}
            disabled={PIPELINE_STAGES.includes(form.project_type)}
            style={PIPELINE_STAGES.includes(form.project_type) ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
            title={PIPELINE_STAGES.includes(form.project_type) ? "Nothing to lock yet — wait until the artist has picked a package" : undefined}
          >
            {form.package_locked ? "Unlock editing" : "Lock editing"}
          </button>
          <button
            className={styles.btnSmall}
            onClick={onSendPackageTicket}
            disabled={hasMediaBookingTicket && mediaBookingTicket?.status !== "COMPLETE"}
            style={hasMediaBookingTicket && mediaBookingTicket?.status !== "COMPLETE" ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
            title={
              !hasMediaBookingTicket
                ? undefined
                : mediaBookingTicket?.status === "COMPLETE"
                ? "Reopens the same ticket for Marketing — use this after artist feedback, or for an internal rebook."
                : "A Media Booking ticket already exists for this release and is still in progress."
            }
          >
            {!hasMediaBookingTicket
              ? "Send Package Ticket to Marketing"
              : mediaBookingTicket?.status === "COMPLETE"
              ? "Send Package Ticket Again"
              : "Package Ticket Already Sent"}
          </button>
          {form.project_type === "Chỉ Phát Hành" && (
            <button
              className={styles.btnSmall}
              onClick={onSendIntMediaTicket}
              disabled={form.int_media_requested}
              style={form.int_media_requested ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
              title="Reopens the Media Booking ticket for Marketing to build an INT MEDIA add-on package"
            >
              {form.int_media_requested ? "INT MEDIA Follow-up Sent" : "Send INT MEDIA Follow-up"}
            </button>
          )}
          {/* Round 77 — item 4b: fast-track buttons that run the same
              "simulation" Package Runner does (see canSimulate,
              lib/packageSimulator.js), directly from the release itself
              instead of a separate tool page. Round 83 item 1 — opened up
              to every AR team member, not just dev (see canSimulate). */}
          {canSimulate && (
            <>
              <button
                className={styles.btnSmall}
                onClick={onSendIntSupportPackage}
                disabled={form.int_media_requested}
                style={form.int_media_requested ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                title="Locks this release straight to INT MEDIA and reopens/sends the Media Booking ticket for Marketing to build it, without waiting on the magic link."
              >
                {form.int_media_requested ? "INT SUPPORT PACKAGE Sent" : "SEND INT SUPPORT PACKAGE"}
              </button>
              <button
                className={styles.btnSmall}
                onClick={onSendOnlyPh}
                disabled={form.package_locked}
                style={form.package_locked ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                title={
                  form.package_locked
                    ? "Already locked — this only runs before a package decision has been made."
                    : "Locks this release to Chỉ Phát Hành (as if the artist picked no package) without sending any ticket."
                }
              >
                ONLY PH
              </button>
            </>
          )}
        </div>

        {magicLinkUrl && (
          <div style={{ marginTop: 14, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
              Existing link for this release:
            </div>
            <a href={magicLinkUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#ff6b1a", fontSize: 13, wordBreak: "break-all" }}>
              {magicLinkUrl}
            </a>
          </div>
        )}
      </div>
      )}

      <div className={styles.subheading}>Name / Artist / Release Date (editing updates the title above)</div>
      <div className={styles.grid2}>
        {/* Round 68 — item 5: Feature Artist added back — it's a real
            releases.feature_artist column (used at New Release creation,
            and per-track on the Tracks tab), but was never actually
            rendered here on the detail page's own Overview fields. Name
            now spans the full row alone (per explicit layout ask) so Main
            Artist and Feature Artist can share the row right below it,
            same shape as the New Release form. */}
        <Field label="Name" style={{ gridColumn: "1 / -1" }}>
          <input className={styles.input} value={form.title || ""} onChange={(e) => update("title", e.target.value)} />
        </Field>
        <Field label="Main Artist">
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <ArtistInput styles={styles} value={form.main_artist} onChange={(v) => update("main_artist", v)} artists={artistsList} placeholder="Tên nghệ sĩ chính" />
            </div>
            <QuickCreate kind="artist" onCreated={(newArtist) => { setArtistsList((prev) => [...prev, newArtist]); update("main_artist", newArtist.stage_name); }} />
          </div>
        </Field>
        <Field label="Feature Artist">
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <ArtistInput styles={styles} value={form.feature_artist} onChange={(v) => update("feature_artist", v)} artists={artistsList} placeholder="Tên nghệ sĩ feature (nếu có)" />
            </div>
            <QuickCreate kind="artist" onCreated={(newArtist) => { setArtistsList((prev) => [...prev, newArtist]); update("feature_artist", newArtist.stage_name); }} />
          </div>
        </Field>
        <Field label="Release Date">
          <input type="date" className={styles.input} value={form.release_date || ""} onChange={(e) => update("release_date", e.target.value)} />
        </Field>
        <Field label="Release Time">
          <input type="time" className={styles.input} value={form.release_time || ""} onChange={(e) => update("release_time", e.target.value)} />
        </Field>
      </div>

      {form.needs_update && (
        <div style={{ background: "rgba(229,115,115,0.1)", border: "1px solid #e57373", borderRadius: 8, padding: 12, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ color: "#e57373", fontSize: 12, fontWeight: 700 }}>
            ⚠ {PRIORITY_MODE_WARNING} Smartlink is locked (URL tab) until the checklist below is complete.
          </div>
          {requiredMetaDone === REQUIRED_META_KEYS.length && (
            <button className={styles.btnSmall} onClick={onUnlockNeedsUpdate} style={{ borderColor: "#7ee6a8", color: "#7ee6a8", flexShrink: 0 }}>
              Checklist complete — unlock Smartlink
            </button>
          )}
        </div>
      )}

      <div className={styles.subheading}>Metadata Checklist ({metaDone}/6 — {requiredMetaDone}/{REQUIRED_META_KEYS.length} required)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        {META_ITEMS.map((m) => (
          <div key={m.key} className={styles.field} style={{ marginBottom: 0 }}>
            <label className={styles.fieldLabel}>{m.label}{REQUIRED_META_KEYS.includes(m.key) ? " *" : ""}</label>
            <GateToggle value={form[m.key] || "false"} onChange={(v) => update(m.key, v)} />
            {/* MV type — same field the Pre-release Workstation edits
                (releases.canva_status, labeled "MV" there), surfaced here
                too once MV is ticked Yes, per explicit request. */}
            {m.key === "meta_mv" && form.meta_mv === "true" && (
              <div style={{ marginTop: 6 }}>
                <PickSelect styles={styles} opts={MV_TYPE_OPTIONS} value={form.canva_status} onChange={(v) => update("canva_status", v)} placeholder="— MV type —" />
              </div>
            )}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: -12, marginBottom: 20 }}>
        * Required for Send Upload (Audio, Artwork, Lyric, Metadata). Working Files and MV are tracked here but don't block the ticket. TBU counts the same as No for gating — it's not done yet.
      </p>

      {/* Marketing Checklist — rendered directly under Metadata Checklist
          (not inside GateFields) per follow-up feedback: the whole group
          belongs here, not split with Project Proposal alone up here and
          Artist Info/Artist Photo left below in the request section. */}
      <div className={styles.subheading}>Marketing Checklist</div>
      <GateGrid styles={styles} fields={MARKETING_CHECKLIST_FIELDS} form={form} update={update} />

      {/* "Other Checklist" (Sony Publish/Publishing/Splitshare/Request Phụ
          Lục as plain Yes/No) removed — it duplicated fields that now live
          as tri-state (with TBU) in the Marketing Request group below via
          GateFields: gate_sony_publish, gate_split_share, gate_phu_luc_mg /
          gate_phu_luc_truyen_thong / gate_phu_luc_publishing. The old
          "PUBLISHING" box here was also a straight duplicate of
          Additional Request's old gate_publishing field ("bị trùng
          publishing") — both are gone now, folded into the Phụ Lục
          Publishing field instead. */}

      <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
        <button
          className={styles.btnPrimary}
          disabled={!uploadReady || form.requested}
          onClick={onUpload}
          style={{ opacity: form.requested ? 0.5 : uploadReady ? 1 : 0.3 }}
        >
          {form.requested ? "UPLOAD SENT" : "SEND UPLOAD"}
        </button>
        {!form.requested && !!pitchingTicket?.data?.priority && requiredMetaDone < REQUIRED_META_KEYS.length && (
          <p style={{ color: "#e57373", fontSize: 11, marginTop: 8, marginBottom: 0 }}>
            Priority Pitching is ticked — Send Upload is unlocked, please fill in Metadata Checklist.
          </p>
        )}
        {!form.requested && pitchingTypesDraft.priority && !pitchingTicket?.data?.priority && requiredMetaDone < REQUIRED_META_KEYS.length && (
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 8, marginBottom: 0 }}>
            Priority Pitching is ticked but not saved yet — hit Save below to unlock Send Upload.
          </p>
        )}
        {!form.requested && !uploadReady && requiredMetaDoneLive !== requiredMetaDone && (
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 8, marginBottom: 0 }}>
            Metadata Checklist has unsaved changes — hit Save below before Send Upload picks them up.
          </p>
        )}
      </div>

      {/* Round 88 2nd follow-up — Copyright Checklist moved out of
          Overview into its own "Copyrights" tab (see CopyrightsTab below)
          per explicit request; no longer rendered here. */}

      <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
        <GateFields
          styles={styles}
          form={form}
          update={update}
          pitchingTypes={pitchingTypesDraft}
          onPitchingToggle={onPitchingToggle}
          pitchingInfoTicket={pitchingInfoTicket}
          onSendPitchingInfoTicket={onSendPitchingInfoTicket}
          artistProfileTypes={artistProfileTypesDraft}
          onArtistProfileToggle={onArtistProfileToggle}
          coTrongNetDraft={coTrongNetDraft}
          onCoTrongNetChange={onCoTrongNetChange}
          onSendCoTrongNetYoutube={onSendCoTrongNetYoutube}
          coTrongNetSent={!!gateTicketMap?.co_trong_net_youtube}
          youtubeAdsUrl={form.youtube_ads_url}
          youtubeBookingNote={form.youtube_ads_booking_note}
          onChangeYoutubeAdsUrl={(v) => update("youtube_ads_url", v)}
          onChangeYoutubeBookingNote={(v) => update("youtube_ads_booking_note", v)}
          ticketMap={gateTicketMap}
          sonyPublishMetaReady={requiredMetaDoneLive === REQUIRED_META_KEYS.length}
          publishingHdLocked={publishingHdLocked}
        />

        {/* Moved here from the old "Pre-release & Note" tab, right before
            Save. Round 68 — item 4 first introduced one note PER TEAM here
            with its own tab picker. Round 86 follow-up item 3 swapped that
            around per explicit request: team-switching now lives on the
            top-right ReleaseNotePanel next to the header instead (see
            NOTE_PANEL_TEAMS/ReleaseNotePanel above) — every OTHER team's
            note belongs in "their corresponding workstation", so this
            Overview field is AR's own note only, plain textbox, no tabs. */}
        <div className={styles.subheading}>Next Step Note (AR)</div>
        <Field label="">
          <textarea
            className={styles.textarea}
            value={form[NOTE_FIELD_BY_TEAM.AR] || ""}
            onChange={(e) => update(NOTE_FIELD_BY_TEAM.AR, e.target.value)}
            placeholder="Tình trạng data, xác nhận gói HTTT..."
          />
        </Field>

        <SaveBar onSave={onSave} saving={saving} />
      </div>
    </div>
  );
}

// Tracklist — only shown when single_album_ep is EP/Album. Own supabase
// CRUD (immediate-write, matching the app's default pattern elsewhere)
// rather than going through the Overview tab's staged form/Save, since
// these are separate rows in release_tracks, not columns on releases.
//
// Round 88 2nd follow-up — reused (unchanged) from the Overview tab, AND
// now also rendered inside the new Copyrights tab for EP/Album releases,
// per explicit "allow to change the list from here or the tổng hợp tab" —
// both are just independent mounts of this same component against the
// same release_tracks rows, so an edit from either tab is immediately
// visible the next time the other tab loads. The `showCopyright` prop is
// the only difference between the two call sites: Copyrights renders it
// `true` to get each track's own copyright combo (4 fields × 3 rights)
// underneath; Overview keeps calling it with no copyright UI at all.
function TracklistSection({ releaseId, showCopyright = false }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [artistsList, setArtistsList] = useState([]);

  useEffect(() => {
    if (!supabase || !releaseId) return;
    load();
    supabase.from("artists").select("stage_name, labels(label_name)").order("stage_name").then(({ data }) => setArtistsList(data || []));
  }, [releaseId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("release_tracks").select("*").eq("release_id", releaseId).order("sort_order");
    setTracks(data || []);
    setLoading(false);
  }

  async function addTrack() {
    const nextOrder = tracks.length ? Math.max(...tracks.map((t) => t.sort_order)) + 1 : 1;
    const { data, error: err } = await supabase
      .from("release_tracks")
      .insert({ release_id: releaseId, sort_order: nextOrder, track_name: "" })
      .select()
      .single();
    if (!err && data) setTracks((prev) => [...prev, data]);
  }

  async function updateTrack(track, field, value) {
    setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, [field]: value } : t)));
    await supabase.from("release_tracks").update({ [field]: value }).eq("id", track.id);
  }

  async function removeTrack(track) {
    if (!window.confirm(`Remove "${track.track_name || "this track"}"?`)) return;
    setTracks((prev) => prev.filter((t) => t.id !== track.id));
    await supabase.from("release_tracks").delete().eq("id", track.id);
  }

  // Round 88 follow-up 4 — "copy this track's copyright fields to the
  // whole bunch," per explicit request. Filling in Owner/Validity/Contract
  // per-right on one track and then copying it to every other track saves
  // re-typing the same combo N times when a whole EP/Album genuinely
  // shares the same owner/contract — an EP/Album with per-track exceptions
  // can still edit any individual track afterward, this is just a fast
  // starting point, not a lock. Confirms first since it overwrites every
  // other track's copyright fields, not just fills in blanks.
  async function copyCopyrightToAllTracks(sourceTrack) {
    const others = tracks.filter((t) => t.id !== sourceTrack.id);
    if (others.length === 0) return;
    if (!window.confirm(`Copy this track's Copyright Checklist to all ${tracks.length} tracks? This overwrites every other track's copyright fields.`)) return;
    const value = sourceTrack.copyright_checklist;
    setTracks((prev) => prev.map((t) => (t.id === sourceTrack.id ? t : { ...t, copyright_checklist: value })));
    await Promise.all(others.map((t) => supabase.from("release_tracks").update({ copyright_checklist: value }).eq("id", t.id)));
  }

  if (loading) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div className={styles.subheading} style={{ marginTop: 0 }}>Tracklist</div>
      {tracks.length === 0 && <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 10 }}>No tracks added yet.</p>}
      {tracks.map((t) => (
        <div key={t.id} style={{ marginBottom: showCopyright ? 16 : 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "50px 2fr 1.5fr 1.5fr 32px", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "center" }}>#{t.sort_order}</div>
            <input
              className={styles.input}
              value={t.track_name || ""}
              placeholder="Track name"
              onChange={(e) => updateTrack(t, "track_name", e.target.value)}
            />
            <ArtistInput
              styles={styles}
              value={t.main_artist || ""}
              onChange={(v) => updateTrack(t, "main_artist", v)}
              artists={artistsList}
              placeholder="Main artist"
            />
            <ArtistInput
              styles={styles}
              value={t.feature_artist || ""}
              onChange={(v) => updateTrack(t, "feature_artist", v)}
              artists={artistsList}
              placeholder="Feature artist"
            />
            <button onClick={() => removeTrack(t)} className={styles.btnSmall} style={{ padding: "4px 8px" }} title="Remove track">✕</button>
          </div>
          {showCopyright && (
            <div style={{ marginTop: 8, marginLeft: 58 }}>
              {tracks.length > 1 && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                  <button
                    type="button"
                    onClick={() => copyCopyrightToAllTracks(t)}
                    className={styles.btnSmall}
                    title="Copy this track's Copyright Checklist to every other track in this release"
                  >
                    ⧉ Copy to all tracks
                  </button>
                </div>
              )}
              <CopyrightChecklistFields
                styles={styles}
                compact
                value={t.copyright_checklist}
                onChange={(v) => updateTrack(t, "copyright_checklist", v)}
              />
            </div>
          )}
        </div>
      ))}
      <button onClick={addTrack} className={styles.btnSmall}>+ Add Track</button>
    </div>
  );
}

// Round 88 2nd follow-up — the Copyright Checklist's own tab. Release-
// level checklist always shows (this is "just the move" for a Single —
// same 3 rights, same fields, previously rendered inline on Overview).
// For EP/Album, the tracklist ALSO shows here (same TracklistSection
// Overview already uses, just with showCopyright — see above), with each
// track getting its own independent copyright combo underneath it, since
// an EP/Album's individual songs can genuinely have different
// owners/contracts from each other and from the release as a whole.
function CopyrightsTab({ form, update, onSave, saving }) {
  const isSingle = form.single_album_ep === "Single";
  return (
    <div>
      {/* Round 92 — AR's own general note for the product, per explicit
          request ("count as the AR team note for the product note") —
          not itself part of the copyright data, just living on this tab
          since that's where it was asked for. Plain text, staged/saved
          the same way as every other field on this tab (releases.ar_product_note). */}
      <div className={styles.subheading} style={{ marginTop: 0 }}>AR Note</div>
      <textarea
        className={styles.input}
        style={{ width: "100%", boxSizing: "border-box", minHeight: 70, resize: "vertical", fontFamily: "inherit", marginBottom: 20 }}
        value={form.ar_product_note || ""}
        onChange={(e) => update("ar_product_note", e.target.value)}
        placeholder="General AR note for this product…"
      />

      <div className={styles.subheading}>Copyright Checklist{isSingle ? "" : " — Release-wide"}</div>
      <CopyrightChecklistFields
        styles={styles}
        value={form.copyright_checklist}
        onChange={(v) => update("copyright_checklist", v)}
      />

      {!isSingle && (
        <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
          <TracklistSection releaseId={form.id} showCopyright />
        </div>
      )}

      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

function UrlTab({ form, update, onSave, saving, did, releaseId }) {
  const urlFields = [
    ["smartlink", "Smartlink"],
    ["link_lbm", "Link LBM"],
    ["link_share", "Link Share"],
    ["link_preorder", "Link Pre-order"],
    ["link_ugc", "Link UGC"],
    ["promotion_package_url", "URL Promotion Package"],
    ["artist_photo_url", "Artist Photo URL"],
    ["project_proposal_url", "Project Proposal URL"],
    ["drive_link", "Link Drive"],
    // Round 92 — same underlying value as the Có Trong Net YouTube panel's
    // YouTube URL field (Data Request grid, Overview tab) and Booking
    // Board's YouTube Ads column popup — one column, editable from any of
    // the 3 places per explicit "add and link to the url tab" request.
    ["youtube_ads_url", "YouTube Ads URL"],
    // Taken from / linked with the same column edited on the Pre-release
    // Workstation (app/workstation/pre-release/page.js) — that page still
    // has its own edit surface too; this is an added edit surface on the
    // detail page's URL tab, not a move.
    ["musixmatch_link", "Musixmatch URL"],
    // Round 46 — old-system "LINK GÓI TT" from the legacy booking board
    // data, kept for backup/reference only. Not tied to any V2 workflow.
    ["link_goi_tt_legacy", "Link Gói TT (Legacy)"],
  ];
  const plStatus = phuLucStatusClient(form);
  return (
    <div>
      <div className={styles.grid2}>
        <Field label="UPC">
          <input className={styles.input} value={form.upc || ""} onChange={(e) => update("upc", e.target.value)} />
        </Field>
        {/* Link Media Report keeps its label but is no longer hand-typed —
            it's auto-mapped to whatever magic link exists for this release
            (set the moment one is generated from the media-booking ticket),
            so it always matches what the artist was actually sent. Round 54
            — the SAME link now has 2 names depending on whether the Booking
            Board's "Convert Media Report" has been clicked yet for this
            release: "Package Offer" before, "Media Report" after — see
            release.media_report_status. */}
        <Field label={form.media_report_status ? "Link Media Report" : "Link Package Offer"}>
          {form.link_media_report ? (
            <a
              href={form.link_media_report}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.input}
              style={{ display: "block", color: "var(--accent)", textDecoration: "none", wordBreak: "break-all", lineHeight: "1.4" }}
            >
              {form.link_media_report}
            </a>
          ) : (
            <div className={styles.input} style={{ color: "var(--text-dim)", display: "flex", alignItems: "center" }}>
              auto-filled once a magic link is generated
            </div>
          )}
        </Field>
        {/* Round 88 follow-up 5 — the team's own domain has been hard to
            share/trust with artists, so links are now sometimes re-hosted
            through a third-party link host under a custom domain instead.
            This is that custom-domain URL, paired directly under the real
            auto-mapped link above (same Package Offer -> Media Report name
            toggle, since it's meant to point at that SAME link, just
            fronted by the team's own domain) — a manually-pasted record,
            not an automatic integration with any link-host API. */}
        <Field label={form.media_report_status ? "Custom Domain — Media Report" : "Custom Domain — Package Offer"}>
          <UrlField
            styles={styles}
            wide
            value={form.link_media_report_custom}
            onChange={(v) => update("link_media_report_custom", v)}
            placeholder="https://your-custom-domain.com/…"
          />
          <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3 }}>
            Optional — paste the third-party/custom-domain short link once created; point it at the link above.
          </div>
        </Field>
        {urlFields.map(([key, label]) =>
          key === "smartlink" && form.needs_update ? (
            <Field key={key} label={label}>
              <UrlField styles={styles} wide value={form[key]} onChange={(v) => update(key, v)} disabled disabledTitle={PRIORITY_MODE_WARNING} />
            </Field>
          ) : (
            <Field key={key} label={label}>
              <UrlField styles={styles} wide value={form[key]} onChange={(v) => update(key, v)} />
            </Field>
          )
        )}
      </div>
      <Field label="URL Phụ Lục">
        <UrlField styles={styles} wide value={form.link_phu_luc} onChange={(v) => update("link_phu_luc", v)} />
      </Field>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        Status Phụ Lục: <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{plStatus}</span>
        {" — "}{phuLucNextStep(form)}
      </p>

      {/* Round 72 — a real, separate "Publishing" ticket, built the same
          way the original Phụ Lục ticket is (releases.link_publishing/
          publishing_ngay_gui/publishing_ngay_ky, own status state machine,
          own ticket type) — NOT the same thing as Phụ Lục Publishing
          (round 71's PublishingUrlField reading a ticket's `data` was
          wrong/reverted; that field belongs to Phụ Lục Publishing only,
          left untouched again). See app/tickets/publishing/ for the list. */}
      <Field label="URL Publishing">
        <UrlField styles={styles} wide value={form.link_publishing} onChange={(v) => update("link_publishing", v)} />
      </Field>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        Status Publishing: <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{publishingStatusClient(form)}</span>
        {" — "}{publishingNextStep(form)}
      </p>

      <SaveBar onSave={onSave} saving={saving} />

      <AllUrlsSection did={did} releaseId={releaseId} />
    </div>
  );
}

// Mirrors publishing_status() in schema.sql — client-side, same idea as
// phuLucStatusClient above.
function publishingStatusClient(form) {
  if (form.link_publishing && form.publishing_ngay_ky) return "Đã Ký";
  if (form.link_publishing && form.publishing_ngay_gui) return "Chờ Ký";
  if (form.link_publishing) return "Đã Soạn";
  return "Chưa Soạn";
}

function publishingNextStep(form) {
  if (!form.link_publishing) return "add a URL Publishing above to begin.";
  if (!form.publishing_ngay_gui) return "next: set Ngày Gửi (Booking tab).";
  if (!form.publishing_ngay_ky) return "next: set Ngày Ký (Booking tab).";
  return "complete.";
}

// Pulls together every URL-shaped piece of data tied to this DID from
// everywhere else in the system — Booking Board links, ticket URL fields
// (Phái Sinh / Manual Claim / Report Conflict / any other type with a url
// or refLink field), and Magic Links — so this tab is the one place to
// see every link connected to the release, not just the columns on the
// release row itself. Read-only: each source still gets edited at its own
// canonical location (Booking Board, the ticket itself, etc.) — this is a
// convenience index, not a second copy to keep in sync.
function AllUrlsSection({ did, releaseId }) {
  const [groups, setGroups] = useState(null); // null = loading

  useEffect(() => {
    if (!supabase || !did || !releaseId) return;
    let cancelled = false;

    (async () => {
      const found = [];

      const { data: bookingLinks } = await supabase
        .from("media_booking_entries")
        .select("channel_name, platform, link")
        .eq("release_id", releaseId)
        .not("link", "is", null);
      (bookingLinks || []).forEach((b) => {
        (b.link || "").split("\n").map((u) => u.trim()).filter(Boolean).forEach((u) => {
          found.push({ source: "Booking Board", label: b.channel_name || b.platform || "Link", url: u });
        });
      });

      const { data: magicLinks } = await supabase
        .from("magic_links")
        .select("token, sent_at, created_at")
        .eq("release_id", releaseId)
        .order("created_at", { ascending: false });
      (magicLinks || []).forEach((m, i) => {
        found.push({
          source: "Magic Link",
          label: m.sent_at ? "Sent" : `Generated${i > 0 ? " (older)" : ""}`,
          url: `${window.location.origin}/pick-package/${m.token}`,
        });
      });

      const { data: tix } = await supabase
        .from("tickets")
        .select("id, tab_id, data, ticket_tabs(key)")
        .contains("data", { releaseId: did })
        .is("deleted_at", null);
      (tix || []).forEach((t) => {
        const tabKey = t.ticket_tabs?.key || "ticket";
        ["url", "refLink"].forEach((field) => {
          const raw = t.data?.[field];
          if (!raw) return;
          raw.split("\n").map((u) => u.trim()).filter(Boolean).forEach((u) => {
            found.push({ source: TICKET_TYPE_LABELS[tabKey] || tabKey, label: field === "refLink" ? "LBM url" : "URL", url: u });
          });
        });
      });

      if (!cancelled) setGroups(found);
    })();

    return () => { cancelled = true; };
  }, [did, releaseId]);

  const validLinks = (groups || []).filter((g) => /^https?:\/\/\S+$/i.test(g.url));

  return (
    <div style={{ marginTop: 28, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
      <div className={styles.subheading} style={{ marginTop: 0 }}>All URLs Related to This DID</div>
      <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: -8, marginBottom: 12 }}>
        Read-only — pulled from the Booking Board, every ticket referencing this release, and Magic Links. Edit each at its own source.
      </p>
      {groups === null ? (
        <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Loading…</div>
      ) : validLinks.length === 0 ? (
        <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Nothing found elsewhere yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          {validLinks.map((g, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
              <span style={{ color: "var(--text-faint)", minWidth: 110, flexShrink: 0 }}>{g.source} — {g.label}</span>
              <a href={g.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {g.url}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Clear, actionable next step instead of a vague "go check another tab"
// pointer — tells you exactly what's missing right now.
function phuLucNextStep(form) {
  if (!form.link_phu_luc) return "add a URL Phụ Lục above to begin.";
  if (!form.phu_luc_ngay_gui) return "next: set Ngày Gửi (Pre-release & Note tab).";
  if (!form.phu_luc_ngay_ky) return "next: set Ngày Ký (Pre-release & Note tab).";
  return "complete.";
}

// Mirrors phu_luc_status() in schema.sql — client-side so the URL tab can
// show it live without a round trip.
function phuLucStatusClient(form) {
  if (form.link_phu_luc && form.phu_luc_ngay_ky) return "Đã Ký";
  if (form.link_phu_luc && form.phu_luc_ngay_gui) return "Chờ Ký";
  if (form.link_phu_luc) return "Đã Soạn";
  return "Chưa Soạn";
}

// Mirrors the Booking Board's "All" filter exactly (app/booking/page.js) —
// one aggregate ratio per Hạng Mục, no brand/platform breakdown, and (same
// as Booking Board's "All" view) read-only: no add-link here anymore.
// Actual booking happens on the Booking Board, which has the real
// brand/platform-scoped columns this page used to fake with a flat
// TikTok/Facebook/Instagram/YouTube grid — that grid predated the
// category+brand model entirely and could drift from it (no category_id,
// no brand), so it's gone rather than kept in sync by hand. The old
// Direct/Partner "Channel Type" switch here is gone for the same reason —
// that split only ever applied to TikTok Channel (see Booking Board), not
// every category the way this page treated it.
// Which booking round applies to this release, decided automatically —
// no more manual INT/Đợt 1/Đợt 2 picker here (that's still on the Booking
// Board itself, unaffected — this tab is read-only, see the hint text
// below). Đợt 2 is never auto-picked yet ("hidden always for now" per the
// request that added this — nothing wired for it here yet). Rules:
//   - INT MEDIA package (project_type matches /int media/i), OR the
//     Chỉ Phát Hành + "Send INT MEDIA Follow-up" combo (int_media_requested)
//     -> "INT"
//   - any OTHER real resolved package (not BRIEF & DATA/DEALING, and not
//     bare Chỉ Phát Hành with no INT MEDIA follow-up yet) -> "Đợt 1"
//   - still BRIEF & DATA/DEALING, or Chỉ Phát Hành with no INT MEDIA
//     follow-up sent yet -> null, nothing to show
function resolveBookingRound(form) {
  const isIntType = !!form.project_type && /int\s*media/i.test(form.project_type);
  if (isIntType || form.int_media_requested) return "INT";
  if (!PIPELINE_STAGES.includes(form.project_type) && form.project_type && form.project_type !== "Chỉ Phát Hành") return "Đợt 1";
  return null;
}

function MediaBookingTab({ form, update, onSave, saving, entries, categories, packageItems, mediaBookingTicket, sectionRef, pseudoParent }) {
  // Round 83 item 3 — gap fix: a pseudo-linked track's own Media Booking
  // tab used to still render its own (separate, always-empty) package
  // builder content — a user could click into it and interact with data
  // that has nothing to do with the inherited package actually in effect.
  // Short-circuited here, same "removes all the package flow from that
  // product" intent as the Package Actions/pipeline-status gates already
  // applied elsewhere on this page.
  if (pseudoParent) {
    return (
      <div ref={sectionRef}>
        <p style={{ fontSize: 13, color: "var(--text-faint)" }}>
          This release is a pseudo-package track — its package is built and managed on the parent
          EP/Album, not here. See{" "}
          <Link href={`/releases/${pseudoParent.id}`} className={styles.rowLink}>{pseudoParent.title} ({pseudoParent.did})</Link>.
        </p>
      </div>
    );
  }
  const round = resolveBookingRound(form);
  const roundEntries = round ? entries.filter((e) => e.booking_round === round) : [];
  const feedbackText = mediaBookingTicket?.data?.feedback?.text;

  // "Booked" per Hạng Mục, read off the confirmed package (release_package_items
  // — set once the magic link is picked). Its `category` field is either
  // "CategoryName" or "CategoryName — Brand", so matching by prefix sums
  // every brand under that Hạng Mục, same aggregate the Booking Board's
  // "All" column computes from the live package lines.
  function bookedFor(categoryName) {
    const matching = packageItems.filter((it) => it.category === categoryName || (it.category || "").startsWith(`${categoryName} — `));
    if (matching.length === 0) return null;
    return matching.reduce((sum, it) => sum + (it.quantity || 0), 0);
  }

  function addedFor(categoryId) {
    return roundEntries.filter((e) => e.category_id === categoryId).length;
  }

  return (
    <div ref={sectionRef}>
      {feedbackText && (
        <div style={{ background: "rgba(255,107,26,0.08)", border: "1px solid var(--accent)", borderRadius: 8, padding: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-soft)", marginBottom: 4 }}>
            Artist feedback — package change requested
          </div>
          <div style={{ fontSize: 12, color: "#ddd", whiteSpace: "pre-line" }}>{feedbackText}</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
            Use "Send Package Ticket Again" above to send this back to Marketing.
          </div>
        </div>
      )}

      {packageItems.length > 0 && (
        <>
          <div className={styles.subheading} style={{ marginTop: 0 }}>Chosen Package — Itemized</div>
          <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
          <table className={styles.table} style={{ marginBottom: 24 }}>
            <thead><tr><th>Hạng Mục</th><th>Số Lượng</th><th>Chi Tiết</th><th>Thành Tiền</th></tr></thead>
            <tbody>
              {packageItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.category}</td>
                  <td>{item.quantity != null ? `${item.quantity} ${item.unit || ""}` : "—"}</td>
                  <td style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "pre-line" }}>{formatDetailText(item.detail) || "—"}</td>
                  <td>{fmtVnd(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: -16, marginBottom: 24 }}>
            The confirmed package itself isn't round-scoped — it's one package, picked once. Only the booking links and Added/Booked counts below change per round.
          </p>
        </>
      )}

      {/* No more manual INT/Đợt 1/Đợt 2 picker — round is decided
          automatically from the release's package state (see
          resolveBookingRound above) and just shown as a label, not a
          choice. Editing which round a link belongs to still happens on
          the Booking Board itself; this tab has only ever been a
          read-only summary (see the hint text at the bottom). */}
      {round ? (
        <>
          <div className={styles.subheading} style={{ marginTop: 0 }}>Booking Links — {round}</div>
          {roundEntries.filter((e) => e.link).length > 0 ? (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 24, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-line", color: "var(--text-muted)" }}>
              {roundEntries
                .filter((e) => e.link)
                .flatMap((e) => e.link.split("\n").map((u) => u.trim()).filter(Boolean).map((u) => `${e.channel_name ? e.channel_name : e.platform}: ${u}`))
                .join("\n")}
            </div>
          ) : (
            <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 24 }}>No links added for {round} yet.</p>
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
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 12 }}>
            Add/manage individual booking links on the Booking Board — this is a read-only summary per Hạng Mục, same as its "All" filter.
          </p>
        </>
      ) : (
        <p style={{ color: "var(--text-faint)", fontSize: 12 }}>
          Booking links will show here once a package is picked (or, for Chỉ Phát Hành, once an INT MEDIA follow-up is sent).
        </p>
      )}

      {/* Moved here from the old "Pre-release & Note" tab — Phụ Lục is a
          Booking-side deliverable, this tab is where it belongs. */}
      <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
        <div className={styles.subheading} style={{ marginTop: 0 }}>Phụ Lục (Booking)</div>
        <div className={styles.grid2}>
          <Field label="Ngày Gửi">
            <input type="date" className={styles.input} value={form.phu_luc_ngay_gui || ""} onChange={(e) => update("phu_luc_ngay_gui", e.target.value)} />
          </Field>
          <Field label="Ngày Ký">
            <input type="date" className={styles.input} value={form.phu_luc_ngay_ky || ""} onChange={(e) => update("phu_luc_ngay_ky", e.target.value)} />
          </Field>
        </div>
        <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -8, marginBottom: 0 }}>
          Status Phụ Lục: <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{phuLucStatusClient(form)}</span>
          {" — "}{phuLucNextStep(form)}
        </p>
        <SaveBar onSave={onSave} saving={saving} />
      </div>

      {/* Round 72 — same "Ngày Gửi/Ngày Ký" pattern as Phụ Lục (Booking)
          above, for the new separate Publishing ticket (URL Publishing
          lives on the URL tab). */}
      <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
        <div className={styles.subheading} style={{ marginTop: 0 }}>Publishing (Booking)</div>
        <div className={styles.grid2}>
          <Field label="Ngày Gửi">
            <input type="date" className={styles.input} value={form.publishing_ngay_gui || ""} onChange={(e) => update("publishing_ngay_gui", e.target.value)} />
          </Field>
          <Field label="Ngày Ký">
            <input type="date" className={styles.input} value={form.publishing_ngay_ky || ""} onChange={(e) => update("publishing_ngay_ky", e.target.value)} />
          </Field>
        </div>
        <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -8, marginBottom: 0 }}>
          Status Publishing: <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{publishingStatusClient(form)}</span>
          {" — "}{publishingNextStep(form)}
        </p>
        <SaveBar onSave={onSave} saving={saving} />
      </div>
    </div>
  );
}

function PitchingTab({ form, update, onSave, saving }) {
  const statusOpts = ["", "Chưa thực hiện", "Đang thực hiện", "Đã pitching", "Không thực hiện"];
  const nctZingOpts = ["", "Chưa thực hiện", "Đã pitching", "Không hỗ trợ", "Có gói"];
  return (
    <div>
      <div className={styles.grid2} style={{ marginBottom: 16 }}>
        <Field label="Priority Pitching">
          <select className={styles.select} value={form.priority_pitching || ""} onChange={(e) => update("priority_pitching", e.target.value)}>
            {statusOpts.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
          </select>
        </Field>
        <Field label="ISRC">
          <input className={styles.input} value={form.isrc || ""} onChange={(e) => update("isrc", e.target.value)} />
        </Field>
        <Field label="Apple ID">
          <input className={styles.input} value={form.apple_id || ""} onChange={(e) => update("apple_id", e.target.value)} />
        </Field>
      </div>

      <div className={styles.grid2}>
        <Field label="Spotify Status">
          <select className={styles.select} value={form.pitching_status_spotify || ""} onChange={(e) => update("pitching_status_spotify", e.target.value)}>
            {statusOpts.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
          </select>
        </Field>
        {/* Round 79 — Apple joined Priority/Spotify/NCT/Zing as a real
            tracked pitching platform (its own status column, own tab in
            the Pitching Workstation popup) — added here too so this
            column isn't only editable from the workstation. */}
        <Field label="Apple Status">
          <select className={styles.select} value={form.pitching_status_apple || ""} onChange={(e) => update("pitching_status_apple", e.target.value)}>
            {statusOpts.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
          </select>
        </Field>
        <Field label="NCT Status">
          <select className={styles.select} value={form.pitching_status_nct || ""} onChange={(e) => update("pitching_status_nct", e.target.value)}>
            {nctZingOpts.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
          </select>
        </Field>
        <Field label="Zing Status">
          <select className={styles.select} value={form.pitching_status_zing || ""} onChange={(e) => update("pitching_status_zing", e.target.value)}>
            {nctZingOpts.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
          </select>
        </Field>
      </div>

      <div className={styles.subheading}>Spotify Extra Fields</div>
      <div className={styles.grid2}>
        <Field label="Pitch Genre">
          <input className={styles.input} value={form.pitch_genre || ""} onChange={(e) => update("pitch_genre", e.target.value)} />
        </Field>
        <Field label="Mood">
          <input className={styles.input} value={form.pitch_mood || ""} onChange={(e) => update("pitch_mood", e.target.value)} />
        </Field>
        <Field label="Instrumental">
          <input className={styles.input} value={form.pitch_instrumental || ""} onChange={(e) => update("pitch_instrumental", e.target.value)} />
        </Field>
        <Field label="Pitch Note">
          <textarea className={styles.textarea} value={form.pitch_note || ""} onChange={(e) => update("pitch_note", e.target.value)} />
        </Field>
        <Field label="Memo">
          <textarea className={styles.textarea} value={form.pitch_memo || ""} onChange={(e) => update("pitch_memo", e.target.value)} />
        </Field>
      </div>
      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

// View-only display for a field OPS updates from its own workstation, not
// from here — reads straight off `form` (the same release row the
// workstation writes to), so it always reflects whatever OPS's workstation
// has live, no separate copy to fall out of sync. A URL renders as an
// openable link like everywhere else url-shaped values show up.
function ReadOnlyField({ label, value, isUrl }) {
  return (
    <Field label={label}>
      {value && isUrl ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className={styles.input} style={{ display: "block", color: "var(--accent)", textDecoration: "none", wordBreak: "break-all", lineHeight: "1.4" }}>
          {value}
        </a>
      ) : (
        <div className={styles.input} style={{ color: value ? "var(--text-muted)" : "var(--text-dim)", display: "flex", alignItems: "center" }}>
          {value || "—"}
        </div>
      )}
    </Field>
  );
}

function PreReleaseTab({ form, update, onSave, saving }) {
  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -4, marginBottom: 12 }}>
        The 6 fields below are set on the Pre-release Workstation, not here — view only. Whatever OPS updates there shows up here the next time this page loads.
      </p>
      <div className={styles.grid2}>
        <ReadOnlyField label="CANVAS MV Status" value={form.canva_mv_status} />
        <ReadOnlyField label="CANVAS Status" value={form.canva_status} />
        <ReadOnlyField label="Artist Pick Status" value={form.artist_pick_status} />
        <ReadOnlyField label="Musixmatch Link" value={form.musixmatch_link} isUrl />
        <ReadOnlyField label="Musixmatch Status" value={form.musixmatch_status} />
        <ReadOnlyField label="NCT Lyric" value={form.nct_lyric} />
      </div>

      {/* Phụ Lục (Booking) moved to the Media Booking tab, and Next Step
          Note moved to the bottom of Overview (right before Save) — both
          per explicit request. */}

      <div className={styles.subheading}>Linkshare Note</div>
      <div className={styles.grid2}>
        <Field label="Tiktok Release Timing">
          <select className={styles.select} value={form.linkshare_tiktok_timing || ""} onChange={(e) => update("linkshare_tiktok_timing", e.target.value)}>
            <option value="">—</option>
            {LINKSHARE_TIKTOK_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Facebook Release Timing">
          <select className={styles.select} value={form.linkshare_facebook_timing || ""} onChange={(e) => update("linkshare_facebook_timing", e.target.value)}>
            <option value="">—</option>
            {LINKSHARE_FACEBOOK_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
      </div>

      <div className={styles.subheading}>Generated Notes (preview)</div>
      <pre style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
{buildProductNote(form)}
      </pre>
      <pre style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap", marginTop: 10 }}>
{buildLinkshareNote(form)}
      </pre>

      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

// View-only. Pulls stream metrics + milestone chart entries by DID.
// NOTE: matching derivative (phái sinh) tracks that aren't in NEW RELEASE
// isn't resolved yet — only an exact DID match is done here; fuzzy/derivative
// matching is flagged as a follow-up, not implemented in this pass.
function StreamingMilestoneTab({ form }) {
  const [metrics, setMetrics] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !form.did) { setLoading(false); return; }
    (async () => {
      const { data: links } = await supabase.from("release_dsp_links").select("id, platform, url_or_id").eq("release_id", form.id);
      let snaps = [];
      if (links && links.length) {
        const { data } = await supabase
          .from("dsp_metrics_snapshots")
          .select("*, release_dsp_links!inner(platform, release_id)")
          .eq("release_dsp_links.release_id", form.id)
          .order("fetched_at", { ascending: false })
          .limit(20);
        snaps = data || [];
      }
      const { data: chart } = await supabase
        .from("milestone_chart_entries")
        .select("*")
        .eq("did", form.did)
        .order("entry_date", { ascending: false });
      setMetrics(snaps);
      setMilestones(chart || []);
      setLoading(false);
    })();
  }, [form.id, form.did]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <span className={styles.fieldLabel}>Promotion Package</span>
        {form.promotion_package_url ? (
          <a href={form.promotion_package_url} target="_blank" rel="noopener noreferrer" title="Open Promotion Package link" style={{ fontSize: 18 }}>
            🔗
          </a>
        ) : (
          <span style={{ color: "var(--text-dim)", fontSize: 12 }}>no link set — add one on the URL tab</span>
        )}
      </div>

      {loading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : (
        <>
          <div className={styles.subheading}>Stream Numbers</div>
          {metrics.length === 0 ? (
            <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>No stream data linked yet.</p>
          ) : (
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table} style={{ marginBottom: 24 }}>
              <thead><tr><th>Platform</th><th>Streams</th><th>Fetched</th></tr></thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.id}>
                    <td>{m.release_dsp_links?.platform}</td>
                    <td>{m.streams ?? "—"}</td>
                    <td>{fmtDate(m.fetched_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          <div className={styles.subheading}>Milestone (Chart Rank)</div>
          <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: -8, marginBottom: 12 }}>
            Matched by exact DID ({form.did || "—"}). Derivative-track matching isn't implemented yet.
          </p>
          {milestones.length === 0 ? (
            <p style={{ color: "var(--text-faint)", fontSize: 12 }}>No milestone entries for this DID.</p>
          ) : (
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead><tr><th>Chart</th><th>Date</th><th>Rank</th><th>Platform</th></tr></thead>
              <tbody>
                {milestones.map((m) => (
                  <tr key={m.id}>
                    <td>{m.chart}</td>
                    <td>{fmtDate(m.entry_date)}</td>
                    <td>{m.rank}</td>
                    <td>{m.platform || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Team assignment per row is a BEST-GUESS mapping (per explicit request),
// not sourced from any existing data — nothing in the codebase ties these
// release-level fields to a team today. Assigned by which
// workstation/tab each field is normally edited from: Metadata Checklist,
// Smartlink/UPC/Link LBM/Link Share are all Upload/Confirm territory
// (OPS); Pitching status fields are the Pitching workstation (OPS);
// CANVAS Status/Artist Pick Status/Musixmatch are the Pre-release
// workstation (OPS); Media Booking entries is the Booking Board
// (Marketing); Link Drive is filled in at creation (AR). This is heavily
// OPS-weighted because most of these fields genuinely are OPS workstation
// fields today — correct any of these if they should sit elsewhere.
function TasklistTab({ form, bookingEntries }) {
  // Metadata Checklist fields are tri-state strings ("false"/"true"/"update"),
  // not real booleans — flagged with "gate: true" so the row below renders a
  // TBU state instead of just falling through the plain truthy check (which
  // would otherwise show "✓ Filled" for the string "false").
  const items = [
    ["Link Drive", form.drive_link, false, "AR"],
    ["Metadata: Audio", form.meta_audio, true, "OPS"],
    ["Metadata: Artwork", form.meta_artwork, true, "OPS"],
    ["Metadata: Working Files", form.meta_working_files, true, "OPS"],
    ["Metadata: Lyric", form.meta_lyric, true, "OPS"],
    ["Metadata: MV", form.meta_mv, true, "OPS"],
    ["Metadata: Doc", form.meta_doc, true, "OPS"],
    ["Smartlink", form.smartlink, false, "OPS"],
    ["UPC", form.upc, false, "OPS"],
    ["Link LBM", form.link_lbm, false, "OPS"],
    ["Link Share", form.link_share, false, "OPS"],
    ["Media Booking entries", bookingEntries.length > 0, false, "Marketing"],
    ["Pitching: Spotify", form.pitching_status_spotify, false, "OPS"],
    ["Pitching: NCT", form.pitching_status_nct, false, "OPS"],
    ["Pitching: Zing", form.pitching_status_zing, false, "OPS"],
    ["CANVAS Status", form.canva_status, false, "OPS"],
    ["Artist Pick Status", form.artist_pick_status, false, "OPS"],
    ["Musixmatch", form.musixmatch_link, false, "OPS"],
  ];

  const grouped = TEAMS.map((team) => ({ team, rows: items.filter((it) => it[3] === team) })).filter((g) => g.rows.length > 0);

  return (
    <div>
      {grouped.map(({ team, rows }) => (
        <div key={team} style={{ marginBottom: 20 }}>
          <div className={styles.subheading} style={{ marginTop: 0 }}>{team}</div>
          <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr><th>Field</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map(([label, val, isGate]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>
                    {isGate ? (
                      val === "true" ? (
                        <span style={{ color: "#7ee6a8" }}>✓ Filled</span>
                      ) : val === "update" ? (
                        <span style={{ color: "#ffca4d" }}>◐ TBU</span>
                      ) : (
                        <span style={{ color: "var(--text-dim)" }}>— Empty</span>
                      )
                    ) : val ? (
                      <span style={{ color: "#7ee6a8" }}>✓ Filled</span>
                    ) : (
                      <span style={{ color: "var(--text-dim)" }}>— Empty</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// buildProductNote/buildLinkshareNote moved to lib/releaseNotes.js so the
// OPS Upload ticket list can show the exact same live-computed notes
// (imported at the top of this file) without re-deriving the template.
