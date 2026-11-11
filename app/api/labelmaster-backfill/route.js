// Round 593 — Labelmaster daily report backfill (dev only). The browser reads the report and works out the plan; this route only
//   releases -> pages of the app's releases (id cursor) for matching
//   apply    -> writes ONE chunk of planned changes. The report is the source of truth: a field is set to the report's value when it differs from
//               the row as it is NOW (a blank report value never blanks anything); each change is logged with its old value (lm_backfill_log) so a whole run can be undone
//   undo     -> puts a run's old values back (only where the field still holds what the run wrote)
//   runs     -> recent runs for the page
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../lib/supabaseAdmin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bad = (msg, status = 400) => NextResponse.json({ error: msg }, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const empty = (v) => v == null || String(v).trim() === "";
const REL_COLS = "id, did, title, main_artist, feature_artist, genre, label, release_date, single_album_ep, upc, isrc, has_isrc, published_at, copyright_checklist, custom_fields";
const OWNER_KEYS = ["master", "vocal", "author"];
const missing = (e) => (/relation|does not exist|schema cache/i.test(e?.message || "") ? "Table missing — run add-round593-labelmaster-backfill.sql in Supabase first." : e.message);

export async function POST(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  const caller = await getCallerProfile(request);
  if (!caller || caller.role !== "dev") return bad("Not authorized.", 403);
  let b;
  try { b = await request.json(); } catch { return bad("Bad request."); }
  const who = caller.name || caller.email || null;

  try {
    if (b.action === "releases") {
      const after = b.after && UUID.test(b.after) ? b.after : null;
      let q = supabaseAdmin.from("releases").select(REL_COLS).order("id").limit(1000);
      if (after) q = q.gt("id", after);
      const { data, error } = await q;
      if (error) return bad(error.message, 500);
      return NextResponse.json({ rows: data || [], next: data && data.length === 1000 ? data[data.length - 1].id : null });
    }

    if (b.action === "runs") {
      const { data, error } = await supabaseAdmin.from("lm_backfill_log").select("run_id, at, by_name, release_id, undone").order("at", { ascending: false }).limit(5000);
      if (error) return bad(missing(error), 500);
      const runs = new Map();
      for (const r of data || []) {
        const x = runs.get(r.run_id) || { run_id: r.run_id, at: r.at, by: r.by_name, changes: 0, releases: new Set(), undone: 0 };
        x.changes++; x.releases.add(r.release_id); if (r.undone) x.undone++;
        runs.set(r.run_id, x);
      }
      return NextResponse.json({ runs: [...runs.values()].slice(0, 10).map((x) => ({ ...x, releases: x.releases.size })) });
    }

    if (b.action === "apply") {
      const runId = UUID.test(b.runId || "") ? b.runId : null;
      const items = Array.isArray(b.items) ? b.items : [];
      if (!runId || !items.length || items.length > 100) return bad("Send a run id and 1-100 items.");
      const ids = items.map((i) => i.id).filter((i) => UUID.test(i || ""));
      const { data: cur, error } = await supabaseAdmin.from("releases").select(REL_COLS).in("id", ids);
      if (error) return bad(error.message, 500);
      const byId = new Map((cur || []).map((r) => [r.id, r]));
      const log = [];
      let updated = 0, fields = 0, skipped = 0;
      const jobs = items.map((it) => async () => {
        const r = byId.get(it.id);
        if (!r || !it.fill) { skipped++; return; }
        const f = it.fill, u = {}, note = (field, oldV, newV) => log.push({ run_id: runId, release_id: r.id, did: r.did, field, old_value: oldV == null ? null : String(oldV), new_value: newV == null ? null : String(newV), by_name: who });
        const digits = (s) => String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");
        for (const col of ["upc", "isrc", "genre", "feature_artist"]) {
          if (f[col] == null || empty(f[col])) continue;
          const nv = String(f[col]).trim();
          const same = col === "upc" ? digits(r.upc) === digits(nv) : String(r[col] ?? "").trim().toLowerCase() === nv.toLowerCase();
          if (!same) { u[col] = nv; note(col, r[col], nv); }
        }
        if (f.release_date && /^\d{4}-\d{2}-\d{2}$/.test(String(f.release_date)) && String(r.release_date || "").slice(0, 10) !== f.release_date) { u.release_date = f.release_date; note("release_date", String(r.release_date || "").slice(0, 10), f.release_date); }
        if (u.isrc && !r.has_isrc) { u.has_isrc = true; note("has_isrc", r.has_isrc, true); }
        if ((u.upc || !empty(r.upc)) && empty(r.published_at) && f.published_at && !isNaN(Date.parse(f.published_at))) { u.published_at = new Date(f.published_at).toISOString(); note("published_at", null, u.published_at); }
        if (f.owners && typeof f.owners === "object") {
          const cc = { ...(r.copyright_checklist || {}) };
          let touched = false;
          for (const k of OWNER_KEYS) {
            const v = f.owners[k];
            if (!empty(v) && String(cc[k]?.owner || "").trim() !== String(v).trim()) { const was = cc[k]?.owner || ""; cc[k] = { ...(cc[k] || {}), owner: String(v).trim() }; touched = true; note(`rights.${k}.owner`, was, cc[k].owner); }
          }
          if (touched) u.copyright_checklist = cc;
        }
        if (f.lm && typeof f.lm === "object") {
          const prev = (r.custom_fields || {}).labelmaster || {};
          const next = {};
          for (const [k, v] of Object.entries(f.lm)) if (!empty(v)) next[k] = typeof v === "number" ? v : String(v).slice(0, 500);
          const changed = Object.keys(next).some((k) => String(prev[k] ?? "") !== String(next[k]));
          if (changed) {
            u.custom_fields = { ...(r.custom_fields || {}), labelmaster: { ...prev, ...next, synced_at: new Date().toISOString() } };
            note("labelmaster snapshot", JSON.stringify(prev), JSON.stringify(u.custom_fields.labelmaster));
          }
        }
        if (!Object.keys(u).length) { skipped++; return; }
        const { error: e } = await supabaseAdmin.from("releases").update(u).eq("id", r.id);
        if (e) throw new Error(`${r.did || r.id}: ${e.message}`);
        updated++; fields += Object.keys(u).length;
      });
      for (let i = 0; i < jobs.length; i += 10) await Promise.all(jobs.slice(i, i + 10).map((j) => j()));
      if (log.length) {
        const { error: le } = await supabaseAdmin.from("lm_backfill_log").insert(log);
        if (le) return bad(missing(le), 500);
      }
      return NextResponse.json({ ok: true, updated, fields, skipped });
    }

    if (b.action === "undo") {
      const runId = UUID.test(b.runId || "") ? b.runId : null;
      if (!runId) return bad("Bad run id.");
      const { data: rows, error } = await supabaseAdmin.from("lm_backfill_log").select("*").eq("run_id", runId).eq("undone", false).order("id", { ascending: false }).limit(2000);
      if (error) return bad(missing(error), 500);
      if (!rows?.length) return NextResponse.json({ ok: true, restored: 0, left: 0 });
      const byRel = new Map();
      for (const r of rows) { if (!byRel.has(r.release_id)) byRel.set(r.release_id, []); byRel.get(r.release_id).push(r); }
      const relIds = [...byRel.keys()].slice(0, 100);
      const { data: cur, error: ce } = await supabaseAdmin.from("releases").select(REL_COLS).in("id", relIds);
      if (ce) return bad(ce.message, 500);
      let restored = 0; const doneIds = [];
      for (const r of cur || []) {
        const u = {}; let cc = null; let cf = null;
        for (const l of byRel.get(r.id)) {
          if (["upc", "isrc", "genre", "feature_artist", "release_date"].includes(l.field)) {
            if (String(r[l.field] ?? "") === String(l.new_value ?? "")) { u[l.field] = l.old_value; doneIds.push(l.id); }
          } else if (l.field === "has_isrc") { if (r.has_isrc === true) { u.has_isrc = false; doneIds.push(l.id); } }
          else if (l.field === "published_at") { if (r.published_at && new Date(r.published_at).toISOString() === l.new_value) { u.published_at = null; doneIds.push(l.id); } }
          else if (l.field.startsWith("rights.")) {
            const k = l.field.split(".")[1];
            cc = cc || { ...(r.copyright_checklist || {}) };
            if (cc[k]?.owner === l.new_value) { cc[k] = { ...cc[k], owner: l.old_value || "" }; doneIds.push(l.id); }
          } else if (l.field === "labelmaster snapshot") {
            cf = cf || { ...(r.custom_fields || {}) };
            let oldSnap = {}; try { oldSnap = JSON.parse(l.old_value || "{}"); } catch { oldSnap = {}; }
            if (JSON.stringify(cf.labelmaster || {}) === l.new_value) { if (Object.keys(oldSnap).length) cf.labelmaster = oldSnap; else delete cf.labelmaster; doneIds.push(l.id); }
          }
        }
        if (cc) u.copyright_checklist = cc;
        if (cf) u.custom_fields = cf;
        if (Object.keys(u).length) {
          const { error: ue } = await supabaseAdmin.from("releases").update(u).eq("id", r.id);
          if (ue) return bad(ue.message, 500);
          restored++;
        }
      }
      // mark everything handled for these releases (even where the value had since changed: nothing more to restore there)
      const handled = rows.filter((l) => relIds.includes(l.release_id)).map((l) => l.id);
      if (handled.length) await supabaseAdmin.from("lm_backfill_log").update({ undone: true }).in("id", handled);
      return NextResponse.json({ ok: true, restored, left: Math.max(0, byRel.size - relIds.length) });
    }

    return bad("Unknown action.");
  } catch (e) {
    return bad(e.message, 500);
  }
}
