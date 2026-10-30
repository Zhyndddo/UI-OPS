// Google Apps Script v2 — keeps the old behaviour (small base64 picture upload) and adds big-file upload (Round 568).
// Paste over your current script, KEEP your own SECRET and FOLDER_ID, then Deploy > Manage deployments > pencil > New version.
// Google will ask you to approve one extra permission (connect to an external service) the first time: allow it.
const SECRET = 'KEEP_YOUR_CURRENT_SECRET';
const FOLDER_ID = 'KEEP_YOUR_CURRENT_FOLDER_ID';
const BIG_FILES_FOLDER = 'chat-uploads';   // created inside FOLDER_ID, with one sub-folder per month (YYYY-MM)

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false, error: 'forbidden' });
    if (d.action === 'ping') return out({ ok: true, pong: true });
    if (d.action === 'init') return out(initUpload_(d));
    if (d.action === 'finalize') return out(finalizeUpload_(d));
    // original behaviour: one small base64 file (the pumpkin pictures)
    const blob = Utilities.newBlob(Utilities.base64Decode(d.dataBase64), d.mimeType || 'image/png', d.filename);
    const f = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
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
