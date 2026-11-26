// Round 697 — AR / admin / dev side of the release-info forms.
//   GET  ?list=submitted|confirmed|rejected|all [&q=text]  -> rows (+ release title/artist/DID)
//   GET  ?release=<uuid>                                    -> the row of one release (or null)
//   POST { action:"confirm"|"reject"|"reopen", id }         -> confirm also fills EMPTY release fields (genre, release date/time, composer); never overwrites
import { NextResponse } from "next/server";
import { findExistingLabel } from "../../../../lib/nameDedupe";
import { supabaseAdmin, getCallerProfile } from "../../../../lib/supabaseAdmin";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

async function caller(request) {
  const p = await getCallerProfile(request);
  if (!p) return null;
  return p.role === "dev" || p.role === "admin" || p.role === "superadmin" || p.segment === "AR" ? p : null;
}
async function withReleases(rows) {
  const ids = [...new Set((rows || []).map((r) => r.release_id).filter(Boolean))];
  const { data } = ids.length ? await supabaseAdmin.from("releases").select("id, did, title, main_artist, drive_link, genre, release_date, release_time, publishing_composer").in("id", ids) : { data: [] };
  const m = new Map((data || []).map((r) => [r.id, r]));
  return (rows || []).map((r) => ({ ...r, release: m.get(r.release_id) || null }));
}

export async function GET(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  if (!(await caller(request))) return bad("Not authorized.", 403);
  const q = new URL(request.url).searchParams;
  if (q.get("release")) {
    if (!UUID.test(q.get("release"))) return bad("Bad release id.");
    const { data } = await supabaseAdmin.from("release_info_forms").select("*").eq("release_id", q.get("release")).maybeSingle();
    return NextResponse.json({ row: data ? (await withReleases([data]))[0] : null }, { headers: noStore });
  }
  const list = q.get("list") || "submitted";
  let query = supabaseAdmin.from("release_info_forms").select("*").order("updated_at", { ascending: false }).limit(200);
  if (list !== "all") query = query.eq("status", list);
  const { data, error } = await query;
  if (error) return bad(/relation|schema cache|does not exist/i.test(error.message || "") ? "Chưa chạy SQL của Round 695/697." : error.message, 500);
  let rows = await withReleases(data);
  const text = (q.get("q") || "").trim().toLowerCase();
  if (text) rows = rows.filter((r) => `${r.answers?.song_title || ""} ${r.answers?.performer || ""} ${r.release?.did || ""}`.toLowerCase().includes(text));
  return NextResponse.json({ rows }, { headers: noStore });
}

export async function POST(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  const me = await caller(request);
  if (!me) return bad("Not authorized.", 403);
  let b = null; try { b = await request.json(); } catch { /* below */ }
  const id = String(b?.id || "");
  if (!UUID.test(id) || !["confirm", "reject", "reopen"].includes(b?.action)) return bad("Bad request.");
  const { data: row } = await supabaseAdmin.from("release_info_forms").select("*").eq("id", id).maybeSingle();
  if (!row) return bad("Not found.", 404);
  const now = new Date().toISOString();
  if (b.action === "reopen") {
    await supabaseAdmin.from("release_info_forms").update({ status: "submitted", confirmed_at: null, confirmed_by_name: null, updated_at: now }).eq("id", id);
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  if (b.action === "reject") {
    await supabaseAdmin.from("release_info_forms").update({ status: "rejected", confirmed_at: now, confirmed_by_name: me.name || null, updated_at: now }).eq("id", id);
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  // confirm: fill EMPTY release fields only
  const a = row.answers || {};
  const { data: rel } = await supabaseAdmin.from("releases").select("id, genre, release_date, release_time, publishing_composer, label, single_album_ep").eq("id", row.release_id).maybeSingle();
  const upd = {}; const filled = [];
  const empty = (v) => v == null || String(v).trim() === "";
  if (rel) {
    if (empty(rel.genre) && a.genres?.[0]) { upd.genre = a.genres[0]; filled.push("genre"); }
    if (empty(rel.release_date) && a.release_date) { upd.release_date = a.release_date; filled.push("release_date"); }
    if (empty(rel.release_time) && a.release_time) { upd.release_time = a.release_time; filled.push("release_time"); }
    if (empty(rel.label) && a.label) {   // the label as the Labels list spells it (a typed "ABC" finds "HĐ - ABC"); free text like "Independent" is kept as typed
      let nm = a.label;
      try { const ex = await findExistingLabel(supabaseAdmin, a.label); if (ex?.label_name) nm = ex.label_name; } catch (e) { /* keep typed */ }
      upd.label = nm; filled.push("label");
    }
    if (empty(rel.publishing_composer) && a.composer) { upd.publishing_composer = a.composer; filled.push("publishing_composer"); }
    if (Object.keys(upd).length) {
      const { error } = await supabaseAdmin.from("releases").update(upd).eq("id", rel.id);
      if (error) return bad("Không ghi được vào sản phẩm: " + error.message, 500);
    }
  }
  // Round 709 — EP / Album: the tracklist the artist typed goes into the product's tracks (release_tracks). Never overwrites: no tracks yet -> add them;
  // tracks already there -> only fill an EMPTY main / feature artist on a track with the same name; tracks that do not match are left alone.
  const note = [];
  const formTracks = (Array.isArray(a.tracks) ? a.tracks : []).map((t) => (typeof t === "string" ? { title: t } : t || {})).filter((t) => String(t.title || "").trim());
  if (rel && (a.release_type === "EP" || a.release_type === "Album") && formTracks.length) {
    if (!rel.single_album_ep || rel.single_album_ep === "Single") note.push(`tracklist not copied (product is set as ${rel.single_album_ep || "empty"}, form says ${a.release_type})`);
    else {
      const { data: have, error: terr } = await supabaseAdmin.from("release_tracks").select("id, track_name, main_artist, feature_artist, sort_order").eq("release_id", rel.id).order("sort_order");
      if (terr) note.push("tracks not written: " + terr.message);
      else if (!have || !have.length) {
        const rows = formTracks.slice(0, 40).map((t, i) => ({ release_id: rel.id, sort_order: i + 1, track_name: String(t.title).trim().slice(0, 200), main_artist: String(t.performer || "").trim() || null, feature_artist: String(t.featuring || "").trim() || null }));
        const { error: ierr } = await supabaseAdmin.from("release_tracks").insert(rows);
        if (ierr) note.push("tracks not written: " + ierr.message); else filled.push(`${rows.length} tracks`);
      } else {
        const norm = (x) => String(x || "").trim().toLowerCase();
        let n = 0, miss = 0;
        for (const t of formTracks) {
          const m = have.find((h) => norm(h.track_name) === norm(t.title));
          if (!m) { miss += 1; continue; }
          const u = {};
          if (empty(m.main_artist) && String(t.performer || "").trim()) u.main_artist = String(t.performer).trim();
          if (empty(m.feature_artist) && String(t.featuring || "").trim()) u.feature_artist = String(t.featuring).trim();
          if (Object.keys(u).length) { const { error: uerr } = await supabaseAdmin.from("release_tracks").update(u).eq("id", m.id); if (!uerr) n += 1; }
        }
        if (n) filled.push(`artists on ${n} track(s)`);
        if (miss) note.push(`${miss} track name(s) not found on the product, left alone`);
      }
    }
  }
  await supabaseAdmin.from("release_info_forms").update({ status: "confirmed", confirmed_at: now, confirmed_by_name: me.name || null, updated_at: now }).eq("id", id);
  return NextResponse.json({ ok: true, filled, note }, { headers: noStore });
}
