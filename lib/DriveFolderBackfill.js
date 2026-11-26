"use client";
// Round 712 — admin / AR: create the Drive folder set for releases whose Link Drive is still empty (upcoming + last 60 days). Preview first, then "Create next 10".
import { useState } from "react";
import { supabase } from "./supabaseClient";
import styles from "../app/shared.module.css";

async function call(method, body) {
  const { data } = await supabase.auth.getSession();
  const r = await fetch("/api/release-drive-folder/backfill", { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
const dmy = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

export default function DriveFolderBackfill() {
  const [open, setOpen] = useState(false);
  const [pv, setPv] = useState(null);   // { total, items, from }
  const [log, setLog] = useState([]);   // results of the batches done in this window
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function load() { setErr(""); setBusy(true); try { setPv(await call("GET")); } catch (e) { setErr(e.message); } setBusy(false); }
  async function run() {
    setErr(""); setBusy(true);
    try { const j = await call("POST", { limit: 10 }); setLog((l) => [...j.results, ...l]); await load(); } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <>
      <button type="button" className={styles.btnSecondary} onClick={() => { setOpen(true); setLog([]); load(); }}>Drive folders (backfill)</button>
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => !busy && setOpen(false)}>
          <div style={{ background: "var(--surface, #fff)", color: "var(--text, #111)", borderRadius: 14, maxWidth: 760, width: "100%", maxHeight: "86vh", overflow: "auto", padding: 20, border: "1px solid var(--border, #ddd)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: 18 }}>Create missing Drive folders</b><button type="button" className={styles.btnSmall} disabled={busy} onClick={() => setOpen(false)}>Close</button></div>
            <p style={{ fontSize: 13, color: "var(--text-faint)", margin: "6px 0 12px" }}>Releases with an <b>empty Link Drive</b>, a real release date from {pv?.from ? dmy(pv.from) : "60 days ago"} onward, not cancelled. Nothing is created until you press the button; each click does the next 10 (oldest date first). A Link Drive that already exists is never overwritten.</p>
            {err && <div style={{ color: "#d13b3b", fontSize: 13, marginBottom: 8 }}>{err}</div>}
            {pv && (
              <>
                <div style={{ marginBottom: 8 }}><b>{pv.total}</b> release(s) waiting.{" "}
                  <button type="button" className={styles.btnPrimary} disabled={busy || !pv.total} onClick={run}>{busy ? "Working…" : `Create next ${Math.min(10, pv.total)}`}</button></div>
                {log.length > 0 && (
                  <div style={{ border: "1px solid var(--border, #ddd)", borderRadius: 8, padding: 8, marginBottom: 10, fontSize: 13 }}>
                    <b>Done in this window</b>
                    {log.map((x) => <div key={x.id}>{x.ok ? "✅" : "⚠️"} {x.did} — {x.title} {x.ok ? <a href={x.url} target="_blank" rel="noreferrer">folder</a> : <span style={{ color: "#d13b3b" }}>{x.error}</span>}</div>)}
                  </div>
                )}
                <div style={{ fontSize: 13 }}>
                  {(pv.items || []).map((r) => <div key={r.id} style={{ padding: "3px 0", borderBottom: "1px solid var(--border, #eee)" }}>{dmy(r.release_date)} · {r.did} · <a href={`/releases/${r.id}`} target="_blank" rel="noreferrer">{r.title}</a> — {r.main_artist}</div>)}
                  {pv.total > (pv.items || []).length && <div style={{ color: "var(--text-faint)", marginTop: 4 }}>… and {pv.total - pv.items.length} more</div>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
