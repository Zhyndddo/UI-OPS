"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { readLabelmasterReport, groupProducts, planBackfill } from "../../lib/labelmasterBackfill";

// Round 593 — Labelmaster sync (dev only). Each day: choose the ProductTrack report -> it is matched to the app's releases
// (UPC, then ISRC, then title + artist) -> preview of what would CHANGE (the report is the source of truth: where it has a value and the app differs, the
// report wins; a blank in the report never blanks the app) -> apply. Every change is logged with its old value, and a whole run can be undone.
// Label differences are listed for review but never written; release date is an opt-in tick.
const CHUNK = 50;
const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 14 };
const btn = { padding: "9px 16px", fontWeight: 800, borderRadius: 8, border: "none", background: "#ff7a1a", color: "#fff", cursor: "pointer" };
const btnGhost = { padding: "6px 12px", fontWeight: 700, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12 };
const th = { textAlign: "left", padding: "6px 10px", fontSize: 11, color: "var(--text-faint)", fontWeight: 600, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td = { padding: "6px 10px", fontSize: 12.5, borderBottom: "1px solid var(--border)", verticalAlign: "top" };
const chip = { display: "inline-block", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 10px", fontSize: 12, marginRight: 6, marginBottom: 6 };
const nf = (n) => Number(n || 0).toLocaleString("en-US");
const vnTime = (d) => new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
const short = (v) => { const s = String(v ?? ""); return s.length > 38 ? s.slice(0, 36) + "…" : s; };

export default function LabelmasterBackfillPage() {
  const { profile } = useAuth();
  const [fileName, setFileName] = useState("");
  const [products, setProducts] = useState(null);
  const [rowCount, setRowCount] = useState(0);
  const [releases, setReleases] = useState(null);
  const [opts, setOpts] = useState({ rights: true, credits: true, releaseDate: false });
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState({});
  const [runs, setRuns] = useState([]);
  const fileRef = useRef(null);

  const call = useCallback(async (body) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/labelmaster-backfill", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token || ""}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
    return j;
  }, []);

  const loadRuns = useCallback(async () => { try { setRuns((await call({ action: "runs" })).runs || []); } catch (e) { setErr(e.message); } }, [call]);
  useEffect(() => { if (profile?.role === "dev") loadRuns(); }, [profile, loadRuns]);

  async function pick(e) {
    const f = e.target.files?.[0];
    setErr(""); setDone(""); setProducts(null); setReleases(null);
    if (!f) return;
    setBusy(true);
    try {
      setFileName(f.name);
      const rows = await readLabelmasterReport(f, (d, t) => setProgress(`Reading the file… ${Math.round((d / t) * 100)}%`));
      setRowCount(rows.length);
      setProgress("Grouping tracks into products…");
      const prods = groupProducts(rows);
      const all = [];
      for (let after = null; ;) {
        setProgress(`Loading the app's releases… ${nf(all.length)}`);
        const j = await call({ action: "releases", after });
        all.push(...j.rows);
        if (!j.next) break;
        after = j.next;
      }
      setProducts(prods); setReleases(all);
    } catch (ex) { setErr(ex.message); }
    setProgress(""); setBusy(false);
  }

  const plan = useMemo(() => (products && releases ? planBackfill(releases, products, opts) : null), [products, releases, opts]);
  const shown = useMemo(() => {
    if (!plan) return [];
    const s = q.trim().toLowerCase();
    return (s ? plan.items.filter((i) => `${i.did} ${i.title}`.toLowerCase().includes(s)) : plan.items).slice(0, 300);
  }, [plan, q]);

  async function apply() {
    if (!plan || !plan.items.length || busy) return;
    if (!window.confirm(`Update ${nf(plan.items.length)} releases from the Labelmaster report? The report's values REPLACE the app's where they differ (old values are logged and the run can be undone).`)) return;
    setBusy(true); setErr(""); setDone("");
    const runId = crypto.randomUUID();
    let updated = 0, fields = 0, skipped = 0;
    try {
      for (let i = 0; i < plan.items.length; i += CHUNK) {
        setProgress(`Writing… ${nf(Math.min(i + CHUNK, plan.items.length))} / ${nf(plan.items.length)}`);
        const chunk = plan.items.slice(i, i + CHUNK).map((it) => ({ id: it.id, fill: it.fill }));
        const j = await call({ action: "apply", runId, items: chunk });
        updated += j.updated; fields += j.fields; skipped += j.skipped;
      }
      setDone(`Done: ${nf(updated)} releases updated (${nf(fields)} fields), ${nf(skipped)} already matched the report.`);
      setReleases(null); setProducts(null);   // plan is stale now; pick the file again for a fresh check
      loadRuns();
    } catch (ex) { setErr(`${ex.message} — nothing more was written; the part already written is in the run list below and can be undone.`); loadRuns(); }
    setProgress(""); setBusy(false);
  }

  async function undo(runId) {
    if (busy || !window.confirm("Undo this run? Each field goes back to what it was, only where it still holds what the run wrote.")) return;
    setBusy(true); setErr(""); setDone("");
    try {
      let restored = 0;
      for (let n = 0; n < 40; n++) { const j = await call({ action: "undo", runId }); restored += j.restored; if (!j.left) break; }
      setDone(`Undone: ${nf(restored)} releases restored.`);
      loadRuns();
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  if (profile && profile.role !== "dev") return <AppShell><div style={{ padding: 24 }}>Dev only.</div></AppShell>;
  const st = plan?.stats;
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  return (
    <AppShell>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 60px" }}>
        <div style={{ fontSize: 12, color: "#ff7a1a", fontWeight: 800, letterSpacing: 1 }}>// DEV · LABELMASTER</div>
        <h1 style={{ margin: "2px 0 10px" }}>Labelmaster sync</h1>
        <div style={{ ...card, fontSize: 13, color: "var(--text-faint)" }}>
          Each day, choose the <b>ProductTrack report</b>. It is the <b>source of truth</b>: rows are matched to the app&apos;s releases (UPC, then ISRC, then title + artist) and where the report has a value that differs from the app, the report value replaces it. A blank in the report never blanks the app, and no release is created. The app side is a log: every change keeps its old value and a run can be undone.
          Label differences are only listed (the app&apos;s label carries the &quot;HĐ - &quot; contract prefix). EP / Album releases only get product-level fields (UPC, genre, featured artist); per-track rights and credits are skipped for them. Cover / audio links in the report are signed and expire after 7 days, so they are not stored.
        </div>

        <div style={card}>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={pick} disabled={busy} />
          {fileName && !progress && <span style={{ marginLeft: 10, fontSize: 12, color: "var(--text-faint)" }}>{fileName} · {nf(rowCount)} tracks</span>}
          {progress && <div style={{ marginTop: 8, fontSize: 13 }}>{progress}</div>}
          {err && <div style={{ marginTop: 8, color: "var(--error-fg)", fontSize: 13 }}>{err}</div>}
          {done && <div style={{ marginTop: 8, color: "var(--success-fg)", fontSize: 13, fontWeight: 700 }}>{done}</div>}
        </div>

        {plan && (
          <>
            <div style={card}>
              <div style={{ marginBottom: 8 }}>
                <span style={chip}>{nf(st.products)} products in the report</span>
                <span style={chip}>{nf(st.releases)} releases in the app</span>
                <span style={chip}><b>{nf(st.matched)}</b> matched (UPC {nf(st.byUpc)} · ISRC {nf(st.byIsrc)} · title {nf(st.byTitle)})</span>
                <span style={chip}>{nf(st.unmatched)} not in the report</span>
                <span style={chip}>{nf(st.ambiguous)} ambiguous (skipped)</span>
                <span style={{ ...chip, borderColor: "#ff7a1a" }}><b>{nf(plan.items.length)}</b> releases would change</span>
              </div>
              <div style={{ fontSize: 12.5, marginBottom: 10 }}>
                {Object.keys(st.fields).length === 0 ? "Nothing to change — every matched release already agrees with the report." : Object.entries(st.fields).map(([k, n]) => <span key={k} style={chip}>{k}: {nf(n)}</span>)}
              </div>
              <label style={{ fontSize: 13, marginRight: 16 }}><input type="checkbox" checked={opts.rights} onChange={(e) => setOpts((o) => ({ ...o, rights: e.target.checked }))} /> Sync rights owners (Q1 master / Q2 vocal / Q3 author — owner name only, contracts and dates stay as they are)</label>
              <label style={{ fontSize: 13, marginRight: 16 }}><input type="checkbox" checked={opts.credits} onChange={(e) => setOpts((o) => ({ ...o, credits: e.target.checked }))} /> Save credits snapshot (composer, producer, C/P line… kept with the release)</label>
              <label style={{ fontSize: 13 }}><input type="checkbox" checked={opts.releaseDate} onChange={(e) => setOpts((o) => ({ ...o, releaseDate: e.target.checked }))} /> Also replace the release date (off by default — it drives schedules)</label>
              <div style={{ marginTop: 12 }}>
                <button style={{ ...btn, opacity: plan.items.length && !busy ? 1 : 0.5 }} disabled={!plan.items.length || busy} onClick={apply}>Update {nf(plan.items.length)} releases</button>
              </div>
            </div>

            <div style={card}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>What would change (old → new)</b>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search DID or title…" style={{ flex: 1, maxWidth: 280, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-input)", color: "inherit" }} />
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>first 300 shown</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>DID</th><th style={th}>Title</th><th style={th}>Matched by</th><th style={th}>Changes</th></tr></thead>
                  <tbody>
                    {shown.map((i) => (
                      <tr key={i.id}>
                        <td style={td}>{i.did}</td><td style={td}>{short(i.title)}</td><td style={td}>{i.how}</td>
                        <td style={td}>{i.diffs.map((d) => <div key={d.field}><span style={{ color: "var(--text-faint)" }}>{d.field}:</span> {d.old ? <span style={{ textDecoration: "line-through", color: "var(--text-faint)" }}>{short(d.old)}</span> : null}{d.old ? " → " : ""}{short(d.new)}</div>)}</td>
                      </tr>
                    ))}
                    {!shown.length && <tr><td style={td} colSpan={4}>Nothing to show.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {[["differs", `Differences for review (not written): ${nf(plan.differs.length)}`, plan.differs, (d) => `${d.did} · ${short(d.title)} — ${d.field}: app “${d.app}” vs report “${d.report}”`],
              ["amb", `Ambiguous matches, skipped: ${nf(plan.ambiguous.length)}`, plan.ambiguous, (a) => `${a.rel.did} · ${short(a.rel.title)} — ${a.why}`]].map(([k, label, list, fmt]) => (
              <div key={k} style={card}>
                <button style={btnGhost} onClick={() => toggle(k)}>{open[k] ? "▾" : "▸"} {label}</button>
                {open[k] && <div style={{ marginTop: 8, fontSize: 12.5, maxHeight: 280, overflow: "auto" }}>{list.slice(0, 500).map((x, i) => <div key={i} style={{ padding: "2px 0" }}>{fmt(x)}</div>)}{list.length > 500 && <div style={{ color: "var(--text-faint)" }}>…and {nf(list.length - 500)} more</div>}</div>}
              </div>
            ))}
          </>
        )}

        <div style={card}>
          <b style={{ fontSize: 13 }}>Recent runs</b>
          {!runs.length && <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 6 }}>No runs yet.</div>}
          {runs.map((r) => (
            <div key={r.run_id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
              <span>{vnTime(r.at)}</span><span>{r.by || "—"}</span><span>{nf(r.releases)} releases · {nf(r.changes)} changes</span>
              {r.undone >= r.changes ? <span style={{ color: "var(--text-faint)" }}>undone</span> : <button style={btnGhost} disabled={busy} onClick={() => undo(r.run_id)}>Undo</button>}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
