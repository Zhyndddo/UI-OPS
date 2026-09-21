// Round 360 — shared between the admin minter (app/short-links/page.js),
// its API route (app/api/short-links/route.js), and the public redirect
// handler (middleware.js, moved there from app/[slug]/route.js in
// Round 395 — see that file's header comment). See sql/pending/add-
// round360-short-links.sql for the table this reads/writes.

// Every existing top-level route this app already serves at "/<name>" —
// a slug matching one of these would either be unreachable (middleware
// checks this list before ever touching the database, so a real route
// always wins) or, worse, would get silently intercepted by middleware
// AHEAD of that real route ever getting a chance to render — so minting
// one is refused outright at mint time. Kept as a plain list (not
// derived from the filesystem — middleware can't read the project's own
// folder structure at runtime in a deployed/serverless build) mirroring
// the current top-level app/ folders; add to this list if a new
// top-level route is ever added.
export const RESERVED_SLUGS = new Set([
  "api",
  "artists",
  "booking",
  "booking-channels",
  "calendar",
  "channels",
  "config",
  "labels",
  "login",
  "new-release",
  "package-categories",
  "package-runner",
  "performance-report",
  "pick-package",
  "reference",
  "releases",
  "report",
  "reset-password",
  "secret-messages",
  "set-password",
  "short-links",
  "summary",
  "task-table",
  "team-building-survey",
  "tickets",
  "tool-directory",
  "tools",
  "tro-gia-booking",
  "workstation",
  // generic reserved words worth blocking even though nothing here uses
  // them yet — avoids a future route silently becoming unreachable the
  // same way, and avoids anything that reads as a system path.
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "_next",
  "static",
  "admin",
]);

// Lowercases + trims, per the table comment's reasoning: the URL path is
// case-insensitive in practice, so the slug is normalized before every
// write and lookup to keep "VSounder" and "vsounder" from ever being
// treated as two different links.
export function normalizeSlug(raw) {
  return (raw || "").trim().toLowerCase();
}

// Letters, numbers, and hyphens only, 2-64 chars, no leading/trailing
// hyphen — a normal-looking URL path segment, not something that reads
// as broken or suspicious when someone sees it in a share preview.
const SLUG_FORMAT = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

// Round 362 — split out of validateSlugFormat below so
// app/booking-channels/page.js's custom-vanity-token field (a DIFFERENT
// namespace — /channels/<token>, not a root-level /<slug>) can reuse the
// same character rules without also reusing RESERVED_SLUGS, which only
// lists THIS app's top-level routes and has nothing to do with what's
// already a valid token under /channels/.
export function isValidSlugFormat(slug) {
  return Boolean(slug) && SLUG_FORMAT.test(slug);
}

// Returns an error string, or null if the slug is fine to mint (format +
// not reserved — NOT a uniqueness check, that still has to hit the DB;
// see app/api/short-links/route.js).
export function validateSlugFormat(slug) {
  if (!slug) return "Slug can't be blank.";
  if (!SLUG_FORMAT.test(slug)) {
    return "Slug can only use lowercase letters, numbers, and hyphens (no leading/trailing hyphen), 2-64 characters.";
  }
  if (RESERVED_SLUGS.has(slug)) {
    return `"${slug}" is already one of this app's own pages — pick a different slug.`;
  }
  return null;
}

// Round 361 — "compromise" on "will the address bar show /vsounder or
// the real URL": every hostname this SAME Next.js app is actually served
// from. A destination on one of these isn't a foreign site being
// proxied — it's a page this app renders directly — so the slug handler
// can REWRITE to it (browser keeps showing /vsounder, no redirect)
// instead of bouncing the visitor away. A destination on any other
// hostname still gets a normal redirect — see middleware.js's own
// comment for why proxying someone else's site isn't a good idea.
//
// Round 395 — was app/[slug]/route.js (a Route Handler) doing the
// rewrite; moved to root middleware.js. See that file's header comment
// for why: NextResponse.rewrite() is flatly unsupported from a Route
// Handler ("this is not currently supported" — confirmed straight from
// the production Vercel function logs, not a theory) and always 500s,
// regardless of destination. Round 394's "exclude /pick-package/ from
// rewriting" workaround is reverted now that the real fix (middleware)
// is in — every internal destination, pick-package included, rewrites
// again.
export const INTERNAL_HOSTNAMES = new Set(["internal.vieent.com", "ui-ops.vercel.app"]);

// A destination can only be rewritten (URL stays masked as /<slug>) when
// it's (a) on one of this app's own hostnames, AND (b) has no #fragment
// — a fragment never reaches the server on any request, rewritten or
// not, so the only way a link that needs to auto-scroll to a section
// (like ...#sheet-preview) can actually do that is if the browser's own
// address bar ends up holding that real URL, which means it has to be a
// real redirect, not a rewrite.
export function canRewriteToDestination(destinationUrl) {
  try {
    const u = new URL(destinationUrl);
    return INTERNAL_HOSTNAMES.has(u.hostname) && !u.hash;
  } catch {
    return false;
  }
}
