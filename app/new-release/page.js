"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { GateFields, BoolToggle } from "../../lib/GateFields";
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
  release_date: "",
  release_time: "19:00",
  theme: "",
  drive_link: "",
  brief: "",
  gate_pitching: "false",
  gate_publishing: "false",
  gate_goi_ho_tro_truyen_thong: "false",
  gate_split_share: "false",
  gate_lyric_musixmatch: "false",
  gate_design: "false",
  gate_co_trong_net_youtube: "false",
  split_share_entries: [],
};

const EMPTY_PITCHING_TYPES = { priority: false, spotify: false, nct: false, zing: false };

export default function NewReleasePage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [pitchingTypes, setPitchingTypes] = useState(EMPTY_PITCHING_TYPES);
  const [genres, setGenres] = useState([]);
  const [topics, setTopics] = useState([]);
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [artists, setArtists] = useState([]);
  const [labels, setLabels] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [createdDid, setCreatedDid] = useState(null);
  const [labelTouched, setLabelTouched] = useState(false); // true once user manually edits Label — blocks autofill from overwriting it
  const [autofillNote, setAutofillNote] = useState(null);

  useEffect(() => {
    if (!supabase) return;

    supabase
      .from("lookup_options")
      .select("category, value, label")
      .eq("active", true)
      .in("category", ["genre", "topic", "channel", "release_category"])
      .order("sort_order")
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(`Couldn't load dropdown options: ${fetchError.message}`);
          return;
        }
        setGenres((data || []).filter((r) => r.category === "genre"));
        setTopics((data || []).filter((r) => r.category === "topic"));
        setChannels((data || []).filter((r) => r.category === "channel"));
        setCategories((data || []).filter((r) => r.category === "release_category"));
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
    const payload = {
      ...form,
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

    setCreatedDid(data.did);
    setForm(EMPTY_FORM);
    setPitchingTypes(EMPTY_PITCHING_TYPES);
    setLabelTouched(false);
    setAutofillNote(null);
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
              <LabelInput
                value={form.label}
                onChange={(v) => update("label", v)}
                labels={labels}
                placeholder="Tên label"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Category</label>
              <select
                className={styles.select}
                value={form.release_category}
                onChange={(e) => update("release_category", e.target.value)}
              >
                {categories.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label || opt.value}
                  </option>
                ))}
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
              <ArtistInput
                value={form.main_artist}
                onChange={(v) => update("main_artist", v)}
                onBlur={handleArtistBlur}
                artists={artists}
                placeholder="Tên nghệ sĩ chính"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Feature Artist</label>
              <ArtistInput
                value={form.feature_artist}
                onChange={(v) => update("feature_artist", v)}
                artists={artists}
                placeholder="Tên nghệ sĩ feat (nếu có)"
              />
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
          </div>

          <div className={styles.subheading} style={{ marginTop: 8 }}>Additional Flags</div>
          <GateFields
            styles={styles}
            form={form}
            update={update}
            pitchingTypes={pitchingTypes}
            onPitchingToggle={(key, checked) => setPitchingTypes((p) => ({ ...p, [key]: checked }))}
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

// Lightweight autocomplete referencing the Artist List reference table —
// typed value stays free text (main_artist/feature_artist are text columns,
// not FKs), this just suggests matches as you type rather than forcing a
// hard reference, since not every artist has been entered yet.
// Same autocomplete pattern as ArtistInput, referencing the Label List
// reference table instead — free text underneath, not a hard foreign key,
// since not every label is in the reference table yet.
function LabelInput({ value, onChange, labels, placeholder }) {
  const [open, setOpen] = useState(false);
  const matches =
    value.trim().length > 0
      ? labels.filter((l) => l.label_name.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8)
      : [];

  return (
    <div style={{ position: "relative" }}>
      <input
        className={styles.input}
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
            background: "#1a1a1a", border: "1px solid #333", borderRadius: 6,
            marginTop: 4, maxHeight: 200, overflowY: "auto",
          }}
        >
          {matches.map((l) => (
            <div
              key={l.label_name}
              onClick={() => { onChange(l.label_name); setOpen(false); }}
              onMouseDown={(e) => e.preventDefault()}
              style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #262626" }}
            >
              {l.label_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtistInput({ value, onChange, onBlur, artists, placeholder }) {
  const [open, setOpen] = useState(false);
  const matches =
    value.trim().length > 0
      ? artists.filter((a) => a.stage_name.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8)
      : [];

  return (
    <div style={{ position: "relative" }}>
      <input
        className={styles.input}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // slight delay so a click on a suggestion registers before the list closes
          setTimeout(() => setOpen(false), 150);
          onBlur?.();
        }}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 10,
            background: "#1a1a1a",
            border: "1px solid #333",
            borderRadius: 6,
            marginTop: 4,
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {matches.map((a) => (
            <div
              key={a.stage_name}
              onClick={() => {
                onChange(a.stage_name);
                setOpen(false);
              }}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                cursor: "pointer",
                borderBottom: "1px solid #262626",
              }}
              onMouseDown={(e) => e.preventDefault()} // keep input focus so onClick fires before onBlur closes the list
            >
              {a.stage_name}
              {a.labels?.label_name && (
                <span style={{ color: "#666", marginLeft: 8 }}>— {a.labels.label_name}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
