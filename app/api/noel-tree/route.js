// Round 675 — shared Noel tree server side.
//   GET            -> records my December login (bulb) and returns { total, lit, today, people:[{o, w}], me:{ornament, wish} }
//   GET ?wish=<i>  -> the wish of the i-th bulb { body, photo, name|null, mine, canDelete }
//   POST { action: "ornament", kind } | { action: "wish", body, photo, showName } | { action: "delete", index? }
// Bulb order = order in which people first opened the app this year, so index i is stable for everyone. Tables are locked; only this route (service role) touches them.
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../lib/supabaseAdmin";
import { isAdminOrAbove } from "../../../lib/permissions";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const ORNAMENTS = ["bulb", "star", "bell", "candy", "sock", "gift", "snowman"];
const MAX_PHOTO_CHARS = 260000;
const vnDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const bad = (error, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

async function order(year) {
  const { data } = await supabaseAdmin.from("noel_tree_lights").select("profile_id, day, created_at").gte("day", `${year}-01-01`).order("created_at", { ascending: true }).limit(5000);
  const ids = []; const seen = new Set(); let todayN = 0; const today = vnDay();
  for (const r of data || []) { if (!seen.has(r.profile_id)) { seen.add(r.profile_id); ids.push(r.profile_id); } if (String(r.day).slice(0, 10) === today) todayN += 1; }
  return { ids, todayN };
}

async function archiveToDrive(profileId, photo) {
  const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();
  const url = clean(process.env.NOEL_DRIVE_WEBHOOK_URL || process.env.HALLOWEEN_DRIVE_WEBHOOK_URL), secret = clean(process.env.NOEL_DRIVE_SECRET || process.env.HALLOWEEN_DRIVE_SECRET);   // own Noel webhook if set, else the Halloween Apps Script webhook
  const m = String(photo || "").match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!url || !secret || !m) return null;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret, filename: `noel-wish-${profileId}-${Date.now()}.jpg`, mimeType: "image/jpeg", dataBase64: m[1] }), redirect: "follow", signal: ctrl.signal });
    const j = await res.json().catch(() => null);
    return j?.ok ? j.url || null : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

export async function GET(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  const caller = await getCallerProfile(request);
  if (!caller) return bad("Not signed in.", 401);
  const day = vnDay(); const year = Number(day.slice(0, 4));
  const wishIdx = new URL(request.url).searchParams.get("wish");
  if (wishIdx !== null) {
    const { ids } = await order(year);
    const pid = ids[Number(wishIdx)];
    if (!pid) return bad("No such bulb.", 404);
    const { data: w } = await supabaseAdmin.from("noel_wishes").select("body, photo, show_name, name").eq("profile_id", pid).maybeSingle();
    if (!w) return bad("No wish on this bulb.", 404);
    const mine = pid === caller.id;
    return NextResponse.json({ body: w.body, photo: w.photo, name: w.show_name ? w.name : null, mine, canDelete: mine || isAdminOrAbove(caller) }, { headers: noStore });
  }
  if (day.slice(5, 7) === "12") await supabaseAdmin.from("noel_tree_lights").upsert({ profile_id: caller.id, day }, { onConflict: "profile_id,day", ignoreDuplicates: true });
  const { ids, todayN } = await order(year);
  const [{ count }, { data: orn }, { data: wishes }, { data: myWish }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    ids.length ? supabaseAdmin.from("noel_people").select("profile_id, ornament").in("profile_id", ids) : { data: [] },
    ids.length ? supabaseAdmin.from("noel_wishes").select("profile_id").in("profile_id", ids) : { data: [] },
    supabaseAdmin.from("noel_wishes").select("body, photo, show_name").eq("profile_id", caller.id).maybeSingle(),
  ]);
  const o = new Map((orn || []).map((r) => [r.profile_id, r.ornament])); const w = new Set((wishes || []).map((r) => r.profile_id));
  return NextResponse.json({
    total: count || 0, lit: ids.length, today: todayN,
    people: ids.map((id) => ({ o: o.get(id) || "bulb", w: w.has(id) })),
    me: { ornament: o.get(caller.id) || "bulb", wish: myWish ? { body: myWish.body, photo: myWish.photo, showName: !!myWish.show_name } : null },
  }, { headers: noStore });
}

export async function POST(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  const caller = await getCallerProfile(request);
  if (!caller) return bad("Not signed in.", 401);
  let b = null; try { b = await request.json(); } catch { /* below */ }
  if (!b) return bad("Bad request.");
  if (b.action === "ornament") {
    if (!ORNAMENTS.includes(b.kind)) return bad("Unknown ornament.");
    const { error } = await supabaseAdmin.from("noel_people").upsert({ profile_id: caller.id, ornament: b.kind, updated_at: new Date().toISOString() });
    return error ? bad(error.message, 500) : NextResponse.json({ ok: true }, { headers: noStore });
  }
  if (b.action === "wish") {
    const body = String(b.body || "").trim().slice(0, 280);
    if (!body) return bad("Write something first.");
    let photo = b.photo || null;
    if (photo && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > MAX_PHOTO_CHARS)) return bad("Picture is too large or not a JPEG.");
    const driveUrl = photo ? await archiveToDrive(caller.id, photo) : null;
    const { error } = await supabaseAdmin.from("noel_wishes").upsert({ profile_id: caller.id, body, photo, show_name: !!b.showName, name: caller.name || caller.email || "Someone", drive_url: driveUrl, updated_at: new Date().toISOString() });
    return error ? bad(error.message, 500) : NextResponse.json({ ok: true, drive: !!driveUrl }, { headers: noStore });
  }
  if (b.action === "delete") {
    let pid = caller.id;
    if (b.index !== undefined && b.index !== null) {
      const { ids } = await order(Number(vnDay().slice(0, 4)));
      const target = ids[Number(b.index)];
      if (!target) return bad("No such bulb.", 404);
      if (target !== caller.id && !isAdminOrAbove(caller)) return bad("Only the sender or an admin can remove this.", 403);
      pid = target;
    }
    const { error } = await supabaseAdmin.from("noel_wishes").delete().eq("profile_id", pid);
    return error ? bad(error.message, 500) : NextResponse.json({ ok: true }, { headers: noStore });
  }
  return bad("Unknown action.");
}
