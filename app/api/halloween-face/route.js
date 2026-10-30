// Round 566 — Halloween "draw the pumpkin face" teaser.
//   GET  -> { day, taken, mine, winner } : is today's single Jollibee combo already taken?
//   POST { png } -> saves the drawing (DB + Google Drive), and hands out the day's prize to the FIRST valid drawing.
// "Valid" is decided in the browser (lib/halloweenFaceCheck.js) — this is an internal fun event, not a security boundary;
// the server still limits size, attempts per day, the event dates, and gives the prize at most once per day.
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../lib/supabaseAdmin";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const OWNER_EMAIL = "an.thien@vieent.vn";           // tests the flow for real but never uses up the day's prize
const EVENT_FROM = "2026-10-30";                    // Vietnam dates, inclusive
const EVENT_TO = "2026-11-01";
const MAX_TRIES_PER_DAY = 5;
const MAX_PNG_CHARS = 200000;

const vnDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const isOwner = (p) => (p?.email || "").trim().toLowerCase() === OWNER_EMAIL;
const inEvent = (day) => day >= EVENT_FROM && day <= EVENT_TO;
const noStore = { "Cache-Control": "no-store" };

export async function GET(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500, headers: noStore });
  const caller = await getCallerProfile(request);
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: noStore });
  const day = vnDay();
  const { data, error } = await supabaseAdmin.from("halloween_daily_prize").select("profile_id, name").eq("day", day).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
  return NextResponse.json({ day, open: inEvent(day) || isOwner(caller), taken: !!data, mine: data?.profile_id === caller.id, winner: data?.name || null }, { headers: noStore });
}

async function sendToDrive({ filename, b64 }) {
  // trim stray spaces / line breaks / quotes pasted into Vercel
  const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();
  const url = clean(process.env.HALLOWEEN_DRIVE_WEBHOOK_URL);
  const secret = clean(process.env.HALLOWEEN_DRIVE_SECRET);
  if (!url || !secret) return { ok: false, error: "Drive webhook not configured" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret, filename, mimeType: "image/png", dataBase64: b64 }), redirect: "follow", signal: ctrl.signal });
    const j = await res.json().catch(() => null);
    if (!j?.ok) return { ok: false, error: j?.error || `HTTP ${res.status}` };
    return { ok: true, url: j.url || null };
  } catch (e) { return { ok: false, error: e.message }; }
  finally { clearTimeout(timer); }
}

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500, headers: noStore });
  const caller = await getCallerProfile(request);
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: noStore });
  const owner = isOwner(caller);
  const day = vnDay();
  if (!inEvent(day) && !owner) return NextResponse.json({ error: "The pumpkin hunt is not open." }, { status: 403, headers: noStore });

  let body = null;
  try { body = await request.json(); } catch { /* below */ }
  const m = String(body?.png || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[1].length > MAX_PNG_CHARS) return NextResponse.json({ error: "Bad drawing." }, { status: 400, headers: noStore });
  const b64 = m[1];
  const name = caller.name || caller.email || "Someone";

  const { count } = await supabaseAdmin.from("halloween_drawings").select("id", { count: "exact", head: true }).eq("day", day).eq("profile_id", caller.id);
  if ((count || 0) >= MAX_TRIES_PER_DAY && !owner) return NextResponse.json({ error: "Enough pumpkins for today — come back tomorrow!" }, { status: 429, headers: noStore });

  // the day's prize: first valid drawing; the owner only practises
  let won = false;
  if (!owner) {
    const { data, error } = await supabaseAdmin.rpc("halloween_claim_prize", { p_day: day, p_profile: caller.id, p_name: name });
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
    won = data === true;
  }

  const { data: row, error: insErr } = await supabaseAdmin.from("halloween_drawings").insert({ day, profile_id: caller.id, name, won, practice: owner, png_b64: b64 }).select("id").single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500, headers: noStore });

  const safe = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "player";
  const drive = await sendToDrive({ filename: `${day}_${won ? "WINNER_" : ""}${owner ? "TEST_" : ""}${safe}_${String(row.id).slice(0, 6)}.png`, b64 });
  if (drive.ok && drive.url) {
    await supabaseAdmin.from("halloween_drawings").update({ drive_url: drive.url }).eq("id", row.id);
    if (won) await supabaseAdmin.from("halloween_daily_prize").update({ drive_url: drive.url }).eq("day", day);
  }

  if (won) {
    try {
      const { data: ownerRow } = await supabaseAdmin.from("profiles").select("id").ilike("email", OWNER_EMAIL).limit(1);
      if (ownerRow?.[0]) {
        await supabaseAdmin.from("notifications").insert({
          profile_id: ownerRow[0].id, type: "halloween_find",
          title: "🍔 " + name + " won today's Jollibee combo",
          body: name + " drew the first valid pumpkin face on " + day + (drive.ok ? ". Drawing saved to Google Drive." : ". (Drive save failed: " + drive.error + ")"),
        });
      }
    } catch { /* best effort */ }
  }
  return NextResponse.json({ won, practice: owner, driveSaved: !!drive.ok, driveError: drive.ok ? null : drive.error }, { headers: noStore });
}
