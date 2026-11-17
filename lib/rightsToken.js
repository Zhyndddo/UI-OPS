// Round 633 — signed per-release link token (server only). No database column: token = <releaseId>.<hmac>.
import { createHmac, timingSafeEqual } from "crypto";
const secret = () => process.env.RIGHTS_FORM_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sig = (id) => createHmac("sha256", secret()).update("rights:" + id).digest("base64url").slice(0, 22);
export function makeRightsToken(releaseId) { return secret() && UUID.test(releaseId) ? `${releaseId}.${sig(releaseId)}` : ""; }
export function readRightsToken(token) {
  const [id, s] = String(token || "").split(".");
  if (!secret() || !id || !s || !UUID.test(id)) return null;
  const a = Buffer.from(s), b = Buffer.from(sig(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}
