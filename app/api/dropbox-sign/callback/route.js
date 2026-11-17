// Round 638 — Dropbox Sign callback (set this URL once in Dropbox Sign -> API settings: https://<site>/api/dropbox-sign/callback).
// Verifies event_hash with the API key, then: all_signed -> sign_status "signed"; downloadable -> signed PDF saved to Google Drive
// (rights-declarations/signed) and its link stored; declined -> "declined". Always answers 200 "Hello API Event Received" for a valid event.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { eventHashOk, downloadSignedPdf } from "../../../../lib/dropboxSign";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const ok = () => new Response("Hello API Event Received", { status: 200, headers: { "Content-Type": "text/plain" } });
const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();

async function readEvent(request) {
  const ct = request.headers.get("content-type") || "";
  try {
    if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
      const fd = await request.formData();
      return JSON.parse(String(fd.get("json") || "{}"));
    }
    return await request.json();
  } catch (e) { return null; }
}

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  const payload = await readEvent(request);
  const event = payload?.event;
  if (!event || !eventHashOk(event)) return NextResponse.json({ error: "bad event" }, { status: 401 });
  const type = event.event_type;
  const reqId = payload?.signature_request?.signature_request_id;
  if (!reqId || type === "callback_test") return ok();

  const { data: row } = await supabaseAdmin.from("rights_declarations").select("id, song_title, sign_status, signed_pdf_url").eq("sign_request_id", reqId).maybeSingle();
  if (!row) return ok();   // not ours / already gone

  if (type === "signature_request_all_signed" && row.sign_status !== "signed") {
    await supabaseAdmin.from("rights_declarations").update({ sign_status: "signed", signed_at: new Date().toISOString() }).eq("id", row.id);
  } else if (type === "signature_request_declined") {
    await supabaseAdmin.from("rights_declarations").update({ sign_status: "declined" }).eq("id", row.id);
  } else if (type === "signature_request_downloadable" && !row.signed_pdf_url) {
    try {
      const pdf = await downloadSignedPdf(reqId);
      const url = clean(process.env.DRIVE_WEBHOOK_URL || process.env.HALLOWEEN_DRIVE_WEBHOOK_URL);
      const secret = clean(process.env.DRIVE_SECRET || process.env.HALLOWEEN_DRIVE_SECRET);
      let link = null;
      if (url && secret && pdf.length > 100 && pdf.length < 4.4 * 1024 * 1024) {
        const ascii = String(row.song_title || "song").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow",
          body: JSON.stringify({ secret, filename: `KhaiBao-DA-KY_${ascii}_${Date.now()}.pdf`, mimeType: "application/pdf", dataBase64: pdf.toString("base64"), subfolder: "rights-declarations/signed" }) });
        const j = await res.json().catch(() => null);
        if (j?.ok && j.url) link = j.url;
      }
      await supabaseAdmin.from("rights_declarations").update({ sign_status: "signed", signed_at: new Date().toISOString(), ...(link ? { signed_pdf_url: link } : {}) }).eq("id", row.id);
    } catch (e) { console.error("[dropbox-sign callback] download failed:", e.message); }
  }
  return ok();
}
