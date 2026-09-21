"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import QuickCreate from "../../lib/QuickCreate";
import UrlField from "../../lib/UrlField";
import Pagination from "../../lib/Pagination";
import SearchBox from "../../lib/SearchBox";
import styles from "../shared.module.css";

const DSP_FIELDS = [
  ["spotify_url", "Spotify"],
  ["apple_url", "Apple"],
  ["tiktok_url", "TikTok"],
  ["facebook_url", "Facebook"],
  ["zing_url", "Zing"],
  ["nct_url", "NCT"],
];

const EMPTY = { stage_name: "", real_name: "", email: "", label_id: "" };

// Round 113 — this page only ever reads/renders the columns below (plus
// the labels(label_name) join) — same "only select what's rendered"
// optimization already applied to the Dashboard (see RELEASE_COLUMNS in
// app/releases/page.js). Artists also carries phan_loai/fanpage_url/
// youtube_url/instagram_url/company_name/type/created_at/updated_at,
// none of which this page uses — select("*") was pulling all of those
// across the wire on every load for nothing.
const ARTIST_COLUMNS = [
  "id", "stage_name", "real_name", "email", "note", "label_id",
  "spotify_url", "apple_url", "tiktok_url", "facebook_url", "zing_url", "nct_url",
].join(", ");

// Round 398 — real server-side pagination (see project doc
// "server-side-pagination-pitch.md"). This page used to pull the ENTIRE
// artists table (fetchAllRows, no .range()) on every visit — every one of
// this Supabase project's tables costs egress bandwidth on every fetch,
// and this page was one of the still-unconverted ~25 the pitch doc flags.
// Same shape as the Round 247 conversion of app/releases/page.js, just
// simpler: no stat cards, no multi-dimension filters, no sort toggle here
// (this page never had one) — just a paginated + searched fetch.
//
// Search used to be lib/SearchBox.js's matchesQuery — a client-side
// JSON.stringify(row).includes(query) match against EVERY field, which
// only worked because the whole table was already in memory. Server-side
// that has no equivalent (can't ilike a JSON blob across a join
// cheaply), so search here is now scoped to the fields someone would
// actually type an artist search against — stage_name, real_name, email,
// note — same "narrow to the fields that matter" tradeoff Round 247 made
// for the Dashboard's title/main_artist/label search.
function escapeOrFilterValue(v) {
  return `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildArtistsQuery({ page, pageSize, searchTerm }) {
  let q = supabase.from("artists").select(`${ARTIST_COLUMNS}, labels(label_name)`, { count: "exact" });
  if (searchTerm) {
    const val = escapeOrFilterValue(`%${searchTerm}%`);
    q = q.or(`stage_name.ilike.${val},real_name.ilike.${val},email.ilike.${val},note.ilike.${val}`);
  }
  q = q.order("stage_name").order("id");
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return q.range(from, to);
}

export default function ArtistsPage() {
  const [artists, setArtists] = useState([]); // current PAGE only, not the whole table
  const [totalRows, setTotalRows] = useState(0);
  const [labels, setLabels] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  // Round 113 — quick index / search box. Round 398 — now fires a real
  // query (debounced) instead of filtering an already-fully-loaded array.
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Search change snaps back to page 1 — same behavior the old client
  // filter got for free via usePagination's own re-clamp effect.
  const firstSearchRunRef = useRef(true);
  useEffect(() => {
    if (firstSearchRunRef.current) { firstSearchRunRef.current = false; return; }
    setPage(1);
  }, [debouncedSearch]);

  async function load({ page: p = page, pageSize: ps = pageSize, searchTerm = debouncedSearch } = {}) {
    setLoading(true);
    const { data, count, error: err } = await buildArtistsQuery({ page: p, pageSize: ps, searchTerm });
    if (!err) {
      setArtists(data || []);
      setTotalRows(count || 0);
      // A delete (or a search/pageSize change) narrowing the result set
      // while sitting on a later page — snap back into range instead of
      // an empty table with no obvious way back. Same guard app/releases/
      // page.js's Round 247 conversion uses.
      const totalPagesNow = Math.max(1, Math.ceil((count || 0) / ps));
      if (p > totalPagesNow) setPage(totalPagesNow);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!supabase) return;
    load({ page, pageSize, searchTerm: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debouncedSearch]);

  useEffect(() => {
    if (!supabase) return;
    // Labels stay a plain full fetch — it's a small reference table (one
    // row per label, not per release/artist), nowhere near the size that
    // makes pagination worthwhile, and every row is needed anyway to
    // populate the Label dropdown/autocomplete.
    supabase.from("labels").select("id, label_name").order("label_name").then(({ data }) => setLabels(data || []));
  }, []);

  async function addArtist(e) {
    e.preventDefault();
    setError(null);
    if (!form.stage_name.trim()) {
      setError("Nghệ Danh is required.");
      return;
    }
    const payload = { ...form, label_id: form.label_id || null };
    const { error: err } = await supabase.from("artists").insert(payload);
    if (err) setError(err.message);
    else {
      setForm(EMPTY);
      // Jump to page 1 (alphabetical order, so a fresh artist could land
      // anywhere) so the person sees it landed instead of wondering
      // whether the add actually worked.
      setPage(1);
      load({ page: 1, pageSize, searchTerm: debouncedSearch });
    }
  }

  async function updateField(artist, field, value) {
    setArtists((prev) => prev.map((a) => (a.id === artist.id ? { ...a, [field]: value } : a)));
    await supabase.from("artists").update({ [field]: value }).eq("id", artist.id);
  }

  async function updateLabel(artist, labelId) {
    const label = labels.find((l) => l.id === labelId);
    setArtists((prev) => prev.map((a) => (a.id === artist.id ? { ...a, label_id: labelId || null, labels: label ? { label_name: label.label_name } : null } : a)));
    await supabase.from("artists").update({ label_id: labelId || null }).eq("id", artist.id);
  }

  async function deleteArtist(artist) {
    if (!window.confirm(`Delete "${artist.stage_name}"? This can't be undone.`)) return;
    const { error: err } = await supabase.from("artists").delete().eq("id", artist.id);
    if (err) {
      window.alert(`Couldn't delete: ${err.message}`);
      return;
    }
    // Refetch the current page rather than just filtering the deleted row
    // out locally — with server-side pagination the next row down needs
    // to slide in from the server, and the total count needs to stay
    // accurate for the Pagination footer.
    load();
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 1300 }}>
        <div className={styles.eyebrow}>// Reference Table</div>
        <h1 className={styles.title}>Artist List</h1>

        {error && <div className={styles.errorBox}>{error}</div>}

        <form onSubmit={addArtist} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28, alignItems: "flex-end" }}>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 160 }}>
            <label className={styles.fieldLabel}>Nghệ Danh *</label>
            <input className={styles.input} value={form.stage_name} onChange={(e) => setForm((f) => ({ ...f, stage_name: e.target.value }))} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 160 }}>
            <label className={styles.fieldLabel}>Họ Và Tên</label>
            <input className={styles.input} value={form.real_name} onChange={(e) => setForm((f) => ({ ...f, real_name: e.target.value }))} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 180 }}>
            <label className={styles.fieldLabel}>Email</label>
            <input className={styles.input} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className={styles.field} style={{ marginBottom: 0, minWidth: 160 }}>
            <label className={styles.fieldLabel}>Label</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select className={styles.select} value={form.label_id} onChange={(e) => setForm((f) => ({ ...f, label_id: e.target.value }))}>
                <option value="">—</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>{l.label_name}</option>
                ))}
              </select>
              <QuickCreate
                kind="label"
                onCreated={(newLabel) => {
                  setLabels((prev) => [...prev, newLabel]);
                  setForm((f) => ({ ...f, label_id: newLabel.id }));
                }}
              />
            </div>
          </div>
          <button className={styles.btnPrimary} type="submit">+ Add Artist</button>
        </form>
        <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: -20, marginBottom: 20 }}>
          DSP links and Note are editable directly in the table below, after creating.
        </p>

        {/* Round 398 — was gated on `artists.length > 0` (the full table);
            now `artists` only ever holds the current page, so that check
            can't tell "empty table" from "just haven't fetched yet" —
            show the box once loading settles, keep it up while a search
            is active even if it currently matches nothing. */}
        {!loading && (totalRows > 0 || debouncedSearch) && (
          <SearchBox value={searchQuery} onChange={(v) => setSearchQuery(v)} placeholder="Search artists…" />
        )}

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : totalRows === 0 ? (
          <div className={styles.emptyState}>{debouncedSearch ? "No artists match this search." : "No artists yet."}</div>
        ) : (
          <>
          <div className={styles.scrollBox} style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
          <table className={styles.table} style={{ minWidth: 1200 }}>
            <thead>
              <tr>
                <th>Nghệ Danh</th><th>Họ Và Tên</th><th>Email</th><th>Label</th>
                {DSP_FIELDS.map(([, label]) => <th key={label}>{label}</th>)}
                <th>Note</th><th></th>
              </tr>
            </thead>
            <tbody>
              {artists.map((a) => (
                <ArtistRow key={a.id} artist={a} labels={labels} onUpdateField={updateField} onUpdateLabel={updateLabel} onDelete={deleteArtist} />
              ))}
            </tbody>
          </table>
          </div>
          <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
          </>
        )}
      </div>
    </div>
    </AppShell>
  );
}

function ArtistRow({ artist, labels, onUpdateField, onUpdateLabel, onDelete }) {
  const [dspDrafts, setDspDrafts] = useState(() => {
    const initial = {};
    DSP_FIELDS.forEach(([key]) => (initial[key] = artist[key] || ""));
    return initial;
  });

  return (
    <tr>
      <td>
        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 120 }} defaultValue={artist.stage_name} onBlur={(e) => onUpdateField(artist, "stage_name", e.target.value)} />
      </td>
      <td>
        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 120 }} defaultValue={artist.real_name || ""} onBlur={(e) => onUpdateField(artist, "real_name", e.target.value)} />
      </td>
      <td>
        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 140 }} defaultValue={artist.email || ""} onBlur={(e) => onUpdateField(artist, "email", e.target.value)} />
      </td>
      <td>
        <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12, minWidth: 120 }} value={artist.label_id || ""} onChange={(e) => onUpdateLabel(artist, e.target.value)}>
          <option value="">—</option>
          {labels.map((l) => <option key={l.id} value={l.id}>{l.label_name}</option>)}
        </select>
      </td>
      {DSP_FIELDS.map(([key]) => (
        <td key={key} style={{ minWidth: 140 }}>
          <UrlField
            styles={styles}
            value={dspDrafts[key]}
            onChange={(v) => setDspDrafts((d) => ({ ...d, [key]: v }))}
            onBlur={() => onUpdateField(artist, key, dspDrafts[key])}
            rows={1}
            placeholder="url…"
          />
        </td>
      ))}
      <td>
        <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, minWidth: 140 }} defaultValue={artist.note || ""} onBlur={(e) => onUpdateField(artist, "note", e.target.value)} />
      </td>
      <td>
        <button onClick={() => onDelete(artist)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>✕</button>
      </td>
    </tr>
  );
}
