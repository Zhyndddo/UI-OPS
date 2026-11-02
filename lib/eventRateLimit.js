// Round 574 — small in-memory brake for the public event routes (no database; per server instance, so a brake, not a vault).
const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000;
export function countHits(key) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, a] of hits) if (!a.length || now - a[a.length - 1] > WINDOW_MS) hits.delete(k);
  return arr.length;
}
export function addHit(key) { countHits(key); hits.get(key).push(Date.now()); }
export const clientIp = (request) => (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
