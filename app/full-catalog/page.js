"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { readTrackReport } from "../../lib/csvParse";

// Round 577 — Full catalog (dev only). Upload the daily TRACK report (CSV); it replaces yesterday's catalog (only new / changed tracks are sent).
// The kworb crawl (11:00 Vietnam) matches the chart against this catalog, so upload before 11:00.
const CHUNK = 1500;
const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 14 };
const btn = { padding: "9px 16px", fontWeight: 800, borderRadius: 8, border: "none", background: "#ff7a1a", color: "#fff", cursor: "pointer" };
const btnGhost = { padding: "7px 12px", fontWeight: 700, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "inherit", cursor: "pointer" };
const th = { textAlign: "left", padding: "6px 10px", fontSize: 11, color: "var(--text-faint)", fontWeight: 600, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td = { padding: "6px 10px", fontSize: 13, borderBottom: "1px solid var(--border)", verticalAlign: "top" };

const vnDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const vnTime = (d) => new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

export default function FullCatalogPage() {
  const { profile } = useAuth();
  const [meta, setMeta] = useState(null);
  const [metaErr, setMetaErr] = useState("");
  const [parsed, setParsed] = useState(null);     // { name, rows, skipped, noArtist, noUpc, counts }
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [f, setF] = useState({ q: "", label: "", artist: "", year: "" });   // browse filters
  const [pageNo, setPageNo] = useState(0);
  const [view, setView] = useState(null);       // { rows, hasNext } of the page on screen
  const [browsing, setBrowsing] = useState(false);
  const cache = useRef(new Map());              // "filters|page" -> result; pages already opened are not fetched again
  const fileRef = useRef(null);

  const call = useCallback(async (body) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/full-catalog", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token || ""}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
    return j;
  }, []);

  const loadMeta = useCallback(async () => {
    try { const j = await call({ action: "status" }); setMeta(j.meta); setMetaErr(""); } catch (e) { setMetaErr(e.message); }
  }, [call]);
  useEffect(() => { if (profile?.role === "dev") loadMeta(); }, [profile, loadMeta]);

  async function pick(e) {
    const f = e.target.files?.[0];
    setErr(""); setDone(""); setParsed(null); setForce(false);
    if (!f) return;
    try {
      const r = await readTrackReport(f, (d, t) => setProgress(`Reading the file… ${Math.round((d / t) * 100)}%`));
      setProgress("Comparing with the stored catalog…");
      const stored = new Map();
      for (let after = 0; ;) {
        const j = await call({ action: "hashes", after });
        j.rows.forEach(([id, h]) => stored.set(id, h));
        if (j.next == null) break;
        after = j.next;
      }
      const inFile = new Set(r.rows.map((x) => x.id));
      const changed = r.rows.filter((x) => stored.get(x.id) !== x.row_hash);
      const added = changed.filter((x) => !stored.has(x.id)).length;
      const removed = [...stored.keys()].filter((id) => !inFile.has(id));
      setParsed({ name: f.name, ...r, changed, added, updated: changed.length - added, removed, storedCount: stored.size });
    } catch (ex) { setErr(ex.message); }
    setProgress("");
  }

  const prev = meta?.row_count || 0;
  const tooSmall = parsed && prev > 0 && parsed.rows.length < prev * 0.6;

  async function upload() {
    if (!parsed || busy) return;
    setBusy(true); setErr(""); setDone("");
    try {
      const chunks = [];
      for (let i = 0; i < parsed.changed.length; i += CHUNK) chunks.push(parsed.changed.slice(i, i + CHUNK));
      let next = 0, sent = 0;
      const worker = async () => {
        while (next < chunks.length) {
          const c = chunks[next++];
          await call({ action: "rows", rows: c });
          sent += c.length;
          setProgress(`Uploading ${sent.toLocaleString("en-US")} / ${parsed.changed.length.toLocaleString("en-US")} changed tracks…`);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      for (let i = 0; i < parsed.removed.length; i += 300) {
        setProgress(`Removing tracks no longer in the report… ${Math.min(i + 300, parsed.removed.length)} / ${parsed.removed.length}`);
        await call({ action: "remove", ids: parsed.removed.slice(i, i + 300) });
      }
      setProgress("Finishing…");
      const counts = { tracks: parsed.rows.length, "with ISRC": parsed.rows.length - parsed.noIsrc };
      await call({ action: "finish", total: parsed.rows.length, fileName: parsed.name, counts });
      setDone(`Done — ${parsed.rows.length.toLocaleString("en-US")} tracks in the catalog (${parsed.added.toLocaleString("en-US")} new, ${parsed.updated.toLocaleString("en-US")} changed, ${parsed.removed.length.toLocaleString("en-US")} removed).`);
      setParsed(null); if (fileRef.current) fileRef.current.value = "";
      await loadMeta();
    } catch (ex) { setErr(`${ex.message} (nothing is lost — uploading the same file again continues from the difference)`); }
    setProgress(""); setBusy(false);
  }

  async function show(filters, page) {
    const key = JSON.stringify([filters, page]);
    setErr("");
    if (cache.current.has(key)) { setView(cache.current.get(key)); setPageNo(page); return; }
    setBrowsing(true);
    try {
      const j = await call({ action: "browse", ...filters, page });
      const res = { rows: j.rows, hasNext: j.hasNext };
      cache.current.set(key, res);
      setView(res); setPageNo(page);
    } catch (ex) { setErr(ex.message); }
    setBrowsing(false);
  }
  function submit(e) { e?.preventDefault(); cache.current = new Map(); show(f, 0); }

  if (profile && profile.role !== "dev") return <AppShell><div style={{ padding: 24 }}>This page is for the dev account only.</div></AppShell>;

  const today = vnDay(new Date());
  const upToDate = meta?.finished_at && vnDay(meta.finished_at) === today;

  return (
    <AppShell>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "16px 16px 40px" }}>
        <h2 style={{ margin: "0 0 4px" }}>Full catalog</h2>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-faint)" }}>
          Every track of the company (new releases, derivatives and tracks not in the app). Upload the daily track report (CSV, ProductTrack_report) — it replaces the previous catalog. The kworb check (11:00 Vietnam time) matches the chart against it, so upload before then.
        </p>

        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Current catalog</div>
          {metaErr ? <div style={{ color: "var(--error-fg)", fontSize: 13 }}>{metaErr}</div> : !meta?.finished_at ? <div style={{ fontSize: 13, color: "var(--text-faint)" }}>No catalog uploaded yet.</div> : (
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div><b>{Number(meta.row_count).toLocaleString("en-US")}</b> tracks · uploaded {vnTime(meta.finished_at)} by {meta.uploaded_by || "?"} · <span style={{ color: "var(--text-faint)" }}>{meta.file_name}</span></div>
              <div style={{ color: upToDate ? "var(--success-fg)" : "#e5484d", fontWeight: 700 }}>{upToDate ? "Up to date for today." : "Not uploaded today yet."}</div>
              {meta.counts && <div style={{ color: "var(--text-faint)" }}>{Object.entries(meta.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${Number(v).toLocaleString("en-US")}`).join(" · ")}</div>}
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Upload today's track report</div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={pick} disabled={busy} />
          {parsed && (
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7 }}>
              <div><b>{parsed.rows.length.toLocaleString("en-US")}</b> tracks read from <i>{parsed.name}</i>{prev ? ` (stored now: ${parsed.storedCount.toLocaleString("en-US")})` : ""}.</div>
              <div><b>{parsed.added.toLocaleString("en-US")}</b> new · <b>{parsed.updated.toLocaleString("en-US")}</b> changed · <b>{parsed.removed.length.toLocaleString("en-US")}</b> no longer in the report · the rest are unchanged and are not re-sent.</div>
              <div style={{ color: "var(--text-faint)" }}>{parsed.usedProductTitle.toLocaleString("en-US")} singles use the product title as the track name · {parsed.noArtist} without a main artist · {parsed.noIsrc} without an ISRC · {parsed.skipped} rows skipped</div>
              {tooSmall && (
                <label style={{ display: "block", color: "#e5484d", fontWeight: 700, margin: "8px 0" }}>
                  <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> This file is much smaller than the current catalog — tick to confirm it is the right file.
                </label>
              )}
              <button type="button" style={{ ...btn, marginTop: 8, opacity: busy || (tooSmall && !force) ? 0.5 : 1 }} disabled={busy || (tooSmall && !force)} onClick={upload}>Update the catalog with this file</button>
            </div>
          )}
          {progress && <div style={{ marginTop: 8, fontSize: 13 }}>{progress}</div>}
          {done && <div style={{ marginTop: 8, fontSize: 13, color: "var(--success-fg)", fontWeight: 700 }}>{done}</div>}
          {err && <div style={{ marginTop: 8, background: "var(--error-bg)", color: "var(--error-fg)", fontSize: 13, padding: "6px 12px", borderRadius: 6 }}>{err}</div>}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Browse the catalog</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 8 }}>Nothing loads until you ask. 50 tracks per page, newest first; filters are applied in the database, so only the page you open is downloaded.</div>
          <form onSubmit={submit} style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {[["q", "Title, artist, UPC, ISRC or Id", 2], ["artist", "Artist", 1], ["label", "Label", 1], ["year", "Year", 0]].map(([k, ph, grow]) => (
              <input key={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} inputMode={k === "year" ? "numeric" : undefined} maxLength={k === "year" ? 4 : 80}
                style={{ flex: grow || "0 0 80px", minWidth: grow ? 140 : 80, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-input, transparent)", color: "inherit" }} />
            ))}
            <button type="submit" style={btnGhost} disabled={browsing}>{f.q || f.artist || f.label || f.year ? "Search" : "Show newest"}</button>
          </form>
          {view && (view.rows.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-faint)" }}>Nothing found.</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Id</th><th style={th}>Track</th><th style={th}>Artist</th><th style={th}>Product</th><th style={th}>Label</th><th style={th}>ISRC</th><th style={th}>UPC</th><th style={th}>Release</th></tr></thead>
                <tbody>
                  {view.rows.map((x) => (
                    <tr key={x.id}>
                      <td style={td}>{x.id}</td>
                      <td style={td}>{x.title}{x.title_version ? <span style={{ color: "var(--text-faint)" }}> ({x.title_version})</span> : null}</td>
                      <td style={td}>{x.main_artist}{x.featured_artist ? <span style={{ color: "var(--text-faint)" }}> ft. {x.featured_artist}</span> : null}</td>
                      <td style={td}>{x.product_title}</td><td style={td}>{x.label}</td><td style={td}>{x.isrc}</td><td style={td}>{x.upc}</td><td style={td}>{x.release_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, fontSize: 13 }}>
                <button type="button" style={btnGhost} disabled={browsing || pageNo === 0} onClick={() => show(f, pageNo - 1)}>← Previous</button>
                <span>Page {pageNo + 1}</span>
                <button type="button" style={btnGhost} disabled={browsing || !view.hasNext} onClick={() => show(f, pageNo + 1)}>Next →</button>
                {browsing && <span style={{ color: "var(--text-faint)" }}>Loading…</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
