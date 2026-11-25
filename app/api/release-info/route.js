// Round 695 — release-info form API (PUBLIC, per-release signed link, same token as /khai-bao).
//   GET  ?token=...          -> { release:{ title, performer, composer, release_date }, saved: {answers,status}|null }
//   POST { token, answers }  -> cleans + saves one row per release (release_info_forms). DEMO: source "demo".
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { readRightsToken } from "../../../lib/rightsToken";
import { cleanReleaseInfo } from "../../../lib/releaseInfoForm";
import { countHits, addHit, clientIp } from "../../../lib/eventRateLimit";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const bad = (error, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

async function loadRelease(id) {
  const { data } = await supabaseAdmin.from("releases").select("id, title, main_artist, publishing_composer, release_date").eq("id", id).maybeSingle();
  return data || null;
}

export async function GET(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  const ip = clientIp(request);
  if (countHits("ri-get:" + ip) >= 60) return bad("Quá nhiều lượt truy cập. Thử lại sau ít phút.", 429);
  addHit("ri-get:" + ip);
  const id = readRightsToken(new URL(request.url).searchParams.get("token"));
  const rel = id ? await loadRelease(id) : null;
  if (!rel) return bad("not_found", 404);
  let saved = null;
  try {
    const { data } = await supabaseAdmin.from("release_info_forms").select("answers, status").eq("release_id", id).maybeSingle();
    if (data) saved = { answers: data.answers, status: data.status };
  } catch { /* SQL not run yet */ }
  return NextResponse.json({ release: { title: rel.title || "", performer: rel.main_artist || "", composer: rel.publishing_composer || "", release_date: rel.release_date || "" }, saved }, { headers: noStore });
}

export async function POST(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  const ip = clientIp(request);
  if (countHits("ri-post:" + ip) >= 20) return bad("Quá nhiều lần gửi. Thử lại sau ít phút.", 429);
  addHit("ri-post:" + ip);
  let b = null; try { b = await request.json(); } catch { /* below */ }
  const id = readRightsToken(b?.token);
  if (!id || !(await loadRelease(id))) return bad("Link không hợp lệ.", 404);
  const c = cleanReleaseInfo(b?.answers);
  if (!c.ok) return bad(c.error);
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("release_info_forms").upsert({ release_id: id, answers: c.data, status: "submitted", source: "demo", contact_email: c.data.contact_email || null, submitted_at: now, updated_at: now }, { onConflict: "release_id" });
  if (error) return bad(/relation|schema cache|does not exist/i.test(error.message || "") ? "Chưa chạy SQL của Round 695." : "Không lưu được. Vui lòng thử lại.", 500);
  return NextResponse.json({ ok: true, answers: c.data }, { headers: noStore });
}
