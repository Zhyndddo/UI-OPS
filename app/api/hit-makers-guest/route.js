// Round 620 — PUBLIC door for Hit Makers guests: a code (shown on the host's lobby) + an alias → a private token (stored in the guest's browser).
// No login. Only works while the game is still in the lobby; a per-IP brake slows down code guessing.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { countHits, addHit, clientIp } from "../../../lib/eventRateLimit";

export const maxDuration = 15;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500, headers: noStore });
  const ip = clientIp(request);
  if (countHits("hm-bad:" + ip) >= 12) return NextResponse.json({ error: "Thử quá nhiều lần, hãy đợi ít phút." }, { status: 429, headers: noStore });
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const code = String(body.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) { addHit("hm-bad:" + ip); return NextResponse.json({ error: "Mã gồm 6 ký tự (chữ và số)." }, { status: 400, headers: noStore }); }
  const { data, error } = await supabaseAdmin.rpc("hm_guest_join", { p_code: code, p_name: String(body.name || "").slice(0, 20) });
  if (error) {
    const missing = /Could not find the function|does not exist/i.test(error.message || "");
    console.error("hit-makers guest join failed:", error.code, error.message);
    return NextResponse.json({ error: missing ? "Trò chơi chưa được cài trên database." : "Lỗi hệ thống, thử lại sau." }, { status: 500, headers: noStore });
  }
  if (data && data.error) { addHit("hm-bad:" + ip); return NextResponse.json({ error: data.error }, { status: 400, headers: noStore }); }
  return NextResponse.json(data, { headers: noStore });
}
