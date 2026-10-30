// Round 566c — OWNER ONLY: send every saved Halloween drawing that has no Google Drive link yet (e.g. the Drive webhook
// was not set up when it was submitted). POST with the owner's Bearer token. Safe to run again: only rows with drive_url null.
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../../lib/supabaseAdmin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const OWNER_EMAIL = "an.thien@vieent.vn";
const noStore = { "Cache-Control": "no-store" };
const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();

async function sendToDrive({ filename, b64 }) {
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
  if ((caller.email || "").trim().toLowerCase() !== OWNER_EMAIL) return NextResponse.json({ error: "Owner only." }, { status: 403, headers: noStore });

  const { data: rows, error } = await supabaseAdmin.from("halloween_drawings")
    .select("id, day, name, won, practice, png_b64").is("drive_url", null).not("png_b64", "is", null).order("created_at", { ascending: true }).limit(40);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });

  const results = [];
  for (const r of rows || []) {
    const safe = (r.name || "player").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "player";
    const drive = await sendToDrive({ filename: `${r.day}_${r.won ? "WINNER_" : ""}${r.practice ? "TEST_" : ""}${safe}_${String(r.id).slice(0, 6)}.png`, b64: r.png_b64 });
    if (drive.ok && drive.url) {
      await supabaseAdmin.from("halloween_drawings").update({ drive_url: drive.url }).eq("id", r.id);
      if (r.won) await supabaseAdmin.from("halloween_daily_prize").update({ drive_url: drive.url }).eq("day", r.day);
    }
    results.push({ id: String(r.id).slice(0, 6), day: r.day, name: r.name, ok: !!drive.ok, error: drive.ok ? null : drive.error });
    if (!drive.ok) break; // same cause for all (setup problem): stop at the first failure
  }
  return NextResponse.json({ found: (rows || []).length, sent: results.filter((x) => x.ok).length, results }, { headers: noStore });
}
