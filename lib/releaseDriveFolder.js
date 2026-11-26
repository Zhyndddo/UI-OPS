// Round 693/694/696 — server-side Drive helpers for a release (Apps Script v8, drive-webhook-v8.gs).
//  - resolveReleasePath(db, id): { ok, rel, path:{kind,year,month,name} } from the release row (refused without a release date)
//  - callDrive(payload): POST to the Apps Script
//  - createReleaseFolder(db, id): builds the folder set and writes releases.drive_link ONLY when it is empty
const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();

export async function callDrive(payload, timeoutMs = 45000) {
  const url = clean(process.env.DRIVE_WEBHOOK_URL || process.env.HALLOWEEN_DRIVE_WEBHOOK_URL);
  const secret = clean(process.env.DRIVE_SECRET || process.env.HALLOWEEN_DRIVE_SECRET);
  if (!url || !secret) return { ok: false, error: "Drive webhook is not configured." };
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret, ...payload }), redirect: "follow", signal: ctrl.signal });
    const j = await res.json().catch(() => null);
    return j || { ok: false, error: `Drive answered HTTP ${res.status}` };
  } catch (e) { return { ok: false, error: e.name === "AbortError" ? "Drive did not answer in time." : e.message }; }
  finally { clearTimeout(timer); }
}

export async function resolveReleasePath(db, releaseId) {
  const { data: r, error } = await db.from("releases").select("id, title, main_artist, release_date, single_album_ep, drive_link, cancelled_at").eq("id", releaseId).maybeSingle();
  if (error || !r) return { ok: false, code: "not_found", error: "Release not found." };
  if (r.cancelled_at) return { ok: false, code: "cancelled", error: "Release is cancelled." };
  if (!String(r.title || "").trim()) return { ok: false, code: "no_title", error: "The release has no title yet." };
  const m = String(r.release_date || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { ok: false, code: "no_release_date", error: "Add the release date first — the folder name and the year/month folders need it." };
  const [, yy, mm, dd] = m;
  const kind = !r.single_album_ep || r.single_album_ep === "Single" ? "single" : "epalbum";
  const name = [String(r.main_artist || "").trim(), String(r.title).trim(), `${dd}${mm}${yy.slice(2)}`].filter(Boolean).join(" - ");
  return { ok: true, rel: r, path: { kind, year: Number(yy), month: Number(mm), name } };
}

export async function createReleaseFolder(db, releaseId) {
  const p = await resolveReleasePath(db, releaseId);
  if (!p.ok) return p;
  if (String(p.rel.drive_link || "").trim()) return { ok: true, created: false, url: p.rel.drive_link };
  const j = await callDrive({ action: "releaseFolder", ...p.path });
  if (!j?.ok || !j.url) return { ok: false, code: "drive", error: j?.error ? `Drive: ${j.error}` : "Drive did not answer (is the Apps Script v8 deployed as a new version?)." };
  const { data: upd } = await db.from("releases").update({ drive_link: j.url }).eq("id", releaseId).or("drive_link.is.null,drive_link.eq.").select("id");
  if (!upd?.length) {   // someone filled it in meanwhile: keep theirs
    const { data: now } = await db.from("releases").select("drive_link").eq("id", releaseId).maybeSingle();
    return { ok: true, created: false, url: now?.drive_link || j.url };
  }
  return { ok: true, created: true, url: j.url };
}

// Round 700 — move the files an artist uploaded to the Drive _INBOX (blank form, song not linked) into the product's Data folder.
export async function moveInboxToRelease(db, releaseId, inboxKey) {
  if (!/^[a-f0-9]{16,40}$/.test(String(inboxKey || ""))) return { ok: false, error: "bad key" };
  const p = await resolveReleasePath(db, releaseId);
  if (!p.ok) return p;
  return callDrive({ action: "inboxMove", ...p.path, inboxKey }, 55000);
}
