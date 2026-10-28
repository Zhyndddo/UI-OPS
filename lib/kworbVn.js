// Round 561 — kworb Vietnam Spotify daily-totals crawl (server side; used by the 12-hour cron and the "Refresh now" button).
// Source: https://kworb.net/spotify/country/vn_daily_totals.html  — a plain server-rendered table, one row per track:
//   "Artist - Title" (artist link + track link), Days, T10, Pk (x?), PkStreams, Total.
// We keep a track only if it is ours (matches a release/track + artist we distribute) or SUSPICIOUS (same title but another
// artist, or one of our artists with a title we don't have) — everything else on the chart is ignored and not stored.
// Daily streams = change in Total between two chart dates (the page shows totals, not per-day numbers).
// Not connected to any report. See sql/pending/add-round561-kworb-vn.sql for the tables.
const SOURCE_URL = "https://kworb.net/spotify/country/vn_daily_totals.html";
const USER_AGENT = "VIEENT-internal-chart-check/1.0 (contact: tech-service-group@vieent.com)";

// ── text helpers ────────────────────────────────────────────────────────────────
function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&apos;/g, "'");
}
const stripTags = (s) => decodeEntities(String(s || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const toInt = (s) => { const m = String(s || "").replace(/[^\d]/g, ""); return m ? Number(m) : null; };

// "Đen Vâu" -> "denvau"; keeps letters/digits only
export function normKey(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
// title key: drops (feat. ...), [Remix], etc. so "Song (feat. X)" == "Song"
export function titleKey(s) {
  return normKey(String(s || "").replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/\s[-–]\s.*$/, " "));
}
export function artistKeys(s) {
  const text = String(s || "");
  // "Hạo Thiên (Kim Thiên)" gives both names; text in brackets counts as an alias
  const inner = [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const base = text.replace(/\([^)]*\)/g, " ");
  return [...new Set(
    [base, ...inner].flatMap((t) => t.split(/,|&|\+|\/|;|\bx\b|\bfeat\.?\b|\bft\.?\b|\bwith\b|\bvà\b/i)).map(normKey).filter((k) => k.length >= 3)
  )];
}

// ── parser ───────────────────────────────────────────────────────────────────────
export function parseKworbTotals(html) {
  const dm = String(html).match(/to\s+(\d{4})\/(\d{2})\/(\d{2})/);
  const chartDate = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : null;
  const rows = [];
  for (const chunk of String(html).split(/<tr[\s>]/i).slice(1)) {
    const tds = [...chunk.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length < 4) continue;
    const name = tds[0];
    const tm = name.match(/href="[^"]*track\/([A-Za-z0-9]+)\.html"[^>]*>([\s\S]*?)<\/a>/i);
    if (!tm) continue;
    const artists = [...name.matchAll(/href="[^"]*artist\/([A-Za-z0-9]+)(?:_songs)?\.html"[^>]*>([\s\S]*?)<\/a>/gi)];
    const vals = tds.slice(1).map(stripTags);
    const nums = vals.map(toInt);
    const total = nums[nums.length - 1];
    if (total == null) continue;
    const pxCell = vals.find((v) => /\(?x\s*\d+\)?/i.test(v));
    rows.push({
      track_id: tm[1],
      title: stripTags(tm[2]),
      artist: artists.map((a) => stripTags(a[2])).join(", "),
      artist_id: artists[0] ? artists[0][1] : null,
      days: nums[0],
      t10: nums[1],
      peak: /^\d+$/.test(vals[2] || "") ? Number(vals[2]) : toInt((vals[2] || "").split("(")[0]),
      peak_x: pxCell ? toInt(pxCell.match(/x\s*(\d+)/i)?.[1]) : null,
      peak_streams: nums.length >= 5 ? nums[nums.length - 2] : null,
      total,
    });
  }
  return { chartDate, rows };
}

// ── what we distribute ───────────────────────────────────────────────────────────
async function pageAll(admin, table, columns) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(columns).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadCatalog(admin) {
  const [releases, tracks, artists] = await Promise.all([
    pageAll(admin, "releases", "id, did, title, main_artist, feature_artist"),
    pageAll(admin, "release_tracks", "id, release_id, track_name, main_artist, feature_artist"),
    pageAll(admin, "artists", "id, stage_name"),
  ]);
  const byTitle = new Map();   // titleKey -> [{ release_id, did, title, artistKeys:Set }]
  const relInfo = new Map();
  const add = (key, entry) => { if (key.length < 3) return; if (!byTitle.has(key)) byTitle.set(key, []); byTitle.get(key).push(entry); };
  for (const r of releases) {
    const info = { release_id: r.id, did: r.did, title: r.title, artistKeys: new Set([...artistKeys(r.main_artist), ...artistKeys(r.feature_artist)]) };
    relInfo.set(r.id, info);
    add(titleKey(r.title), info);
  }
  for (const t of tracks) {
    const info = relInfo.get(t.release_id);
    if (!info) continue;
    artistKeys(t.main_artist).concat(artistKeys(t.feature_artist)).forEach((k) => info.artistKeys.add(k));
    add(titleKey(t.track_name), info);
  }
  const ourArtists = new Map();   // artist key -> display name
  const addArtist = (name) => artistKeys(name).forEach((k) => { if (!ourArtists.has(k)) ourArtists.set(k, name); });
  releases.forEach((r) => { addArtist(r.main_artist); addArtist(r.feature_artist); });
  tracks.forEach((t) => { addArtist(t.main_artist); addArtist(t.feature_artist); });
  artists.forEach((a) => addArtist(a.stage_name));
  return { byTitle, ourArtists, counts: { releases: releases.length, tracks: tracks.length, artists: ourArtists.size } };
}

// ours | suspect | other  (+ reason / release link)
export function classify(row, catalog) {
  const tk = titleKey(row.title);
  const rowArtists = artistKeys(row.artist);
  const sameTitle = tk.length >= 3 ? catalog.byTitle.get(tk) || [] : [];
  for (const rel of sameTitle) {
    if (rowArtists.some((k) => rel.artistKeys.has(k))) return { status: "ours", release_id: rel.release_id, did: rel.did, reason: null };
  }
  if (sameTitle.length) {
    const rel = sameTitle[0];
    return { status: "suspect", release_id: rel.release_id, did: rel.did, reason: `Same title as our release "${rel.title}"${rel.did ? ` (${rel.did})` : ""} but a different artist` };
  }
  const hit = rowArtists.find((k) => catalog.ourArtists.has(k));
  if (hit) return { status: "suspect", release_id: null, did: null, reason: `Our artist "${catalog.ourArtists.get(hit)}" — no release or track with this title in our products` };
  return { status: "other", release_id: null, did: null, reason: null };
}

// ── one full run ─────────────────────────────────────────────────────────────────
export async function fetchKworbHtml() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`kworb answered HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

export async function runKworbVnRefresh(admin, htmlOverride) {
  const html = htmlOverride || (await fetchKworbHtml());
  const { chartDate, rows } = parseKworbTotals(html);
  if (rows.length < 20) throw new Error(`Parsed only ${rows.length} rows — kworb's page layout may have changed; nothing was saved.`);
  const date = chartDate || new Date().toISOString().slice(0, 10);
  const catalog = await loadCatalog(admin);

  const { data: existing, error: exErr } = await admin.from("kworb_vn_tracks").select("track_id, status, review");
  if (exErr) throw new Error(`kworb_vn_tracks: ${exErr.message} (has add-round561-kworb-vn.sql been run?)`);
  const known = new Map((existing || []).map((r) => [r.track_id, r]));

  const nowIso = new Date().toISOString();
  const keep = [];
  let ours = 0, suspects = 0, newSuspects = 0;
  for (const r of rows) {
    const c = classify(r, catalog);
    if (c.status === "other") continue;
    if (c.status === "ours") ours++; else { suspects++; if (!known.has(r.track_id)) newSuspects++; }
    keep.push({ r, c });
  }
  if (keep.length) {
    const trackRows = keep.map(({ r, c }) => ({
      track_id: r.track_id, artist: r.artist, title: r.title, artist_id: r.artist_id,
      status: c.status, release_id: c.release_id, did: c.did, reason: c.reason, last_seen: nowIso, in_chart: true,
    }));
    const { error } = await admin.from("kworb_vn_tracks").upsert(trackRows, { onConflict: "track_id" });   // review columns are not in the payload -> kept
    if (error) throw new Error(`save tracks: ${error.message}`);
    const snaps = keep.map(({ r }) => ({ track_id: r.track_id, chart_date: date, taken_at: nowIso, days: r.days, t10: r.t10, peak: r.peak, peak_x: r.peak_x, peak_streams: r.peak_streams, total: r.total }));
    const { error: sErr } = await admin.from("kworb_vn_snapshots").upsert(snaps, { onConflict: "track_id,chart_date" });
    if (sErr) throw new Error(`save snapshots: ${sErr.message}`);
  }
  // tracks we follow that are no longer on the page
  const seen = new Set(keep.map(({ r }) => r.track_id));
  const gone = (existing || []).filter((e) => !seen.has(e.track_id)).map((e) => e.track_id);
  if (gone.length) await admin.from("kworb_vn_tracks").update({ in_chart: false }).in("track_id", gone);
  return { ok: true, chartDate: date, pageRows: rows.length, catalog: catalog.counts, ours, suspects, newSuspects, leftChart: gone.length };
}
