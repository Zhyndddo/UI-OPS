"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { COPYRIGHT_ITEMS, normalizeCopyrightChecklist, copyrightValidityLabel, copyrightChecklistIsEmpty } from "./copyrightChecklist";

const URL_RE = /^https?:\/\/\S+$/i;

function ContractValue({ value }) {
  const v = (value || "").trim();
  if (!v) return <span style={{ color: "var(--text-faint)" }}>—</span>;
  if (URL_RE.test(v)) {
    return (
      <a href={v} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all" }}>
        {v}
      </a>
    );
  }
  return <span style={{ wordBreak: "break-word" }}>{v}</span>;
}

function ReadOnlyChecklist({ value }) {
  const data = normalizeCopyrightChecklist(value);
  if (copyrightChecklistIsEmpty(value)) {
    return <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0 }}>Nothing filled in yet.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {COPYRIGHT_ITEMS.map((item) => {
        const entry = data[item.key];
        const validity = copyrightValidityLabel(entry);
        return (
          <div key={item.key} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>{item.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, fontSize: 12 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 2 }}>Owner</div>
                <div style={{ whiteSpace: "pre-line" }}>{entry.owner?.trim() || <span style={{ color: "var(--text-faint)" }}>—</span>}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 2 }}>Validity Period</div>
                <div>{validity || <span style={{ color: "var(--text-faint)" }}>—</span>}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 2 }}>Contract</div>
                <ContractValue value={entry.contract} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Round 88 2nd follow-up — read-only Copyright preview, opened from the
// "Copyright" column's icon in New Release Setup (app/workstation/upload/
// page.js) — same content the release's own Copyrights tab shows, just
// not editable here. Single releases show only the release-level 3-right
// checklist; EP/Album also fetches release_tracks (lazily, only once the
// popup is actually open) and shows each track's own checklist too, same
// as the Copyrights tab does for editing.
export default function CopyrightPreviewPopup({ release, onClose }) {
  const isSingle = release.single_album_ep === "Single";
  const [tracks, setTracks] = useState(null); // null = not loaded yet

  useEffect(() => {
    if (isSingle || !supabase) return;
    supabase
      .from("release_tracks")
      .select("id, sort_order, track_name, main_artist, copyright_checklist")
      .eq("release_id", release.id)
      .order("sort_order")
      .then(({ data }) => setTracks(data || []));
  }, [release.id, isSingle]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div
        style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, maxWidth: 680, width: "100%", maxHeight: "85vh", overflowY: "auto", padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, marginBottom: 2 }}>© Copyright — read-only</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{release.title}</div>
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release.main_artist} · {release.did}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>
          {isSingle ? "Copyright Checklist" : "Copyright Checklist — Release-wide"}
        </div>
        <ReadOnlyChecklist value={release.copyright_checklist} />

        {!isSingle && (
          <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>Tracklist</div>
            {tracks === null ? (
              <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading…</p>
            ) : tracks.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-faint)" }}>No tracks added yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {tracks.map((t) => (
                  <div key={t.id}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      #{t.sort_order} — {t.track_name || <span style={{ color: "var(--text-faint)" }}>(untitled)</span>}
                      {t.main_artist && <span style={{ fontWeight: 400, color: "var(--text-faint)" }}> · {t.main_artist}</span>}
                    </div>
                    <ReadOnlyChecklist value={t.copyright_checklist} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
