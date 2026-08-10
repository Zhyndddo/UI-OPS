"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { GateFields, GateToggle, GateGrid, MARKETING_CHECKLIST_FIELDS, CO_TRONG_NET_DRAFT_DEFAULTS } from "../../lib/GateFields";
import { MV_TYPE_OPTIONS } from "../../lib/pickerOptions";
import PickSelect from "../../lib/PickSelect";
import QuickCreate from "../../lib/QuickCreate";
import { LabelInput, ArtistInput } from "../../lib/ReferenceInputs";
import { buildLinkshareNote, defaultLinkshareFacebookTiming, defaultLinkshareTiktokTiming, LINKSHARE_TIKTOK_OPTIONS, LINKSHARE_FACEBOOK_OPTIONS } from "../../lib/releaseNotes";
import styles from "./styles.module.css";

// Mirrors _field_initials()/set_release_did() in schema.sql exactly, minus
// the sequence suffix (that part is DB-only, by design — see comment at
// the call site). Keep this in sync if the SQL rule ever changes.
function fieldInitials(field) {
  const words = (field || "").trim().split(/\s+/).filter(Boolean);
  const letterFor = (w) => {
    if (!w) return "#";
    if (w.includes("-")) return "#";
    return w[0].toUpperCase();
  };
  return letterFor(words[0]) + letterFor(words[1]);
}

function didPreview(title, mainArtist, releaseDate) {
  const titleInit = fieldInitials(title);
  const artistInit = fieldInitials(mainArtist);
  const datePart = releaseDate ? releaseDate.split("-").reverse().join("") : "--------"; // input value is YYYY-MM-DD → DDMMYYYY
  return `${titleInit}${artistInit}-${datePart}-####`;
}

// Same computation as didPreview, minus the trailing "-####" placeholder —
// this is exactly what set_release_did() in schema.sql writes before its
// own DB-assigned numeric suffix, so a `did like '${prefix}-%'` query finds
// any existing release whose title+artist initials and release date match,
// regardless of that suffix. Returns null until there's enough to compute
// a real (non-placeholder) prefix.
function didPrefixFor(title, mainArtist, releaseDate) {
  if (!title?.trim() || !mainArtist?.trim() || !releaseDate) return null;
  const titleInit = fieldInitials(title);
  const artistInit = fieldInitials(mainArtist);
  const datePart = releaseDate.split("-").reverse().join("");
  return `${titleInit}${artistInit}-${datePart}`;
}

const EMPTY_FORM = {
  label: "",
  title: "",
  main_artist: "",
  feature_artist: "",
  genre: "",
  requester_segment: "",
  release_category: "New Release",
  single_album_ep: "Single",
  tracks: [], // client-only — stripped before the releases insert, written to release_tracks after
  release_date: "",
  release_time: "19:00",
  theme: "",
  drive_link: "",
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
};

const EMPTY_PITCHING_TYPES = { priority: false, spotify: false, apple: false, nct: false, zing: false };
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
      .select("stage_name, labels(label_name)")
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

  // Autofill: on leaving Main Artist, look it up in the already-loaded
  // Artist List — if found and Label hasn't been manually edited yet,
  // suggest its Label. Never overwrites a manual edit (matches v1's
  // masterData_service.js behavior).
  function handleArtistBlur() {
    if (!form.main_artist.trim() || labelTouched) return;
    const match = artists.find(
      (a) => a.stage_name.toLowerCase() === form.main_artist.trim().toLowerCase()
    );
    if (match?.labels?.label_name) {
      setForm((f) => ({ ...f, label: match.labels.label_name }));
      setAutofillNote(`Label auto-filled from Artist List ("${match.stage_name}").`);
    }
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
      brief: form.brief || null,
    };

    // Soft-lock duplicate check — same DID prefix (title+artist initials +
    // release date) as an existing release strongly suggests this is a
    // re-entry of the same product. Warn instead of silently creating a
    // second one; "Confirm New Creation" bypasses this and proceeds anyway
    // (legit remarketing/re-release cases do exist).
    const prefix = didPrefixFor(form.title, form.main_artist, form.release_date);
    if (prefix) {
      const { data: existing } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, release_date")
        .like("did", `${prefix}-%`)
        .limit(1);
      if (existing && existing.length > 0) {
        setDuplicateWarning({ existing: existing[0], payload, trackRows, navMode });
        return;
      }
    }

    await performInsert(payload, trackRows, navMode);
  }

  function resetFormForAnother() {
    setForm(EMPTY_FORM);
    setPitchingTypes(EMPTY_PITCHING_TYPES);
    setArtistProfileTypes(EMPTY_ARTIST_PROFILE_TYPES);
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
          data: {
            releaseId: data.did,
            priority: pitchingTypes.priority,
            spotify: pitchingTypes.spotify,
            apple: pitchingTypes.apple,
            nct: pitchingTypes.nct,
            zing: pitchingTypes.zing,
          },
          status: tab.default_status,
          status_log: { [tab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
      }

      // Pitching Info (DSP editorial tagging — Genre/Moods/Song Styles/
      // Music Cultures/Instruments for Spotify + Apple Music) only makes
      // sense for the 2 platforms that actually take editorial tags —
      // Priority Pitching and Spotify, not NCT/Zing. Requester OPS,
      // executor AR (picks it up from their ticket list, same PIC pattern
      // as every other ticket type).
      if (pitchingTypes.priority || pitchingTypes.spotify) {
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

    // gate_artist_profile = "true" means an Artist Profile ticket should
    // exist for this release's main artist — created now, email left
    // blank for OPS to fill in (not collected on this form). spotify/
    // tiktok/apple carry the "set up on which platforms" picker's state.
    if (form.gate_artist_profile === "true") {
      const { data: apTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "artist_profile").single();
      if (apTab) {
        await supabase.from("tickets").insert({
          tab_id: apTab.id,
          data: { releaseId: data.did, artistName: form.main_artist, email: "", ...artistProfileTypes },
          status: apTab.default_status,
          status_log: { [apTab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
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

    const todayIso = new Date().toISOString().slice(0, 10);
    const payload = {
      ...EMPTY_FORM,
      tracks: undefined,
      label: quickForm.label.trim(),
      title: quickForm.title.trim(),
      main_artist: quickForm.main_artist.trim(),
      release_date: todayIso,
    };
    delete payload.tracks;

    const prefix = didPrefixFor(payload.title, payload.main_artist, payload.release_date);
    if (prefix) {
      const { data: existing } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, release_date")
        .like("did", `${prefix}-%`)
        .limit(1);
      if (existing && existing.length > 0) {
        setQuickCreateOpen(false);
        setDuplicateWarning({ existing: existing[0], payload, trackRows: [], navMode: "detail" });
        return;
      }
    }

    setQuickSubmitting(true);
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

        <div className={styles.didBox}>
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

        {error && <div className={styles.errorBox}>{error}</div>}
        {autofillNote && (
          <div style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 16 }}>{autofillNote}</div>
        )}
        {createdDid && (
          <div className={styles.successBox}>
            Release created — DID {createdDid}. The form below has been cleared for the next one.
          </div>
        )}

        <form onSubmit={(e) => handleSubmit(e, "detail")}>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Trạng Thái Gói (Loại Dự Án)</label>
              <div style={{ padding: "9px 12px", background: "var(--bg-card)", border: "1px solid #2a2a2a", borderRadius: 6, color: "var(--text-faint)", fontSize: 13 }}>
                BRIEF & DATA — sẽ tiến triển qua quy trình gói sau khi tạo
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Hãng Đĩa <span className={styles.required}>*</span></label>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
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

            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Main Artist <span className={styles.required}>*</span>
              </label>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <ArtistInput
                    styles={styles}
                    value={form.main_artist}
                    onChange={(v) => update("main_artist", v)}
                    onBlur={handleArtistBlur}
                    artists={artists}
                    placeholder="Tên nghệ sĩ chính"
                  />
                </div>
                <QuickCreate
                  kind="artist"
                  onCreated={(newArtist) => {
                    setArtists((prev) => [...prev, newArtist]);
                    update("main_artist", newArtist.stage_name);
                  }}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Feature Artist</label>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <ArtistInput
                    styles={styles}
                    value={form.feature_artist}
                    onChange={(v) => update("feature_artist", v)}
                    artists={artists}
                    placeholder="Tên nghệ sĩ feat (nếu có)"
                  />
                </div>
                <QuickCreate
                  kind="artist"
                  onCreated={(newArtist) => {
                    setArtists((prev) => [...prev, newArtist]);
                    update("feature_artist", newArtist.stage_name);
                  }}
                />
              </div>
            </div>

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

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Giờ phát hành</label>
              <input
                type="time"
                className={styles.input}
                value={form.release_time}
                onChange={(e) => update("release_time", e.target.value)}
              />
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel}>Link Drive</label>
              <input
                className={styles.input}
                placeholder="https://drive.google.com/..."
                value={form.drive_link}
                onChange={(e) => update("drive_link", e.target.value)}
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

          <GateFields
            styles={styles}
            form={form}
            update={update}
            pitchingTypes={pitchingTypes}
            onPitchingToggle={(key, checked) => setPitchingTypes((p) => ({ ...p, [key]: checked }))}
            artistProfileTypes={artistProfileTypes}
            onArtistProfileToggle={(key, checked) => setArtistProfileTypes((p) => ({ ...p, [key]: checked }))}
            coTrongNetDraft={coTrongNetDraft}
            onCoTrongNetChange={(key, value) => setCoTrongNetDraft((p) => ({ ...p, [key]: value }))}
            suppressUrlFor={["gate_pre_order"]}
          />

          <div className={styles.actions}>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
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

        {quickCreateOpen && (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
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
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
            }}
          >
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 24, maxWidth: 440 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#ff9d5c", marginBottom: 10 }}>
                ⚠ Possible duplicate release
              </div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
                An existing release already has a matching DID prefix (same title/artist initials and release date):
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
