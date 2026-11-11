// Round 600 — PUBLIC role card for the scan-to-see-role QR. The 64-hex token IS the key (unguessable, one per player per game);
// no login, nothing is written. A small per-IP brake against token guessing.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { countHits, addHit, clientIp } from "../../../lib/eventRateLimit";

export const maxDuration = 15;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const TOKEN = /^[0-9a-f]{64}$/;

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500, headers: noStore });
  const ip = clientIp(request);
  if (countHits("role-bad:" + ip) >= 20) return NextResponse.json({ error: "Thử quá nhiều lần, hãy đợi ít phút." }, { status: 429, headers: noStore });
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const t = String(body.t || "").trim().toLowerCase();
  if (!TOKEN.test(t)) { addHit("role-bad:" + ip); return NextResponse.json({ error: "Mã không hợp lệ." }, { status: 400, headers: noStore }); }
  const { data, error } = await supabaseAdmin.rpc("ms_role_by_token", { p_token: t });
  if (error) {
    const missing = /Could not find the function|does not exist/i.test(error.message || "");
    return NextResponse.json({ error: missing ? "Thiếu hàm trên database — hãy chạy file SQL round 600." : "Lỗi hệ thống, thử lại sau." }, { status: 500, headers: noStore });
  }
  if (data && data.error) { addHit("role-bad:" + ip); return NextResponse.json({ error: data.error }, { status: 404, headers: noStore }); }
  return NextResponse.json(data, { headers: noStore });
}
