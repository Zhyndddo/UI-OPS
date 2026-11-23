// Round 675 — shared Noel tree server side.
//   GET            -> records my December login (bulb) and returns { total, lit, today, people:[{o, w}], me:{ornament, wish} }
//   GET ?wish=<i>  -> the wishes of the i-th bulb { wishes:[{ id, body, photoUrl, name|null, mine, canDelete }] }   (pictures = signed Storage URLs, never stored in the table)
//   POST { action: "ornament", kind } | { action: "wish", body, photo, showName } | { action: "delete", id } | { action: "reset" } (reset = admin+ only, wipes MY test data)
//   GET ?test=1 (admin+ only) records today's bulb even outside December, so the tree can be tested early.
// Bulb order = order in which people first opened the app this year, so index i is stable for everyone. Tables are locked; only this route (service role) touches them.
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../lib/supabaseAdmin";
import { isAdminOrAbove } from "../../../lib/permissions";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const ORNAMENTS = ["bulb", "star", "bell", "candy", "sock", "gift", "snowman"];
const MAX_PHOTO_CHARS = 260000;
const MAX_WISHES = 10;
const BUCKET = "noel-wishes";
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
    const { data: rows } = await supabaseAdmin.from("noel_wishes").select("id, body, photo_path, show_name, name").eq("profile_id", pid).order("created_at", { ascending: false }).limit(MAX_WISHES);
    const paths = (rows || []).map((r) => r.photo_path).filter(Boolean);
    const signed = paths.length ? (await supabaseAdmin.storage.from(BUCKET).createSignedUrls(paths, 3600)).data || [] : [];
    const url = new Map(signed.map((x) => [x.path, x.signedUrl]));
    const mine = pid === caller.id; const admin = isAdminOrAbove(caller);
    return NextResponse.json({ wishes: (rows || []).map((r) => ({ id: r.id, body: r.body, photoUrl: r.photo_path ? url.get(r.photo_path) || null : null, name: r.show_name ? r.name : null, mine, canDelete: mine || admin })) }, { headers: noStore });
  }
  const test = new URL(request.url).searchParams.get("test") === "1" && isAdminOrAbove(caller);
  if (day.slice(5, 7) === "12" || test) await supabaseAdmin.from("noel_tree_lights").upsert({ profile_id: caller.id, day }, { onConflict: "profile_id,day", ignoreDuplicates: true });
  const { ids, todayN } = await order(year);
  const [{ count }, { data: orn }, { data: wishes }, { data: myWishes }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    ids.length ? supabaseAdmin.from("noel_people").select("profile_id, ornament").in("profile_id", ids) : { data: [] },
    ids.length ? supabaseAdmin.from("noel_wishes").select("profile_id, created_at").in("profile_id", ids).limit(5000) : { data: [] },
    supabaseAdmin.from("noel_wishes").select("id, body, photo_path, show_name").eq("profile_id", caller.id).order("created_at", { ascending: false }).limit(MAX_WISHES),
  ]);
  const o = new Map((orn || []).map((r) => [r.profile_id, r.ornament])); const w = new Set((wishes || []).map((r) => r.profile_id));
  const vnDate = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const t = new Set((wishes || []).filter((r) => vnDate(r.created_at) === day).map((r) => r.profile_id));
  return NextResponse.json({
    total: count || 0, lit: ids.length, today: todayN,
    people: ids.map((id) => ({ o: o.get(id) || "bulb", w: w.has(id), t: t.has(id) })),
    me: { ornament: o.get(caller.id) || "bulb", wishes: (myWishes || []).map((r) => ({ id: r.id, body: r.body, hasPhoto: !!r.photo_path, showName: !!r.show_name })), max: MAX_WISHES, canTest: isAdminOrAbove(caller) },
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
    const { count } = await supabaseAdmin.from("noel_wishes").select("id", { count: "exact", head: true }).eq("profile_id", caller.id);
    if ((count || 0) >= MAX_WISHES) return bad(`Tối đa ${MAX_WISHES} lời chúc mỗi người, hãy xoá bớt một lời chúc cũ nhé.`);
    const photo = b.photo || null;
    if (photo && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > MAX_PHOTO_CHARS)) return bad("Picture is too large or not a JPEG.");
    let photoPath = null, photoSaved = true;
    if (photo) {
      const path = `${caller.id}/${Date.now()}.jpg`;
      const up = await supabaseAdmin.storage.from(BUCKET).upload(path, Buffer.from(photo.split(",")[1], "base64"), { contentType: "image/jpeg", upsert: false });
      if (up.error) photoSaved = false; else photoPath = path;
    }
    const driveUrl = photoPath ? await archiveToDrive(caller.id, photo) : null;
    const { error } = await supabaseAdmin.from("noel_wishes").insert({ profile_id: caller.id, body, photo_path: photoPath, show_name: !!b.showName, name: caller.name || caller.email || "Someone", drive_url: driveUrl });
    return error ? bad(error.message, 500) : NextResponse.json({ ok: true, photoSaved, drive: !!driveUrl }, { headers: noStore });
  }
  if (b.action === "delete") {
    const { data: w } = await supabaseAdmin.from("noel_wishes").select("id, profile_id, photo_path").eq("id", String(b.id || "")).maybeSingle();
    if (!w) return bad("No such wish.", 404);
    if (w.profile_id !== caller.id && !isAdminOrAbove(caller)) return bad("Only the sender or an admin can remove this.", 403);
    if (w.photo_path) await supabaseAdmin.storage.from(BUCKET).remove([w.photo_path]);
    const { error } = await supabaseAdmin.from("noel_wishes").delete().eq("id", w.id);
    return error ? bad(error.message, 500) : NextResponse.json({ ok: true }, { headers: noStore });
  }
  if (b.action === "reset") {
    if (!isAdminOrAbove(caller)) return bad("Admins only.", 403);
    const { data: mine } = await supabaseAdmin.from("noel_wishes").select("photo_path").eq("profile_id", caller.id);
    const paths = (mine || []).map((r) => r.photo_path).filter(Boolean);
    if (paths.length) await supabaseAdmin.storage.from(BUCKET).remove(paths);
    await supabaseAdmin.from("noel_wishes").delete().eq("profile_id", caller.id);
    await supabaseAdmin.from("noel_people").delete().eq("profile_id", caller.id);
    await supabaseAdmin.from("noel_tree_lights").delete().eq("profile_id", caller.id).gte("day", `${vnDay().slice(0, 4)}-01-01`);
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  return bad("Unknown action.");
}
