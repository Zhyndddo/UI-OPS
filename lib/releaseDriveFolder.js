// Round 693/694 — server-side: builds the Drive folder set for a release (Apps Script action releaseFolder, drive-webhook-v7.gs)
// and writes releases.drive_link ONLY when it is empty. Used by /api/release-drive-folder and by Friday's Upload ask.
// A release WITHOUT a release date is refused (code "no_release_date"): the year/month folders and the DDMMYY in the name need it.
const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();

export async function createReleaseFolder(db, releaseId) {
  const url = clean(process.env.DRIVE_WEBHOOK_URL || process.env.HALLOWEEN_DRIVE_WEBHOOK_URL);
  const secret = clean(process.env.DRIVE_SECRET || process.env.HALLOWEEN_DRIVE_SECRET);
  if (!url || !secret) return { ok: false, code: "not_configured", error: "Drive webhook is not configured." };
  const { data: r, error } = await db.from("releases").select("id, title, main_artist, release_date, single_album_ep, drive_link, cancelled_at").eq("id", releaseId).maybeSingle();
  if (error || !r) return { ok: false, code: "not_found", error: "Release not found." };
  if (String(r.drive_link || "").trim()) return { ok: true, created: false, url: r.drive_link };
  if (r.cancelled_at) return { ok: false, code: "cancelled", error: "Release is cancelled." };
  if (!String(r.title || "").trim()) return { ok: false, code: "no_title", error: "The release has no title yet." };
  const m = String(r.release_date || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { ok: false, code: "no_release_date", error: "Add the release date first — the folder name and the year/month folders need it." };
  const [, yy, mm, dd] = m;
  const kind = !r.single_album_ep || r.single_album_ep === "Single" ? "single" : "epalbum";
  const name = [String(r.main_artist || "").trim(), String(r.title).trim(), `${dd}${mm}${yy.slice(2)}`].filter(Boolean).join(" - ");

  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 45000);
  let j = null;
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret, action: "releaseFolder", kind, year: Number(yy), month: Number(mm), name }), redirect: "follow", signal: ctrl.signal });
    j = await res.json().catch(() => null);
  } catch { /* below */ } finally { clearTimeout(timer); }
  if (!j?.ok || !j.url) return { ok: false, code: "drive", error: j?.error ? `Drive: ${j.error}` : "Drive did not answer (is the Apps Script v7 deployed as a new version?)." };

  const { data: upd } = await db.from("releases").update({ drive_link: j.url }).eq("id", releaseId).or("drive_link.is.null,drive_link.eq.").select("id");
  if (!upd?.length) {   // someone filled it in meanwhile: keep theirs
    const { data: now } = await db.from("releases").select("drive_link").eq("id", releaseId).maybeSingle();
    return { ok: true, created: false, url: now?.drive_link || j.url };
  }
  return { ok: true, created: true, url: j.url };
}
