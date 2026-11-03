// Round 577 — Full catalog: daily product report upload (dev only). The browser parses the CSV and sends the rows in chunks:
//   hashes -> id + row_hash of what is stored (the page compares and sends only new / changed tracks)
//   rows   -> upserts one chunk of new / changed tracks
//   remove -> deletes tracks that are no longer in the report
//   finish -> checks the row count and stamps full_catalog_meta (the kworb run reads that stamp)
//   status / search -> read-only helpers for the page
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../lib/supabaseAdmin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const COLS = ["id", "isrc", "upc", "title", "track_title", "title_version", "product_title", "product_version", "track_order", "label", "main_artist", "featured_artist", "release_date", "title_key", "row_hash"];
const bad = (msg, status = 400) => NextResponse.json({ error: msg }, { status });

export async function POST(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  const caller = await getCallerProfile(request);
  if (!caller || caller.role !== "dev") return bad("Not authorized.", 403);
  let b;
  try { b = await request.json(); } catch { return bad("Bad request."); }
  const missing = (e) => /relation|does not exist|schema cache/i.test(e?.message || "") ? "Tables missing — run add-round577-full-catalog.sql in Supabase first." : e.message;

  try {
    if (b.action === "status") {
      const { data, error } = await supabaseAdmin.from("full_catalog_meta").select("*").eq("id", 1).maybeSingle();
      if (error) return bad(missing(error), 500);
      return NextResponse.json({ meta: data || null });
    }

    if (b.action === "search") {
      const q = String(b.q || "").trim().replace(/[%,()]/g, " ").slice(0, 80);
      if (q.length < 2) return NextResponse.json({ rows: [] });
      const num = /^\d+$/.test(q) ? Number(q) : null;
      const orParts = [`title.ilike.%${q}%`, `product_title.ilike.%${q}%`, `main_artist.ilike.%${q}%`, `featured_artist.ilike.%${q}%`, `upc.ilike.%${q}%`, `isrc.ilike.%${q}%`];
      if (num != null) orParts.push(`id.eq.${num}`);
      const { data, error } = await supabaseAdmin.from("full_catalog").select("id, isrc, upc, title, title_version, product_title, label, main_artist, featured_artist, release_date")
        .or(orParts.join(",")).order("id", { ascending: false }).limit(60);
      if (error) return bad(missing(error), 500);
      return NextResponse.json({ rows: data || [] });
    }

    if (b.action === "hashes") {   // id + row_hash of what is stored, so the browser can send only new / changed rows
      let after = Number(b.after) || 0;
      const out = [];
      for (let page = 0; page < 20; page++) {
        const { data, error } = await supabaseAdmin.from("full_catalog").select("id, row_hash").gt("id", after).order("id").limit(1000);
        if (error) return bad(missing(error), 500);
        for (const r of data || []) out.push([r.id, r.row_hash]);
        if (!data || data.length < 1000) return NextResponse.json({ rows: out, next: null });
        after = data[data.length - 1].id;
      }
      return NextResponse.json({ rows: out, next: after });
    }

    if (b.action === "rows") {
      const rows = Array.isArray(b.rows) ? b.rows : [];
      if (!rows.length || rows.length > 2500) return bad("Send between 1 and 2500 rows per chunk.");
      const clean = rows.map((r) => {
        const o = {};
        for (const c of COLS) o[c] = r[c] === undefined || r[c] === "" ? null : r[c];
        o.id = Number(o.id); o.title = String(o.title || ""); o.main_artist = String(o.main_artist || ""); o.title_key = String(o.title_key || "");
        return o;
      }).filter((o) => Number.isFinite(o.id) && o.id > 0 && o.title);
      const { error } = await supabaseAdmin.from("full_catalog").upsert(clean, { onConflict: "id" });
      if (error) return bad(missing(error), 500);
      return NextResponse.json({ ok: true, saved: clean.length });
    }

    if (b.action === "remove") {   // tracks that are no longer in the report
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 400);   // ids go in the URL: keep it short
      if (!ids.length) return NextResponse.json({ ok: true, removed: 0 });
      const { error } = await supabaseAdmin.from("full_catalog").delete().in("id", ids);
      if (error) return bad(error.message, 500);
      return NextResponse.json({ ok: true, removed: ids.length });
    }

    if (b.action === "finish") {
      const expected = Number(b.total);
      const { count, error } = await supabaseAdmin.from("full_catalog").select("id", { count: "exact", head: true });
      if (error) return bad(missing(error), 500);
      if (count !== expected) return bad(`The catalog holds ${count} rows but the file had ${expected} — not stamped as done. Upload again (only the differences are sent).`);
      const counts = b.counts && typeof b.counts === "object" ? b.counts : null;
      const { error: mErr } = await supabaseAdmin.from("full_catalog_meta").upsert({
        id: 1, row_count: count, file_name: String(b.fileName || "").slice(0, 200), uploaded_by: caller.name || caller.email || null, finished_at: new Date().toISOString(), counts,
      }, { onConflict: "id" });
      if (mErr) return bad(mErr.message, 500);
      return NextResponse.json({ ok: true, rows: count });
    }

    return bad("Unknown action.");
  } catch (e) {
    return bad(e.message, 500);
  }
}
