// Round 576 — Ma Sói (Werewolf) game API. One POST route; every action calls a database function (sql/pending/add-round576-ma-soi.sql)
// with the CALLER'S profile id taken from the login token, so nobody can act as somebody else. The game tables are never read from the browser.
import { NextResponse } from "next/server";
import { getCallerProfile, supabaseAdmin } from "../../../lib/supabaseAdmin";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const ACT_KINDS = new Set(["wolf_vote", "wolf_confirm", "seer", "guard", "witch", "vote", "hunter"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const caller = await getCallerProfile(request);
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: noStore });
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500, headers: noStore });
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const p = caller.id;
  let fn, args;
  switch (body.action) {
    case "state": fn = "ms_state"; args = { p_profile: p }; break;
    case "join": fn = "ms_join"; args = { p_profile: p }; break;
    case "leave": fn = "ms_leave"; args = { p_profile: p }; break;
    case "resume": fn = "ms_resume"; args = { p_profile: p }; break;
    case "create": fn = "ms_create"; args = { p_profile: p, p_auto: Math.max(0, Math.min(16, parseInt(body.auto, 10) || 0)) }; break;
    case "start": fn = "ms_start"; args = { p_profile: p, p_force: true }; break;
    case "cancel": fn = "ms_cancel"; args = { p_profile: p }; break;
    case "act": {
      if (!ACT_KINDS.has(body.kind)) return NextResponse.json({ error: "Hành động không hợp lệ." }, { status: 400, headers: noStore });
      const target = body.target ? String(body.target) : null;
      if (target && !UUID.test(target)) return NextResponse.json({ error: "Mục tiêu không hợp lệ." }, { status: 400, headers: noStore });
      const data = {};
      if (body.data?.heal === true) data.heal = true;
      if (body.data?.poison === true) data.poison = true;
      fn = "ms_act"; args = { p_profile: p, p_kind: body.kind, p_target: target, p_data: data };
      break;
    }
    default: return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore });
  }
  const { data, error } = await supabaseAdmin.rpc(fn, args);
  if (error) {
    const missing = /Could not find the function|does not exist/i.test(error.message || "");
    return NextResponse.json({ error: missing ? "Game tables are missing — run add-round576-ma-soi.sql." : "Lỗi hệ thống, thử lại sau." }, { status: 500, headers: noStore });
  }
  if (data && data.error) return NextResponse.json({ error: data.error }, { status: 400, headers: noStore });
  return NextResponse.json(data || { ok: true }, { headers: noStore });
}
