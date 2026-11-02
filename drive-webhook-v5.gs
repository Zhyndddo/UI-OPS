// Google Apps Script v5 — v4 (Google Sheet LOG of every Picture render picture) + action 'logList' so the app can show a count and a CSV (Round 573).
// Paste over your current script, KEEP your own SECRET and FOLDER_ID, then Deploy > Manage deployments > pencil > New version.
// Google will ask to approve one extra permission (Google Sheets / spreadsheets) the first time: allow it.
// The log sheet is created automatically the first time a picture is saved (named "Picture render log", inside FOLDER_ID).
// Columns: Time (Vietnam) | Name as typed | Who (staff: email / public page) | File | Drive link
const SECRET = 'KEEP_YOUR_CURRENT_SECRET';
const FOLDER_ID = 'KEEP_YOUR_CURRENT_FOLDER_ID';
const BIG_FILES_FOLDER = 'chat-uploads';   // created inside FOLDER_ID, with one sub-folder per month (YYYY-MM)
const LOG_NAME = 'Picture render log';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false, error: 'forbidden' });
    if (d.action === 'ping') return out({ ok: true, pong: true });
    if (d.action === 'init') return out(initUpload_(d));
    if (d.action === 'finalize') return out(finalizeUpload_(d));
    if (d.action === 'logList') return out(listLog_());
    // one small base64 file (the pumpkin pictures, Picture render). Optional d.subfolder like "picture-render/invitation" (max 3 levels).
    const blob = Utilities.newBlob(Utilities.base64Decode(d.dataBase64), d.mimeType || 'image/png', d.filename);
    let target = DriveApp.getFolderById(FOLDER_ID);
    if (d.subfolder) {
      String(d.subfolder).split('/').slice(0, 3).forEach(function (n) {
        n = String(n).replace(/[^A-Za-z0-9 _-]/g, '').trim();
        if (n) target = child_(target, n);
      });
    }
    const f = target.createFile(blob);
    if (d.logName) { try { logRow_(d, f); } catch (err) { /* the log must never break a save */ } }
    return out({ ok: true, url: f.getUrl(), id: f.getId() });
  } catch (err) { return out({ ok: false, error: String(err) }); }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function child_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function monthFolder_() {
  const root = child_(DriveApp.getFolderById(FOLDER_ID), BIG_FILES_FOLDER);
  return child_(root, Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM'));
}

// ---- Picture render log (Google Sheet) ----
function safeCell_(v) {   // a name starting with = + - @ would be run as a formula; force plain text
  v = String(v == null ? '' : v).slice(0, 200);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
function logSheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PICTURE_LOG_ID');
  if (id) { try { return SpreadsheetApp.openById(id).getSheets()[0]; } catch (err) { /* deleted: make a new one */ } }
  const ss = SpreadsheetApp.create(LOG_NAME);
  const sh = ss.getSheets()[0];
  sh.appendRow(['Time (Vietnam)', 'Name as typed', 'Who', 'File', 'Drive link']);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 5).setFontWeight('bold');
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(FOLDER_ID));
  props.setProperty('PICTURE_LOG_ID', ss.getId());
  return sh;
}
function logRow_(d, file) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    logSheet_().appendRow([
      Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss'),
      safeCell_(d.logName), safeCell_(d.logSource), file.getName(), file.getUrl()
    ]);
  } finally { lock.releaseLock(); }
}
// Read the log back for the app (last 5000 rows). Dates the sheet auto-converted are turned back into text.
function listLog_() {
  const id = PropertiesService.getScriptProperties().getProperty('PICTURE_LOG_ID');
  if (!id) return { ok: true, rows: [], sheetUrl: null };
  const ss = SpreadsheetApp.openById(id);
  const sh = ss.getSheets()[0];
  const last = sh.getLastRow();
  if (last < 2) return { ok: true, rows: [], sheetUrl: ss.getUrl() };
  const from = Math.max(2, last - 4999);
  const vals = sh.getRange(from, 1, last - from + 1, 5).getValues();
  const rows = vals.map(function (r) {
    return r.map(function (c, i) { return (c instanceof Date) ? Utilities.formatDate(c, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss') : String(c == null ? '' : c); });
  }).filter(function (r) { return r[1] !== ''; });
  return { ok: true, rows: rows, sheetUrl: ss.getUrl() };
}
// Run this once from the editor (select it, press Run) to see the log sheet's address in "Execution log".
function showLogUrl() { Logger.log(logSheet_().getParent().getUrl()); }

// Opens a Drive "resumable upload" slot and hands its address back; the browser then sends the file straight to Google.
function initUpload_(d) {
  const folder = monthFolder_();
  const headers = {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
    'X-Upload-Content-Type': d.mimeType || 'application/octet-stream',
    'X-Upload-Content-Length': String(d.size)
  };
  const opts = { method: 'post', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify({ name: d.name, parents: [folder.getId()] }), muteHttpExceptions: true };
  const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true';
  let res;
  if (d.origin) {   // lets the browser upload cross-origin (CORS). If Google Apps Script refuses this header, retry without it.
    try { res = UrlFetchApp.fetch(url, Object.assign({}, opts, { headers: Object.assign({ Origin: d.origin }, headers) })); }
    catch (err) { res = null; }
  }
  if (!res) res = UrlFetchApp.fetch(url, Object.assign({}, opts, { headers: headers }));
  const h = res.getAllHeaders();
  const loc = h['Location'] || h['location'];
  if (res.getResponseCode() !== 200 || !loc) return { ok: false, error: 'init failed ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200) };
  return { ok: true, uploadUrl: loc };
}

function isUnder_(file, rootId) {
  let level = [file];
  for (let depth = 0; depth < 6; depth++) {
    const next = [];
    for (const f of level) {
      const it = f.getParents();
      while (it.hasNext()) { const p = it.next(); if (p.getId() === rootId) return true; next.push(p); }
    }
    if (!next.length) return false;
    level = next;
  }
  return false;
}

// Checks the finished file really is in our folder with the expected size, shares it with the VIEENT domain (link needed), returns links.
function finalizeUpload_(d) {
  let file = null;
  if (d.fileId) { try { file = DriveApp.getFileById(d.fileId); } catch (err) { file = null; } }
  if (!file && d.name) { const it = DriveApp.getFilesByName(d.name); while (it.hasNext()) { const f = it.next(); if (isUnder_(f, FOLDER_ID)) { file = f; break; } } }
  if (!file) return { ok: false, error: 'file not found in Drive' };
  if (!isUnder_(file, FOLDER_ID)) return { ok: false, error: 'file is outside the upload folder' };
  if (d.size && Number(file.getSize()) !== Number(d.size)) return { ok: false, error: 'size mismatch: Drive has ' + file.getSize() + ', expected ' + d.size };
  try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (err) { return { ok: false, error: 'could not share with the domain: ' + err }; }
  const id = file.getId();
  return { ok: true, id: id, name: file.getName(), size: file.getSize(), mimeType: file.getMimeType(), url: file.getUrl(), previewUrl: 'https://drive.google.com/file/d/' + id + '/preview' };
}
