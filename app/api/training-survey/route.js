// Round 587 — training survey API. One POST route, actions:
//   open     (signed in)  record that this person opened the form, return their saved answers
//   submit   (signed in)  validate + save answers (one row per person; can be re-submitted to edit)
//   results  (dev, OR anybody holding the secret results key)  everything: who opened / answered + all answers
//   link     (dev)        the current secret results key
//   rotate   (dev)        make a new key (the old results link stops working)
// Tables are never read from the browser (sql/pending/add-round587-training-survey.sql, RLS on, service key only).
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getCallerProfile, supabaseAdmin } from "../../../lib/supabaseAdmin";
import { cleanAnswers } from "../../../lib/trainingSurveyQuestions";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const fail = (error, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

function sameKey(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
const newKey = () => crypto.randomBytes(24).toString("hex");

async function getKey() {
  const { data } = await supabaseAdmin.from("training_survey_config").select("results_key").eq("id", 1).maybeSingle();
  return data?.results_key || null;
}

export async function POST(request) {
  if (!supabaseAdmin) return fail("Server not configured.", 500);
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const caller = await getCallerProfile(request);
  const isDevCaller = caller?.role === "dev";
  const action = body.action;

  if (action === "results") {
    let allowed = isDevCaller;
    if (!allowed && body.key) { const k = await getKey(); allowed = sameKey(k, body.key); }
    if (!allowed) return fail("Không có quyền xem kết quả.", 403);
    const [pr, vw, rs] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, email, role, segment").order("name"),
      supabaseAdmin.from("training_survey_views").select("profile_id, first_opened_at, last_opened_at, opens"),
      supabaseAdmin.from("training_survey_responses").select("profile_id, answers, submitted_at, updated_at"),
    ]);
    if (pr.error || vw.error || rs.error) return fail("Lỗi hệ thống (đã chạy SQL Round 587 chưa?).", 500);
    const views = new Map((vw.data || []).map((v) => [v.profile_id, v]));
    const resp = new Map((rs.data || []).map((r) => [r.profile_id, r]));
    const people = (pr.data || []).map((p) => {
      const v = views.get(p.id), r = resp.get(p.id);
      return {
        id: p.id, name: p.name || (p.email || "").split("@")[0], email: p.email, segment: p.segment || "", role: p.role,
        opened_at: v?.first_opened_at || null, last_opened_at: v?.last_opened_at || null, opens: v?.opens || 0,
        submitted_at: r?.submitted_at || null, updated_at: r?.updated_at || null, answers: r?.answers || null,
      };
    });
    return NextResponse.json({ ok: true, people, via: isDevCaller ? "dev" : "key" }, { headers: noStore });
  }

  if (!caller) return fail("Bạn cần đăng nhập.", 401);

  if (action === "open") {
    const now = new Date().toISOString();
    const { data: v } = await supabaseAdmin.from("training_survey_views").select("opens").eq("profile_id", caller.id).maybeSingle();
    if (v) await supabaseAdmin.from("training_survey_views").update({ opens: (v.opens || 0) + 1, last_opened_at: now }).eq("profile_id", caller.id);
    else await supabaseAdmin.from("training_survey_views").insert({ profile_id: caller.id, first_opened_at: now, last_opened_at: now, opens: 1 });
    const { data: r } = await supabaseAdmin.from("training_survey_responses").select("answers, submitted_at").eq("profile_id", caller.id).maybeSingle();
    return NextResponse.json({ ok: true, answers: r?.answers || null, submitted_at: r?.submitted_at || null, name: caller.name || "" }, { headers: noStore });
  }

  if (action === "submit") {
    const c = cleanAnswers(body.answers);
    if (!c.ok) return fail(c.error);
    const now = new Date().toISOString();
    const { data: ex } = await supabaseAdmin.from("training_survey_responses").select("submitted_at").eq("profile_id", caller.id).maybeSingle();
    const { error } = await supabaseAdmin.from("training_survey_responses").upsert(
      { profile_id: caller.id, answers: c.answers, submitted_at: ex?.submitted_at || now, updated_at: now }, { onConflict: "profile_id" });
    if (error) return fail("Không lưu được, thử lại sau.", 500);
    // sending the form also counts as having opened it
    await supabaseAdmin.from("training_survey_views").upsert({ profile_id: caller.id, last_opened_at: now }, { onConflict: "profile_id", ignoreDuplicates: true });
    return NextResponse.json({ ok: true, edited: !!ex }, { headers: noStore });
  }

  if (action === "link" || action === "rotate") {
    if (!isDevCaller) return fail("Chỉ dev.", 403);
    if (action === "rotate") {
      const key = newKey();
      const { error } = await supabaseAdmin.from("training_survey_config").upsert({ id: 1, results_key: key }, { onConflict: "id" });
      if (error) return fail("Không đổi được khoá.", 500);
      return NextResponse.json({ ok: true, key }, { headers: noStore });
    }
    const key = await getKey();
    if (!key) return fail("Chưa chạy SQL Round 587.", 500);
    return NextResponse.json({ ok: true, key }, { headers: noStore });
  }

  return fail("Unknown action.");
}
