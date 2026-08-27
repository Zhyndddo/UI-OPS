"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { GateFields, GateToggle, GateGrid, MARKETING_CHECKLIST_FIELDS, CO_TRONG_NET_DRAFT_DEFAULTS } from "../../lib/GateFields";
import { MV_TYPE_OPTIONS } from "../../lib/pickerOptions";
import { publishingHdDone } from "../../lib/labelHopTacStatus";
import PickSelect from "../../lib/PickSelect";
import QuickCreate from "../../lib/QuickCreate";
import { LabelInput, ArtistInput } from "../../lib/ReferenceInputs";
import ArtistTagInput from "../../lib/ArtistTagInput";
import { buildLinkshareNote, defaultLinkshareFacebookTiming, defaultLinkshareTiktokTiming, LINKSHARE_TIKTOK_OPTIONS, LINKSHARE_FACEBOOK_OPTIONS } from "../../lib/releaseNotes";
// Round 86 follow-up item 7 — didPreview/didPrefixFor moved into
// lib/didHelpers.js so the release detail page's DID-recompute-on-Save
// logic can share the exact same _field_initials() mirror instead of a
// second hand-kept copy drifting out of sync.
import { didPreview, didPrefixFor } from "../../lib/didHelpers";
import { emptyCopyrightChecklist } from "../../lib/copyrightChecklist";
import CopyrightChecklistFields from "../../lib/CopyrightChecklistFields";
import NewReleaseTemplateTools from "../../lib/NewReleaseTemplateTools";
import styles from "./styles.module.css";

const EMPTY_FORM = {
  label: "",
  title: "",
  main_artist: "",
  feature_artist: "",
  // Round 97 — Main/Feature Artist as tags (see lib/ArtistTagInput.js).
  // main_artist/feature_artist above stay in sync (auto-derived, joined
  // with ", ") for DID generation and every existing string-based reader —
  // these arrays are the new SQL-filterable source of truth going forward.
  main_artist_tags: [],
  feature_artist_tags: [],
  // Round 97 — the real gate for creating Artist Profile ticket(s), split
  // out of gate_artist_profile ("Artist Info", now marketing-only — see
  // lib/GateFields.js). Default "false" like every other gate.
  gate_artist_profile_verify: "false",
  genre: "",
  requester_segment: "",
  release_category: "New Release",
  single_album_ep: "Single",
  tracks: [], // client-only — stripped before the releases insert, written to release_tracks after
  release_date: "",
  release_time: "19:00",
  theme: "",
  drive_link: "",
  // Round 212 — new field, per explicit request/layout change. Starts
  // blank (it's usually not known yet at setup time — "empty on the come
  // in, and then get filled by OPS team" via the same releases.upc
  // column the Upload/Re-Check workstations and the release detail
  // page's URL tab already read/write); just gives it a home on this
  // form's row 1 too instead of only ever being added later elsewhere.
  upc: "",
  brief: "",
  linkshare_tiktok_timing: "",
  linkshare_facebook_timing: "",
  meta_audio: "false",
  meta_artwork: "false",
  meta_working_files: "false",
  meta_lyric: "false",
  meta_mv: "false",
  canva_status: "", // MV type (Full/Lyric/Visualization) — same field the Pre-release Workstation edits, revealed under Metadata Checklist's MV toggle
  meta_doc: "false",
  gate_pitching: "false",
  // TBU by default — every release starts in BRIEF & DATA, which is
  // exactly the state that maps to "update" now that this is a read-only,
  // auto-computed status (see the effect in app/releases/[id]/page.js).
  gate_goi_ho_tro_truyen_thong: "update",
  gate_data_request: "false",
  gate_split_share: "false",
  gate_lyric_musixmatch: "false",
  gate_mv_spotify: "false",
  gate_discovery_mode_spotify: "false",
  gate_sony_publish: "false",
  gate_phu_luc_mg: "false",
  gate_phu_luc_truyen_thong: "false",
  gate_phu_luc_publishing: "false",
  gate_design: "false",
  gate_co_trong_net_youtube: "false",
  design_content_types: [],
  split_share_entries: [],
  // Round 86 item 4 — Publishing (distinct from Phụ Lục Publishing above).
  // publishing_gia_tri backs the inline "Giá Trị Publishing" field GateGrid
  // reveals once this is "true" (see TEXT_GATE_FIELDS in lib/GateFields.js)
  // — the real ticket needs that value, so auto-create waits on it instead
  // of firing blank like the other Legal Request types just above.
  gate_publishing: "false",
  publishing_gia_tri: "",
  // Round 88 — Copyright Checklist (Master/Vocal/Author rights) — see
  // lib/copyrightChecklist.js for the shape.
  copyright_checklist: emptyCopyrightChecklist(),
};

// Round 106 item 5 — 4 merged top-level keys (was 5) — see
// lib/GateFields.js's PITCHING_TYPES comment for the merge mapping.
const EMPTY_PITCHING_TYPES = { priority: false, spotifyBanner: false, spotifyS4a: false, domestic: false };
const EMPTY_ARTIST_PROFILE_TYPES = { spotify: false, tiktok: false, apple: false };

const META_ITEMS = [
  { key: "meta_audio", label: "Audio" },
  { key: "meta_artwork", label: "Artwork" },
  { key: "meta_working_files", label: "Working Files" },
  { key: "meta_lyric", label: "Lyric" },
  { key: "meta_mv", label: "MV" },
  { key: "meta_doc", label: "Metadata" },
];

// Must match REQUIRED_META_KEYS in app/releases/[id]/page.js exactly —
// the "4 required" metadata items Sony Publish's auto-create gate checks
// (see performInsert()'s gate_sony_publish block below).
const REQUIRED_META_KEYS = ["meta_audio", "meta_artwork", "meta_lyric", "meta_doc"];

export default function NewReleasePage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [pitchingTypes, setPitchingTypes] = useState(EMPTY_PITCHING_TYPES);
  const [artistProfileTypes, setArtistProfileTypes] = useState(EMPTY_ARTIST_PROFILE_TYPES);
  // Round 97 — which of the release's own Main/Feature Artist tags AR has
  // picked to send an Artist Profile ticket for (ArtistProfileVerifyPanel).
  // Defaults to "all tags" the first time the panel has something to show,
  // via the effect below — AR can then uncheck ones they don't want.
  // artistProfileVerifyTouched (round 97 follow-up) — same "touched" idiom
  // as labelTouched below: once AR has manually checked/unchecked anything
  // in the panel, the auto-default-to-all-selected effect stops
  // overriding their choice on every subsequent tag add/remove. Resets
  // when the gate goes back to "false" so ticking it "Yes" again later
  // starts fresh at "everyone selected."
  const [artistProfileVerifySelected, setArtistProfileVerifySelected] = useState([]);
  const [artistProfileVerifyTouched, setArtistProfileVerifyTouched] = useState(false);
  const [coTrongNetDraft, setCoTrongNetDraft] = useState(CO_TRONG_NET_DRAFT_DEFAULTS);
  const [genres, setGenres] = useState([]);
  const [topics, setTopics] = useState([]);
  const [channels, setChannels] = useState([]);
  const [artists, setArtists] = useState([]);
  const [labels, setLabels] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [createdDid, setCreatedDid] = useState(null);
  const [labelTouched, setLabelTouched] = useState(false); // true once user manually edits Label — blocks autofill from overwriting it
  const [autofillNote, setAutofillNote] = useState(null);
  const [tiktokTimingTouched, setTiktokTimingTouched] = useState(false);
  const [facebookTimingTouched, setFacebookTimingTouched] = useState(false);
  // Soft-lock duplicate warning — set when a same-prefix DID already
  // exists; holds the duplicate release plus the already-built payload/
  // tracks so "Confirm New Creation" can just resume the insert without
  // re-validating the form. navMode travels with it so the confirm button
  // still does the right thing afterward (go to detail page vs. reset for
  // another entry) — see performInsert()'s navMode param.
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  // Round 88 item 3 — floating Save button, same pattern as the release
  // detail page's SaveBar: only shows once the real "Tạo Release" button
  // has scrolled out of view, so there's never a duplicate visible once
  // the person's actually scrolled down to it.
  const submitBtnRef = useRef(null);
  const [showFloatingSave, setShowFloatingSave] = useState(false);
  useEffect(() => {
    const el = submitBtnRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setShowFloatingSave(!entry.isIntersecting), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Quick Create (⚡️) — a stripped-down modal for the common case of just
  // wanting a placeholder release to exist (Label/Title/Main Artist) with
  // everything else filled in later on the release's own detail page.
  // release_date is NOT NULL in the DB and isn't collected here, so it's
  // defaulted to today — same as how the full form defaults release_time
  // to "19:00" without asking.
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickForm, setQuickForm] = useState({ label: "", title: "", main_artist: "" });
  const [quickError, setQuickError] = useState(null);
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  // Linkshare timing defaults — Facebook depends on how much lead time
  // this release actually has (today vs. Release Date), so it recomputes
  // live as Release Date changes; Tiktok has no date logic, it's always
  // the same default. Neither ever overwrites a manual pick — same
  // touched-until-cleared pattern as Label/Deadline elsewhere in this app.
  useEffect(() => {
    if (facebookTimingTouched) return;
    setForm((f) => ({ ...f, linkshare_facebook_timing: defaultLinkshareFacebookTiming(new Date().toISOString(), f.release_date) }));
  }, [form.release_date, facebookTimingTouched]);

  useEffect(() => {
    if (tiktokTimingTouched) return;
    setForm((f) => ({ ...f, linkshare_tiktok_timing: defaultLinkshareTiktokTiming() }));
  }, [tiktokTimingTouched]);

  function handleTiktokTimingChange(v) {
    update("linkshare_tiktok_timing", v);
    setTiktokTimingTouched(v !== "");
  }
  function handleFacebookTimingChange(v) {
    update("linkshare_facebook_timing", v);
    setFacebookTimingTouched(v !== "");
  }

  // Round 87 item 6 — if the picked Label already has its Hợp Đồng
  // Publishing done (existing label, contract already signed), Phụ Lục
  // Publishing is locked to "No" here too, same as the release detail
  // page — a brand-new release under that label needs no addendum from
  // the start. Re-looked-up whenever the Label field actually changes.
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
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(`Couldn't load dropdown options: ${fetchError.message}`);
          return;
        }
        setGenres((data || []).filter((r) => r.category === "genre"));
        setTopics((data || []).filter((r) => r.category === "topic"));
        setChannels((data || []).filter((r) => r.category === "channel"));
      });

    supabase
      .from("artists")
      .select("id, stage_name, labels(label_name)")
      .order("stage_name")
      .then(({ data }) => setArtists(data || []));

    supabase
      .from("labels")
      .select("label_name")
      .order("label_name")
      .then(({ data }) => setLabels(data || []));
  }, []);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "label") setLabelTouched(true);
    if (createdDid) {
      // A previous success is still showing — clear it as soon as the
      // user starts on a new entry, so the old DID/banner don't linger
      // and make it look like nothing happened on the next submit.
      setCreatedDid(null);
    }
  }

  // Round 97 — Main/Feature Artist tags. main_artist/feature_artist (the
  // plain-string columns everything else — DID generation, search,
  // display — already reads) stay auto-derived from the tags, joined with
  // ", " same as someone would've hand-typed for a multi-artist song
  // before this round. tagsKey is "main_artist_tags" or
  // "feature_artist_tags"; textKey is the matching string field.
  //
  // Same Label autofill the old free-text Main Artist field used to do
  // on blur (see the now-removed handleArtistBlur) — now fires the moment
  // a NEW tag is added to Main Artist specifically, since there's no blur
  // event on a tag picker to hang it off of.
  function updateArtistTags(tagsKey, textKey, tags) {
    setForm((f) => ({ ...f, [tagsKey]: tags, [textKey]: tags.join(", ") }));
    if (createdDid) setCreatedDid(null);
    if (tagsKey === "main_artist_tags" && !labelTouched && tags.length > (form.main_artist_tags || []).length) {
      const addedName = tags[tags.length - 1];
      const match = artists.find((a) => a.stage_name.toLowerCase() === addedName.toLowerCase());
      if (match?.labels?.label_name) {
        setForm((f) => ({ ...f, label: match.labels.label_name }));
        setAutofillNote(`Label auto-filled from Artist List ("${match.stage_name}").`);
      }
    }
  }

  // Round 97 — Artist Profile Verify's artist checklist. artistTags is the
  // deduped union of both tag fields — a name could technically be tagged
  // as both Main and Feature, only shown once here. Defaults to "every tag
  // selected" the first time the panel has something to show (gate ticked
  // "Yes" and at least one tag exists) — AR can uncheck from there.
  const artistProfileArtistTags = [...new Set([...(form.main_artist_tags || []), ...(form.feature_artist_tags || [])])];
  useEffect(() => {
    if (form.gate_artist_profile_verify !== "true") {
      // Gate went back to "false" — reset so the next time it's ticked
      // "Yes" starts fresh at "everyone selected" again, not stuck on
      // whatever was last unchecked.
      if (artistProfileVerifyTouched) setArtistProfileVerifyTouched(false);
      return;
    }
    if (!artistProfileVerifyTouched && artistProfileArtistTags.length > 0) {
      setArtistProfileVerifySelected(artistProfileArtistTags);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.gate_artist_profile_verify, form.main_artist_tags, form.feature_artist_tags]);

  function toggleArtistProfileArtist(name, checked) {
    setArtistProfileVerifyTouched(true);
    setArtistProfileVerifySelected((prev) => (checked ? [...new Set([...prev, name])] : prev.filter((n) => n !== name)));
  }


  // navMode: 'detail' (normal Tạo Release button — always land on the new
  // release's own detail page afterward) or 'stay' (Save and Create
  // another — insert, then reset straight back to a fresh blank form).
  async function handleSubmit(e, navMode = "detail") {
    e.preventDefault();
    setError(null);
    setCreatedDid(null);

    if (!form.title.trim() || !form.main_artist.trim() || !form.release_date || !form.label.trim()) {
      setError("Hãng Đĩa, Tên bài hát, Main Artist, and Ngày phát hành are required.");
      return;
    }
    if (!supabase) {
      setError("Supabase isn't configured — check environment variables.");
      return;
    }

    const { tracks: trackRows, ...formForInsert } = form;
    const payload = {
      ...formForInsert,
      feature_artist: form.feature_artist || null,
      genre: form.genre || null,
      requester_segment: form.requester_segment || null,
      theme: form.theme || null,
      drive_link: form.drive_link || null,
      upc: form.upc || null,
      brief: form.brief || null,
    };

    const dup = await checkDuplicateRelease(payload);
    if (dup) {
      setDuplicateWarning({ ...dup, payload, trackRows, navMode });
      return;
    }

    await performInsert(payload, trackRows, navMode);
  }

  // Round 105 — soft-lock duplicate check, now checking TWO independent
  // signals instead of just one:
  //   1. Same DID prefix (title+artist initials + release date) as an
  //      existing release — the original check, strongly suggests a
  //      re-entry of the same product on the same day.
  //   2. Same title + main artist, REGARDLESS of release date — per
  //      explicit request ("dedup by name + artist"), catches the case
  //      where someone re-enters the same song under a different/updated
  //      release date, which the DID-prefix check alone would miss
  //      entirely (a different date means a different prefix).
  // Either signal warns; "Confirm New Creation" still bypasses and proceeds
  // regardless of which one fired (legit remarketing/re-release cases do
  // exist) — same escape hatch as before, just triggered by more cases now.
  // Returns `{ existing, reason }` or `null`; `reason` lets the warning
  // modal explain which kind of match it found instead of always assuming
  // it was the DID-prefix one.
  async function checkDuplicateRelease(payload) {
    const prefix = didPrefixFor(payload.title, payload.main_artist, payload.release_date);
    if (prefix) {
      const { data: existing } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, release_date")
        .like("did", `${prefix}-%`)
        .limit(1);
      if (existing && existing.length > 0) return { existing: existing[0], reason: "did-prefix" };
    }
    if (payload.title?.trim() && payload.main_artist?.trim()) {
      const { data: existing } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, release_date")
        .ilike("title", payload.title.trim())
        .ilike("main_artist", payload.main_artist.trim())
        .limit(1);
      if (existing && existing.length > 0) return { existing: existing[0], reason: "title-artist" };
    }
    return null;
  }

  function resetFormForAnother() {
    setForm(EMPTY_FORM);
    setPitchingTypes(EMPTY_PITCHING_TYPES);
    setArtistProfileTypes(EMPTY_ARTIST_PROFILE_TYPES);
    setArtistProfileVerifySelected([]);
    setArtistProfileVerifyTouched(false);
    setCoTrongNetDraft(CO_TRONG_NET_DRAFT_DEFAULTS);
    setLabelTouched(false);
    setAutofillNote(null);
    setTiktokTimingTouched(false);
    setFacebookTimingTouched(false);
  }

  async function performInsert(payload, trackRows, navMode = "detail") {
    setSubmitting(true);

    const { data, error: insertError } = await supabase
      .from("releases")
      .insert(payload)
      .select("id, did")
      .single();

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    // gate_pitching = "true" means pitching is required — create the real
    // Pitching ticket now, holding which of the 4 types were chosen.
    // received_at/lifecycle start is handled elsewhere (Upload flow), not
    // here — this just gets it queued.
    if (form.gate_pitching === "true") {
      const { data: tab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "pitching").single();
      if (tab) {
        await supabase.from("tickets").insert({
          tab_id: tab.id,
          // Round 106 item 5 — 4 merged top-level keys (was 5) — see
          // lib/GateFields.js's PITCHING_TYPES comment for the merge mapping.
          data: {
            releaseId: data.did,
            priority: pitchingTypes.priority,
            spotifyBanner: pitchingTypes.spotifyBanner,
            spotifyS4a: pitchingTypes.spotifyS4a,
            domestic: pitchingTypes.domestic,
          },
          status: tab.default_status,
          status_log: { [tab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
      }

      // Pitching Info (DSP editorial tagging — Genre/Moods/Song Styles/
      // Music Cultures/Instruments for Spotify + Apple Music) only makes
      // sense for the platforms that actually take editorial tags —
      // Priority Pitching and Spotify S4A, not Domestic (NCT/Zing).
      // Requester OPS, executor AR (picks it up from their ticket list,
      // same PIC pattern as every other ticket type).
      if (pitchingTypes.priority || pitchingTypes.spotifyS4a) {
        const { data: infoTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "pitching_info").single();
        if (infoTab) {
          await supabase.from("tickets").insert({
            tab_id: infoTab.id,
            data: { releaseId: data.did },
            status: infoTab.default_status,
            status_log: { [infoTab.default_status]: new Date().toISOString() },
            requester_segment: form.requester_segment || null,
          });
        }
      }
    }

    // Round 97 — gate_artist_profile_verify = "true" means one Artist
    // Profile ticket per artist checked in ArtistProfileVerifyPanel (not
    // one shared ticket for the whole release anymore — see that panel's
    // comment for why). Email left blank for OPS to fill in either way;
    // spotify/tiktok/apple carry the "set up on which platforms" picker's
    // state, applied identically to every ticket created here.
    if (form.gate_artist_profile_verify === "true" && artistProfileVerifySelected.length > 0) {
      const { data: apTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "artist_profile").single();
      if (apTab) {
        await Promise.all(
          artistProfileVerifySelected.map((artistName) =>
            supabase.from("tickets").insert({
              tab_id: apTab.id,
              data: { releaseId: data.did, artistName, email: "", ...artistProfileTypes },
              status: apTab.default_status,
              status_log: { [apTab.default_status]: new Date().toISOString() },
              requester_segment: form.requester_segment || null,
            })
          )
        );
      }
    }

    // gate_pre_order = "true" means a Pre-order Itunes ticket should exist
    // for this release — auto-created at New Release creation, per
    // explicit request, same "tick Yes here -> ticket appears" pattern as
    // Pitching/Artist Profile above. Fields left blank (DID + Note only,
    // per the ticket type's own config) — LBM url and Link Preorder are
    // filled in later from the ticket's own popup, not collected here.
    if (form.gate_pre_order === "true") {
      const { data: poTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "pre_order_itunes").single();
      if (poTab) {
        await supabase.from("tickets").insert({
          tab_id: poTab.id,
          data: { releaseId: data.did },
          status: poTab.default_status,
          status_log: { [poTab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
      }
    }

    // gate_lyric_musixmatch = "true" means a Priority Sync Lyric ticket
    // should exist for this release — same auto-create-on-Yes pattern as
    // Pre-order Itunes above, per explicit request.
    if (form.gate_lyric_musixmatch === "true") {
      const { data: pslTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "priority_sync_lyric").single();
      if (pslTab) {
        await supabase.from("tickets").insert({
          tab_id: pslTab.id,
          data: { releaseId: data.did },
          status: pslTab.default_status,
          status_log: { [pslTab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
      }
    }

    // gate_mv_spotify = "true" means a Music Video on Spotify ticket
    // should exist for this release — same auto-create-on-Yes pattern.
    if (form.gate_mv_spotify === "true") {
      const { data: mvTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "mv_spotify").single();
      if (mvTab) {
        await supabase.from("tickets").insert({
          tab_id: mvTab.id,
          data: { releaseId: data.did },
          status: mvTab.default_status,
          status_log: { [mvTab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
      }
    }

    // gate_co_trong_net_youtube = "true" — same auto-create-on-Yes pattern
    // as Music Video on Spotify above, but carries the Teaser/Official/
    // Short/Mô Tả draft collected in this form's own GateFields panel
    // instead of the generic {releaseId}-only body.
    if (form.gate_co_trong_net_youtube === "true") {
      const { data: ctnTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "co_trong_net_youtube").single();
      if (ctnTab) {
        await supabase.from("tickets").insert({
          tab_id: ctnTab.id,
          data: { releaseId: data.did, ...coTrongNetDraft },
          status: ctnTab.default_status,
          status_log: { [ctnTab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
      }
    }

    // gate_discovery_mode_spotify = "true" — same auto-create-on-Yes
    // pattern as Music Video on Spotify above. No extra data collected
    // here: url LBM/name/artist/release date all live on the release
    // itself and the ticket list reads them live via releaseId, same
    // "map directly back" idiom as Sony Publish's Link LBM/UPC/ISRC.
    if (form.gate_discovery_mode_spotify === "true") {
      const { data: dmTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "discovery_mode_spotify").single();
      if (dmTab) {
        await supabase.from("tickets").insert({
          tab_id: dmTab.id,
          data: { releaseId: data.did },
          status: dmTab.default_status,
          status_log: { [dmTab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
      }
    }

    // gate_split_share / gate_phu_luc_mg / gate_phu_luc_publishing = "true"
    // — same auto-create-on-Yes pattern as above, per explicit request
    // (previously these 3 Legal Request types only ever got created via
    // the release detail page's manual "Send Ticket"/Save flow, never at
    // New Release creation time itself).
    if (form.gate_split_share === "true") {
      const { data: ssTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "split_share").single();
      if (ssTab) {
        await supabase.from("tickets").insert({
          tab_id: ssTab.id,
          data: { releaseId: data.did },
          status: ssTab.default_status,
          status_log: { [ssTab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
      }
    }
    if (form.gate_phu_luc_mg === "true") {
      const { data: mgTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "phu_luc_mg").single();
      if (mgTab) {
        await supabase.from("tickets").insert({
          tab_id: mgTab.id,
          data: { releaseId: data.did },
          status: mgTab.default_status,
          status_log: { [mgTab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
      }
    }
    if (form.gate_phu_luc_publishing === "true") {
      const { data: pubTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "phu_luc_publishing").single();
      if (pubTab) {
        await supabase.from("tickets").insert({
          tab_id: pubTab.id,
          data: { releaseId: data.did },
          status: pubTab.default_status,
          status_log: { [pubTab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
      }
    }

    // Round 86 item 4 — Publishing. Same "gated on real required data"
    // idea as Sony Publish just below, but on the inline Giá Trị Publishing
    // value instead of the Metadata Checklist — and data.releaseId here is
    // the just-inserted release's own id (data.id), NOT its did like every
    // other gate ticket type on this page, matching what
    // app/tickets/publishing/page.js's list actually looks up by. If left
    // blank at creation time, app/releases/[id]/page.js's saveTab() picks
    // this back up the moment a value is filled in and Saved.
    if (form.gate_publishing === "true" && (form.publishing_gia_tri || "").trim() !== "") {
      const { data: pubTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "publishing").single();
      if (pubTab) {
        await supabase.from("tickets").insert({
          tab_id: pubTab.id,
          data: { releaseId: data.id, giaTri: form.publishing_gia_tri },
          status: pubTab.default_status,
          status_log: { [pubTab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
      }
    }

    // gate_sony_publish = "true" is special-cased, unlike every other gate
    // ticket above — per explicit request it only auto-creates once the 4
    // required metadata fields (Audio/Artwork/Lyric/Metadata doc) are ALL
    // ticked. At creation time that's rarely already true (the checklist
    // is usually filled in afterward on the release detail page), so this
    // will usually be a no-op here — app/releases/[id]/page.js's saveTab()
    // re-checks the same condition on every save afterward, so it still
    // fires the moment the checklist catches up. When it DOES fire here,
    // it also sends the release straight to the Upload workstation (same
    // effect as SEND UPLOAD — a newrelease_upload ticket + requested:true)
    // since a brand-new release can't have been sent there any other way
    // yet.
    if (form.gate_sony_publish === "true" && REQUIRED_META_KEYS.every((k) => form[k] === "true")) {
      const { data: spTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "sony_publish").single();
      if (spTab) {
        await supabase.from("tickets").insert({
          tab_id: spTab.id,
          data: { releaseId: data.did },
          status: spTab.default_status,
          status_log: { [spTab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
      }
      const { data: uploadTab } = await supabase.from("ticket_tabs").select("id").eq("key", "newrelease_upload").single();
      if (uploadTab) {
        await supabase.from("tickets").insert({
          tab_id: uploadTab.id,
          data: { releaseId: data.did, project: form.title, artist: form.main_artist, label: form.label },
        });
      }
      await supabase.from("releases").update({ requested: true }).eq("id", data.id);
    }

    if (form.single_album_ep !== "Single" && trackRows && trackRows.length > 0) {
      await supabase.from("release_tracks").insert(
        trackRows
          .filter((t) => (t.track_name || "").trim())
          .map((t, i) => ({ release_id: data.id, sort_order: i + 1, track_name: t.track_name, main_artist: t.main_artist || null, feature_artist: t.feature_artist || null }))
      );
    }

    if (navMode === "stay") {
      // Save and Create another — stay on this page, cleared and ready
      // for the next entry. Success banner (createdDid) confirms the one
      // that just went through.
      resetFormForAnother();
      setCreatedDid(data.did);
    } else {
      router.push(`/releases/${data.id}`);
    }
  }

  // Quick Create (⚡️) — minimal Label/Title/Main Artist, release_date
  // defaulted to today. Runs the same duplicate-prefix soft-lock as the
  // full form, then always lands on the new release's detail page (same
  // as the normal button) so the rest can be filled in there.
  // Round 99 — Quick Create's Main Artist now resolves against the
  // artists reference table the same way the real tag picker's "+" button
  // does, just automatically instead of needing an explicit click (Quick
  // Create is a single fast action, not an ongoing multi-tag editing
  // session, so auto-resolving on submit fits better here than requiring
  // a separate quick-create step first). Exact case-insensitive match
  // found → use that artist's real stage_name (so casing/spelling match
  // the reference table exactly, not whatever was typed) as both
  // main_artist and the sole main_artist_tags entry. No match → inserts a
  // new artists row with the typed name (same insert QuickCreate.js does)
  // and uses that. Either way, the release that Quick Create hands off to
  // the detail page already has a real Main Artist TAG, not just text —
  // no more landing on the detail page with an empty tag picker despite
  // main_artist already having a name.
  async function resolveQuickArtistTag(name) {
    const trimmed = name.trim();
    const match = artists.find((a) => a.stage_name.toLowerCase() === trimmed.toLowerCase());
    if (match) return match.stage_name;
    const { data: created, error: createErr } = await supabase.from("artists").insert({ stage_name: trimmed }).select().single();
    if (!createErr && created) {
      setArtists((prev) => [...prev, created]);
      return created.stage_name;
    }
    // Insert failed for some reason (network hiccup, etc.) — fall back to
    // the typed text as before this round rather than blocking creation.
    return trimmed;
  }

  async function handleQuickSubmit(e) {
    e.preventDefault();
    setQuickError(null);

    if (!quickForm.label.trim() || !quickForm.title.trim() || !quickForm.main_artist.trim()) {
      setQuickError("Label, Title, and Main Artist are required.");
      return;
    }
    if (!supabase) {
      setQuickError("Supabase isn't configured — check environment variables.");
      return;
    }

    setQuickSubmitting(true);
    const resolvedArtist = await resolveQuickArtistTag(quickForm.main_artist);

    const todayIso = new Date().toISOString().slice(0, 10);
    const payload = {
      ...EMPTY_FORM,
      tracks: undefined,
      label: quickForm.label.trim(),
      title: quickForm.title.trim(),
      main_artist: resolvedArtist,
      main_artist_tags: [resolvedArtist],
      release_date: todayIso,
    };
    delete payload.tracks;

    const dup = await checkDuplicateRelease(payload);
    if (dup) {
      setQuickSubmitting(false);
      setQuickCreateOpen(false);
      setDuplicateWarning({ ...dup, payload, trackRows: [], navMode: "detail" });
      return;
    }

    await performInsert(payload, [], "detail");
    setQuickSubmitting(false);
    setQuickCreateOpen(false);
    setQuickForm({ label: "", title: "", main_artist: "" });
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className={styles.eyebrow}>// New Release</div>
            <h1 className={styles.title}>New Release</h1>
          </div>
          <button
            type="button"
            className={styles.btnSecondary}
            title="Quick Create — Label / Title / Main Artist only"
            onClick={() => {
              setQuickError(null);
              setQuickForm({ label: "", title: "", main_artist: "" });
              setQuickCreateOpen(true);
            }}
          >
            ⚡️ Quick Create
          </button>
        </div>

        {/* Round 212 — DID moved out of here. It used to be its own big
            dashed box right at the top of the page; per explicit request
            it now sits as a slim accent line directly above the Release
            Time field instead (see .didAccent in styles.module.css and
            the Release Time field further down, row 6 of the new
            layout) — same content, just relocated. */}

        {error && <div className={styles.errorBox}>{error}</div>}
        {autofillNote && (
          <div style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 16 }}>{autofillNote}</div>
        )}
        {createdDid && (
          <div className={styles.successBox}>
            Release created — DID {createdDid}. The form below has been cleared for the next one.
          </div>
        )}

        <NewReleaseTemplateTools
          styles={styles}
          form={form}
          onImport={(patch) => setForm((f) => ({ ...f, ...patch }))}
        />

        <form onSubmit={(e) => handleSubmit(e, "detail")}>
          <div className={styles.grid}>
            {/* Round 212 — reordered per explicit request. Row 1: Link Drive
                + UPC share one row (Drive Link keeps a generous preferred
                width since URLs run long; UPC is flex:1, so it always
                fills whatever's left of the row). UPC is a brand-new field
                on this form — starts blank ("empty on the come in, and
                then get filled by OPS team" via the release detail page's
                URL tab or the Upload/Re-Check workstations, same
                releases.upc column). */}
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: "0 1 480px", display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
                  <label className={styles.fieldLabel}>Link Drive</label>
                  <input
                    className={styles.input}
                    placeholder="https://drive.google.com/..."
                    value={form.drive_link}
                    onChange={(e) => update("drive_link", e.target.value)}
                  />
                </div>
                <div style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <label className={styles.fieldLabel}>UPC</label>
                  <input
                    className={styles.input}
                    placeholder="UPC"
                    value={form.upc}
                    onChange={(e) => update("upc", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Row 2: Song name */}
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel}>
                Tên bài hát / EP / Album <span className={styles.required}>*</span>
              </label>
              <input
                className={styles.input}
                placeholder="Nhập tên dự án"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </div>

            {/* Row 3 — everything not explicitly called out in the new
                order (per explicit confirmation: "3-10 supposed to be 1
                request" — consolidated into one block here, between Song
                name and Artist, keeping this group's own original
                relative order/styling). */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Trạng Thái Gói (Loại Dự Án)</label>
              <div style={{ padding: "9px 12px", background: "var(--bg-card)", border: "1px solid #2a2a2a", borderRadius: 6, color: "var(--text-faint)", fontSize: 13 }}>
                BRIEF & DATA — sẽ tiến triển qua quy trình gói sau khi tạo
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Category</label>
              <select
                className={styles.select}
                value={form.release_category}
                onChange={(e) => update("release_category", e.target.value)}
              >
                <option value="New Release">New Release</option>
                <option value="Remarketing">Remarketing</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Single/Album/EP</label>
              <select
                className={styles.select}
                value={form.single_album_ep}
                onChange={(e) => update("single_album_ep", e.target.value)}
              >
                <option value="Single">Single</option>
                <option value="EP">EP</option>
                <option value="Album">Album</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Media Channel</label>
              <select
                className={styles.select}
                value={form.requester_segment}
                onChange={(e) => update("requester_segment", e.target.value)}
              >
                <option value="">— Chọn —</option>
                {channels.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label || opt.value}
                  </option>
                ))}
              </select>
            </div>

            {form.single_album_ep !== "Single" && (
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.fieldLabel}>Tracklist</label>
                {(form.tracks || []).map((t, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "40px 2fr 1.5fr 1.5fr 32px", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "center" }}>#{i + 1}</div>
                    <input
                      className={styles.input}
                      placeholder="Track name"
                      value={t.track_name || ""}
                      onChange={(e) => {
                        const next = [...form.tracks];
                        next[i] = { ...next[i], track_name: e.target.value };
                        update("tracks", next);
                      }}
                    />
                    <ArtistInput
                      styles={styles}
                      value={t.main_artist || ""}
                      artists={artists}
                      placeholder="Main artist"
                      onChange={(v) => {
                        const next = [...form.tracks];
                        next[i] = { ...next[i], main_artist: v };
                        update("tracks", next);
                      }}
                    />
                    <ArtistInput
                      styles={styles}
                      value={t.feature_artist || ""}
                      artists={artists}
                      placeholder="Feature artist"
                      onChange={(v) => {
                        const next = [...form.tracks];
                        next[i] = { ...next[i], feature_artist: v };
                        update("tracks", next);
                      }}
                    />
                    <button
                      type="button"
                      className={styles.btnSmall}
                      style={{ padding: "4px 8px" }}
                      onClick={() => update("tracks", form.tracks.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.btnSmall}
                  onClick={() => update("tracks", [...(form.tracks || []), { track_name: "", main_artist: "", feature_artist: "" }])}
                >
                  + Add Track
                </button>
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Thể loại</label>
              <select
                className={styles.select}
                value={form.genre}
                onChange={(e) => update("genre", e.target.value)}
              >
                <option value="">— Chọn thể loại —</option>
                {genres.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label || opt.value}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Chủ đề</label>
              <select
                className={styles.select}
                value={form.theme}
                onChange={(e) => update("theme", e.target.value)}
              >
                <option value="">— Chọn chủ đề —</option>
                {topics.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label || opt.value}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Ngày phát hành <span className={styles.required}>*</span>
              </label>
              <input
                type="date"
                className={styles.input}
                value={form.release_date}
                onChange={(e) => update("release_date", e.target.value)}
              />
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel}>Next Step Note</label>
              <textarea
                className={styles.textarea}
                placeholder="Tình trạng data, xác nhận gói HTTT…"
                value={form.brief}
                onChange={(e) => update("brief", e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Tiktok Release Timing</label>
              <select className={styles.select} value={form.linkshare_tiktok_timing} onChange={(e) => handleTiktokTimingChange(e.target.value)}>
                <option value="">—</option>
                {LINKSHARE_TIKTOK_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
              <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                Defaults to "{LINKSHARE_TIKTOK_OPTIONS[2]}" if left blank.
              </p>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Facebook Release Timing</label>
              <select className={styles.select} value={form.linkshare_facebook_timing} onChange={(e) => handleFacebookTimingChange(e.target.value)}>
                <option value="">—</option>
                {LINKSHARE_FACEBOOK_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
              <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                Auto-picked from today vs. Release Date − 4 days — pick one yourself to override.
              </p>
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel}>Linkshare Note (auto-generated preview)</label>
              <pre style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap", margin: 0 }}>
                {buildLinkshareNote(form)}
              </pre>
            </div>

            {/* Row 4: Artist */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Main Artist <span className={styles.required}>*</span>
              </label>
              <ArtistTagInput
                styles={styles}
                value={form.main_artist_tags}
                onChange={(tags) => updateArtistTags("main_artist_tags", "main_artist", tags)}
                artists={artists}
                placeholder="Tìm nghệ sĩ chính…"
                onArtistCreated={(newArtist) => setArtists((prev) => [...prev, newArtist])}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Feature Artist</label>
              <ArtistTagInput
                styles={styles}
                value={form.feature_artist_tags}
                onChange={(tags) => updateArtistTags("feature_artist_tags", "feature_artist", tags)}
                artists={artists}
                placeholder="Tìm nghệ sĩ feat (nếu có)…"
                onArtistCreated={(newArtist) => setArtists((prev) => [...prev, newArtist])}
              />
            </div>

            {/* Row 5: Label, on its own row now (used to share a row with
                Category) — "Label:" prefix added per explicit request so
                it still reads unambiguously on its own full-width row,
                distinct from the Artist row right above it. */}
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel}>Hãng Đĩa <span className={styles.required}>*</span></label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className={styles.labelPrefix}>Label:</span>
                <div style={{ flex: 1 }}>
                  <LabelInput
                    styles={styles}
                    value={form.label}
                    onChange={(v) => update("label", v)}
                    labels={labels}
                    placeholder="Tên label"
                  />
                </div>
                <QuickCreate
                  kind="label"
                  onCreated={(newLabel) => {
                    setLabels((prev) => [...prev, newLabel]);
                    update("label", newLabel.label_name);
                  }}
                />
              </div>
            </div>

            {/* Row 6: Release Time. DID moved here too (see .didAccent in
                styles.module.css) — used to be its own big dashed box at
                the very top of the page; per explicit request, it now
                sits as a slim accent line directly above this field
                instead, since this row has the height for it. */}
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <div className={styles.didAccent}>
                <div className={styles.didLabel}>// Release ID (DID)</div>
                {createdDid ? (
                  <div className={styles.didValue}>{createdDid}</div>
                ) : form.title.trim() || form.main_artist.trim() ? (
                  <>
                    <div className={styles.didValue}>{didPreview(form.title, form.main_artist, form.release_date)}</div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
                      Preview — the final 4 digits are assigned by the database on creation, to guarantee no collisions
                    </div>
                  </>
                ) : (
                  <div className={styles.didPlaceholder}>---- ---- ----</div>
                )}
              </div>
              <label className={styles.fieldLabel}>Giờ phát hành</label>
              <input
                type="time"
                className={styles.input}
                value={form.release_time}
                onChange={(e) => update("release_time", e.target.value)}
              />
            </div>
          </div>

          <div className={styles.subheading} style={{ marginTop: 8 }}>Metadata Checklist</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
            {META_ITEMS.map((m) => (
              <div key={m.key} className={styles.field} style={{ marginBottom: 0 }}>
                <label className={styles.fieldLabel}>{m.label}</label>
                <GateToggle value={form[m.key] || "false"} onChange={(v) => update(m.key, v)} />
                {/* MV type — same field the Pre-release Workstation already
                    edits (releases.canva_status, labeled "MV" there), just
                    surfaced here too once the MV checklist item is ticked
                    Yes, per explicit request. */}
                {m.key === "meta_mv" && form.meta_mv === "true" && (
                  <div style={{ marginTop: 6 }}>
                    <PickSelect styles={styles} opts={MV_TYPE_OPTIONS} value={form.canva_status} onChange={(v) => update("canva_status", v)} placeholder="— MV type —" />
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Marketing Checklist — rendered directly under Metadata
              Checklist (not inside GateFields) per follow-up feedback: the
              whole group belongs here, not split with Project Proposal
              alone up here and Artist Info/Artist Photo left below. */}
          <div className={styles.subheading}>Marketing Checklist</div>
          <GateGrid styles={styles} fields={MARKETING_CHECKLIST_FIELDS} form={form} update={update} />

          {/* Round 88 — Copyright Checklist, living directly above Data
              Request (the first group inside <GateFields> below), per
              explicit request — stays here on the create form even after
              the 2nd follow-up moved its detail-page counterpart into its
              own "Copyrights" tab, per "stay where they are (for easy
              creation)". */}
          <div className={styles.subheading}>Copyright Checklist</div>
          <CopyrightChecklistFields
            styles={styles}
            value={form.copyright_checklist}
            onChange={(v) => update("copyright_checklist", v)}
          />

          <GateFields
            styles={styles}
            form={form}
            update={update}
            pitchingTypes={pitchingTypes}
            onPitchingToggle={(key, checked) => setPitchingTypes((p) => ({ ...p, [key]: checked }))}
            artistProfileTypes={artistProfileTypes}
            onArtistProfileToggle={(key, checked) => setArtistProfileTypes((p) => ({ ...p, [key]: checked }))}
            artistProfileArtistTags={artistProfileArtistTags}
            artistProfileSelected={artistProfileVerifySelected}
            onToggleArtistProfileArtist={toggleArtistProfileArtist}
            coTrongNetDraft={coTrongNetDraft}
            onCoTrongNetChange={(key, value) => setCoTrongNetDraft((p) => ({ ...p, [key]: value }))}
            suppressUrlFor={["gate_pre_order"]}
            publishingHdLocked={publishingHdLocked}
          />

          <div className={styles.actions}>
            <button ref={submitBtnRef} type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? "Đang tạo…" : "Tạo Release"}
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={submitting}
              onClick={(e) => handleSubmit(e, "stay")}
            >
              {submitting ? "Đang tạo…" : "Save and Create another"}
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                setForm(EMPTY_FORM);
                setPitchingTypes(EMPTY_PITCHING_TYPES);
                setArtistProfileTypes(EMPTY_ARTIST_PROFILE_TYPES);
                setCoTrongNetDraft(CO_TRONG_NET_DRAFT_DEFAULTS);
                setError(null);
                setCreatedDid(null);
                setLabelTouched(false);
                setAutofillNote(null);
              }}
            >
              Hủy
            </button>
          </div>
        </form>

        {showFloatingSave && (
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={submitting}
            onClick={(e) => handleSubmit(e, "detail")}
            style={{ position: "fixed", bottom: 24, right: 24, zIndex: 250, boxShadow: "0 4px 16px rgba(0,0,0,0.45)" }}
          >
            {submitting ? "Đang tạo…" : "Tạo Release"}
          </button>
        )}

        {quickCreateOpen && (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
            }}
          >
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 24, maxWidth: 440, width: "100%" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 }}>
                ⚡️ Quick Create
              </div>
              <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 16 }}>
                Creates a placeholder release with just these 3 fields — Release Date defaults to today, everything else you fill in on the release's detail page afterward.
              </p>
              {quickError && <div className={styles.errorBox} style={{ marginBottom: 12 }}>{quickError}</div>}
              <form onSubmit={handleQuickSubmit}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Hãng Đĩa <span className={styles.required}>*</span></label>
                  <LabelInput
                    styles={styles}
                    value={quickForm.label}
                    onChange={(v) => setQuickForm((f) => ({ ...f, label: v }))}
                    labels={labels}
                    placeholder="Tên label"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Tên bài hát <span className={styles.required}>*</span></label>
                  <input
                    className={styles.input}
                    placeholder="Nhập tên dự án"
                    value={quickForm.title}
                    onChange={(e) => setQuickForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Main Artist <span className={styles.required}>*</span></label>
                  <ArtistInput
                    styles={styles}
                    value={quickForm.main_artist}
                    onChange={(v) => setQuickForm((f) => ({ ...f, main_artist: v }))}
                    artists={artists}
                    placeholder="Tên nghệ sĩ chính"
                  />
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
                  <button type="button" className={styles.btnSecondary} onClick={() => setQuickCreateOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.btnPrimary} disabled={quickSubmitting}>
                    {quickSubmitting ? "Đang tạo…" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {duplicateWarning && (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
            }}
          >
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 24, maxWidth: 440, width: "100%" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#ff9d5c", marginBottom: 10 }}>
                ⚠ Possible duplicate release
              </div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
                {duplicateWarning.reason === "title-artist"
                  ? "An existing release already has the same Title + Main Artist (release date differs, so the DID prefix alone didn't catch it):"
                  : "An existing release already has a matching DID prefix (same title/artist initials and release date):"}
              </p>
              <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: "var(--text-muted)" }}>{duplicateWarning.existing.title}</div>
                <div style={{ color: "var(--text-faint)", marginTop: 2 }}>
                  {duplicateWarning.existing.main_artist} · {duplicateWarning.existing.did} · {duplicateWarning.existing.release_date}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className={styles.btnSecondary} onClick={() => setDuplicateWarning(null)}>
                  Cancel Creation
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={async () => {
                    const { payload, trackRows, navMode } = duplicateWarning;
                    setDuplicateWarning(null);
                    await performInsert(payload, trackRows, navMode);
                  }}
                >
                  Confirm New Creation
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </AppShell>
  );
}
