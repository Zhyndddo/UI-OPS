// Round 708 — preview picture of the artwork the artist uploaded (their Drive link is staff-only, so the server fetches a small thumbnail through the Apps Script).
//   GET ?token=<signed link>  -> image bytes (private cache 10 min) | 404 when there is no image / Drive is not ready
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { readRightsToken } from "../../../../lib/rightsToken";
import { resolveReleasePath, callDrive } from "../../../../lib/releaseDriveFolder";
import { countHits, addHit, clientIp } from "../../../../lib/eventRateLimit";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const none = (status = 404) => new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request) {
  if (!supabaseAdmin) return none(500);
  const ip = clientIp(request);
  if (countHits("ri-thumb:" + ip) >= 120) return none(429);
  addHit("ri-thumb:" + ip);
  const id = readRightsToken(new URL(request.url).searchParams.get("token"));
  if (!id) return none();
  let url = "";
  try { const { data } = await supabaseAdmin.from("release_info_forms").select("answers").eq("release_id", id).maybeSingle(); url = String(data?.answers?.files?.artwork || ""); } catch { return none(); }
  const fid = (url.match(/\/d\/([A-Za-z0-9_-]{20,})/) || url.match(/[?&]id=([A-Za-z0-9_-]{20,})/) || [])[1];
  if (!fid) return none();
  const p = await resolveReleasePath(supabaseAdmin, id);
  if (!p.ok) return none();
  const j = await callDrive({ action: "releaseThumb", ...p.path, fileId: fid });
  if (!j.ok || !j.b64) return none();
  return new NextResponse(Buffer.from(j.b64, "base64"), { status: 200, headers: { "Content-Type": /^image\/(png|jpe?g|gif|webp)$/.test(j.mimeType) ? j.mimeType : "image/png", "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff" } });
}
