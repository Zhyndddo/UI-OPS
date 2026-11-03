// Google Apps Script v6 — v5 + EVENT CHECK-IN (Round 574): guests register -> QR emailed (Gmail) -> scanned at the door. Guest list = a Google Sheet.
// ORDER MATTERS (new permissions: Gmail send): 1) paste this, keep your SECRET/FOLDER_ID  2) pick `authorizeAll` in the function dropdown, Run, approve  3) Deploy > Manage deployments > pencil > New version.
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
    if (d.action === 'evRegister') return out(evRegister_(d));
    if (d.action === 'evMail') return out(evMail_(d));
    if (d.action === 'evCheckin') return out(evCheckin_(d));
    if (d.action === 'evStats') return out(evStats_());
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


// ============================ EVENT CHECK-IN (Round 574) ============================
// Sheet "Event check-in" (made automatically inside FOLDER_ID). Columns:
// A Registered (Vietnam) | B Name | C Email | D Organisation | E QR token | F Mail | G Checked in | H Mails sent
const EV_NAME = 'Event check-in';
const EV_MAX_MAILS = 5;   // one guest can get their QR emailed at most this many times

function evSheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('EVENT_SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id).getSheets()[0]; } catch (err) { /* deleted: make a new one */ } }
  const ss = SpreadsheetApp.create(EV_NAME);
  const sh = ss.getSheets()[0];
  sh.appendRow(['Registered (Vietnam)', 'Name', 'Email', 'Organisation', 'QR token', 'Mail', 'Checked in', 'Mails sent']);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 8).setFontWeight('bold');
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(FOLDER_ID));
  props.setProperty('EVENT_SHEET_ID', ss.getId());
  return sh;
}
function fmt_(c) { return (c instanceof Date) ? Utilities.formatDate(c, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss') : String(c == null ? '' : c); }
function nowVn_() { return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss'); }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function findRow_(sh, col, value) {   // 1-based row number or 0
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const vals = sh.getRange(2, col, last - 1, 1).getValues();
  const want = String(value).trim().toLowerCase();
  for (let i = 0; i < vals.length; i++) if (String(vals[i][0]).trim().toLowerCase() === want) return i + 2;
  return 0;
}

// Registers a guest (or recognises the same email again and hands back the ORIGINAL token). Does not send mail.
function evRegister_(d) {
  const email = String(d.email || '').trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email) || !d.token) return { ok: false, error: 'bad data' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = evSheet_();
    const row = findRow_(sh, 3, email);
    if (row) return { ok: true, again: true, token: String(sh.getRange(row, 5).getValue()) };
    sh.appendRow([nowVn_(), safeCell_(d.name), safeCell_(email), safeCell_(d.org), String(d.token), 'pending', '', 0]);
    return { ok: true, again: false, token: String(d.token) };
  } finally { lock.releaseLock(); }
}

// Emails the QR for an existing token (looked up in the sheet, so the address cannot be changed by the caller).
function evMail_(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = evSheet_();
    const row = findRow_(sh, 5, d.token);
    if (!row) return { ok: false, error: 'unknown token' };
    const r = sh.getRange(row, 1, 1, 8).getValues()[0];
    const sent = Number(r[7]) || 0;
    if (sent >= EV_MAX_MAILS) return { ok: false, error: 'resend limit' };
    if (MailApp.getRemainingDailyQuota() < 1) { sh.getRange(row, 6).setValue('quota - not sent'); return { ok: false, error: 'mail quota' }; }
    const ev = d.event || {};
    const png = Utilities.newBlob(Utilities.base64Decode(d.qrBase64), 'image/png', 'ma-qr.png');
    const html =
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#222;max-width:520px">' +
      '<p>Kính gửi <b>' + esc_(r[1]) + '</b>,</p>' +
      '<p>Cảm ơn Quý khách đã đăng ký tham dự:</p>' +
      '<p style="font-size:17px;color:#1b4286"><b>' + esc_(ev.title) + '</b></p>' +
      '<p>🕘 ' + esc_(ev.when) + '<br>📍 ' + esc_(ev.where) + '</p>' +
      '<p style="text-align:center"><img src="cid:qr" alt="Mã QR" width="240" height="240" style="border:1px solid #ccc;padding:8px;background:#fff"></p>' +
      '<p>' + esc_(ev.note) + '</p>' +
      '<p style="color:#666;font-size:13px">Mã QR dành riêng cho Quý khách, vui lòng không chia sẻ. Ảnh mã QR cũng được đính kèm trong email này.<br>— ' + esc_(ev.host) + '</p></div>';
    MailApp.sendEmail({
      to: String(r[2]), subject: 'Mã QR tham dự – ' + String(ev.title || 'Sự kiện'), htmlBody: html,
      body: 'Mã QR tham dự của Quý khách được đính kèm. ' + String(ev.note || ''),
      inlineImages: { qr: png }, attachments: [png], name: String(ev.host || 'Ban tổ chức')
    });
    sh.getRange(row, 6).setValue('sent ' + nowVn_());
    sh.getRange(row, 8).setValue(sent + 1);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'mail failed: ' + err };
  } finally { lock.releaseLock(); }
}

// Door scan: first scan marks the guest in, later scans say "already".
function evCheckin_(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = evSheet_();
    const row = findRow_(sh, 5, d.token);
    const stats = evCounts_(sh);
    if (!row) return { ok: true, status: 'unknown', total: stats.total, checked: stats.checked };
    const r = sh.getRange(row, 1, 1, 8).getValues()[0];
    if (String(r[6]) !== '') return { ok: true, status: 'already', name: String(r[1]), org: String(r[3]), at: fmt_(r[6]), total: stats.total, checked: stats.checked };
    const at = nowVn_();
    sh.getRange(row, 7).setValue(at);
    return { ok: true, status: 'ok', name: String(r[1]), org: String(r[3]), at: at, total: stats.total, checked: stats.checked + 1 };
  } finally { lock.releaseLock(); }
}
function evCounts_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return { total: 0, checked: 0 };
  const g = sh.getRange(2, 7, last - 1, 1).getValues();
  let c = 0; for (let i = 0; i < g.length; i++) if (String(g[i][0]) !== '') c++;
  return { total: last - 1, checked: c };
}
function evStats_() { const c = evCounts_(evSheet_()); return { ok: true, total: c.total, checked: c.checked }; }

// Run ONCE from the editor after pasting (Run > approve every permission: Sheets, Drive, Gmail send), THEN deploy a New version.
function authorizeAll() {
  MailApp.getRemainingDailyQuota();
  DriveApp.getFolderById(FOLDER_ID);
  LockService.getScriptLock();
  Logger.log('Mail quota left today: ' + MailApp.getRemainingDailyQuota());
  Logger.log('Guest sheet: ' + evSheet_().getParent().getUrl());
}
function showEventSheetUrl() { Logger.log(evSheet_().getParent().getUrl()); }
