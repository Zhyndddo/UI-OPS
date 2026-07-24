"use client";

import AppShell from "../../../lib/AppShell";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import { GateFields, BoolToggle } from "../../../lib/GateFields";
import QuickCreate from "../../../lib/QuickCreate";
import { LabelInput, ArtistInput } from "../../../lib/ReferenceInputs";
import { useAuth } from "../../../lib/AuthContext";
import { validateLabelNameEdit } from "../../../lib/labelHelpers";
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

const BOOKING_ROUNDS = ["INT", "Đợt 1", "Đợt 2"];
const BOOKING_PLATFORMS = ["TikTok", "Facebook", "Instagram", "YouTube"];

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
  const [magicLinkUrl, setMagicLinkUrl] = useState(null);

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
  // never touches Upload. Each is its own one-time gate (requested /
  // package_ticket_sent) — the real bug being fixed here is that Upload
  // used to be a toggle (could flip back off), not a proper one-time
  // action like Package always was.
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
    await supabase.from("releases").update(patch).eq("id", id);
    setForm((f) => ({ ...f, ...patch }));
    setRelease((r) => ({ ...r, ...patch }));

    // Avoids double-sending if Marketing's button already fired independently.
    await sendPackageTicket();
  }

  async function sendPackageTicket() {
    if (form.package_ticket_sent) return;
    const { data: mbTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "media_booking").single();
    if (mbTab) {
      await supabase.from("tickets").insert({
        tab_id: mbTab.id,
        data: { releaseId: form.did, proposedPackage: null },
        status: mbTab.default_status,
        status_log: { [mbTab.default_status]: new Date().toISOString() },
      });
    }

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

  async function addBookingEntry(round, platform, channelType, link) {
    if (!link) return;
    const { data, error: err } = await supabase
      .from("media_booking_entries")
      .insert({ release_id: id, booking_round: round, platform, channel_type: channelType, link, status: "Chưa Booking" })
      .select()
      .single();
    if (!err && data) setBookingEntries((prev) => [...prev, data]);
  }

  async function cycleBookingStatus(entry) {
    const order = ["Chưa Booking", "Đã Gửi", "Done"];
    const next = order[(order.indexOf(entry.status) + 1) % order.length];
    await supabase.from("media_booking_entries").update({ status: next }).eq("id", entry.id);
    setBookingEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: next } : e)));
  }

  // Magic link generation moved to Marketing's package spec builder (not
  // built yet) — this page only reads/displays an existing link now,
  // fetched on load below, never creates one.

  async function togglePackageLock() {
    const newVal = !form.package_locked;
    setForm((f) => ({ ...f, package_locked: newVal }));
    await supabase.from("releases").update({ package_locked: newVal }).eq("id", id);
    setRelease((r) => ({ ...r, package_locked: newVal }));
  }

  if (error && !release) return <div className={styles.page}><div className={styles.container}><div className={styles.errorBox}>{error}</div></div></div>;
  if (!form) return <div className={styles.page}><div className={styles.container}>Loading…</div></div>;

  const metaDone = META_ITEMS.filter((m) => form[m.key]).length;
  const nameGroupFilled = form.title && form.main_artist && form.release_date;
  const uploadReady = metaDone === META_ITEMS.length && nameGroupFilled;

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <Link href="/releases" className={styles.backLink}>
          ← Back to New Release
        </Link>

        <div style={{ marginBottom: 20 }}>
          <div className={styles.eyebrow}>{form.did || "—"}</div>
          <h1 className={styles.title} style={{ marginBottom: 4 }}>
            {form.title} — {form.main_artist}
          </h1>
          <div style={{ color: "#888", fontSize: 13 }}>
            {form.release_date} {form.release_time}
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
            uploadReady={uploadReady}
            onSave={saveTab}
            saving={saving}
            onUpload={sendUpload}
            packageItems={packageItems}
            magicLinkUrl={magicLinkUrl}
            onToggleLock={togglePackageLock}
            onSendPackageTicket={sendPackageTicket}
            pitchingTicket={pitchingTicket}
            pitchingTypesDraft={pitchingTypesDraft}
            onPitchingToggle={handlePitchingToggle}
            setTab={setTab}
          />
        )}
        {tab === "url" && <UrlTab form={form} update={update} onSave={saveTab} saving={saving} />}
        {tab === "media_booking" && (
          <MediaBookingTab form={form} entries={bookingEntries} onAdd={addBookingEntry} onCycleStatus={cycleBookingStatus} packageItems={packageItems} />
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
          {" "}
          <button className={styles.btnSmall} onClick={() => update("project_type", "BRIEF & DATA")}>
            Reset to BRIEF & DATA
          </button>
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

function OverviewTab({ form, update, metaDone, uploadReady, onSave, saving, onUpload, packageItems, magicLinkUrl, onToggleLock, onSendPackageTicket, pitchingTicket, pitchingTypesDraft, onPitchingToggle, setTab }) {
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
        <Field label="Link Drive">
          <input className={styles.input} value={form.drive_link || ""} onChange={(e) => update("drive_link", e.target.value)} />
        </Field>
        <Field label="Link LBM (locked — edit from URL tab or Ticket)">
          <input className={styles.input} value={form.link_lbm || ""} disabled />
        </Field>
        <Field label="Media Channel">
          <select className={styles.select} value={form.requester_segment || ""} onChange={(e) => update("requester_segment", e.target.value)}>
            <option value="">— Chọn —</option>
            {channels.map((opt) => <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <input className={styles.input} value={form.release_category || ""} onChange={(e) => update("release_category", e.target.value)} placeholder="New Release / Re Marketing / ..." />
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
      </div>

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

      <div className={styles.subheading}>Metadata Checklist ({metaDone}/6)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        {META_ITEMS.map((m) => (
          <div key={m.key} className={styles.field} style={{ marginBottom: 0 }}>
            <label className={styles.fieldLabel}>{m.label}</label>
            <BoolToggle value={!!form[m.key]} onChange={(v) => update(m.key, v)} />
          </div>
        ))}
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
            disabled={form.package_ticket_sent}
            style={form.package_ticket_sent ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
          >
            {form.package_ticket_sent ? "Package Ticket Sent" : "Send Package Ticket to Marketing"}
          </button>
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
        <div className={styles.subheading} style={{ marginTop: 0 }}>Additional Flags</div>
        <GateFields
          styles={styles}
          form={form}
          update={update}
          pitchingTypes={pitchingTypesDraft}
          onPitchingToggle={onPitchingToggle}
        />

        <SaveBar onSave={onSave} saving={saving} />
      </div>
    </div>
  );
}

function UrlTab({ form, update, onSave, saving }) {
  const fields = [
    ["smartlink", "Smartlink"],
    ["upc", "UPC"],
    ["link_lbm", "Link LBM"],
    ["link_share", "Link Share"],
    ["link_preorder", "Link Pre-order"],
    ["link_ugc", "Link UGC"],
    ["link_media_report", "Link Media Report"],
    ["promotion_package_url", "URL Promotion Package"],
    ["artist_photo_url", "Artist Photo URL"],
    ["project_proposal_url", "Project Proposal URL"],
    ["drive_link", "Link Drive"],
  ];
  const plStatus = phuLucStatusClient(form);
  return (
    <div>
      <div className={styles.grid2}>
        {fields.map(([key, label]) => (
          <Field key={key} label={label}>
            <input className={styles.input} value={form[key] || ""} onChange={(e) => update(key, e.target.value)} />
          </Field>
        ))}
      </div>
      <Field label="URL Phụ Lục">
        <input className={styles.input} value={form.link_phu_luc || ""} onChange={(e) => update("link_phu_luc", e.target.value)} />
      </Field>
      <p style={{ color: "#888", fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        Status Phụ Lục: <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{plStatus}</span>
        {" — "}{phuLucNextStep(form)}
      </p>
      <SaveBar onSave={onSave} saving={saving} />
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

function MediaBookingTab({ form, entries, onAdd, onCycleStatus, packageItems }) {
  const [round, setRound] = useState("INT");
  const [channelType, setChannelType] = useState("Direct");

  const visibleEntries = entries.filter((e) => e.booking_round === round && e.channel_type === channelType);
  // Per the real workflow: Direct booking (VIEENT-run, no third party) runs
  // immediately in parallel with the Phụ Lục signing process; Partner
  // booking (an outside vendor/channel) waits until it's actually signed.
  // This gates on channel_type, NOT booking_round — round is a scheduling
  // phase, channel_type is what actually determines legal exposure.
  const plSigned = phuLucStatusClient(form) === "Đã Ký";
  const isRestricted = channelType === "Partner" && !plSigned;

  return (
    <div>
      {packageItems.length > 0 && (
        <>
          <div className={styles.subheading} style={{ marginTop: 0 }}>Chosen Package — Itemized</div>
          <table className={styles.table} style={{ marginBottom: 24 }}>
            <thead><tr><th>Hạng Mục</th><th>Số Lượng</th><th>Chi Tiết</th><th>Thành Tiền</th></tr></thead>
            <tbody>
              {packageItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.category}</td>
                  <td>{item.quantity} {item.unit}</td>
                  <td style={{ fontSize: 11, color: "#999" }}>{item.detail || "—"}</td>
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

      {isRestricted && (
        <div className={styles.errorBox} style={{ background: "#1a1a1a", borderColor: "#5a4a1a", color: "#ffca4d", marginBottom: 16 }}>
          ⚠ Partner booking should wait — Phụ Lục isn't signed yet (Status Phụ Lục: {phuLucStatusClient(form)}).
          Not a hard block yet, just a heads up.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {BOOKING_PLATFORMS.map((platform) => {
          const cellEntries = visibleEntries.filter((e) => e.platform === platform);
          return (
            <div key={platform} style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", marginBottom: 8, textTransform: "uppercase" }}>
                {platform}
              </div>
              <BookingCell
                round={round}
                platform={platform}
                channelType={channelType}
                entries={cellEntries}
                onAdd={onAdd}
                onCycleStatus={onCycleStatus}
              />
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, borderTop: "1px solid #262626", paddingTop: 16 }}>
        <div className={styles.fieldLabel} style={{ marginBottom: 8 }}>Channel Type</div>
        <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden", width: "fit-content" }}>
          {["Direct", "Partner"].map((c) => (
            <button
              key={c}
              onClick={() => setChannelType(c)}
              style={{
                padding: "9px 20px",
                fontSize: 12,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                background: channelType === c ? "#ff6b1a" : "transparent",
                color: channelType === c ? "#0a0a0a" : "#ccc",
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <p style={{ color: "#666", fontSize: 11, marginTop: 8 }}>
          Round "INT" (top) means no Partner channel is currently planned for this release (though that
          could change) — a scheduling phase, separate from this Direct/Partner switch below, which is
          what actually determines whether Phụ Lục needs to be signed first.
        </p>
      </div>
    </div>
  );
}

function BookingCell({ round, platform, channelType, entries, onAdd, onCycleStatus }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const done = entries.filter((e) => e.status === "Done").length;
  return (
    <div style={{ fontSize: 12 }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
        title={entries.map((e) => `${e.status}: ${e.link}`).join("\n")}
      >
        <span style={{ color: "#ccc" }}>Links</span>
        <span style={{ color: entries.length ? "#ff9d5c" : "#555", fontWeight: 700 }}>
          {done} / {entries.length}
        </span>
      </div>
      {open && (
        <div style={{ marginTop: 6 }}>
          {entries.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
              <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>
                {e.link}
              </a>
              <button
                onClick={() => onCycleStatus(e)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#ff9d5c", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}
              >
                {e.status}
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <input
              className={styles.input}
              style={{ padding: "4px 8px", fontSize: 11 }}
              placeholder="link…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <button
              className={styles.btnSmall}
              onClick={() => {
                onAdd(round, platform, channelType, link);
                setLink("");
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}
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
            <option>Cùng Ngày</option>
            <option>Ngày release+4</option>
            <option>Ngày release+7</option>
          </select>
        </Field>
        <Field label="Facebook Release Timing">
          <select className={styles.select} value={form.linkshare_facebook_timing || ""} onChange={(e) => update("linkshare_facebook_timing", e.target.value)}>
            <option value="">—</option>
            <option>Cùng ngày</option>
            <option>Ngày deliver+4</option>
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

function buildProductNote(f) {
  const lines = [
    `Tên Bài Hát: ${f.title || ""}`,
    `Ca sĩ: ${f.main_artist || ""}`,
    `Ngày Phát Hành: ${f.release_date || ""} ${f.release_time || ""}`,
    `---------------------`,
    `CHANNEL: ${f.requester_segment || ""}`,
    `---------------------`,
  ];
  const numbered = [
    ["LINK DRIVE", f.drive_link],
    ["LINK SHARE", f.link_share],
    ["SMARTLINK", f.smartlink],
    ["LINKDASH", f.link_lbm],
    ["UPC", f.upc],
    ["LINK UGC", f.link_ugc],
    ["MEDIA REPORT", f.link_media_report],
  ];
  numbered.forEach(([label, val], i) => {
    if (val) lines.push(`${i + 1}. ${label}: ${val}`);
  });
  return lines.join("\n");
}

function buildLinkshareNote(f) {
  return [
    `Thời gian phát hành Tiktok: ${f.linkshare_tiktok_timing || ""}`,
    `Thời gian phát hành Facebook: ${f.linkshare_facebook_timing || ""}`,
    `Link DATA: ${f.drive_link || ""}`,
  ].join("\n");
}
