// Round 593 — Labelmaster daily report -> release backfill (dev only). Pure logic: read the ProductTrack report, match its rows to the
// app's releases, and work out which EMPTY release fields can be filled. Nothing here writes to the database.
// Matching order per release: UPC -> ISRC -> exact title + main artist (accents / case ignored). A release that matches more than one
// product, or a product that matches more than one release, is skipped and listed ("ambiguous") — never guessed.
import { csvStream } from "./csvParse";

const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "");
const digitsKey = (s) => String(s || "").replace(/\D/g, "").replace(/^0+/, "");
const isrcKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const empty = (v) => v == null || String(v).trim() === "";

// media links are signed, expire after 7 days and are huge — deliberately NOT read (the column indexes are simply not kept)
const WANT = {
  id: "id", order: "order", title: "title", titleVersion: "titleversion", upc: "upccode", isrc: "isrccode", productTitle: "producttitle",
  created: "productcreateddate", releaseDate: "productreleasedate", providers: "deliveryproviders", genre: "primarygenre", genre2: "secondarygenre",
  mainArtist: "mainartist", featured: "featuredartist", composer: "composer", lyricist: "lyricist", publisher: "musicpublisher", producer: "producer",
  mixer: "mixer", remixer: "remixer", cText: "clinetext", cYear: "clineyear", pText: "plinetext", pYear: "plineyear", rightHolder: "rightholder",
  recordRight: "recordproducerright", performerRight: "performerright", authorRight: "authorright", advisory: "metadataparentaladvisory",
  ai: "containsai", lang: "metadataaudiolanguagecode", label: "label",
};
const NEED = ["id", "productTitle", "mainArtist"];

export async function readLabelmasterReport(file, onProgress) {
  const rows = [];
  let idx = null;
  const parser = csvStream(
    (cells) => {
      const byName = {}; cells.forEach((h, i) => { byName[norm(h)] = i; });
      idx = {};
      for (const [k, name] of Object.entries(WANT)) idx[k] = byName[name] == null ? -1 : byName[name];
      for (const k of NEED) if (idx[k] < 0) throw new Error(`Column "${WANT[k]}" not found — is this the Labelmaster ProductTrack report?`);
      return Object.values(idx).filter((i) => i >= 0);
    },
    (r) => {
      const o = {};
      for (const k of Object.keys(WANT)) o[k] = idx[k] < 0 ? "" : String(r[idx[k]] ?? "").trim();
      o.id = Number(o.id); o.order = Number(o.order) || 0;
      if (Number.isFinite(o.id) && o.id > 0) rows.push(o);
    },
  );
  const dec = new TextDecoder("utf-8");
  const stream = file.stream().getReader();
  let done = 0;
  for (;;) {
    const { value, done: fin } = await stream.read();
    if (fin) break;
    parser.push(dec.decode(value, { stream: true }));
    done += value.byteLength;
    if (onProgress) onProgress(done, file.size);
  }
  parser.push(dec.decode());
  parser.end();
  return rows;
}

// A "product" = every report row sharing a UPC (rows without a UPC are their own product, keyed by report id)
export function groupProducts(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = digitsKey(r.upc) || `id:${r.id}`;
    if (!by.has(k)) by.set(k, { key: k, upc: r.upc, rows: [] });
    by.get(k).rows.push(r);
  }
  for (const p of by.values()) p.rows.sort((a, b) => a.order - b.order || a.id - b.id);
  return [...by.values()];
}

export const DEFAULT_OPTS = { rights: true, credits: true };

// releases: rows from the app. Returns { items, ambiguous, unmatched, stats, differs }
export function planBackfill(releases, products, opts = DEFAULT_OPTS) {
  const byUpc = new Map(), byIsrc = new Map(), byTitle = new Map();
  for (const p of products) {
    const u = digitsKey(p.upc); if (u) byUpc.set(u, p);
    for (const r of p.rows) {
      const ik = isrcKey(r.isrc); if (ik) { if (!byIsrc.has(ik)) byIsrc.set(ik, []); byIsrc.get(ik).push(p); }
      const names = new Set([fold(r.title), fold(r.productTitle)].filter(Boolean));
      for (const n of names) { const key = n + "|" + fold(firstArtist(r.mainArtist)); if (!byTitle.has(key)) byTitle.set(key, []); byTitle.get(key).push(p); }
    }
  }
  const uniq = (a) => [...new Set(a)];
  // several products for one ISRC / title+artist (same song re-released): the one with the release's own date wins, if that leaves exactly one
  const byDate = (c, rel) => {
    if (c.length < 2 || !rel.release_date) return c;
    const d = String(rel.release_date).slice(0, 10);
    const hit = c.filter((p) => p.rows.some((r) => (r.releaseDate || "").slice(0, 10) === d));
    return hit.length === 1 ? hit : c;
  };
  const matched = [];   // { rel, product, how }
  const ambiguous = [], unmatched = [];
  for (const rel of releases) {
    let product = null, how = "";
    const u = digitsKey(rel.upc), ik = isrcKey(rel.isrc);
    if (u && byUpc.has(u)) { product = byUpc.get(u); how = "UPC"; }
    else if (ik && byIsrc.has(ik)) {
      const c = byDate(uniq(byIsrc.get(ik)), rel);
      if (c.length === 1) { product = c[0]; how = "ISRC"; } else { ambiguous.push({ rel, why: `ISRC matches ${c.length} products` }); continue; }
    } else {
      const c = byDate(uniq(byTitle.get(fold(rel.title) + "|" + fold(firstArtist(rel.main_artist))) || []), rel);
      if (c.length === 1) { product = c[0]; how = "title + artist"; }
      else if (c.length > 1) { ambiguous.push({ rel, why: `title + artist matches ${c.length} products` }); continue; }
    }
    if (!product) { unmatched.push(rel); continue; }
    matched.push({ rel, product, how });
  }
  // one product must belong to one release only
  const count = new Map(); matched.forEach((m) => count.set(m.product.key, (count.get(m.product.key) || 0) + 1));
  const stats = { releases: releases.length, products: products.length, matched: 0, byUpc: 0, byIsrc: 0, byTitle: 0, ambiguous: 0, unmatched: unmatched.length, epSkippedTracks: 0, fields: {} };
  const items = [], differs = [];
  for (const m of matched) {
    if (count.get(m.product.key) > 1) { ambiguous.push({ rel: m.rel, why: "another release in the app matches the same product" }); continue; }
    stats.matched++;
    if (m.how === "UPC") stats.byUpc++; else if (m.how === "ISRC") stats.byIsrc++; else stats.byTitle++;
    const it = buildItem(m, opts, stats);
    if (it.diffs.length) items.push(it);
    for (const d of it.info) differs.push(d);
  }
  stats.ambiguous = ambiguous.length;
  return { items, ambiguous, unmatched, differs, stats };
}

const firstArtist = (s) => String(s || "").split(/\s*(?:,|&|;| feat\.? | ft\.? )\s*/i)[0];

function pickTrack(rel, product) {
  const isSingle = (rel.single_album_ep || "Single") === "Single";
  if (!isSingle) return { row: product.rows[0], single: false };
  const t = fold(rel.title);
  return { row: product.rows.find((r) => fold(r.title || r.productTitle) === t) || product.rows[0], single: true };
}

function buildItem({ rel, product, how }, opts, stats) {
  const { row, single } = pickTrack(rel, product);
  const fill = {}, diffs = [], info = [];
  const add = (field, oldV, newV) => { fill[field] = newV; diffs.push({ field, old: oldV ?? "", new: newV }); stats.fields[field] = (stats.fields[field] || 0) + 1; };
  const first = product.rows[0];
  if (empty(rel.upc) && !empty(first.upc)) add("upc", rel.upc, first.upc);
  if (single && empty(rel.isrc) && !empty(row.isrc)) { add("isrc", rel.isrc, row.isrc); if (!rel.has_isrc) fill.has_isrc = true; }
  if (empty(rel.genre) && !empty(first.genre)) add("genre", rel.genre, first.genre);
  if (empty(rel.feature_artist) && !empty(first.featured)) add("feature_artist", rel.feature_artist, first.featured);
  if (fill.upc && empty(rel.published_at) && first.created) { fill.published_at = toVnIso(first.created); diffs.push({ field: "published_at", old: "", new: first.created }); stats.fields.published_at = (stats.fields.published_at || 0) + 1; }
  if (!single) stats.epSkippedTracks += product.rows.length;
  if (single && opts.rights) {
    const cc = rel.copyright_checklist || {};
    const want = { master: row.recordRight || row.rightHolder, vocal: row.performerRight, author: row.authorRight };
    const owners = {};
    for (const [k, v] of Object.entries(want)) if (!empty(v) && empty(cc[k]?.owner)) { owners[k] = v; diffs.push({ field: `rights.${k}.owner`, old: "", new: v }); stats.fields[`rights.${k}.owner`] = (stats.fields[`rights.${k}.owner`] || 0) + 1; }
    if (Object.keys(owners).length) fill.owners = owners;
  }
  if (single && opts.credits) {
    const lm = { composer: row.composer, lyricist: row.lyricist, publisher: row.publisher, producer: row.producer, mixer: row.mixer, remixer: row.remixer,
      c_line: [row.cText, row.cYear].filter(Boolean).join(" "), p_line: [row.pText, row.pYear].filter(Boolean).join(" "), advisory: row.advisory, language: row.lang,
      genre2: row.genre2, providers: row.providers, label: row.label, release_date: (row.releaseDate || "").slice(0, 10), lm_track_id: row.id };
    for (const k of Object.keys(lm)) if (empty(lm[k])) delete lm[k];
    const cur = rel.custom_fields?.labelmaster || {};
    const changed = Object.keys(lm).filter((k) => String(cur[k] ?? "") !== String(lm[k]));
    if (changed.length) { fill.lm = lm; diffs.push({ field: "labelmaster snapshot", old: Object.keys(cur).length ? `${Object.keys(cur).length} fields` : "", new: `${changed.length} field(s) updated` }); stats.fields["labelmaster snapshot"] = (stats.fields["labelmaster snapshot"] || 0) + 1; }
  }
  // differences we NEVER write (these fields are never empty in the app) — shown for review only
  if (!empty(first.label) && fold(first.label) !== fold(String(rel.label || "").replace(/^HĐ - /, ""))) info.push({ did: rel.did, title: rel.title, field: "label", app: rel.label, report: first.label });
  const rd = (first.releaseDate || "").slice(0, 10);
  if (rd && rel.release_date && rd !== String(rel.release_date).slice(0, 10)) info.push({ did: rel.did, title: rel.title, field: "release date", app: String(rel.release_date).slice(0, 10), report: rd });
  return { id: rel.id, did: rel.did, title: rel.title, how, fill, diffs, info };
}

// The report writes times without a zone; read as Vietnam time (UTC+7)
function toVnIso(s) { const m = String(s).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/); return m ? `${m[1]}T${m[2]}+07:00` : null; }
