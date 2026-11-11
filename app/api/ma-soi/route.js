// Round 576 — Ma Sói (Werewolf) game API. One POST route; every action calls a database function (sql/pending/add-round576-ma-soi.sql)
// with the CALLER'S profile id taken from the login token, so nobody can act as somebody else. The game tables are never read from the browser.
import { NextResponse } from "next/server";
import { getCallerProfile, supabaseAdmin } from "../../../lib/supabaseAdmin";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const ACT_KINDS = new Set(["wolf_vote", "wolf_confirm", "seer", "guard", "witch", "vote", "hunter", "cupid", "wwolf", "silence", "whisper"]);
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
    case "create": fn = "ms_create"; args = { p_profile: p, p_auto: Math.max(0, Math.min(30, parseInt(body.auto, 10) || 0)) }; break;
    case "start": fn = "ms_start"; args = { p_profile: p, p_force: true }; break;
    case "cancel": fn = "ms_cancel"; args = { p_profile: p }; break;
    case "act": {
      if (!ACT_KINDS.has(body.kind)) return NextResponse.json({ error: "Hành động không hợp lệ." }, { status: 400, headers: noStore });
      const target = body.target ? String(body.target) : null;
      if (target && !UUID.test(target)) return NextResponse.json({ error: "Mục tiêu không hợp lệ." }, { status: 400, headers: noStore });
      const data = {};
      if (body.data?.heal === true) data.heal = true;
      if (body.data?.poison === true) data.poison = true;
      if (body.kind === "cupid") {   // Round 589 — second lover
        const second = body.data?.second ? String(body.data.second) : "";
        if (!UUID.test(second)) return NextResponse.json({ error: "Hãy chọn đủ hai người." }, { status: 400, headers: noStore });
        data.second = second;
      }
      if (body.kind === "whisper" && body.data?.second) {   // Round 595 — the flute-player may enchant a second person
        const second = String(body.data.second);
        if (!UUID.test(second)) return NextResponse.json({ error: "Người thứ hai không hợp lệ." }, { status: 400, headers: noStore });
        data.second = second;
      }
      fn = "ms_act"; args = { p_profile: p, p_kind: body.kind, p_target: target, p_data: data };
      break;
    }
    // Round 596 — chat + dev test tools (rules are in sql/pending/add-round596-ma-soi-chat.sql; writing goes only through here)
    case "chat_load": fn = "ms_chat_load"; args = { p_profile: p, p_day: Number.isInteger(body.day) && body.day > 0 ? body.day : null }; break;
    case "chat_list": fn = "ms_chat_list"; args = { p_profile: p, p_room: body.room === "wolf" ? "wolf" : "day", p_day: Number.isInteger(body.day) && body.day > 0 ? body.day : null, p_after: Math.max(0, parseInt(body.after, 10) || 0) }; break;
    case "chat_send": fn = "ms_chat_send"; args = { p_profile: p, p_room: body.room === "wolf" ? "wolf" : "day", p_body: String(body.body || "").slice(0, 600) }; break;
    case "chat_toggle": fn = "ms_chat_toggle"; args = { p_profile: p, p_on: body.on === true }; break;
    case "role_token": fn = "ms_role_token"; args = { p_profile: p }; break;   // Round 600 — private link for the scan-to-see-role QR
    case "bots_add": fn = "ms_add_bots"; args = { p_profile: p, p_n: Math.max(1, Math.min(29, parseInt(body.n, 10) || 1)) }; break;
    case "dev_skip": fn = "ms_dev_skip"; args = { p_profile: p }; break;   // Round 598 — dev: close the current phase now
    case "bots_turn": fn = "ms_bot_turn"; args = { p_profile: p }; break;
    case "bots_chat": fn = "ms_bot_chat"; args = { p_profile: p, p_count: Math.max(1, Math.min(300, parseInt(body.count, 10) || 1)) }; break;
    default: return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore });
  }
  const { data, error } = await supabaseAdmin.rpc(fn, args);
  if (error) {
    const missing = /Could not find the function|does not exist/i.test(error.message || "");
    return NextResponse.json({ error: missing ? "Thiếu hàm trên database — hãy chạy các file SQL Ma Sói mới nhất (round 595 / 596)." : "Lỗi hệ thống, thử lại sau." }, { status: 500, headers: noStore });
  }
  if (data && data.error) return NextResponse.json({ error: data.error }, { status: 400, headers: noStore });
  // Round 584 — after a change, send the fresh game state back in the same reply so the page does not need a second round trip
  // (one fewer login check + database call per click = noticeably snappier).
  if (body.action !== "state" && !String(body.action).startsWith("chat_") && body.action !== "bots_chat" && body.action !== "role_token") {   // chat calls skip the state refetch: they must stay cheap
    const st = await supabaseAdmin.rpc("ms_state", { p_profile: p });
    if (!st.error && st.data && !st.data.error) return NextResponse.json({ ...(data && typeof data === "object" ? data : { ok: true }), state: st.data }, { headers: noStore });
  }
  return NextResponse.json(data || { ok: true }, { headers: noStore });
}
