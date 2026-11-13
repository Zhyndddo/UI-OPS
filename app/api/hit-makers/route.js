// Round 620 — Hit Makers game API (one POST route). Staff are identified by their login token; guests by the private token they got when they joined
// with a code (header x-guest-token). Every action calls a database function (sql/pending/add-round620-hit-makers.sql) with the CALLER'S identity
// taken from the token, so nobody can play for somebody else. The game tables are never read from the browser.
import { NextResponse } from "next/server";
import { getCallerProfile, supabaseAdmin } from "../../../lib/supabaseAdmin";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const ACT_KINDS = new Set(["roll", "buy", "skip", "end", "jail_pay", "jail_card", "upgrade", "sell"]);
const EDIT_KINDS = new Set(["code", "target", "bots", "kick_bots"]);
const STAFF_ONLY = new Set(["create", "join", "edit", "start", "cancel"]);

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500, headers: noStore });
  const caller = await getCallerProfile(request);
  let guest = null;
  if (!caller) {
    const t = (request.headers.get("x-guest-token") || "").trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(t)) { const { data } = await supabaseAdmin.rpc("hm_guest_by_token", { p_token: t }); guest = data || null; }
  }
  if (!caller && !guest) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: noStore });
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  if (STAFF_ONLY.has(body.action) && !caller) return NextResponse.json({ error: "Khách không dùng được chức năng này." }, { status: 403, headers: noStore });
  const p = caller?.id || null;
  const admin = caller?.role === "dev";
  const yr = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
  let fn, args;
  switch (body.action) {
    case "state": fn = "hm_state"; args = { p_profile: p, p_guest: guest }; break;
    case "leave": fn = "hm_leave"; args = { p_profile: p, p_guest: guest }; break;
    case "create": fn = "hm_create"; args = { p_profile: p, p_alias: String(body.alias || "").slice(0, 20), p_target: yr(body.target) }; break;
    case "join": fn = "hm_join"; args = { p_profile: p, p_alias: String(body.alias || "").slice(0, 20) }; break;
    case "edit":
      if (!EDIT_KINDS.has(body.what)) return NextResponse.json({ error: "Không hợp lệ." }, { status: 400, headers: noStore });
      fn = "hm_lobby_edit"; args = { p_profile: p, p_admin: admin, p_what: body.what, p_n: yr(body.n) }; break;
    case "start": fn = "hm_start"; args = { p_profile: p, p_admin: admin }; break;
    case "cancel": fn = "hm_cancel"; args = { p_profile: p, p_admin: admin }; break;
    case "act": {
      if (!ACT_KINDS.has(body.kind)) return NextResponse.json({ error: "Hành động không hợp lệ." }, { status: 400, headers: noStore });
      fn = "hm_act"; args = { p_profile: p, p_guest: guest, p_kind: body.kind, p_arg: yr(body.arg) }; break;
    }
    default: return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore });
  }
  const { data, error } = await supabaseAdmin.rpc(fn, args);
  if (error) {
    const missing = /Could not find the function|does not exist/i.test(error.message || "");
    console.error("hit-makers rpc failed:", fn, error.code, error.message);
    const detail = caller?.role === "dev" ? ` [${fn}: ${String(error.message || "").slice(0, 160)}]` : "";
    return NextResponse.json({ error: (missing ? "Thiếu hàm trên database — hãy chạy file SQL round 620 (Hit Makers)." : "Lỗi hệ thống, thử lại sau.") + detail }, { status: 500, headers: noStore });
  }
  if (data && data.error) return NextResponse.json({ error: data.error }, { status: 400, headers: noStore });
  if (body.action !== "state") {
    const st = await supabaseAdmin.rpc("hm_state", { p_profile: p, p_guest: guest });
    if (!st.error && st.data) return NextResponse.json({ ...(data && typeof data === "object" ? data : { ok: true }), state: st.data }, { headers: noStore });
  }
  return NextResponse.json(data || { ok: true }, { headers: noStore });
}
