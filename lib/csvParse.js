// Round 577 — streaming CSV reader for the Full catalog upload (track report: ~190 MB, ~116k rows, most of it long download links).
// Reads the file piece by piece (no giant string), keeps only the columns we need, handles quotes / "" / line breaks inside quotes / BOM / CRLF.
import { titleKey } from "./kworbVn";

export const KEY_VERSION = 1;   // bump when titleKey() changes, so every row is rewritten once with new keys

// onHeader(cells) -> array of column indexes to keep (the others are skipped without being stored). onRow(rowArray) gets kept cells only.
export function csvStream(onHeader, onRow) {
  let row = [], cell = "", q = false, qq = false, col = 0, has = false, skipLF = false, first = true, started = false, want = null;
  const keep = () => !want || want[col];
  const endRow = () => {
    if (keep()) row[col] = cell;
    const empty = !has && col === 0;
    const cells = row;
    row = []; cell = ""; col = 0; has = false;
    if (empty) return;
    if (first) { first = false; const idxs = onHeader(cells); want = []; for (const i of idxs) want[i] = true; return; }
    onRow(cells);
  };
  return {
    push(text) {
      let s = text;
      if (!started) { started = true; if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); }
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (skipLF) { skipLF = false; if (c === "\n") continue; }
        if (qq) { qq = false; if (c === '"') { if (keep()) cell += '"'; continue; } q = false; }   // a quote seen inside quotes: doubled = literal quote, otherwise the field closed
        if (q) {
          if (c === '"') qq = true;
          else if (keep()) cell += c;
        } else if (c === '"') { q = true; has = true; }
        else if (c === ",") { if (keep()) row[col] = cell; cell = ""; col++; has = true; }
        else if (c === "\n" || c === "\r") { if (c === "\r") skipLF = true; endRow(); }
        else { has = true; if (keep()) cell += c; }
      }
    },
    end() { if (has || col > 0 || cell !== "") endRow(); },
  };
}

// FNV-1a, two seeds -> 16 hex chars. Only used to tell "this row changed since the last upload".
function hash16(str) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x85ebca6b) >>> 0; }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const dateOnly = (v) => { const m = String(v || "").match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; };
const NEED = ["id", "productTitle", "mainArtist"];
const WANT = { id: "id", order: "order", title: "title", titleVersion: "titleversion", upc: "upccode", isrc: "isrccode", productTitle: "producttitle", productVersion: "producttitleversion", releaseDate: "productreleasedate", label: "label", mainArtist: "mainartist", featuredArtist: "featuredartist" };

// Returns { onHeader, onRow, result } to plug into csvStream. A track whose own Title is empty is the product's single:
// its name is the PRODUCT title (that is how the report writes singles).
export function trackReportReader() {
  let idx = null;
  const rows = [], seen = new Set();
  const stats = { skipped: 0, noArtist: 0, noIsrc: 0, usedProductTitle: 0 };
  return {
    stats, rows,
    onHeader(cells) {
      idx = {};
      const byName = {}; cells.forEach((h, i) => { byName[norm(h)] = i; });
      for (const [k, name] of Object.entries(WANT)) idx[k] = byName[name] == null ? -1 : byName[name];
      for (const k of NEED) if (idx[k] < 0) throw new Error(`Column "${WANT[k]}" not found — is this the track report (ProductTrack_report)?`);
      return Object.values(idx).filter((i) => i >= 0);
    },
    onRow(r) {
      const g = (k) => (idx[k] < 0 ? "" : String(r[idx[k]] ?? "").trim());
      const id = Number(g("id"));
      const own = g("title"), product = g("productTitle");
      const title = own || product;
      if (!Number.isFinite(id) || id <= 0 || !title || seen.has(id)) { stats.skipped++; return; }
      seen.add(id);
      if (!own) stats.usedProductTitle++;
      if (!g("mainArtist")) stats.noArtist++;
      if (!g("isrc")) stats.noIsrc++;
      const o = {
        id, isrc: g("isrc") || null, upc: g("upc") || null, title, track_title: own || null, title_version: g("titleVersion") || null,
        product_title: product || null, product_version: g("productVersion") || null, track_order: Number(g("order")) || null,
        label: g("label") || null, main_artist: g("mainArtist"), featured_artist: g("featuredArtist") || null, release_date: dateOnly(g("releaseDate")),
        title_key: titleKey(title),
      };
      o.row_hash = hash16([KEY_VERSION, o.id, o.isrc, o.upc, o.title, o.track_title, o.title_version, o.product_title, o.product_version, o.track_order, o.label, o.main_artist, o.featured_artist, o.release_date, o.title_key].join("|"));
      rows.push(o);
    },
  };
}

// Reads a File/Blob in pieces. onProgress(bytesRead, total).
export async function readTrackReport(file, onProgress) {
  const reader = trackReportReader();
  const parser = csvStream(reader.onHeader, reader.onRow);
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
  return { rows: reader.rows, ...reader.stats };
}
