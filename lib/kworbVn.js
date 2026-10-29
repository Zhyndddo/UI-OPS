// Round 561/563 — kworb Vietnam crawl (server side; used by the daily cron and the "Refresh now" button).
// Three pages, all plain server-rendered tables on kworb.net:
//   totals  https://kworb.net/spotify/country/vn_daily_totals.html — all-time per track: Days, T10, Pk (x?), PkStreams, Total
//   daily   https://kworb.net/spotify/country/vn_daily.html        — today's chart: Pos, Days, Pk (x?), Streams (= REAL daily streams), 7Day, Total
//   youtube https://kworb.net/youtube/trending/vn.html             — trending videos (rank + title + video link, no channel name)
// Spotify rows are kept only if ours (release/track + artist we distribute) or SUSPICIOUS (same title but another artist,
// or one of our artists with a title we don't have). YouTube videos are matched on the video TITLE text the same way.
// Everything else on the pages is ignored and not stored. Not connected to any report.
// Tables: sql/pending/add-round561-kworb-vn.sql (+ add-round563-kworb-sources.sql).
export const KWORB_SOURCES = {
  totals: "https://kworb.net/spotify/country/vn_daily_totals.html",
  daily: "https://kworb.net/spotify/country/vn_daily.html",
  youtube: "https://kworb.net/youtube/trending/vn.html",
};
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

function trackFromNameCell(name) {
  const tm = name.match(/href="[^"]*track\/([A-Za-z0-9]+)\.html"[^>]*>([\s\S]*?)<\/a>/i);
  if (!tm) return null;
  const artists = [...name.matchAll(/href="[^"]*artist\/([A-Za-z0-9]+)(?:_songs)?\.html"[^>]*>([\s\S]*?)<\/a>/gi)];
  return { track_id: tm[1], title: stripTags(tm[2]), artist: artists.map((a) => stripTags(a[2])).join(", "), artist_id: artists[0] ? artists[0][1] : null };
}
const peakOf = (v) => toInt(String(v || "").split("(")[0]);
const peakXOf = (v) => { const m = String(v || "").match(/x\s*(\d+)/i); return m ? Number(m[1]) : null; };

// vn_daily.html: Pos | P+ | Artist and Title | Days | Pk (x?) | Streams | Streams+ | 7Day | 7Day+ | Total
export function parseKworbDaily(html) {
  const dm = String(html).match(/Vietnam\s*-\s*(\d{4})\/(\d{2})\/(\d{2})/) || String(html).match(/(\d{4})\/(\d{2})\/(\d{2})/);
  const chartDate = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : null;
  const rows = [];
  for (const chunk of String(html).split(/<tr[\s>]/i).slice(1)) {
    const tds = [...chunk.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    const ni = tds.findIndex((t) => /track\/[A-Za-z0-9]+\.html/i.test(t));
    if (ni < 0) continue;
    const t = trackFromNameCell(tds[ni]);
    const v = tds.slice(ni + 1).map(stripTags);          // Days, Pk, Streams, Streams+, 7Day, 7Day+, Total
    if (!t || v.length < 7) continue;
    const total = toInt(v[6]);
    if (total == null) continue;
    rows.push({ ...t, pos: toInt(stripTags(tds[0])), days: toInt(v[0]), peak: peakOf(v[1]), peak_x: peakXOf(v[1]), streams: toInt(v[2]), streams_7d: toInt(v[4]), total });
  }
  return { chartDate, rows };
}

// trending/vn.html: rank | change | video link (several tables on the page; list_no = which one)
export function parseKworbYoutube(html) {
  const rows = [];
  const tables = String(html).split(/<table[\s>]/i).slice(1);
  tables.forEach((tbl, ti) => {
    for (const chunk of tbl.split(/<tr[\s>]/i).slice(1)) {
      const tds = [...chunk.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
      if (tds.length < 2) continue;
      const lm = chunk.match(/href="[^"]*(?:youtu\.be\/|watch\?v=)([A-Za-z0-9_-]{11})[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      if (!lm) continue;
      const rank = toInt(stripTags(tds[0]));
      if (rank == null) continue;
      rows.push({ video_id: lm[1], title: stripTags(lm[2]), rank, list_no: ti + 1 });
    }
  });
  return { rows };
}

// A video has no artist field — match the TITLE TEXT against our catalog.
export function classifyVideo(row, catalog) {
  const text = normKey(row.title);
  let titleOnly = null;
  for (const [tk, rels] of catalog.byTitle) {
    if (tk.length < 6 || !text.includes(tk)) continue;
    for (const rel of rels) {
      const hit = [...rel.artistKeys].find((k) => k.length >= 4 && text.includes(k));
      if (hit) return { status: "ours", release_id: rel.release_id, did: rel.did, reason: null };
      if (!titleOnly) titleOnly = rel;
    }
  }
  if (titleOnly) return { status: "suspect", release_id: titleOnly.release_id, did: titleOnly.did, reason: `Title contains our release "${titleOnly.title}"${titleOnly.did ? ` (${titleOnly.did})` : ""} but none of its artists` };
  for (const [k, name] of catalog.ourArtists) {
    if (k.length >= 5 && text.includes(k)) return { status: "suspect", release_id: null, did: null, reason: `Our artist "${name}" is named in the video title — no release with a matching title in our products` };
  }
  return { status: "other", release_id: null, did: null, reason: null };
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
export async function fetchKworbHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`kworb answered HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

async function readSource(name, parse, minRows, htmlOverride) {
  try {
    const html = htmlOverride?.[name] || (await fetchKworbHtml(KWORB_SOURCES[name]));
    const parsed = parse(html);
    if (parsed.rows.length < minRows) return { name, ok: false, error: `Parsed only ${parsed.rows.length} rows — kworb's layout may have changed; nothing saved from this page.` };
    return { name, ok: true, ...parsed };
  } catch (e) { return { name, ok: false, error: e.message }; }
}

const chunked = (arr, n = 400) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
async function upsertAll(admin, table, rows, onConflict, label) {
  for (const part of chunked(rows)) {
    const { error } = await admin.from(table).upsert(part, { onConflict });
    if (error) throw new Error(`save ${label}: ${error.message}`);
  }
}

// Round 565 — rows a person pressed "Dismiss" on. Kept in their own table (kworb_vn_ignored, filled by a trigger when a
// review is set to 'dismissed') so they stay excluded even if the tracks/videos tables are wiped and re-crawled.
// Fail-open: if the table does not exist yet the crawl still runs, nothing is skipped.
async function loadIgnored(admin) {
  const out = { track: new Set(), video: new Set(), ok: true };
  const { data, error } = await admin.from("kworb_vn_ignored").select("kind, ref_id");
  if (error) { out.ok = false; return out; }
  for (const r of data || []) (r.kind === "video" ? out.video : out.track).add(r.ref_id);
  return out;
}

// dry = true -> fetch + parse + classify only, nothing is written (used by "Test parse" to check the layout).
export async function runKworbVnRefresh(admin, opts = {}) {
  const { dry = false, htmlOverride } = opts;
  const [totals, daily, youtube] = await Promise.all([
    readSource("totals", parseKworbTotals, 20, htmlOverride),
    readSource("daily", parseKworbDaily, 20, htmlOverride),
    readSource("youtube", parseKworbYoutube, 10, htmlOverride),
  ]);
  const sources = {};
  for (const r of [totals, daily, youtube]) sources[r.name] = r.ok ? { ok: true, rows: r.rows.length, chartDate: r.chartDate || null } : { ok: false, error: r.error };
  if (![totals, daily, youtube].some((r) => r.ok)) throw new Error(`All three kworb pages failed — ${[totals, daily, youtube].map((r) => `${r.name}: ${r.error}`).join(" | ")}`);

  const catalog = await loadCatalog(admin);
  const ignored = await loadIgnored(admin);
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  const out = { ok: true, dry, sources, catalog: catalog.counts, ignoredList: ignored.ok, skippedDismissed: 0, ours: 0, suspects: 0, newSuspects: 0, leftChart: 0, videos: { ours: 0, suspects: 0, newSuspects: 0 } };

  // ── Spotify (totals + daily share one track table) ──
  const spotifyOk = [totals, daily].filter((r) => r.ok);
  if (spotifyOk.length) {
    const { data: existing, error: exErr } = await admin.from("kworb_vn_tracks").select("track_id, status, review");
    if (exErr) throw new Error(`kworb_vn_tracks: ${exErr.message} (has add-round561-kworb-vn.sql been run?)`);
    const known = new Map((existing || []).map((r) => [r.track_id, r]));
    const merged = new Map();
    for (const src of spotifyOk) for (const r of src.rows) if (!merged.has(r.track_id)) merged.set(r.track_id, r);
    const verdict = new Map();
    for (const r of merged.values()) {
      if (ignored.track.has(r.track_id)) { out.skippedDismissed++; continue; }   // dismissed by a person: never flagged or stored again
      const c = classify(r, catalog);
      if (c.status === "other") continue;
      verdict.set(r.track_id, { r, c });
      if (c.status === "ours") out.ours++; else { out.suspects++; if (!known.has(r.track_id)) out.newSuspects++; }
    }
    if (!dry && verdict.size) {
      const trackRows = [...verdict.values()].map(({ r, c }) => ({
        track_id: r.track_id, artist: r.artist, title: r.title, artist_id: r.artist_id,
        status: c.status, release_id: c.release_id, did: c.did, reason: c.reason, last_seen: nowIso, in_chart: true,
      }));
      await upsertAll(admin, "kworb_vn_tracks", trackRows, "track_id", "tracks");   // review columns are not in the payload -> kept
      if (totals.ok) {
        const date = totals.chartDate || today;
        const snaps = totals.rows.filter((r) => verdict.has(r.track_id)).map((r) => ({ track_id: r.track_id, chart_date: date, taken_at: nowIso, days: r.days, t10: r.t10, peak: r.peak, peak_x: r.peak_x, peak_streams: r.peak_streams, total: r.total }));
        await upsertAll(admin, "kworb_vn_snapshots", snaps, "track_id,chart_date", "totals snapshots");
      }
      if (daily.ok) {
        const date = daily.chartDate || today;
        const snaps = daily.rows.filter((r) => verdict.has(r.track_id)).map((r) => ({ track_id: r.track_id, chart_date: date, taken_at: nowIso, pos: r.pos, streams: r.streams, streams_7d: r.streams_7d, total: r.total }));
        await upsertAll(admin, "kworb_vn_snapshots", snaps, "track_id,chart_date", "daily snapshots");
      }
      // "left the chart" only when BOTH pages were read (otherwise a track only on the other page would look gone)
      if (totals.ok && daily.ok) {
        const gone = (existing || []).filter((e) => !verdict.has(e.track_id) && !ignored.track.has(e.track_id)).map((e) => e.track_id);
        out.leftChart = gone.length;
        if (gone.length) await admin.from("kworb_vn_tracks").update({ in_chart: false }).in("track_id", gone);
      }
    }
    out.chartDate = daily.ok ? daily.chartDate : totals.chartDate;
  }

  // ── YouTube trending ──
  if (youtube.ok) {
    const { data: exV, error: vErr } = await admin.from("kworb_vn_videos").select("video_id");
    if (vErr) throw new Error(`kworb_vn_videos: ${vErr.message} (has add-round563-kworb-sources.sql been run?)`);
    const knownV = new Set((exV || []).map((r) => r.video_id));
    const byId = new Map();
    for (const r of youtube.rows) {
      if (ignored.video.has(r.video_id)) { out.skippedDismissed++; continue; }
      const c = classifyVideo(r, catalog); if (c.status !== "other" && !byId.has(r.video_id)) byId.set(r.video_id, { r, c });
    }
    for (const { c, r } of byId.values()) { if (c.status === "ours") out.videos.ours++; else { out.videos.suspects++; if (!knownV.has(r.video_id)) out.videos.newSuspects++; } }
    if (!dry) {
      if (byId.size) {
        await upsertAll(admin, "kworb_vn_videos", [...byId.values()].map(({ r, c }) => ({ video_id: r.video_id, title: r.title, status: c.status, release_id: c.release_id, did: c.did, reason: c.reason, last_seen: nowIso, in_chart: true })), "video_id", "videos");
        await upsertAll(admin, "kworb_vn_video_snapshots", youtube.rows.filter((r) => byId.has(r.video_id)).map((r) => ({ video_id: r.video_id, seen_on: today, list_no: r.list_no, rank: r.rank, taken_at: nowIso })), "video_id,seen_on,list_no", "video ranks");
      }
      const gone = (exV || []).filter((e) => !byId.has(e.video_id) && !ignored.video.has(e.video_id)).map((e) => e.video_id);
      if (gone.length) await admin.from("kworb_vn_videos").update({ in_chart: false }).in("video_id", gone);
    }
  }

  if (dry) {
    out.preview = {
      totals: totals.ok ? totals.rows.slice(0, 2) : null,
      daily: daily.ok ? daily.rows.slice(0, 2) : null,
      youtube: youtube.ok ? youtube.rows.slice(0, 3) : null,
    };
  }
  return out;
}
