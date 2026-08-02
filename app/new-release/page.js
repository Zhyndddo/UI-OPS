"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { GateFields, GateToggle } from "../../lib/GateFields";
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
  meta_doc: "false",
  gate_pitching: "false",
  gate_goi_ho_tro_truyen_thong: "false",
  gate_data_request: "false",
  gate_split_share: "false",
  gate_lyric_musixmatch: "false",
  gate_mv_spotify: "false",
  gate_discovery_mode_spotify: "false",
  gate_sony_publish: "false",
  gate_legal_request: "false",
  gate_phu_luc_mg: "false",
  gate_phu_luc_truyen_thong: "false",
  gate_phu_luc_publishing: "false",
  gate_design: "false",
  gate_co_trong_net_youtube: "false",
  design_content_types: [],
  split_share_entries: [],
};

const EMPTY_PITCHING_TYPES = { priority: false, spotify: false, nct: false, zing: false };

const META_ITEMS = [
  { key: "meta_audio", label: "Audio" },
  { key: "meta_artwork", label: "Artwork" },
  { key: "meta_working_files", label: "Working Files" },
  { key: "meta_lyric", label: "Lyric" },
  { key: "meta_mv", label: "MV" },
  { key: "meta_doc", label: "Metadata" },
];

export default function NewReleasePage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [pitchingTypes, setPitchingTypes] = useState(EMPTY_PITCHING_TYPES);
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

  async function handleSubmit(e) {
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

    setSubmitting(true);
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
    // blank for OPS to fill in (not collected on this form).
    if (form.gate_artist_profile === "true") {
      const { data: apTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "artist_profile").single();
      if (apTab) {
        await supabase.from("tickets").insert({
          tab_id: apTab.id,
          data: { releaseId: data.did, artistName: form.main_artist, email: "" },
          status: apTab.default_status,
          status_log: { [apTab.default_status]: new Date().toISOString() },
          requester_segment: form.requester_segment || null,
        });
      }
    }

    if (form.single_album_ep !== "Single" && trackRows && trackRows.length > 0) {
      await supabase.from("release_tracks").insert(
        trackRows
          .filter((t) => (t.track_name || "").trim())
          .map((t, i) => ({ release_id: data.id, sort_order: i + 1, track_name: t.track_name, main_artist: t.main_artist || null, feature_artist: t.feature_artist || null }))
      );
    }

    router.push("/releases");
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>// New Release</div>
        <h1 className={styles.title}>New Release</h1>

        <div className={styles.didBox}>
          <div className={styles.didLabel}>// Release ID (DID)</div>
          {createdDid ? (
            <div className={styles.didValue}>{createdDid}</div>
          ) : form.title.trim() || form.main_artist.trim() ? (
            <>
              <div className={styles.didValue}>{didPreview(form.title, form.main_artist, form.release_date)}</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                Preview — the final 4 digits are assigned by the database on creation, to guarantee no collisions
              </div>
            </>
          ) : (
            <div className={styles.didPlaceholder}>---- ---- ----</div>
          )}
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}
        {autofillNote && (
          <div style={{ color: "#888", fontSize: 12, marginBottom: 16 }}>{autofillNote}</div>
        )}
        {createdDid && (
          <div className={styles.successBox}>
            Release created — DID {createdDid}. The form below has been cleared for the next one.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Trạng Thái Gói (Loại Dự Án)</label>
              <div style={{ padding: "9px 12px", background: "#141414", border: "1px solid #2a2a2a", borderRadius: 6, color: "#888", fontSize: 13 }}>
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
                    <div style={{ fontSize: 12, color: "#888", textAlign: "center" }}>#{i + 1}</div>
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
              <p style={{ color: "#666", fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                Defaults to "{LINKSHARE_TIKTOK_OPTIONS[2]}" if left blank.
              </p>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Facebook Release Timing</label>
              <select className={styles.select} value={form.linkshare_facebook_timing} onChange={(e) => handleFacebookTimingChange(e.target.value)}>
                <option value="">—</option>
                {LINKSHARE_FACEBOOK_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
              <p style={{ color: "#666", fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                Auto-picked from today vs. Release Date − 4 days — pick one yourself to override.
              </p>
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel}>Linkshare Note (auto-generated preview)</label>
              <pre style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 12, fontSize: 12, color: "#ccc", whiteSpace: "pre-wrap", margin: 0 }}>
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
              </div>
            ))}
          </div>

          <div className={styles.subheading} style={{ marginTop: 8 }}>Additional Request</div>
          <GateFields
            styles={styles}
            form={form}
            update={update}
            pitchingTypes={pitchingTypes}
            onPitchingToggle={(key, checked) => setPitchingTypes((p) => ({ ...p, [key]: checked }))}
            suppressUrlFor={["gate_pre_order"]}
          />

          <div className={styles.actions}>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? "Đang tạo…" : "Tạo Release"}
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                setForm(EMPTY_FORM);
                setPitchingTypes(EMPTY_PITCHING_TYPES);
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
      </div>
    </div>
    </AppShell>
  );
}
