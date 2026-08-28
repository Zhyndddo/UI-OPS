import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// Round 230 (Performance share link) / Round 231 (Package/Media Report
// magic link) — "crawl the [cover] image into the magic link", using
// releases.link_share (a Labelmaster share page URL, confirmed during an
// earlier conversation to carry real OpenGraph tags — og:image included)
// as the source. Called from both public, no-login pages —
// app/performance-report/[token]/page.js and
// app/pick-package/[token]/page.js — so this route is deliberately public
// too, but NOT a general-purpose URL fetcher: it only ever fetches a
// `url` that matches an existing releases.link_share value on file,
// checked against the database first. Without that check, this would be
// an open server-side-request-forgery proxy (anyone could make our
// server fetch any URL they want); requiring a match against our own
// stored data means it can only ever be pointed at share links this app
// itself already trusts and displays elsewhere.
//
// No new column, no write path, no "crawl on save" hook — the image is
// fetched fresh (with an hour of edge/fetch caching) each time the magic
// link is opened, which is simpler than wiring a crawl into every place
// link_share can be edited (New Release Setup's inline table, the release
// detail page's URL tab) and self-heals if Labelmaster's own image ever
// changes.

const FETCH_TIMEOUT_MS = 6000;

function extractOgImage(html) {
  // Order matters: prefer og:image, then twitter:image, whichever meta
  // tag order the page happens to use (content= can come before or after
  // property=/name=).
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export async function GET(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }

  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url param." }, { status: 400 });

  let parsed;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("bad protocol");
  } catch {
    return NextResponse.json({ error: "Invalid url." }, { status: 400 });
  }

  // Only crawl a URL that's a real, already-stored link_share value —
  // see the module comment above for why.
  const { data: match } = await supabaseAdmin.from("releases").select("id").eq("link_share", url).limit(1).maybeSingle();
  if (!match) {
    return NextResponse.json({ error: "url is not a known release link_share." }, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; VieentPerformanceReportBot/1.0)" },
      next: { revalidate: 3600 },
    });
    clearTimeout(timer);
    if (!res.ok) return NextResponse.json({ image: null });
    const html = await res.text();
    const image = extractOgImage(html);
    return NextResponse.json({ image: image || null }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch {
    return NextResponse.json({ image: null });
  }
}
