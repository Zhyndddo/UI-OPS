// Round 639 — email code (2-step) + evidence record for the public rights form (server only).
// No database table: the code is an HMAC of (email, expiry, nonce) inside a signed "challenge"; after the code is checked the server
// signs an "audit token" (who/when/where + hash of the form) that the final submit must carry. Secret = RIGHTS_FORM_SECRET (falls back like rightsToken.js).
import { createHmac, createHash, timingSafeEqual, randomBytes } from "crypto";
const secret = () => process.env.RIGHTS_FORM_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const mac = (s) => createHmac("sha256", secret()).update(s).digest();
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export function stableJson(v) {
  if (Array.isArray(v)) return "[" + v.map(stableJson).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stableJson(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
export const formHash = (d) => createHash("sha256").update(stableJson(d)).digest("hex");
export const sha256Hex = (buf) => createHash("sha256").update(buf).digest("hex");

export function sign(payload, kind) {
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return p + "." + mac(kind + "|" + p).toString("base64url");
}
export function unsign(token, kind) {
  const [p, s] = String(token || "").split(".");
  if (!p || !s || !secret() || !eq(s, mac(kind + "|" + p).toString("base64url"))) return null;
  try { return JSON.parse(Buffer.from(p, "base64url").toString()); } catch (e) { return null; }
}

const codeFor = (email, exp, n) => String(mac(`otp|${email}|${exp}|${n}`).readUInt32BE(0) % 1000000).padStart(6, "0");
export function newChallenge(email) {
  const exp = Date.now() + 10 * 60 * 1000, n = randomBytes(6).toString("hex");
  return { challenge: sign({ e: email, x: exp, n }, "otp"), code: codeFor(email, exp, n) };
}
export function readChallenge(challenge) { const c = unsign(challenge, "otp"); return c && c.x > Date.now() ? c : null; }
export const codeMatches = (c, email, code) => c.e === email && eq(String(code || "").trim(), codeFor(c.e, c.x, c.n));

export function describeUa(ua) {
  const s = String(ua || "");
  const os = /iPhone|iPad|iPod/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows" : /Mac OS X|Macintosh/.test(s) ? "macOS" : /CrOS/.test(s) ? "ChromeOS" : /Linux/.test(s) ? "Linux" : "?";
  const browser = /Edg\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /Firefox\//.test(s) ? "Firefox" : /CocoaCoreAutomation|Zalo/.test(s) ? "Zalo" : /Chrome\/|CriOS/.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "?";
  return { os, browser, device: /Mobi|iPhone|Android.*Mobile/.test(s) ? "Mobile" : /iPad|Tablet/.test(s) ? "Tablet" : "Desktop" };
}

// Evidence about the request itself (IP, device, approximate place) — used for the declarer AND the right holder.
export function requestEvidence(request, ip, client) {
  const h = (k) => request.headers.get(k) || "";
  const dec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  const t = (x, n) => String(x == null ? "" : x).slice(0, n);
  const cl = client && typeof client === "object" ? client : {};
  const ua = h("user-agent").slice(0, 300);
  return {
    ip, ua, ...describeUa(ua),
    country: t(h("x-vercel-ip-country"), 8), region: t(h("x-vercel-ip-country-region"), 20), city: t(dec(h("x-vercel-ip-city")), 60),
    lat: t(h("x-vercel-ip-latitude"), 12), lon: t(h("x-vercel-ip-longitude"), 12),
    client: { tz: t(cl.tz, 60), lang: t(cl.lang, 20), screen: t(cl.screen, 20), platform: t(cl.platform, 40) },
  };
}
