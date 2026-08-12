"use client";

import AppShell from "../../../lib/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import { filterProfilesByTeam } from "../../../lib/workstationHelpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import SearchBox, { matchesQuery } from "../../../lib/SearchBox";
import { useIsMobile } from "../../../lib/useIsMobile";
import styles from "../../shared.module.css";

const GENRE_CATEGORIES = [
  { shared: "Pop", spotify: ["Adult Contemporary", "Britpop", "V-Pop", "French Pop", "Indo Pop", "Pop", "Pop in Spanish", "Sanat"], apple: ["Britpop", "V-Pop"] },
  { shared: "Hip-Hop / Rap", spotify: ["Alternative Rap", "Dirty South", "East Coast Rap", "Gangsta Rap", "Hardcore Rap", "Hip Hop/Rap", "Hip-Hop", "Latin Rap"], apple: ["Hip Hop", "Rap"] },
  { shared: "Ngày lễ / Mùa (Holiday & Seasonal)", spotify: ["Chanukah", "Christmas", "Christmas: Children's", "Christmas: Classic", "Christmas: Classical", "Christmas: Country", "Christmas: Jazz", "Christmas: Modern"], apple: ["Christmas"] },
  { shared: "Việt Nam - có nhãn riêng trên Spotify", spotify: [], apple: ["Indie Viet", "Lofi Viet", "V-Pop", "Vietnamese Bolero", "Vietnamese Hip Hop"] },
  { shared: "Rock", spotify: ["Alternative", "Alternative & Rock in Spanish", "Alternative Folk", "American Trad Rock", "Americana", "Arena Rock", "British Invasion", "College Rock"], apple: ["Alternative", "Americana", "Arena Rock", "Glam Rock", "Grunge", "Hard Rock", "Indie Pop", "Indie Rock"] },
  { shared: "R&B / Soul / Funk", spotify: ["Contemporary R&B", "Funk", "Motown", "Neo-Soul", "Quiet Storm", "R&B/Soul", "Soul"], apple: ["Contemporary R&B", "Funk", "Motown", "Neo Soul", "Quiet Storm", "Soul"] },
  { shared: "Electronic / Dance", spotify: ["Afro House", "Amapiano", "Ambient", "Bass", "Breakbeat", "Dance", "Downtempo", "Dubstep"], apple: ["Afro House", "Amapiano", "Ambient", "Bass", "Breakbeat", "Dance", "Downtempo", "Dubstep"] },
  { shared: "Jazz", spotify: ["Avant-Garde Jazz", "Bebop", "Contemporary Jazz", "Cool Jazz", "Crossover Jazz", "Hard Bop", "Jazz", "Latin Jazz"], apple: ["Bebop", "Contemporary Jazz", "Cool Jazz", "Hard Bop", "Latin Jazz", "Smooth Jazz", "Vocal Jazz"] },
  { shared: "Punk", spotify: ["EMO", "Pop Punk", "Punk"], apple: ["Emo", "Pop Punk", "Punk"] },
  { shared: "Latin", spotify: ["Axé", "Baile Funk", "Baladas y Boleros", "Bolero", "Bossa Nova", "Brazilian", "Chachacha", "Choro"], apple: ["Axé", "Bolero", "Bossa Nova", "Forró", "Guaracha", "Samba", "Sertanejo", "Tango"] },
  { shared: "World - Đông Á (East Asia: Trung/Nhật/Hàn)", spotify: ["Anime", "Cantopop", "Chinese", "Chinese Alt", "Chinese Classical", "Chinese Flute", "Chinese Hip-Hop", "Chinese Opera"], apple: ["Cantopop", "Chinese Hip Hop", "Chinese Rock", "Enka", "J-Pop", "K-Pop", "Kayokyoku", "Mandopop"] },
  { shared: "Christian / Gospel / Tôn giáo", spotify: ["CCM", "Chant", "Christian & Gospel", "Christian Metal", "Christian Pop", "Christian Rap", "Christian Rock", "Classic Christian"], apple: ["Christian Pop", "Christian Rock", "Gospel", "Southern Gospel", "Sufi", "Traditional Gospel"] },
  { shared: "Soundtrack / Score / Media", spotify: ["Foreign Cinema", "Musicals", "Original Score", "Shows", "Soundtrack", "TV Soundtrack", "Video Game"], apple: ["Musicals", "Soundtrack"] },
  { shared: "Hài kịch / Kể chuyện / Thiếu nhi (Comedy, Spoken, Kids)", spotify: ["Children's Music", "Comedy", "Karaoke", "Lullabies", "Sing-Along", "Spoken Word", "Standup Comedy", "Stories"], apple: ["Children's Music", "Comedy", "Spoken Word"] },
  { shared: "New Age / Thư giãn / Thiền", spotify: ["Environmental", "Exercise", "Fitness & Workout", "Healing", "Meditation", "Nature", "New Age", "Relaxation"], apple: ["New Age"] },
  { shared: "Khác / Vùng miền chung chung (Other / General Region)", spotify: ["Asia", "Australia", "Avant-Garde", "Lounge", "New Acoustic", "North America", "Novelty", "Sound Effects"], apple: ["Avant-garde", "Lounge"] },
  { shared: "Blues", spotify: ["Acoustic Blues", "Blues", "Blues-Rock", "Chicago Blues", "Classic Blues", "Country Blues", "Delta Blues", "Electric Blues"], apple: ["Blues", "Blues Rock", "Chicago Blues", "Classic Blues", "Country Blues", "Delta Blues"] },
  { shared: "Country / Folk / Bluegrass / Americana", spotify: ["Afro-folk", "Alternative Country", "Bluegrass", "Cajun", "Celtic", "Celtic Folk", "Contemporary Bluegrass", "Contemporary Celtic"], apple: ["Bluegrass", "Cajun", "Celtic", "Country", "Folk", "Folk Rock", "Honky Tonk", "Outlaw Country"] },
  { shared: "Classical / Orchestral", spotify: ["Art Song", "Baroque Era", "Chamber Music", "Choral", "Classical", "Classical Crossover", "Classical Era", "Impressionist"], apple: ["Chamber Music", "Choral", "Classical", "Classical Crossover", "Minimalism", "Orchestral", "Renaissance"] },
  { shared: "Metal", spotify: ["Death Metal/Black Metal", "Hair Metal", "Hardcore", "Heavy Metal"], apple: ["Hardcore", "Heavy Metal"] },
  { shared: "Reggae / Caribbean / Tropical", spotify: ["African Dancehall", "African Reggae", "Calypso", "Caribbean", "Dancehall", "Dub", "Kizomba", "Modern Dancehall"], apple: ["Calypso", "Dancehall", "Dub", "Kizomba", "Reggae", "Roots Reggae", "Ska", "Soca"] },
  { shared: "World - Châu Phi (Africa)", spotify: ["African", "Afrikaans", "Afro Soul", "Afro-Beat", "Afro-Pop", "Afro-fusion", "Afrobeats", "Benga"], apple: ["Afrikaans", "Afro Soul", "Afrobeats", "Bongo Flava", "Coupé Décalé", "Gqom", "Highlife", "Kuduro"] },
  { shared: "World - Trung Đông / Ả Rập (Middle East)", spotify: ["Arabesk", "Arabic", "Arabic Pop", "Dabke", "Egyptian Hip-Hop", "Egyptian Pop", "Egyptian Tarab", "Electro-Cha'abi"], apple: ["Arabesk", "Dabke", "Egyptian Hip Hop", "Khaleeji Hip-Hop", "Maghreb Pop"] },
  { shared: "World - Nam Á (South Asia)", spotify: ["Assamese", "Bengali", "Bhojpuri", "Bollywood", "Carnatic Classical", "Dini", "Ghazals", "Gujarati"], apple: ["Bollywood", "Carnatic Classical", "Hindustani Classical", "Punjabi Pop"] },
  { shared: "World - Đông Nam Á (Southeast Asia)", spotify: ["Dangdut", "Indonesian Religious", "Malaysian Pop", "Manilla Sound", "Original Pilipino Music", "Pinoy Pop", "Tai-Pop", "Thai Country"], apple: ["Dangdut", "Thai Pop"] },
  { shared: "World - Châu Âu (Europe/Nga/Thổ)", spotify: ["Europe", "Fado", "Flamenco", "France", "German Folk", "German Pop", "Hörspiele", "Iberia"], apple: ["Fado", "Flamenco", "Russian Chanson"] },
  { shared: "Nhạc cụ / Độc tấu (Instrumental)", spotify: ["Brass & Woodwinds", "Cello", "Guitar", "Instrumental", "Marching Bands", "Percussion", "Piano", "Solo Instrumental"], apple: [] },
];

const MOODS = [
  { shared: "Chill", spotify: "Chill", apple: "Chill" },
  { shared: "Energetic / Fitness", spotify: "Energetic", apple: "Fitness" },
  { shared: "Happy / Feel Good", spotify: "Happy", apple: "Feel Good" },
  { shared: "Fierce", spotify: "Fierce", apple: null },
  { shared: "Meditative / Focus-Sleep", spotify: "Meditative", apple: "Focus / Sleep" },
  { shared: "Psychedelic", spotify: "Psychedelic", apple: null },
  { shared: "Romantic / Romance", spotify: "Romantic", apple: "Romance" },
  { shared: "Sad / Feeling Blue", spotify: "Sad", apple: "Feeling Blue" },
  { shared: "Sexy", spotify: "Sexy", apple: null },
  { shared: "Heartbreak", spotify: null, apple: "Heartbreak" },
  { shared: "Motivation", spotify: null, apple: "Motivation" },
  { shared: "Party", spotify: null, apple: "Party" },
];

const SONG_STYLES = ["Acoustic", "Ballad", "Beats", "Christmas", "Experimental", "Goth", "Holiday", "Kids", "Traditional"];
const MUSIC_CULTURES = ["African", "Appalachian", "Arabic", "Asian", "Buddhist", "Caribbean", "Celtic", "Christian", "Hindu", "Indigenous", "Islamic", "Judaic", "Latin", "Mediterranean", "Sikh", "South Asian"];
const INSTRUMENTS = ["Accordion", "Acoustic Guitar", "Banjo", "Bass Guitar", "Buzuq", "Cello", "Clarinet", "Djembe", "Drum Kit", "Electric Guitar", "Erhu", "Flute", "Harmonica", "Harp", "Kora", "Mandolin", "Mbira", "Oboe", "Organ", "Oud", "Pedal Steel Guitar", "Piano", "Samples", "Sanxian", "Sarod", "Saxophone", "Sitar", "Steel Drum", "Synthesizer", "Tabla", "Trombone", "Trumpet", "Ukulele", "Violin", "Xylophone"];

// "—" is a real, pickable value — explicitly "not applicable," distinct
// from a field that's simply never been touched yet (still null). Per
// spec: it must be chosen on purpose, never assumed as a default, so an
// untouched field still blocks completion exactly like any other unfilled
// one.
const NA = "—";

const MOOD_SPOTIFY_MAX = 2;
const MOOD_APPLE_MAX = 3;
const SONG_STYLE_SPOTIFY_MAX = 2;
const CULTURE_SPOTIFY_MAX = 2;

function emptyData(releaseId) {
  return {
    releaseId,
    syncEnabled: true,
    genre: null,
    spotify: { moods: [], songStyles: [], cultures: [], instruments: [] },
    apple: { moods: [], songStyles: null, cultures: null, instruments: null },
  };
}

// Genre/song-style/culture/instrument current upload status — mirrors the
// same 3-stage logic described for the New Release dashboard: Upload once
// Link LBM exists, Standby once Link Share exists but nothing's delivered
// yet, Deliver once Smartlink or UPC exists (wins even if Link Share is
// also set, since Deliver is strictly later).
function uploadStatus(release) {
  if (!release) return null;
  if (release.smartlink || release.upc) return "Deliver";
  if (release.link_share && !release.upc && !release.smartlink) return "Standby";
  if (release.link_lbm) return "Upload";
  return null;
}

function fieldsDone(data) {
  const d = { ...emptyData(null), ...data, spotify: { ...emptyData(null).spotify, ...(data?.spotify || {}) }, apple: { ...emptyData(null).apple, ...(data?.apple || {}) } };
  return {
    genre: d.genre != null,
    moods: d.spotify.moods.length > 0 && d.apple.moods.length > 0,
    songStyles: d.spotify.songStyles.length > 0 && d.apple.songStyles != null,
    cultures: d.spotify.cultures.length > 0 && d.apple.cultures != null,
    instruments: d.spotify.instruments.length > 0 && d.apple.instruments != null,
  };
}

function allFieldsDone(data) {
  return Object.values(fieldsDone(data)).every(Boolean);
}

export default function PitchingInfoTicketPage() {
  return (
    <AppShell>
      <PitchingInfoTickets />
    </AppShell>
  );
}

const FIELD_KEYS = ["genre", "moods", "songStyles", "cultures", "instruments"];
const FIELD_LABELS = { genre: "Genre", moods: "Moods", songStyles: "Song Styles", cultures: "Cultures", instruments: "Instruments" };

function PitchingInfoTickets() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState(null);
  const [rows, setRows] = useState([]); // { ticket, release }
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [openTicketId, setOpenTicketId] = useState(null);
  const [query, setQuery] = useState(""); // round 76 — quick index search box

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "pitching_info").single();
    if (!tabRow) { setLoading(false); return; }
    setTab(tabRow);
    if (!statusFilter) setStatusFilter(tabRow.status_options[0]);

    const { data: tickets } = await supabase
      .from("tickets")
      .select("*")
      .eq("tab_id", tabRow.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    const dids = [...new Set((tickets || []).map((t) => t.data?.releaseId).filter(Boolean))];
    let releaseMap = {};
    if (dids.length > 0) {
      const { data: rels } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, label, release_date, link_lbm, link_share, upc, smartlink, published_at")
        .in("did", dids);
      (rels || []).forEach((r) => (releaseMap[r.did] = r));
    }
    setRows((tickets || []).map((t) => ({ ticket: t, release: releaseMap[t.data?.releaseId] || null })));

    const { data: profs } = await supabase.from("profiles").select("id, name, segment, role").order("name");
    setProfiles(filterProfilesByTeam(profs || [], "AR"));

    setLoading(false);
  }

  async function updatePic(ticket, profileId) {
    const patch = { pic_profile_id: profileId || null };
    if (profileId && ticket.status === tab.default_status) {
      const nextStatus = tab.status_options[1];
      if (nextStatus) {
        patch.status = nextStatus;
        patch.status_log = { ...ticket.status_log, [nextStatus]: new Date().toISOString() };
      }
    }
    setRows((prev) => prev.map((row) => (row.ticket.id !== ticket.id ? row : { ...row, ticket: { ...row.ticket, ...patch } })));
    await supabase.from("tickets").update(patch).eq("id", ticket.id);
  }

  async function updateStatus(ticket, newStatus) {
    const patch = { status: newStatus, status_log: { ...ticket.status_log, [newStatus]: new Date().toISOString() } };
    setRows((prev) => prev.map((row) => (row.ticket.id !== ticket.id ? row : { ...row, ticket: { ...row.ticket, ...patch } })));
    await supabase.from("tickets").update(patch).eq("id", ticket.id);
  }

  async function updateData(ticket, newData) {
    setRows((prev) => prev.map((row) => (row.ticket.id !== ticket.id ? row : { ...row, ticket: { ...row.ticket, data: newData } })));
    await supabase.from("tickets").update({ data: newData }).eq("id", ticket.id);
  }

  const visibleRows = useMemo(
    () => rows.filter((row) => row.ticket.status === statusFilter).filter((row) => matchesQuery(row, query)),
    [rows, statusFilter, query]
  );
  const { pageRows: pagedRows, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleRows);
  const openRow = rows.find((row) => row.ticket.id === openTicketId) || null;

  if (loading || !tab) return <div className={styles.page}><div className={styles.container}>Loading…</div></div>;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <TypeSwitcher kind="ticket" current="pitching_info" />
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Ticket</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>Pitching Info</h1>
          </div>
        </div>
        <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 24 }}>
          DSP editorial tagging (Genre / Moods / Song Styles / Music Cultures / Instruments) for Spotify + Apple Music — auto-sent when Priority Pitching or Spotify is checked at New Release creation.
        </p>

        <SearchBox value={query} onChange={setQuery} placeholder="Search this list…" />

        <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
          {tab.status_options.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`${styles.tabBtn} ${statusFilter === s ? styles.tabBtnActive : ""}`}
              style={{ border: "1px solid var(--border)", borderRadius: 6 }}
            >
              {s}
            </button>
          ))}
        </div>

        {visibleRows.length === 0 ? (
          <div className={styles.emptyState}>No tickets at this status.</div>
        ) : isMobile ? (
          <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pagedRows.map(({ ticket, release }) => {
              const done = fieldsDone(ticket.data);
              return (
                <div
                  key={ticket.id}
                  onClick={() => setOpenTicketId(ticket.id)}
                  style={{ cursor: "pointer", border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: "var(--bg-card)" }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{release?.title || "—"}</div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{release?.main_artist || "—"} · {release?.label || "—"}</div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 4 }}>Release Date</div>
                      <div style={{ fontSize: 12 }}>{release?.release_date ? fmtDate(release.release_date) : "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 4 }}>Upload Status</div>
                      <div style={{ fontSize: 12 }}>{uploadStatus(release) || "—"}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>Fields</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {FIELD_KEYS.map((key) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-faint)" }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: done[key] ? "#7ee6a8" : "#ffca4d" }} />
                          {FIELD_LABELS[key]}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 4 }}>PIC</div>
                    <select
                      className={styles.select}
                      style={{ fontSize: 12, padding: "4px 8px", width: "100%" }}
                      value={ticket.pic_profile_id || ""}
                      onChange={(e) => updatePic(ticket, e.target.value)}
                    >
                      <option value="">— unassigned —</option>
                      {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
          </>
        ) : (
          <>
          <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                {/* Round 81 item 6 — DID column hidden per explicit
                    request; still available via each row's popup detail
                    (release?.did is untouched there). */}
                <th>Song</th>
                <th>Artist</th>
                <th>Label</th>
                <th>Release Date</th>
                <th>Upload Status</th>
                <th>Genre</th>
                <th>Moods</th>
                <th>Song Styles</th>
                <th>Cultures</th>
                <th>Instruments</th>
                <th>PIC</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map(({ ticket, release }) => {
                const done = fieldsDone(ticket.data);
                return (
                  <tr key={ticket.id} onClick={() => setOpenTicketId(ticket.id)} style={{ cursor: "pointer" }}>
                    <td>{release?.title || "—"}</td>
                    <td>{release?.main_artist || "—"}</td>
                    <td>{release?.label || "—"}</td>
                    <td>{release?.release_date ? fmtDate(release.release_date) : "—"}</td>
                    <td>{uploadStatus(release) || "—"}</td>
                    {FIELD_KEYS.map((key) => (
                      <td key={key}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: done[key] ? "#7ee6a8" : "#ffca4d" }} />
                      </td>
                    ))}
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className={styles.select}
                        style={{ fontSize: 11, padding: "4px 6px", minWidth: "16ch" }}
                        value={ticket.pic_profile_id || ""}
                        onChange={(e) => updatePic(ticket, e.target.value)}
                      >
                        <option value="">— unassigned —</option>
                        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
          </>
        )}
      </div>

      {openRow && (
        <PitchingInfoPopup
          ticket={openRow.ticket}
          release={openRow.release}
          statusOptions={tab.status_options}
          onClose={() => setOpenTicketId(null)}
          onUpdateData={(newData) => updateData(openRow.ticket, newData)}
          onUpdateStatus={(newStatus) => updateStatus(openRow.ticket, newStatus)}
        />
      )}
    </div>
  );
}


function PitchingInfoPopup({ ticket, release, statusOptions, onClose, onUpdateData, onUpdateStatus }) {
  const data = useMemo(() => {
    const base = emptyData(ticket.data?.releaseId);
    const merged = { ...base, ...ticket.data };
    merged.spotify = { ...base.spotify, ...(ticket.data?.spotify || {}) };
    merged.apple = { ...base.apple, ...(ticket.data?.apple || {}) };
    return merged;
  }, [ticket.data]);

  const sync = data.syncEnabled !== false;
  const done = fieldsDone(data);
  const complete = allFieldsDone(data);

  function save(patch) {
    const next = { ...data, ...patch };
    onUpdateData(next);
  }

  function toggleSync() {
    const nextSync = !sync;
    if (!nextSync) { save({ syncEnabled: false }); return; }
    // Turning sync back ON re-mirrors the flat (Spotify-only) fields
    // immediately from whatever's currently picked — Moods stays as-is
    // (both sides already independently pickable, sync only affects
    // future edits for that one).
    const apple = { ...data.apple };
    ["songStyles", "cultures", "instruments"].forEach((key) => {
      apple[key] = data.spotify[key].length > 0 ? "MIRROR" : apple[key];
    });
    save({ syncEnabled: true, apple });
  }

  function setGenre(value) {
    save({ genre: value || null });
  }

  function toggleMood(tag, side) {
    const row = MOODS.find((r) => r.spotify === tag || r.apple === tag);
    const max = side === "spotify" ? MOOD_SPOTIFY_MAX : MOOD_APPLE_MAX;
    const list = [...data[side].moods];
    const idx = list.indexOf(tag);
    const removing = idx >= 0;
    if (removing) list.splice(idx, 1);
    else { if (list.length >= max) return; list.push(tag); }

    const nextSideData = { ...data[side], moods: list };
    let otherSideData = data[side === "spotify" ? "apple" : "spotify"];
    if (sync && row) {
      const otherKey = side === "spotify" ? "apple" : "spotify";
      const otherTag = side === "spotify" ? row.apple : row.spotify;
      if (otherTag) {
        const otherMax = otherKey === "spotify" ? MOOD_SPOTIFY_MAX : MOOD_APPLE_MAX;
        const otherList = [...data[otherKey].moods];
        const otherIdx = otherList.indexOf(otherTag);
        if (removing && otherIdx >= 0) otherList.splice(otherIdx, 1);
        else if (!removing && otherIdx < 0 && otherList.length < otherMax) otherList.push(otherTag);
        otherSideData = { ...data[otherKey], moods: otherList };
      }
    }
    const next = { ...data };
    next[side] = nextSideData;
    if (sync && row) next[side === "spotify" ? "apple" : "spotify"] = otherSideData;
    save(next);
  }

  // Song Styles / Music Cultures / Instruments: Apple has no real tag
  // data for these at all (see reference sheet) — Spotify is the only
  // side with a real pick list, Apple's "value" is just MIRROR (synced)
  // or an explicit "—" (not synced, marked by hand).
  function toggleFlatTag(field, tag, max) {
    const list = [...data.spotify[field]];
    const idx = list.indexOf(tag);
    if (idx >= 0) list.splice(idx, 1);
    else { if (list.length >= max) return; list.push(tag); }
    const spotify = { ...data.spotify, [field]: list };
    const apple = { ...data.apple };
    if (sync) apple[field] = list.length > 0 ? "MIRROR" : null;
    save({ spotify, apple });
  }

  function markFlatNA(field) {
    save({ apple: { ...data.apple, [field]: NA } });
  }
  function clearFlatApple(field) {
    save({ apple: { ...data.apple, [field]: null } });
  }

  const genreRow = GENRE_CATEGORIES.find((r) => r.shared === data.genre);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div
        style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, maxWidth: 980, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, marginBottom: 2 }}>{release?.did || data.releaseId}</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{release?.title || "—"}</div>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{release?.main_artist} · {release?.label}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Read-only ordering info */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
          <InfoField label="Release Date" value={release?.release_date ? fmtDate(release.release_date) : "—"} />
          <InfoField label="Upload Status" value={uploadStatus(release) || "—"} />
          <InfoField label="Published Date" value={release?.published_at ? fmtDate(release.published_at) : "—"} />
          <InfoField label="Status" value={ticket.status} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className={styles.subheading} style={{ marginTop: 0, marginBottom: 0 }}>Executing Form</div>
          <button
            onClick={toggleSync}
            title={sync ? "Sync is ON — compatible picks mirror automatically" : "Sync is OFF — each side is independent"}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: sync ? "rgba(255,107,26,0.12)" : "transparent",
              border: sync ? "1px solid var(--accent)" : "1px solid var(--border-strong)", borderRadius: 6, padding: "6px 12px",
              color: sync ? "var(--accent-soft)" : "var(--text-faint)", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            ⇄ Sync {sync ? "ON" : "OFF"}
          </button>
        </div>

        {/* Genre — single shared value, same on both platforms conceptually.
            Spotify/Apple tag lists shown as reference for whoever's typing
            these into the actual DSP dashboards. */}
        <FieldCard title="Genre" done={done.genre}>
          <select className={styles.select} style={{ width: "100%", marginBottom: 8 }} value={data.genre || ""} onChange={(e) => setGenre(e.target.value)}>
            <option value="">— pick a category —</option>
            {GENRE_CATEGORIES.map((r) => <option key={r.shared} value={r.shared}>{r.shared}</option>)}
          </select>
          {genreRow && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 11, color: "var(--text-faint)" }}>
              <div><strong style={{ color: "#1DB954" }}>Spotify tags:</strong> {genreRow.spotify.length ? genreRow.spotify.join("; ") : "—"}</div>
              <div><strong style={{ color: "#fc3c44" }}>Apple Music tags:</strong> {genreRow.apple.length ? genreRow.apple.join("; ") : "—"}</div>
            </div>
          )}
        </FieldCard>

        {/* Moods — real independent pick lists on both sides, row-linked
            when sync is on. */}
        <FieldCard title={`Moods (Spotify max ${MOOD_SPOTIFY_MAX} · Apple max ${MOOD_APPLE_MAX})`} done={done.moods}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <TagPanel platform="Spotify" color="#1DB954">
              {MOODS.filter((r) => r.spotify).map((r) => (
                <TagChip key={r.spotify} label={r.spotify} active={data.spotify.moods.includes(r.spotify)} onClick={() => toggleMood(r.spotify, "spotify")} />
              ))}
            </TagPanel>
            <TagPanel platform="Apple Music" color="#fc3c44">
              {MOODS.filter((r) => r.apple).map((r) => (
                <TagChip key={r.apple} label={r.apple} active={data.apple.moods.includes(r.apple)} onClick={() => toggleMood(r.apple, "apple")} />
              ))}
            </TagPanel>
          </div>
        </FieldCard>

        <FlatField
          title={`Song Styles (Spotify max ${SONG_STYLE_SPOTIFY_MAX} · no Apple equivalent)`}
          done={done.songStyles}
          options={SONG_STYLES}
          selected={data.spotify.songStyles}
          onToggle={(tag) => toggleFlatTag("songStyles", tag, SONG_STYLE_SPOTIFY_MAX)}
          appleValue={data.apple.songStyles}
          sync={sync}
          onMarkNA={() => markFlatNA("songStyles")}
          onClear={() => clearFlatApple("songStyles")}
        />
        <FlatField
          title={`Music Cultures (Spotify max ${CULTURE_SPOTIFY_MAX} · no Apple equivalent)`}
          done={done.cultures}
          options={MUSIC_CULTURES}
          selected={data.spotify.cultures}
          onToggle={(tag) => toggleFlatTag("cultures", tag, CULTURE_SPOTIFY_MAX)}
          appleValue={data.apple.cultures}
          sync={sync}
          onMarkNA={() => markFlatNA("cultures")}
          onClear={() => clearFlatApple("cultures")}
        />
        <FlatField
          title="Instruments (Spotify unlimited · no Apple equivalent)"
          done={done.instruments}
          options={INSTRUMENTS}
          selected={data.spotify.instruments}
          onToggle={(tag) => toggleFlatTag("instruments", tag, Infinity)}
          appleValue={data.apple.instruments}
          sync={sync}
          onMarkNA={() => markFlatNA("instruments")}
          onClear={() => clearFlatApple("instruments")}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
          {statusOptions.filter((s) => s !== "COMPLETE").map((s) => (
            <button key={s} className={styles.btnSmall} onClick={() => onUpdateStatus(s)} disabled={ticket.status === s}>{s}</button>
          ))}
          <button
            className={styles.btnPrimary}
            disabled={!complete || ticket.status === "COMPLETE"}
            onClick={() => onUpdateStatus("COMPLETE")}
            title={!complete ? "Every field (both sides) needs a value — \"—\" counts, but must be picked on purpose" : undefined}
            style={{ marginLeft: "auto" }}
          >
            {ticket.status === "COMPLETE" ? "✓ Complete" : "Mark Complete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  );
}

function FieldCard({ title, done, children }) {
  return (
    <div style={{ marginBottom: 16, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: done ? "#7ee6a8" : "#ffca4d" }} />
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function TagPanel({ platform, color, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 6 }}>{platform}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
    </div>
  );
}

function TagChip({ label, active, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 11, padding: "4px 10px", borderRadius: 12, cursor: disabled ? "default" : "pointer",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
        background: active ? "rgba(255,107,26,0.15)" : "transparent",
        color: active ? "var(--accent-soft)" : "var(--text-faint)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

// Shared shape for Song Styles / Music Cultures / Instruments — Spotify
// side is a real pickable chip list, Apple side has no real tag data at
// all (see reference sheet), so it's just a status: MIRROR (synced,
// auto-follows Spotify), "—" (explicitly marked not applicable), or
// unfilled.
function FlatField({ title, done, options, selected, onToggle, appleValue, sync, onMarkNA, onClear }) {
  return (
    <FieldCard title={title} done={done}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <TagPanel platform="Spotify" color="#1DB954">
          {options.map((tag) => (
            <TagChip key={tag} label={tag} active={selected.includes(tag)} onClick={() => onToggle(tag)} />
          ))}
        </TagPanel>
        <TagPanel platform="Apple Music" color="#fc3c44">
          {appleValue === "MIRROR" ? (
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              Mirrors Spotify (sync on): {selected.length ? selected.join("; ") : "—"}
            </span>
          ) : appleValue === NA ? (
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{NA} (marked not applicable)</span>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-faint)" }}>No Apple Music data for this field.</span>
              {!sync && (
                <button className={styles.btnSmall} onClick={onMarkNA} style={{ fontSize: 10 }}>Mark {NA}</button>
              )}
            </div>
          )}
          {appleValue != null && !sync && (
            <button onClick={onClear} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 10, cursor: "pointer", marginTop: 4, padding: 0 }}>
              clear
            </button>
          )}
        </TagPanel>
      </div>
    </FieldCard>
  );
}
