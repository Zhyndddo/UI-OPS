"use client";

import AppShell from "../../../lib/AppShell";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, formatDetailText } from "../../../lib/helpers";
import { GateFields, BoolToggle } from "../../../lib/GateFields";
import QuickCreate from "../../../lib/QuickCreate";
import { LabelInput, ArtistInput } from "../../../lib/ReferenceInputs";
import UrlField from "../../../lib/UrlField";
import { useAuth } from "../../../lib/AuthContext";
import { validateLabelNameEdit } from "../../../lib/labelHelpers";
import { TICKET_TYPE_LABELS } from "../../../lib/teamTypes";
import { buildProductNote, buildLinkshareNote, LINKSHARE_TIKTOK_OPTIONS, LINKSHARE_FACEBOOK_OPTIONS, PRIORITY_MODE_WARNING } from "../../../lib/releaseNotes";
import styles from "../../shared.module.css";

const TABS = [
  { key: "overview", label: "Tổng Hợp" },
  { key: "url", label: "URL" },
  { key: "media_booking", label: "Media Booking" },
  { key: "pitching", label: "Pitching" },
  { key: "pre_release", label: "Pre-release & Note" },
  { key: "streaming_milestone", label: "Streaming/Milestone" },
  { key: "tasklist", label: "Tasklist" },
];

const PIPELINE_STAGES = ["BRIEF & DATA", "DEALING"];

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

const BOOKING_ROUNDS = ["INT", "Đợt 1", "Đợt 2"];

export default function ReleaseDetailPage() {
  const { id } = useParams();
  const [release, setRelease] = useState(null);
  const [form, setForm] = useState(null);
  const [pitchingTicket, setPitchingTicket] = useState(null);
  const [pitchingTypesDraft, setPitchingTypesDraft] = useState({ priority: false, spotify: false, nct: false, zing: false });
  const [artistProfileTicket, setArtistProfileTicket] = useState(null);
  const [tab, setTab] = useState("overview");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [packageItems, setPackageItems] = useState([]);
  const [bookingEntries, setBookingEntries] = useState([]);
  const [bookingCategories, setBookingCategories] = useState([]); // package_categories — for the Media Booking tab's per-Hạng-Mục summary
  const [magicLinkUrl, setMagicLinkUrl] = useState(null);
  const [hasMediaBookingTicket, setHasMediaBookingTicket] = useState(false);
  const [pitchingInfoTicket, setPitchingInfoTicket] = useState(null);

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
          if (found) setPitchingTypesDraft({ priority: false, spotify: false, nct: false, zing: false, ...found.data });
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
          setArtistProfileTicket(apTix?.[0] || null);
        }
        // The real gate for "Send Package Ticket" — whether a Media
        // Booking ticket for this release ACTUALLY exists right now, not
        // the release.package_ticket_sent flag (imported releases don't
        // always have that flag mapped, so it can't be trusted alone).
        const { data: mbTab } = await supabase.from("ticket_tabs").select("id").eq("key", "media_booking").single();
        if (mbTab) {
          const { data: mbTix } = await supabase
            .from("tickets")
            .select("id")
            .eq("tab_id", mbTab.id)
            .eq("data->>releaseId", data.did)
            .is("deleted_at", null)
            .limit(1);
          setHasMediaBookingTicket((mbTix || []).length > 0);
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

  // The one and only place Pitching/Artist Profile tickets get created or
  // updated from this page now — no more immediate-on-click side effects.
  // Both are idempotent per release (checked via pitchingTicket/
  // artistProfileTicket, fetched on load) so clicking Save more than once
  // never creates a second ticket for the same product.
  async function saveTab() {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("releases").update(form).eq("id", id);
    if (err) {
      setSaving(false);
      setError(err.message);
      return;
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
          const newData = { releaseId: form.did, priority: false, spotify: false, nct: false, zing: false, ...pitchingTypesDraft };
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

    if (form.gate_artist_profile === "true" && !artistProfileTicket) {
      const { data: tab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "artist_profile").single();
      if (tab) {
        const { data: created } = await supabase
          .from("tickets")
          .insert({
            tab_id: tab.id,
            data: { releaseId: form.did, artistName: form.main_artist, email: "" },
            status: tab.default_status,
            status_log: { [tab.default_status]: new Date().toISOString() },
            requester_segment: form.requester_segment || null,
          })
          .select()
          .single();
        if (created) setArtistProfileTicket(created);
      }
    }

    setSaving(false);
    setRelease(form);
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
  // No extra ticket from here once one exists; the only supported way to
  // get another Media Booking ticket moving for this release is the
  // dedicated INT MEDIA follow-up, which reopens the SAME ticket instead
  // of creating a new one.
  async function sendPackageTicket() {
    if (hasMediaBookingTicket) return;
    const { data: mbTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "media_booking").single();
    if (mbTab) {
      const { error: insertErr } = await supabase.from("tickets").insert({
        tab_id: mbTab.id,
        data: { releaseId: form.did, proposedPackage: null },
        status: mbTab.default_status,
        status_log: { [mbTab.default_status]: new Date().toISOString() },
      });
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
    }
    setHasMediaBookingTicket(true);

    const patch = { package_ticket_sent: true };
    if (form.project_type === "BRIEF & DATA") patch.project_type = "DEALING";
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
        await supabase
          .from("tickets")
          .update({
            status: "REQUESTED",
            status_log: { ...(existing.status_log || {}), REQUESTED: new Date().toISOString() },
            data: { ...(existing.data || {}), proposedPackage: "INT MEDIA" },
          })
          .eq("id", existing.id);
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

  async function togglePackageLock() {
    const newVal = !form.package_locked;
    setForm((f) => ({ ...f, package_locked: newVal }));
    await supabase.from("releases").update({ package_locked: newVal }).eq("id", id);
    setRelease((r) => ({ ...r, package_locked: newVal }));
  }

  if (error && !release) return <div className={styles.page}><div className={styles.container}><div className={styles.errorBox}>{error}</div></div></div>;
  if (!form) return <div className={styles.page}><div className={styles.container}>Loading…</div></div>;

  const metaDone = META_ITEMS.filter((m) => form[m.key]).length;
  // Send Upload only actually requires 4 of the 6 checklist items (Audio,
  // Artwork, Lyric, Metadata) — Working Files and MV are still tracked in
  // the checklist above for visibility, they just don't gate the ticket.
  // Gated on the SAVED release (release), not the live form draft — same
  // "must hit Save first" rule already applied to Priority Pitching below.
  // Ticking a checklist box is a draft edit like every other field on this
  // page; it must not unlock Send Upload until Save actually persists it.
  // requiredMetaDoneLive tracks the live/unsaved count purely to show a
  // "you have unsaved checklist changes" hint near the button.
  const requiredMetaDone = REQUIRED_META_KEYS.filter((k) => release?.[k]).length;
  const requiredMetaDoneLive = REQUIRED_META_KEYS.filter((k) => form[k]).length;
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

        <div style={{ marginBottom: 20 }}>
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
          <div style={{ color: "#888", fontSize: 13, marginBottom: form.upc ? 4 : 14 }}>
            {form.release_date} {form.release_time}
          </div>
          {form.upc && (
            <div style={{ color: "#666", fontSize: 12, marginBottom: 14 }}>
              UPC: <span style={{ color: "#999" }}>{form.upc}</span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <LinkPill label="Link Drive" href={firstUrl(form.drive_link)} />
            <span style={{ color: "#444" }}>|</span>
            <LinkPill label="Smartlink" href={firstUrl(form.smartlink)} />
            <span style={{ color: "#444" }}>|</span>
            <LinkPill label="Magic Link" href={magicLinkUrl} />
          </div>
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
            onSendIntMediaTicket={sendIntMediaTicket}
            pitchingTicket={pitchingTicket}
            pitchingTypesDraft={pitchingTypesDraft}
            onPitchingToggle={handlePitchingToggle}
            pitchingInfoTicket={pitchingInfoTicket}
            onSendPitchingInfoTicket={sendPitchingInfoTicket}
            setTab={setTab}
          />
        )}
        {tab === "url" && <UrlTab form={form} update={update} onSave={saveTab} saving={saving} did={form.did} releaseId={id} />}
        {tab === "media_booking" && (
          <MediaBookingTab form={form} entries={bookingEntries} categories={bookingCategories} packageItems={packageItems} />
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
      <span style={{ fontSize: 12, fontWeight: 700, color: "#555" }}>
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

function SaveBar({ onSave, saving }) {
  return (
    <div style={{ marginTop: 20 }}>
      <button className={styles.btnPrimary} onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

// Loại Dự Án is no longer a static dropdown — it's the booking pipeline:
// BRIEF & DATA -> DEALING (persists until artist locks in) -> a real resolved package
// (set once the artist locks one in via the magic link). Shows the current
// stage — no manual "Advance" action anymore; sending the package ticket
// to Marketing (below, in the Package section) is what actually moves
// BRIEF & DATA -> DEALING. Once resolved to a real package, shows that
// value read-only plus the derived Phụ Lục requirement.
function PipelineControl({ form, update, setTab }) {
  const stage = form.project_type;
  const isPipelineStage = PIPELINE_STAGES.includes(stage);

  return (
    <div style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 14, marginBottom: 20 }}>
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
          <span style={{ color: "#666", fontSize: 11 }}>
            Moves to DEALING automatically once a Package Ticket is sent (see Package section below)
          </span>
        )}
        {stage === "DEALING" && (
          <span style={{ color: "#666", fontSize: 11 }}>
            Waiting on artist to pick a package via the magic link (see Package section below)
          </span>
        )}
      </div>
      {!isPipelineStage && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#888" }}>
          Resolved package — <span style={{ color: "#ffca4d" }}>Phụ Lục required, see URL tab.</span>
        </div>
      )}
      <p style={{ color: "#555", fontSize: 11, marginTop: 8, marginBottom: 0 }}>
        Click Save below to persist a stage change.
      </p>
    </div>
  );
}

function fmtVnd(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

function OverviewTab({ form, update, metaDone, requiredMetaDone, requiredMetaDoneLive, uploadReady, onSave, saving, onUpload, onUnlockNeedsUpdate, packageItems, magicLinkUrl, onToggleLock, onSendPackageTicket, hasMediaBookingTicket, onSendIntMediaTicket, pitchingTicket, pitchingTypesDraft, onPitchingToggle, pitchingInfoTicket, onSendPitchingInfoTicket, setTab }) {
  const { profile } = useAuth();
  const isAdminOrAbove = profile?.role === "admin" || profile?.role === "dev";
  const [genres, setGenres] = useState([]);
  const [topics, setTopics] = useState([]);
  const [channels, setChannels] = useState([]);
  const [artistsList, setArtistsList] = useState([]);
  const [labelsList, setLabelsList] = useState([]);
  const [labelDraft, setLabelDraft] = useState(form.label || "");

  useEffect(() => {
    setLabelDraft(form.label || "");
  }, [form.label]);
  const [labelCurveId, setLabelCurveId] = useState(null);

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

  // Curve ID lives on the labels table, not the release — releases.label
  // is a denormalized text copy, so this looks up the matching real label
  // row to find its Curve ID (for display) and to validate the "HĐ -"
  // prefix rule if the Label field's text gets edited.
  useEffect(() => {
    if (!supabase || !form.label) { setLabelCurveId(null); return; }
    supabase.from("labels").select("curve_id").eq("label_name", form.label).maybeSingle()
      .then(({ data }) => setLabelCurveId(data?.curve_id || null));
  }, [form.label]);

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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        <Field label="UPC">
          <input className={styles.input} value={form.upc || ""} onChange={(e) => update("upc", e.target.value)} />
        </Field>
        <Field label="ISRC">
          <input className={styles.input} value={form.isrc || ""} onChange={(e) => update("isrc", e.target.value)} />
        </Field>
        <Field label="Apple ID">
          <input className={styles.input} value={form.apple_id || ""} onChange={(e) => update("apple_id", e.target.value)} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "start" }}>
        <div>
          <div className={styles.subheading} style={{ marginTop: 0 }}>Trạng Thái Gói (Loại Dự Án)</div>
          <PipelineControl form={form} update={update} setTab={setTab} />
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
                    const check = validateLabelNameEdit(form.label, e.target.value, labelCurveId);
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
          <Field label="Curve ID">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input className={styles.input} style={{ flex: 1, opacity: 0.7 }} value={labelCurveId || ""} readOnly placeholder="— set on the Label List —" />
              {isAdminOrAbove && (
                <Link href="/labels" style={{ fontSize: 11, color: "var(--accent)", whiteSpace: "nowrap" }}>
                  Edit in Label List →
                </Link>
              )}
            </div>
          </Field>
        </div>
      </div>

      <div className={styles.subheading}>Name / Artist / Release Date (editing updates the title above)</div>
      <div className={styles.grid2}>
        <Field label="Name">
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
            <BoolToggle value={!!form[m.key]} onChange={(v) => update(m.key, v)} />
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "#888", marginTop: -12, marginBottom: 20 }}>
        * Required for Send Upload (Audio, Artwork, Lyric, Metadata). Working Files and MV are tracked here but don't block the ticket.
      </p>

      <div className={styles.subheading}>Other Checklist</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className={styles.field} style={{ marginBottom: 0 }}>
          <label className={styles.fieldLabel}>SONY PUBLISH</label>
          <BoolToggle value={!!form.sony_publish} onChange={(v) => update("sony_publish", v)} />
        </div>
        <div className={styles.field} style={{ marginBottom: 0 }}>
          <label className={styles.fieldLabel}>PUBLISHING</label>
          <BoolToggle value={!!form.is_publish} onChange={(v) => update("is_publish", v)} />
        </div>
        <div className={styles.field} style={{ marginBottom: 0 }}>
          <label className={styles.fieldLabel}>Splitshare</label>
          <BoolToggle value={!!form.has_splitshare} onChange={(v) => update("has_splitshare", v)} />
        </div>
        <div className={styles.field} style={{ marginBottom: 0 }}>
          <label className={styles.fieldLabel}>Request Phụ lục</label>
          <BoolToggle value={!!form.phu_luc_requested} onChange={(v) => update("phu_luc_requested", v)} />
        </div>
      </div>

      <div style={{ marginTop: 24, borderTop: "1px solid #262626", paddingTop: 20 }}>
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
          <p style={{ color: "#888", fontSize: 11, marginTop: 8, marginBottom: 0 }}>
            Priority Pitching is ticked but not saved yet — hit Save below to unlock Send Upload.
          </p>
        )}
        {!form.requested && !uploadReady && requiredMetaDoneLive !== requiredMetaDone && (
          <p style={{ color: "#888", fontSize: 11, marginTop: 8, marginBottom: 0 }}>
            Metadata Checklist has unsaved changes — hit Save below before Send Upload picks them up.
          </p>
        )}
      </div>

      <div style={{ marginTop: 24, borderTop: "1px solid #262626", paddingTop: 20 }}>
        <div className={styles.subheading} style={{ marginTop: 0 }}>Package (Gói Hỗ Trợ Truyền Thông)</div>

        {["BRIEF & DATA", "DEALING"].includes(form.project_type) ? (
          <p style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
            No contract type resolved yet — package details will show once the artist locks one in.
          </p>
        ) : (
          <p style={{ fontSize: 13, color: "#ccc", marginBottom: 4 }}>
            Contract type: <strong style={{ color: "#ff9d5c" }}>{form.project_type}</strong>
            {form.package_locked && <span style={{ color: "#888" }}> (locked)</span>}
          </p>
        )}

        {form.package_total_value != null && (
          <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
            Tổng Giá Trị Gói: <strong style={{ color: "#ccc" }}>{fmtVnd(form.package_total_value)}</strong>
            {" · "}Thanh Toán: <strong style={{ color: "#ccc" }}>{form.package_payment_status}</strong>
            {" · "}<span style={{ color: "#666" }}>Full item breakdown is on the Media Booking tab.</span>
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
            disabled={hasMediaBookingTicket}
            style={hasMediaBookingTicket ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
            title={hasMediaBookingTicket ? "A Media Booking ticket already exists for this release." : undefined}
          >
            {hasMediaBookingTicket ? "Package Ticket Already Sent" : "Send Package Ticket to Marketing"}
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
        </div>

        {magicLinkUrl && (
          <div style={{ marginTop: 14, background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
              Existing link for this release:
            </div>
            <a href={magicLinkUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#ff6b1a", fontSize: 13, wordBreak: "break-all" }}>
              {magicLinkUrl}
            </a>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, borderTop: "1px solid #262626", paddingTop: 20 }}>
        <div className={styles.subheading} style={{ marginTop: 0 }}>Additional Request</div>
        <GateFields
          styles={styles}
          form={form}
          update={update}
          pitchingTypes={pitchingTypesDraft}
          onPitchingToggle={onPitchingToggle}
          pitchingInfoTicket={pitchingInfoTicket}
          onSendPitchingInfoTicket={onSendPitchingInfoTicket}
        />

        <SaveBar onSave={onSave} saving={saving} />
      </div>
    </div>
  );
}

// Tracklist — only shown when single_album_ep is EP/Album. Own supabase
// CRUD (immediate-write, matching the app's default pattern elsewhere)
// rather than going through the Overview tab's staged form/Save, since
// these are separate rows in release_tracks, not columns on releases.
function TracklistSection({ releaseId }) {
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

  if (loading) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div className={styles.subheading} style={{ marginTop: 0 }}>Tracklist</div>
      {tracks.length === 0 && <p style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>No tracks added yet.</p>}
      {tracks.map((t) => (
        <div key={t.id} style={{ display: "grid", gridTemplateColumns: "50px 2fr 1.5fr 1.5fr 32px", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#888", textAlign: "center" }}>#{t.sort_order}</div>
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
      ))}
      <button onClick={addTrack} className={styles.btnSmall}>+ Add Track</button>
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
            so it always matches what the artist was actually sent. */}
        <Field label="Link Media Report">
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
            <div className={styles.input} style={{ color: "#555", display: "flex", alignItems: "center" }}>
              auto-filled once a magic link is generated
            </div>
          )}
        </Field>
        {urlFields.map(([key, label]) =>
          key === "smartlink" && form.needs_update ? (
            <Field key={key} label={label}>
              <UrlField styles={styles} value={form[key]} onChange={(v) => update(key, v)} disabled disabledTitle={PRIORITY_MODE_WARNING} />
            </Field>
          ) : (
            <Field key={key} label={label}>
              <UrlField styles={styles} value={form[key]} onChange={(v) => update(key, v)} />
            </Field>
          )
        )}
      </div>
      <Field label="URL Phụ Lục">
        <UrlField styles={styles} value={form.link_phu_luc} onChange={(v) => update("link_phu_luc", v)} />
      </Field>
      <p style={{ color: "#888", fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        Status Phụ Lục: <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{plStatus}</span>
        {" — "}{phuLucNextStep(form)}
      </p>
      <SaveBar onSave={onSave} saving={saving} />

      <AllUrlsSection did={did} releaseId={releaseId} />
    </div>
  );
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
    <div style={{ marginTop: 28, borderTop: "1px solid #262626", paddingTop: 20 }}>
      <div className={styles.subheading} style={{ marginTop: 0 }}>All URLs Related to This DID</div>
      <p style={{ color: "#666", fontSize: 11, marginTop: -8, marginBottom: 12 }}>
        Read-only — pulled from the Booking Board, every ticket referencing this release, and Magic Links. Edit each at its own source.
      </p>
      {groups === null ? (
        <div style={{ color: "#666", fontSize: 12 }}>Loading…</div>
      ) : validLinks.length === 0 ? (
        <div style={{ color: "#666", fontSize: 12 }}>Nothing found elsewhere yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          {validLinks.map((g, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
              <span style={{ color: "#666", minWidth: 110, flexShrink: 0 }}>{g.source} — {g.label}</span>
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
function MediaBookingTab({ form, entries, categories, packageItems }) {
  const [round, setRound] = useState("INT");
  const roundEntries = entries.filter((e) => e.booking_round === round);

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
    <div>
      {entries.length > 0 && (
        <>
          <div className={styles.subheading} style={{ marginTop: 0 }}>All Booking Links</div>
          <div style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 12, marginBottom: 24, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-line", color: "#ccc" }}>
            {entries
              .filter((e) => e.link)
              .flatMap((e) => e.link.split("\n").map((u) => u.trim()).filter(Boolean).map((u) => `${e.channel_name ? e.channel_name : e.platform}: ${u}`))
              .join("\n")}
          </div>
        </>
      )}

      {packageItems.length > 0 && (
        <>
          <div className={styles.subheading} style={{ marginTop: 0 }}>Chosen Package — Itemized</div>
          <table className={styles.table} style={{ marginBottom: 24 }}>
            <thead><tr><th>Hạng Mục</th><th>Số Lượng</th><th>Chi Tiết</th><th>Thành Tiền</th></tr></thead>
            <tbody>
              {packageItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.category}</td>
                  <td>{item.quantity != null ? `${item.quantity} ${item.unit || ""}` : "—"}</td>
                  <td style={{ fontSize: 11, color: "#999", whiteSpace: "pre-line" }}>{formatDetailText(item.detail) || "—"}</td>
                  <td>{fmtVnd(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {BOOKING_ROUNDS.map((r) => (
          <button
            key={r}
            onClick={() => setRound(r)}
            className={`${styles.tabBtn} ${round === r ? styles.tabBtnActive : ""}`}
            style={{ border: "1px solid #262626", borderRadius: 6 }}
          >
            {r}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {categories.map((c) => {
          const booked = bookedFor(c.name);
          const added = addedFor(c.id);
          const isDone = booked != null && booked > 0 && added >= booked;
          return (
            <div key={c.id} style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", marginBottom: 8, textTransform: "uppercase" }}>
                {c.name}
              </div>
              {isDone ? (
                <span style={{ color: "#7ee6a8", fontWeight: 800, fontSize: 13 }}>DONE</span>
              ) : booked != null ? (
                <span style={{ color: "#ccc", fontSize: 13 }}>{added} / {booked}</span>
              ) : (
                <span style={{ color: "#666", fontSize: 13 }}>{added} / —</span>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ color: "#666", fontSize: 11, marginTop: 12 }}>
        Add/manage individual booking links on the Booking Board — this is a read-only summary per Hạng Mục, same as its "All" filter.
      </p>
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

function PreReleaseTab({ form, update, onSave, saving }) {
  return (
    <div>
      <div className={styles.grid2}>
        <Field label="CANVAS MV Status">
          <input className={styles.input} value={form.canva_mv_status || ""} onChange={(e) => update("canva_mv_status", e.target.value)} />
        </Field>
        <Field label="CANVAS Status">
          <input className={styles.input} value={form.canva_status || ""} onChange={(e) => update("canva_status", e.target.value)} />
        </Field>
        <Field label="Artist Pick Status">
          <input className={styles.input} value={form.artist_pick_status || ""} onChange={(e) => update("artist_pick_status", e.target.value)} />
        </Field>
        <Field label="Musixmatch Link">
          <input className={styles.input} value={form.musixmatch_link || ""} onChange={(e) => update("musixmatch_link", e.target.value)} />
        </Field>
        <Field label="Musixmatch Status">
          <input className={styles.input} value={form.musixmatch_status || ""} onChange={(e) => update("musixmatch_status", e.target.value)} />
        </Field>
        <Field label="NCT Lyric">
          <input className={styles.input} value={form.nct_lyric || ""} onChange={(e) => update("nct_lyric", e.target.value)} />
        </Field>
      </div>

      <div className={styles.subheading}>Phụ Lục (Booking)</div>
      <div className={styles.grid2}>
        <Field label="Ngày Gửi">
          <input type="date" className={styles.input} value={form.phu_luc_ngay_gui || ""} onChange={(e) => update("phu_luc_ngay_gui", e.target.value)} />
        </Field>
        <Field label="Ngày Ký">
          <input type="date" className={styles.input} value={form.phu_luc_ngay_ky || ""} onChange={(e) => update("phu_luc_ngay_ky", e.target.value)} />
        </Field>
      </div>
      <p style={{ color: "#888", fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        Status Phụ Lục: <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{phuLucStatusClient(form)}</span>
        {" — "}{phuLucNextStep(form)}
      </p>

      <div className={styles.subheading}>Next Step Note</div>
      <Field label="">
        <textarea className={styles.textarea} value={form.brief || ""} onChange={(e) => update("brief", e.target.value)} placeholder="Tình trạng data, xác nhận gói HTTT..." />
      </Field>

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
      <pre style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 14, fontSize: 12, color: "#ccc", whiteSpace: "pre-wrap" }}>
{buildProductNote(form)}
      </pre>
      <pre style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 14, fontSize: 12, color: "#ccc", whiteSpace: "pre-wrap", marginTop: 10 }}>
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
          <span style={{ color: "#555", fontSize: 12 }}>no link set — add one on the URL tab</span>
        )}
      </div>

      {loading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : (
        <>
          <div className={styles.subheading}>Stream Numbers</div>
          {metrics.length === 0 ? (
            <p style={{ color: "#666", fontSize: 12, marginBottom: 20 }}>No stream data linked yet.</p>
          ) : (
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
          )}

          <div className={styles.subheading}>Milestone (Chart Rank)</div>
          <p style={{ color: "#666", fontSize: 11, marginTop: -8, marginBottom: 12 }}>
            Matched by exact DID ({form.did || "—"}). Derivative-track matching isn't implemented yet.
          </p>
          {milestones.length === 0 ? (
            <p style={{ color: "#666", fontSize: 12 }}>No milestone entries for this DID.</p>
          ) : (
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
          )}
        </>
      )}
    </div>
  );
}

function TasklistTab({ form, bookingEntries }) {
  const items = [
    ["Link Drive", form.drive_link],
    ["Metadata: Audio", form.meta_audio],
    ["Metadata: Artwork", form.meta_artwork],
    ["Metadata: Working Files", form.meta_working_files],
    ["Metadata: Lyric", form.meta_lyric],
    ["Metadata: MV", form.meta_mv],
    ["Metadata: Doc", form.meta_doc],
    ["Smartlink", form.smartlink],
    ["UPC", form.upc],
    ["Link LBM", form.link_lbm],
    ["Link Share", form.link_share],
    ["Media Booking entries", bookingEntries.length > 0],
    ["Pitching: Spotify", form.pitching_status_spotify],
    ["Pitching: NCT", form.pitching_status_nct],
    ["Pitching: Zing", form.pitching_status_zing],
    ["CANVAS Status", form.canva_status],
    ["Artist Pick Status", form.artist_pick_status],
    ["Musixmatch", form.musixmatch_link],
  ];
  return (
    <table className={styles.table}>
      <thead>
        <tr><th>Field</th><th>Status</th></tr>
      </thead>
      <tbody>
        {items.map(([label, val]) => (
          <tr key={label}>
            <td>{label}</td>
            <td>{val ? <span style={{ color: "#7ee6a8" }}>✓ Filled</span> : <span style={{ color: "#555" }}>— Empty</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// buildProductNote/buildLinkshareNote moved to lib/releaseNotes.js so the
// OPS Upload ticket list can show the exact same live-computed notes
// (imported at the top of this file) without re-deriving the template.
