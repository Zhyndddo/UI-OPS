// Round 706 — browser -> Google Drive resumable upload engine (used by the khai-bao form's "Tải lên" buttons).
// The server only opens the Drive session and checks the result; the bytes go straight from the browser to Google in 8 MB pieces.
//  - after a failed piece it ASKS Drive how far it got and continues from there (no blind re-send), with growing waits and a wait for "online"
//  - resume(): the same file can be continued after a refresh / sleeping phone (the session address is kept by the caller)
//  - cancel: abort signal; cancelSession() tells Drive to drop the session
//  - the last piece going wrong is reported as `maybeDone` so the caller can still ask the server whether the file is complete
const CH = 8 * 1024 * 1024;   // multiple of 256 KiB
const MAX_FAILS = 8;          // consecutive failures without progress
const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  if (signal) signal.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("Đã huỷ"), { name: "AbortError" })); }, { once: true });
});
const waitOnline = (signal) => new Promise((res, rej) => {
  if (typeof navigator === "undefined" || navigator.onLine !== false) return res();
  const on = () => { window.removeEventListener("online", on); res(); };
  window.addEventListener("online", on);
  if (signal) signal.addEventListener("abort", () => { window.removeEventListener("online", on); rej(Object.assign(new Error("Đã huỷ"), { name: "AbortError" })); }, { once: true });
});
const rangeEnd = (res) => { const m = String(res.headers.get("Range") || "").match(/bytes=0-(\d+)/); return m ? Number(m[1]) : null; };
const jsonId = async (res) => { try { return (await res.json()).id || null; } catch { return null; } };

// Ask Drive where the upload stands. -> { done, id } | { done:false, next } (next = null when the browser cannot read Drive's Range header) | { expired } | null (could not ask)
export async function sessionStatus(uploadUrl, size, signal) {
  try {
    const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes */${size}` }, signal });
    if (res.status === 200 || res.status === 201) return { done: true, id: await jsonId(res) };
    if (res.status === 308) { const e = rangeEnd(res); return { done: false, next: e == null ? 0 : e + 1, known: true }; }   // no Range header = nothing stored yet
    if (res.status === 404 || res.status === 410) return { expired: true };
    return null;
  } catch (e) { if (e.name === "AbortError") throw e; return null; }
}

export async function cancelSession(uploadUrl) {
  try { await fetch(uploadUrl, { method: "DELETE", keepalive: true }); } catch { /* best effort */ }
}

// -> { id } (id may be null if the browser could not read Drive's reply: ask the server by file name). Throws Error with .code = "expired" | "cors" | "failed", .maybeDone, or AbortError.
export async function resumableUpload({ file, uploadUrl, startAt = 0, signal, onProgress }) {
  const size = file.size;
  let start = startAt, id = null, fails = 0, firstTry = startAt === 0;
  const fail = (code, msg, extra = {}) => Object.assign(new Error(msg), { code, ...extra });
  while (start < size) {
    if (signal?.aborted) throw Object.assign(new Error("Đã huỷ"), { name: "AbortError" });
    const end = Math.min(start + CH, size);
    try {
      const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes ${start}-${end - 1}/${size}` }, body: file.slice(start, end), signal });
      if (res.status === 200 || res.status === 201) { id = await jsonId(res); start = size; fails = 0; }
      else if (res.status === 308) { const e = rangeEnd(res); const next = e == null ? end : e + 1; if (next > start) fails = 0; start = Math.min(next, size); }
      else if (res.status === 404 || res.status === 410) throw fail("expired", "Phiên tải lên đã hết hạn.");
      else throw fail("failed", `Google trả lỗi HTTP ${res.status}`);
      firstTry = false;
      onProgress?.(Math.min(1, start / size));
    } catch (err) {
      if (err.name === "AbortError" || err.code === "expired") throw err;
      fails += 1;
      if (fails >= MAX_FAILS) throw fail(firstTry && err instanceof TypeError ? "cors" : "failed", err.message || "Mất kết nối", { maybeDone: size - start <= CH });
      await waitOnline(signal);
      await sleep(Math.min(1000 * 2 ** (fails - 1), 15000), signal);
      const st = await sessionStatus(uploadUrl, size, signal);   // continue from what Drive really has
      if (st?.expired) throw fail("expired", "Phiên tải lên đã hết hạn.");
      if (st?.done) { id = st.id; start = size; onProgress?.(1); }
      else if (st && st.next != null) { start = Math.min(st.next, size); onProgress?.(start / size); }
      else if (firstTry && fails >= 3 && err instanceof TypeError) throw fail("cors", "Trình duyệt không gửi trực tiếp được lên Drive.");
    }
  }
  return { id };
}
