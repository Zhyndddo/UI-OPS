"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { isKhoNhacType } from "./phaiSinhTypes";
import UrlField from "./UrlField";
import appStyles from "../app/shared.module.css";

// Round 213 — item 2's shared popup: "Track Smartlink" on the phái sinh
// ticket page and "+ Add Smartlink" on the Re-Check workstation (Phase 2)
// both open this same component, so a row created either way ends up
// identical and lives in the one place the team asked for ("i want it to
// be one workstation so the team won't be confused of where is the
// smartlink"). Two ways in:
//   - presetTicket: caller already knows the ticket (the ticket page's own
//     "Track Smartlink" button) — skips the picker, fields start
//     pre-filled from it, but stay editable.
//   - no presetTicket: caller picks a ticket to autofill from, or leaves
//     it on "Manual entry" and types song_title/artist/did directly — for
//     smartlinks that aren't tied to any phái sinh ticket at all.
// Either way writes one row into phai_sinh_smartlinks; onSaved(row) hands
// the new row back so the caller can drop it straight into local state
// instead of re-querying.
function fieldsFromTicket(t) {
  const d = t?.data || {};
  return { song_title: d.tenBai || "", artist: d.artist || "", did: d.relatedDid || "" };
}

export default function PhaiSinhSmartlinkPopup({ presetTicket, profiles = [], onClose, onSaved }) {
  const [mode, setMode] = useState(presetTicket ? "ticket" : "manual"); // "ticket" | "manual"
  const [pickedTicket, setPickedTicket] = useState(presetTicket || null);
  const [tickets, setTickets] = useState([]);
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketsLoaded, setTicketsLoaded] = useState(!!presetTicket);

  const [songTitle, setSongTitle] = useState(fieldsFromTicket(presetTicket).song_title);
  const [artist, setArtist] = useState(fieldsFromTicket(presetTicket).artist);
  const [did, setDid] = useState(fieldsFromTicket(presetTicket).did);
  const [smartlink, setSmartlink] = useState("");
  const [note, setNote] = useState("");
  const [picId, setPicId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (mode !== "ticket" || presetTicket || ticketsLoaded || !supabase) return;
    (async () => {
      const { data: tabRow } = await supabase.from("ticket_tabs").select("id").eq("key", "phai_sinh").single();
      if (!tabRow) { setTicketsLoaded(true); return; }
      const { data } = await supabase.from("tickets").select("id, data").eq("tab_id", tabRow.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(500);
      // Kho Nhạc-family (batch) tickets have no single tenBai/artist/did of
      // their own to autofill from — left out of the picker entirely,
      // matching how they're greyed out everywhere else in this app.
      setTickets((data || []).filter((t) => !isKhoNhacType(t.data?.typeRequest)));
      setTicketsLoaded(true);
    })();
  }, [mode, presetTicket, ticketsLoaded]);

  function pickTicket(t) {
    setPickedTicket(t);
    const f = fieldsFromTicket(t);
    setSongTitle(f.song_title);
    setArtist(f.artist);
    setDid(f.did);
  }

  function switchToManual() {
    setMode("manual");
    setPickedTicket(null);
  }

  const search = ticketSearch.trim().toLowerCase();
  const matches = search
    ? tickets.filter((t) => `${t.data?.tenBai || ""} ${t.data?.artist || ""} ${t.data?.relatedDid || ""}`.toLowerCase().includes(search)).slice(0, 12)
    : tickets.slice(0, 12);

  async function save() {
    if (!smartlink.trim()) { setError("Smartlink is required."); return; }
    setSaving(true);
    setError(null);
    const row = {
      song_title: songTitle.trim() || null,
      artist: artist.trim() || null,
      did: did.trim() || null,
      smartlink: smartlink.trim(),
      source_ticket_id: pickedTicket?.id || null,
      pic_profile_id: picId || null,
      note: note.trim() || null,
    };
    const { data, error: err } = await supabase.from("phai_sinh_smartlinks").insert(row).select().single();
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved(data);
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, maxWidth: 460, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div className={appStyles.eyebrow}>// Track Smartlink</div>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Phái Sinh Smartlink</h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        {!presetTicket && (
          <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
            {[["ticket", "Pick a ticket"], ["manual", "Manual entry"]].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => (k === "manual" ? switchToManual() : setMode("ticket"))}
                className={appStyles.tabBtn}
                style={{ border: mode === k ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: mode === k ? "rgba(255,107,26,0.1)" : "transparent" }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {mode === "ticket" && !pickedTicket && (
          <div style={{ marginBottom: 16 }}>
            <input
              autoFocus
              placeholder="Search Tên Bài, Artist, or DID…"
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
              className={appStyles.input}
              style={{ width: "100%", boxSizing: "border-box", marginBottom: 8 }}
            />
            <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
              {!ticketsLoaded ? (
                <div style={{ color: "var(--text-faint)", fontSize: 12, padding: "8px 10px" }}>Loading tickets…</div>
              ) : matches.length === 0 ? (
                <div style={{ color: "var(--text-faint)", fontSize: 12, padding: "8px 10px" }}>No matches.</div>
              ) : (
                matches.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => pickTicket(t)}
                    style={{ padding: "8px 10px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>{t.data?.tenBai || "(untitled)"}</div>
                    <div style={{ color: "var(--text-faint)" }}>{t.data?.artist || "—"} · {t.data?.relatedDid || "no DID"}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {(mode === "manual" || pickedTicket) && (
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {pickedTicket && (
              <div style={{ fontSize: 11, color: "var(--text-faint)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>From ticket — fields autofilled, still editable below.</span>
                {!presetTicket && (
                  <button type="button" onClick={switchToManual} className={appStyles.btnSmall}>Unpick</button>
                )}
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Song Title</label>
              <input className={appStyles.input} style={{ width: "100%", boxSizing: "border-box" }} value={songTitle} onChange={(e) => setSongTitle(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Artist</label>
              <input className={appStyles.input} style={{ width: "100%", boxSizing: "border-box" }} value={artist} onChange={(e) => setArtist(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>DID</label>
              <input className={appStyles.input} style={{ width: "100%", boxSizing: "border-box" }} value={did} onChange={(e) => setDid(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Smartlink <span className={appStyles.required}>*</span></label>
              <UrlField styles={appStyles} value={smartlink} onChange={setSmartlink} wide />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>PIC</label>
              <select className={appStyles.select} style={{ width: "100%" }} value={picId} onChange={(e) => setPicId(e.target.value)}>
                <option value="">— Unassigned —</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Note</label>
              <textarea className={appStyles.textarea} style={{ width: "100%", boxSizing: "border-box" }} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}

        {error && <div className={appStyles.errorBox}>{error}</div>}

        {(mode === "manual" || pickedTicket) && (
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={save} disabled={saving} className={appStyles.btnPrimary}>{saving ? "Saving…" : "Save"}</button>
            <button type="button" onClick={onClose} className={appStyles.btnSecondary}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
