"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import UrlField from "./UrlField";

const DSP_FIELDS = [
  ["spotify_url", "Spotify"],
  ["apple_url", "Apple"],
  ["tiktok_url", "TikTok"],
  ["facebook_url", "Facebook"],
  ["zing_url", "Zing"],
  ["nct_url", "NCT"],
];

// Round 100 — "..." (now "⋮", Round 103) on each artist tag (ArtistTagInput)
// opens this popup so AR can fill out the artist's full reference-table
// record (Label, DSP links, email, note) without leaving whatever release /
// new-release form they're on. Deliberately reuses the exact same field set
// and the exact same save-on-blur pattern as the Artist List admin page's
// row editor (app/artists/page.js's ArtistRow) — this is NOT a separate
// editing path with its own rules, it's that same editor reachable from a
// tag. Every write here goes straight to the `artists` table, never to the
// release — the release only ever holds the artist's name (as a tag / in
// the derived main_artist text), never any of these fields.
//
// Round 103 — was given a pre-resolved `artistId`, looked up by the caller
// matching the tag's name against its own already-loaded `artists` list.
// That lookup could silently miss (list not loaded yet, a name that came in
// through the old free-text field pre-Round-97/102 with slightly different
// casing/whitespace than what's in the reference table, etc.) — when it
// missed, the caller just didn't open the popup at all, which read as the
// "…" button being broken/unclickable. Now this popup takes only the tag's
// NAME and resolves it itself, the same case-insensitive-trim rule the
// Round 102 backfill and Quick Create's resolver both already use — if
// nothing matches, it creates a new `artists` row for that name (same
// auto-create-if-missing behavior as everywhere else in this app) instead
// of failing closed. The popup now always opens.
export default function ArtistDetailPopup({ styles, artistName, onClose }) {
  const [artist, setArtist] = useState(null);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [dspDrafts, setDspDrafts] = useState({});

  useEffect(() => {
    let cancelled = false;
    if (!supabase || !artistName) return undefined;
    setLoading(true);
    setLoadError(null);
    (async () => {
      const trimmed = artistName.trim();
      // ilike with no % wildcards is just a case-insensitive equality check
      // — same "exact match, ignoring case" rule used everywhere else this
      // app resolves a typed/tagged name against the artists reference
      // table (resolveQuickArtistTag, the Round 102 backfill).
      const { data: existing } = await supabase.from("artists").select("id").ilike("stage_name", trimmed).limit(1).maybeSingle();
      let id = existing?.id;
      if (!id) {
        const { data: created, error: createErr } = await supabase.from("artists").insert({ stage_name: trimmed }).select("id").single();
        if (createErr) {
          if (!cancelled) {
            setLoadError(createErr.message);
            setLoading(false);
          }
          return;
        }
        id = created.id;
      }
      const [{ data: a }, { data: l }] = await Promise.all([
        supabase.from("artists").select("*").eq("id", id).single(),
        supabase.from("labels").select("id, label_name").order("label_name"),
      ]);
      if (cancelled) return;
      setArtist(a || null);
      setLabels(l || []);
      const drafts = {};
      DSP_FIELDS.forEach(([key]) => (drafts[key] = (a && a[key]) || ""));
      setDspDrafts(drafts);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [artistName]);

  async function updateField(field, value) {
    if (!artist) return;
    setArtist((prev) => (prev ? { ...prev, [field]: value } : prev));
    await supabase.from("artists").update({ [field]: value }).eq("id", artist.id);
  }

  async function updateLabel(labelId) {
    if (!artist) return;
    const label = labels.find((l) => l.id === labelId);
    setArtist((prev) => (prev ? { ...prev, label_id: labelId || null, labels: label ? { label_name: label.label_name } : null } : prev));
    await supabase.from("artists").update({ label_id: labelId || null }).eq("id", artist.id);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 399, background: "rgba(0,0,0,0.5)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 400,
          width: "min(480px, calc(100vw - 32px))",
          maxHeight: "85vh",
          overflowY: "auto",
          background: "var(--bg-card)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          padding: 20,
          boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>
            Artist — {artistName}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {loadError ? (
          <div style={{ color: "var(--error-fg, #e57373)", fontSize: 12 }}>Couldn't load: {loadError}</div>
        ) : loading || !artist ? (
          <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Nghệ Danh</label>
              <input
                className={styles.input}
                style={{ width: "100%", boxSizing: "border-box" }}
                defaultValue={artist.stage_name}
                onBlur={(e) => updateField("stage_name", e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Họ Và Tên</label>
              <input
                className={styles.input}
                style={{ width: "100%", boxSizing: "border-box" }}
                defaultValue={artist.real_name || ""}
                onBlur={(e) => updateField("real_name", e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Email</label>
              <input
                className={styles.input}
                style={{ width: "100%", boxSizing: "border-box" }}
                defaultValue={artist.email || ""}
                onBlur={(e) => updateField("email", e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Label</label>
              <select
                className={styles.select}
                style={{ width: "100%", boxSizing: "border-box" }}
                value={artist.label_id || ""}
                onChange={(e) => updateLabel(e.target.value)}
              >
                <option value="">—</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>{l.label_name}</option>
                ))}
              </select>
            </div>
            {DSP_FIELDS.map(([key, label]) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>{label}</label>
                <UrlField
                  styles={styles}
                  value={dspDrafts[key]}
                  onChange={(v) => setDspDrafts((d) => ({ ...d, [key]: v }))}
                  onBlur={() => updateField(key, dspDrafts[key])}
                  wide
                  placeholder="url…"
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Note</label>
              <input
                className={styles.input}
                style={{ width: "100%", boxSizing: "border-box" }}
                defaultValue={artist.note || ""}
                onBlur={(e) => updateField("note", e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
