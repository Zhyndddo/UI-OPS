// _to_delete/t718.jsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// lib/ReleaseInfoSections.js
import { useState, useRef, useEffect } from "react";

// lib/driveResumable.js
var CH = 8 * 1024 * 1024;
var MAX_FAILS = 8;
var sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  if (signal) signal.addEventListener("abort", () => {
    clearTimeout(t);
    rej(Object.assign(new Error("\u0110\xE3 hu\u1EF7"), { name: "AbortError" }));
  }, { once: true });
});
var waitOnline = (signal) => new Promise((res, rej) => {
  if (typeof navigator === "undefined" || navigator.onLine !== false) return res();
  const on = () => {
    window.removeEventListener("online", on);
    res();
  };
  window.addEventListener("online", on);
  if (signal) signal.addEventListener("abort", () => {
    window.removeEventListener("online", on);
    rej(Object.assign(new Error("\u0110\xE3 hu\u1EF7"), { name: "AbortError" }));
  }, { once: true });
});
var rangeEnd = (res) => {
  const m = String(res.headers.get("Range") || "").match(/bytes=0-(\d+)/);
  return m ? Number(m[1]) : null;
};
var jsonId = async (res) => {
  try {
    return (await res.json()).id || null;
  } catch {
    return null;
  }
};
async function sessionStatus(uploadUrl, size, signal) {
  try {
    const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes */${size}` }, signal });
    if (res.status === 200 || res.status === 201) return { done: true, id: await jsonId(res) };
    if (res.status === 308) {
      const e = rangeEnd(res);
      return { done: false, next: e == null ? 0 : e + 1, known: true };
    }
    if (res.status === 404 || res.status === 410) return { expired: true };
    return null;
  } catch (e) {
    if (e.name === "AbortError") throw e;
    return null;
  }
}
async function cancelSession(uploadUrl) {
  try {
    await fetch(uploadUrl, { method: "DELETE", keepalive: true });
  } catch {
  }
}
async function resumableUpload({ file, uploadUrl, startAt = 0, signal, onProgress }) {
  const size = file.size;
  let start = startAt, id = null, fails = 0, firstTry = startAt === 0;
  const fail = (code, msg, extra = {}) => Object.assign(new Error(msg), { code, ...extra });
  while (start < size) {
    if (signal?.aborted) throw Object.assign(new Error("\u0110\xE3 hu\u1EF7"), { name: "AbortError" });
    const end = Math.min(start + CH, size);
    try {
      const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes ${start}-${end - 1}/${size}` }, body: file.slice(start, end), signal });
      if (res.status === 200 || res.status === 201) {
        id = await jsonId(res);
        start = size;
        fails = 0;
      } else if (res.status === 308) {
        const e = rangeEnd(res);
        const next = e == null ? end : e + 1;
        if (next > start) fails = 0;
        start = Math.min(next, size);
      } else if (res.status === 404 || res.status === 410) throw fail("expired", "Phi\xEAn t\u1EA3i l\xEAn \u0111\xE3 h\u1EBFt h\u1EA1n.");
      else throw fail("failed", `Google tr\u1EA3 l\u1ED7i HTTP ${res.status}`);
      firstTry = false;
      onProgress?.(Math.min(1, start / size));
    } catch (err) {
      if (err.name === "AbortError" || err.code === "expired") throw err;
      fails += 1;
      if (fails >= MAX_FAILS) throw fail(firstTry && err instanceof TypeError ? "cors" : "failed", err.message || "M\u1EA5t k\u1EBFt n\u1ED1i", { maybeDone: size - start <= CH });
      await waitOnline(signal);
      await sleep(Math.min(1e3 * 2 ** (fails - 1), 15e3), signal);
      const st = await sessionStatus(uploadUrl, size, signal);
      if (st?.expired) throw fail("expired", "Phi\xEAn t\u1EA3i l\xEAn \u0111\xE3 h\u1EBFt h\u1EA1n.");
      if (st?.done) {
        id = st.id;
        start = size;
        onProgress?.(1);
      } else if (st && st.next != null) {
        start = Math.min(st.next, size);
        onProgress?.(start / size);
      } else if (firstTry && fails >= 3 && err instanceof TypeError) throw fail("cors", "Tr\xECnh duy\u1EC7t kh\xF4ng g\u1EEDi tr\u1EF1c ti\u1EBFp \u0111\u01B0\u1EE3c l\xEAn Drive.");
    }
  }
  return { id };
}

// lib/releaseInfoForm.js
var PROJECT_KINDS = [
  { key: "pitching", label: "Pitching & h\u1ED7 tr\u1EE3 truy\u1EC1n th\xF4ng", sub: "G\u1EEDi tr\u01B0\u1EDBc t\u1ED1i thi\u1EC3u 14 ng\xE0y" },
  { key: "release_only", label: "Ch\u1EC9 ph\xE1t h\xE0nh / ph\xE2n ph\u1ED1i (kh\xF4ng Pitching)", sub: "G\u1EEDi tr\u01B0\u1EDBc t\u1ED1i thi\u1EC3u 04 ng\xE0y l\xE0m vi\u1EC7c" },
  { key: "urgent", label: "D\u1EF1 \xE1n g\u1EA5p (ph\xE1t h\xE0nh trong 24\u201348h)", sub: "TikTok \u2265 24h \xB7 Zing MP3 \u2265 48h (Th\u1EE9 2\u2013Th\u1EE9 5) \xB7 Meta \u2265 04 ng\xE0y" }
];
var FILE_FIELDS = [
  { key: "audio", label: "File audio", hint: "24bit, 48000Hz, WAV" },
  { key: "artwork", label: "File h\xECnh", hint: "3000x3000px" },
  { key: "mv", label: "File MV", hint: "n\u1EBFu c\xF3" },
  { key: "dsp_photo", label: "H\xECnh profile DSP", hint: "n\u1EBFu ngh\u1EC7 s\u0129 mu\u1ED1n c\u1EADp nh\u1EADt h\xECnh profile tr\u01B0\u1EDBc khi ra m\u1EAFt" }
];
var PLATFORMS = [
  { key: "spotify", label: "Spotify" },
  { key: "apple", label: "Apple Music" },
  { key: "zing", label: "Zing MP3" },
  { key: "nct", label: "NCT" },
  { key: "tiktok", label: "TikTok" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" }
];
var REQUIRED_PLATFORMS = ["spotify", "apple"];
var PROMO_FIELDS = [
  { key: "artist_photo", label: "Artist Photo", hint: "b\u1ED9 \u1EA3nh ngh\u1EC7 s\u0129 ch\u1EA5t l\u01B0\u1EE3ng cao" },
  { key: "mv_photo", label: "MV Photo", hint: "\u1EA3nh h\u1EADu tr\u01B0\u1EDDng, stills t\u1EEB MV" },
  { key: "bts", label: "Behind The Scenes", hint: "clip / h\xECnh h\u1EADu tr\u01B0\u1EDDng thu \xE2m, quay MV" },
  { key: "short_video", label: "Short Video / Lipsync TikTok", hint: "video ng\u1EAFn qu\u1EA3ng b\xE1 tr\u01B0\u1EDBc/sau ph\xE1t h\xE0nh" },
  { key: "cta", label: "CTA Video / Audio", hint: "video k\xEAu g\u1ECDi fan tr\xEAn t\u1EA5t c\u1EA3 n\u1EC1n t\u1EA3ng" },
  { key: "media_plan", label: "K\u1EBF ho\u1EA1ch truy\u1EC1n th\xF4ng", hint: "master plan / timeline, n\u1EBFu c\xF3" },
  { key: "design_file", label: "File h\xECnh thi\u1EBFt k\u1EBF", hint: "psd / tiff" }
];
var DIRECTION_FIELDS = [
  { key: "goal", label: "M\u1EE5c ti\xEAu v\xE0 \xFD \u0111\u1ECBnh", hint: "L\xFD do th\u1EF1c hi\u1EC7n d\u1EF1 \xE1n, th\xF4ng \u0111i\u1EC7p ch\xEDnh, c\u1EA3m x\xFAc mong mu\u1ED1n mang \u0111\u1EBFn cho ng\u01B0\u1EDDi nghe." },
  { key: "style", label: "Phong c\xE1ch & c\xE1ch ti\u1EBFp c\u1EADn", hint: "M\xE0u s\u1EAFc \xE2m nh\u1EA1c, ch\u1EA5t li\u1EC7u / k\u1EF9 thu\u1EADt s\u1EA3n xu\u1EA5t, s\u1EF1 th\u1EED nghi\u1EC7m ho\u1EB7c pha tr\u1ED9n phong c\xE1ch." },
  { key: "story", label: "\xDD ngh\u0129a v\xE0 c\xE2u chuy\u1EC7n", hint: "Nh\u1EEFng suy ngh\u0129, c\u1EA3m x\xFAc, c\xE2u chuy\u1EC7n truy\u1EC1n c\u1EA3m h\u1EE9ng g\u1EEDi g\u1EAFm trong t\xE1c ph\u1EA9m." }
];
var DESIGN_FIELDS = [
  { key: "spotify_video", label: "Spotify Video Banner", hint: "16:9 \xB7 .MOV/.MP4 \xB7 t\u1ED1i \u0111a 30 gi\xE2y \xB7 t\u1ED1i \u0111a 500MB \xB7 t\u1ED1i thi\u1EC3u 1280x720 \xB7 \xE2m thanh chu\u1EA9n h\xF3a theo Spotify" },
  { key: "spotify_image", label: "Spotify Image Banner", hint: "1.91:1 \xB7 800x418 \u2192 1200x628 px \xB7 .JPG \xB7 t\u1ED1i \u0111a 1MB" },
  { key: "zing_psd", label: "Zing MP3", hint: "file PSD (Zing t\u1EF1 resize theo chu\u1EA9n hi\u1EC3n th\u1ECB)" },
  { key: "nct", label: "Nh\u1EA1c C\u1EE7a Tui (NCT)", hint: "1280 x 256 px" },
  { key: "cta_clip", label: "Call-to-action video clip / audio", hint: "Zing MP3 / NCT / Spotify (khi BTV n\u1EC1n t\u1EA3ng y\xEAu c\u1EA7u)" }
];
var isoDate = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x));
function workingDaysBetween(from, to) {
  let n = 0;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) n += 1;
  }
  return n;
}
function deadlineCheck(kind, releaseIso, now = /* @__PURE__ */ new Date()) {
  if (!isoDate(releaseIso || "")) return { level: "info", text: "Ch\u1ECDn ng\xE0y ph\xE1t h\xE0nh \u0111\u1EC3 ki\u1EC3m tra th\u1EDDi h\u1EA1n g\u1EEDi d\u1EF1 \xE1n." };
  const rel = /* @__PURE__ */ new Date(releaseIso + "T00:00:00");
  const days = Math.round((rel - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  if (days < 0) return { level: "warn", past: true, text: `Ng\xE0y ph\xE1t h\xE0nh ${releaseIso.split("-").reverse().join("/")} \u0111\xE3 qua. B\u1EA1n v\u1EABn c\xF3 th\u1EC3 g\u1EEDi, nh\u01B0ng h\xE3y ki\u1EC3m tra l\u1EA1i ng\xE0y ph\xE1t h\xE0nh.` };
  if (kind === "pitching") return days >= 14 ? { level: "ok", text: `C\xF2n ${days} ng\xE0y \u2014 \u0111\u1EE7 th\u1EDDi h\u1EA1n Pitching (t\u1ED1i thi\u1EC3u 14 ng\xE0y).` } : { level: "warn", late: true, text: `Ch\u1EC9 c\xF2n ${days} ng\xE0y \u2014 d\u1EF1 \xE1n Pitching c\u1EA7n g\u1EEDi tr\u01B0\u1EDBc t\u1ED1i thi\u1EC3u 14 ng\xE0y.` };
  if (kind === "release_only") {
    const w = workingDaysBetween(now, rel);
    return w >= 4 ? { level: "ok", text: `C\xF2n ${w} ng\xE0y l\xE0m vi\u1EC7c \u2014 \u0111\u1EE7 th\u1EDDi h\u1EA1n (t\u1ED1i thi\u1EC3u 04 ng\xE0y l\xE0m vi\u1EC7c).` } : { level: "warn", text: `Ch\u1EC9 c\xF2n ${w} ng\xE0y l\xE0m vi\u1EC7c \u2014 d\u1EF1 \xE1n ch\u1EC9 ph\xE1t h\xE0nh c\u1EA7n g\u1EEDi tr\u01B0\u1EDBc t\u1ED1i thi\u1EC3u 04 ng\xE0y l\xE0m vi\u1EC7c.`, late: true };
  }
  if (kind === "urgent") return { level: "info", text: "D\u1EF1 \xE1n g\u1EA5p: th\u1EDDi h\u1EA1n t\xF9y n\u1EC1n t\u1EA3ng \u2014 TikTok \u2265 24h, Zing MP3 \u2265 48h (ch\u1EC9 nh\u1EADn Th\u1EE9 2\u2013Th\u1EE9 5), Meta \u2265 04 ng\xE0y." };
  return { level: "info", text: "Ch\u1ECDn lo\u1EA1i d\u1EF1 \xE1n \u0111\u1EC3 ki\u1EC3m tra th\u1EDDi h\u1EA1n g\u1EEDi." };
}
var REST_MIN = 3;
var isDeliverOnly = (a) => !!a.project_kind && a.project_kind !== "pitching";
function restFilled(a) {
  const n = (o) => Object.values(o || {}).filter((v) => String(v || "").trim()).length;
  return n(a.promo) + n(a.direction) + (a.project_kind === "pitching" ? n(a.design) : 0);
}

// lib/ReleaseInfoSections.js
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var OR = "#f26a0f";
var OR_DK = "#c2410c";
var BORDER = "#f5d9c3";
var card = { background: "#fff", border: "1px solid #ececec", borderRadius: 24, padding: "22px 22px 24px", marginBottom: 18 };
var inp = { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #ddd", borderRadius: 10, fontSize: 15, background: "#fff", color: "#111", fontFamily: "inherit" };
var lab = { display: "block", fontWeight: 700, fontSize: 14, margin: "14px 0 5px", color: "#222" };
var hintS = { fontWeight: 400, color: "#777", fontSize: 12.5 };
var optBox = (on) => ({ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "#fff", border: `1px solid ${on ? OR : BORDER}`, borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 15, marginBottom: 8 });
function Num({ n, title, sub }) {
  return /* @__PURE__ */ jsxs("div", { style: { marginBottom: 6 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12 }, children: [
      /* @__PURE__ */ jsx("span", { style: { width: 40, height: 40, borderRadius: 20, background: "#fdeadd", color: OR_DK, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }, children: n }),
      /* @__PURE__ */ jsx("h2", { style: { margin: 0, fontSize: 21 }, children: title })
    ] }),
    sub && /* @__PURE__ */ jsx("div", { style: { ...hintS, margin: "6px 0 0 52px" }, children: sub })
  ] });
}
function Field({ label, hint, children }) {
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("label", { style: lab, children: [
      label,
      " ",
      hint && /* @__PURE__ */ jsx("span", { style: hintS, children: hint })
    ] }),
    children
  ] });
}
var dlBtn = { display: "block", padding: "12px 14px", borderRadius: 12, border: `1px solid ${OR}`, background: "#fff", color: OR_DK, fontWeight: 800, textDecoration: "none", fontSize: 15 };
var mb = (n) => (n / 1048576).toFixed(1) + " MB";
var post = async (path, body) => {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};
var gate = { n: 0, q: [] };
var acquire = () => new Promise((res) => {
  const go = () => {
    gate.n++;
    res();
  };
  if (gate.n < 2) go();
  else gate.q.push(go);
});
var release = () => {
  gate.n--;
  const nx = gate.q.shift();
  if (nx) nx();
};
var SESS_DAYS = 6;
var sessKey = (who, field, f) => `ri-up:${who}:${field}:${f.name}:${f.size}:${f.lastModified}`;
var lsGet = (k) => {
  try {
    const v = JSON.parse(localStorage.getItem(k) || "null");
    return v && Date.now() - v.at < SESS_DAYS * 864e5 ? v : null;
  } catch {
    return null;
  }
};
var lsSet = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
  }
};
var lsDel = (k) => {
  try {
    localStorage.removeItem(k);
  } catch {
  }
};
function FileSlot({ token, inboxKey, field, label, hint, value, onChange, inlineExtra = null }) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [note, setNote] = useState("");
  const [info, setInfo] = useState("");
  const isArt = field === "files.artwork";
  const [thumb, setThumb] = useState("");
  const [thumbBad, setThumbBad] = useState(false);
  useEffect(() => () => {
    if (thumb) URL.revokeObjectURL(thumb);
  }, [thumb]);
  useEffect(() => {
    setThumbBad(false);
  }, [value]);
  const remoteThumb = isArt && !thumb && token && /^https?:\/\/(drive|docs)\.google\.com\//i.test(String(value || "")) && !thumbBad ? `/api/release-info/thumb?token=${encodeURIComponent(token)}&v=${encodeURIComponent(String(value).slice(-40))}` : "";
  const shown = thumb || remoteThumb;
  const ctl = useRef(null);
  useEffect(() => {
    if (!busy) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  useEffect(() => () => {
    ctl.current?.abort();
  }, []);
  function cancel() {
    ctl.current?.abort();
  }
  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    const ac = new AbortController();
    ctl.current = ac;
    setBusy(true);
    setPct(0);
    setNote("");
    setInfo("\u0110ang ch\u1EDD t\u1EDBi l\u01B0\u1EE3t\u2026");
    const api = token ? "/api/release-info/upload" : "/api/release-info/inbox";
    const who = token ? { token } : { inboxKey };
    if (isArt && /^image\//.test(file.type || "") && file.size < 60 * 1048576) setThumb(URL.createObjectURL(file));
    else if (isArt) setThumb("");
    const key = sessKey(token ? token.slice(-24) : inboxKey, field, file);
    let held = false, sess = null;
    try {
      await acquire();
      held = true;
      if (ac.signal.aborted) throw Object.assign(new Error("\u0110\xE3 hu\u1EF7"), { name: "AbortError" });
      let startAt = 0, fileId = null, done = false;
      sess = lsGet(key);
      if (sess) {
        const st = await sessionStatus(sess.uploadUrl, file.size, ac.signal);
        if (st?.done) {
          fileId = st.id;
          done = true;
        } else if (st && !st.expired && st.next != null) startAt = st.next;
        else if (!st || st.expired) {
          if (st?.expired) {
            sess = null;
            lsDel(key);
          } else startAt = 0;
        }
      }
      if (!sess) {
        const init = await post(api, { ...who, action: "init", field, filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size });
        sess = { uploadUrl: init.uploadUrl, name: init.name, at: Date.now() };
        lsSet(key, sess);
        startAt = 0;
      }
      const onProgress = (r) => {
        setPct(Math.round(r * 100));
        setInfo(`${mb(r * file.size)} / ${mb(file.size)}`);
      };
      if (startAt > 0) {
        setNote(`Ti\u1EBFp t\u1EE5c t\u1EEB ${mb(startAt)}\u2026`);
        onProgress(startAt / file.size);
      }
      if (!done) {
        try {
          const r = await resumableUpload({ file, uploadUrl: sess.uploadUrl, startAt, signal: ac.signal, onProgress });
          fileId = r.id;
        } catch (err) {
          if (err.code === "expired") {
            lsDel(key);
            const init = await post(api, { ...who, action: "init", field, filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size });
            sess = { uploadUrl: init.uploadUrl, name: init.name, at: Date.now() };
            lsSet(key, sess);
            const r = await resumableUpload({ file, uploadUrl: sess.uploadUrl, startAt: 0, signal: ac.signal, onProgress });
            fileId = r.id;
          } else if (err.maybeDone) {
            fileId = null;
          } else throw err;
        }
      }
      setInfo("\u0110ang x\xE1c nh\u1EADn\u2026");
      const fin = await post(api, { ...who, action: "finalize", field, name: sess.name, size: file.size, fileId });
      lsDel(key);
      onChange(fin.file.url);
      setNote(`\u2713 \u0110\xE3 t\u1EA3i l\xEAn: ${file.name} (${mb(file.size)})`);
    } catch (err) {
      if (err.name === "AbortError") {
        if (sess?.uploadUrl) cancelSession(sess.uploadUrl);
        lsDel(key);
        setNote("\u0110\xE3 hu\u1EF7 t\u1EA3i l\xEAn.");
      } else if (err.code === "cors") {
        setNote("\u26A0\uFE0F Tr\xECnh duy\u1EC7t/m\u1EA1ng n\xE0y kh\xF4ng g\u1EEDi tr\u1EF1c ti\u1EBFp \u0111\u01B0\u1EE3c l\xEAn Drive. H\xE3y th\u1EED m\u1EA1ng kh\xE1c ho\u1EB7c d\xE1n link (Drive/WeTransfer) v\xE0o \xF4 b\xEAn tr\xEAn.");
      } else {
        setNote("\u26A0\uFE0F " + (err.message || "Kh\xF4ng t\u1EA3i l\xEAn \u0111\u01B0\u1EE3c") + " \u2014 b\u1EA5m T\u1EA3i l\xEAn v\xE0 ch\u1ECDn l\u1EA1i \u0110\xDANG file n\xE0y \u0111\u1EC3 ti\u1EBFp t\u1EE5c t\u1EEB ch\u1ED7 \u0111\xE3 g\u1EEDi, ho\u1EB7c d\xE1n link thay th\u1EBF.");
      }
    }
    if (held) release();
    setBusy(false);
    setInfo("");
  }
  return /* @__PURE__ */ jsxs(Field, { label, hint: hint ? `(${hint})` : "", children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs("div", { className: "fs-wrap", style: { position: "relative", flex: "1 1 220px", display: "flex", flexDirection: "column", minWidth: 0 }, children: [
        inlineExtra && /* @__PURE__ */ jsx("style", { children: `@media (max-width: 560px) { .fs-sw { position: static !important; transform: none !important; align-self: flex-start; margin: 0 0 6px !important; } .fs-wrap .fs-in { padding-right: 12px !important; } }` }),
        inlineExtra && /* @__PURE__ */ jsx("div", { className: "fs-sw", style: { position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", zIndex: 1 }, children: inlineExtra }),
        /* @__PURE__ */ jsx("input", { className: "fs-in", style: { ...inp, width: "100%", paddingRight: inlineExtra ? 142 : 12 }, placeholder: "Th\xEAm link ho\u1EB7c b\u1EA5m T\u1EA3i l\xEAn / Add a link or press Upload", value: value || "", onChange: (e) => onChange(e.target.value) })
      ] }),
      (token || inboxKey) && (busy ? /* @__PURE__ */ jsxs("button", { type: "button", onClick: cancel, style: { flex: "0 0 auto", padding: "11px 14px", borderRadius: 10, border: "1px solid #c33", color: "#a01818", fontWeight: 800, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap", background: "#fff" }, children: [
        "\u2715 Hu\u1EF7 (",
        pct,
        "%)"
      ] }) : /* @__PURE__ */ jsxs("label", { style: { flex: "0 0 auto", padding: "11px 14px", borderRadius: 10, border: `1px solid ${OR}`, color: OR_DK, fontWeight: 800, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap", background: "#fff" }, children: [
        "\u2B06 T\u1EA3i l\xEAn",
        /* @__PURE__ */ jsx("input", { type: "file", style: { display: "none" }, onChange: pick })
      ] }))
    ] }),
    isArt && shown && /* @__PURE__ */ jsx("img", { src: shown, alt: "Artwork", onError: () => {
      if (!thumb) setThumbBad(true);
    }, style: { display: "block", width: 120, height: 120, objectFit: "cover", borderRadius: 14, border: "1px solid #ddd", marginTop: 8, background: "#f4f4f4" } }),
    busy && /* @__PURE__ */ jsx("div", { style: { height: 6, background: "#eee", borderRadius: 3, marginTop: 6 }, children: /* @__PURE__ */ jsx("div", { style: { width: pct + "%", height: 6, background: OR, borderRadius: 3 } }) }),
    busy && /* @__PURE__ */ jsxs("div", { style: { ...hintS, marginTop: 4 }, children: [
      info,
      " \xB7 \u0110\u1EEBng \u0111\xF3ng trang cho t\u1EDBi khi xong. M\u1EA5t m\u1EA1ng th\xEC t\u1EF1 th\u1EED l\u1EA1i."
    ] }),
    note && /* @__PURE__ */ jsx("div", { style: { ...hintS, marginTop: 4, color: note.startsWith("\u26A0\uFE0F") ? "#a01818" : "#17652f" }, children: note })
  ] });
}
var PL_LOGO = { spotify: "/brand/platform-icons/pf-spotify.png", apple: "/brand/platform-icons/pf-apple.png", zing: "/brand/platform-icons/pf-zing.png", nct: "/brand/platform-icons/pf-nct.png", tiktok: "/brand/platform-icons/pf-tiktok.png", facebook: "/brand/platform-icons/pf-facebook.png", instagram: "/brand/platform-icons/pf-instagram.png", youtube: "/brand/platform-icons/pf-youtube.png" };
var PlatformBadge = ({ k, size = 34 }) => {
  const name = PLATFORMS.find((x) => x.key === k)?.label || k;
  return /* @__PURE__ */ jsx("img", { src: PL_LOGO[k] || "", alt: name, title: name, width: size, height: size, style: { flex: "none", width: size, height: size, objectFit: "contain", borderRadius: size * 0.22, display: "block" } });
};
function ProfilePicker({ f, set }) {
  const rows = Array.isArray(f.profiles) ? f.profiles : [];
  const upd = (i, url) => set("profiles", rows.map((r, x) => x === i ? { ...r, url } : r));
  const add = (p) => set("profiles", [...rows, { p, url: "" }].slice(0, 16));
  const del = (i) => set("profiles", rows.filter((_, x) => x !== i));
  const miss = (k) => !f.profile_returning && !rows.some((r) => r.p === k && String(r.url || "").trim());
  return /* @__PURE__ */ jsxs(Field, { label: "Link profile ngh\u1EC7 s\u0129 tr\xEAn c\xE1c n\u1EC1n t\u1EA3ng nh\u1EA1c s\u1ED1", hint: "(n\u1EBFu l\u1EA7n \u0111\u1EA7u ph\xE1t h\xE0nh v\u1EDBi VIEENT \u2014 b\u1EAFt bu\u1ED9c Spotify v\xE0 Apple Music)", children: [
    /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", margin: "2px 0 10px" }, children: PLATFORMS.map((x) => /* @__PURE__ */ jsx("button", { type: "button", onClick: () => add(x.key), title: `Th\xEAm ${x.label}`, "aria-label": `Th\xEAm ${x.label}`, style: { border: "1px dashed #bbb", background: "#fff", borderRadius: 22, padding: 3, cursor: "pointer", minHeight: 0 }, children: /* @__PURE__ */ jsx(PlatformBadge, { k: x.key }) }, x.key)) }),
    rows.map((r, i) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", marginTop: 8 }, children: [
      /* @__PURE__ */ jsx(PlatformBadge, { k: r.p }),
      /* @__PURE__ */ jsx("input", { style: { ...inp, flex: "1 1 auto", width: "auto", borderColor: REQUIRED_PLATFORMS.includes(r.p) && miss(r.p) ? "#e8a0a0" : "#ddd" }, placeholder: `Link ${PLATFORMS.find((x) => x.key === r.p)?.label || ""}${REQUIRED_PLATFORMS.includes(r.p) && !f.profile_returning ? " *" : ""}`, value: r.url || "", onChange: (e) => upd(i, e.target.value), inputMode: "url" }),
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => del(i), "aria-label": "Xo\xE1 d\xF2ng", style: { flex: "0 0 auto", width: 40, height: 40, borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer", color: "#a01818", fontWeight: 800 }, children: "\u2715" })
    ] }, i)),
    !f.profile_returning && REQUIRED_PLATFORMS.filter((k) => !rows.some((r) => r.p === k)).map((k) => /* @__PURE__ */ jsxs("div", { style: { ...hintS, marginTop: 6, color: "#a01818" }, children: [
      "Thi\u1EBFu ",
      PLATFORMS.find((x) => x.key === k).label,
      " \u2014 b\u1EA5m bi\u1EC3u t\u01B0\u1EE3ng \u1EDF tr\xEAn \u0111\u1EC3 th\xEAm."
    ] }, k)),
    /* @__PURE__ */ jsxs("label", { style: { display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 }, children: [
      /* @__PURE__ */ jsx("input", { type: "checkbox", checked: !!f.profile_returning, onChange: (e) => set("profile_returning", e.target.checked), style: { width: 20, height: 20, accentColor: OR, flex: "none", marginTop: 1 } }),
      /* @__PURE__ */ jsx("span", { children: "Ngh\u1EC7 s\u0129 \u0111\xE3 ph\xE1t h\xE0nh v\u1EDBi VIEENT tr\u01B0\u1EDBc \u0111\xE2y \u2014 kh\xF4ng b\u1EAFt bu\u1ED9c \u0111i\u1EC1n l\u1EA1i (v\u1EABn c\xF3 th\u1EC3 th\xEAm / \u0111\u1ED5i link)." })
    ] })
  ] });
}
var EMPTY = { audio_kind: "final", artwork_kind: "final", song_title: "", performer: "", composer: "", producer: "", mixer: "", lyricist: "", genres: ["", ""], featuring: "", profiles: [{ p: "spotify", url: "" }, { p: "apple", url: "" }], profile_returning: false, project_kind: "", release_date: "", release_time: "", preview_time: "", tiktok_demo_date: "", lyrics: "", profile_links: "", files: {}, promo: {}, design: {}, direction: {}, contact_email: "", label: "", release_type: "", tracks: [{ title: "" }, { title: "" }], deliver_only: false, late_ack: false };
function TracksDetail({ f, setF, n = 2 }) {
  if (!(f.release_type === "EP" || f.release_type === "Album")) return null;
  return /* @__PURE__ */ jsxs("div", { style: card, children: [
    /* @__PURE__ */ jsx(Num, { n, title: `Chi ti\u1EBFt t\u1EEBng track (${f.release_type})`, sub: "Kh\xF4ng b\u1EAFt bu\u1ED9c. \u0110\u1EC3 tr\u1ED1ng = gi\u1ED1ng th\xF4ng tin chung \u1EDF tr\xEAn. B\u1EA5m v\xE0o track \u0111\u1EC3 m\u1EDF." }),
    (f.tracks || []).map((t, i) => /* @__PURE__ */ jsxs("details", { style: { border: "1px solid #ececec", borderRadius: 12, padding: "10px 12px", marginTop: 10, background: "#fff" }, children: [
      /* @__PURE__ */ jsxs("summary", { style: { cursor: "pointer", fontWeight: 700 }, children: [
        i + 1,
        ". ",
        t.title || `Track ${i + 1}`
      ] }),
      /* @__PURE__ */ jsx(Field, { label: "Ngh\u1EC7 s\u0129 tr\xECnh b\xE0y / Main artist", children: /* @__PURE__ */ jsx("input", { style: inp, value: t.performer ?? f.performer ?? "", onChange: (e) => setF((o) => ({ ...o, tracks: o.tracks.map((x, xi) => xi === i ? { ...x, performer: e.target.value } : x) })) }) }),
      /* @__PURE__ */ jsx(Field, { label: "Ngh\u1EC7 s\u0129 h\u1EE3p t\xE1c / Featuring artist", children: /* @__PURE__ */ jsx("input", { style: inp, placeholder: f.featuring || "", value: t.featuring || "", onChange: (e) => setF((o) => ({ ...o, tracks: o.tracks.map((x, xi) => xi === i ? { ...x, featuring: e.target.value } : x) })) }) }),
      /* @__PURE__ */ jsx(Field, { label: "Preview Time", hint: "(\u0111o\u1EA1n nh\u1EA1c TikTok 60s b\u1EAFt \u0111\u1EA7u t\u1EEB)", children: /* @__PURE__ */ jsx("input", { style: inp, placeholder: "vd 1:05", value: t.preview_time || "", onChange: (e) => setF((o) => ({ ...o, tracks: o.tracks.map((x, xi) => xi === i ? { ...x, preview_time: e.target.value } : x) })) }) }),
      [["composer", "S\xE1ng t\xE1c / Composer"], ["lyricist", "Ng\u01B0\u1EDDi vi\u1EBFt l\u1EDDi / Lyricist"], ["producer", "Nh\xE0 s\u1EA3n xu\u1EA5t / Producer"], ["mixer", "Ng\u01B0\u1EDDi ph\u1ED1i \xE2m / Mixer"]].map(([k, lb]) => /* @__PURE__ */ jsx(Field, { label: lb, children: /* @__PURE__ */ jsx("input", { style: inp, value: t[k] || "", onChange: (e) => setF((o) => ({ ...o, tracks: o.tracks.map((x, xi) => xi === i ? { ...x, [k]: e.target.value } : x) })) }) }, k)),
      /* @__PURE__ */ jsx(Field, { label: "L\u1EDDi b\xE0i h\xE1t / Lyrics", children: /* @__PURE__ */ jsx("textarea", { style: { ...inp, minHeight: 110, resize: "vertical" }, value: t.lyrics || "", onChange: (e) => setF((o) => ({ ...o, tracks: o.tracks.map((x, xi) => xi === i ? { ...x, lyrics: e.target.value } : x) })) }) })
    ] }, i))
  ] });
}
var isUrlOnly = (v) => /^https?:\/\/\S+$/i.test(String(v || "").trim());
function LyricsField({ value, onChange }) {
  return /* @__PURE__ */ jsxs(Field, { label: "L\u1EDDi b\xE0i h\xE1t / Lyrics", hint: "(d\xE1n link Drive / Docs ch\u1EE9a l\u1EDDi, ho\u1EB7c d\xE1n to\xE0n b\u1ED9 l\u1EDDi b\xE0i h\xE1t / paste a link or the full lyrics)", children: [
    /* @__PURE__ */ jsx("textarea", { style: { ...inp, minHeight: isUrlOnly(value) ? 64 : 180, resize: "vertical" }, value: value || "", onChange: (e) => onChange(e.target.value), placeholder: "https://\u2026 ho\u1EB7c d\xE1n l\u1EDDi b\xE0i h\xE1t \u1EDF \u0111\xE2y" }),
    isUrlOnly(value) && /* @__PURE__ */ jsx("div", { style: { ...hintS, marginTop: 4, color: "#17652f" }, children: "\u2713 \u0110ang d\xF9ng link l\u1EDDi b\xE0i h\xE1t." })
  ] });
}
var KIND_KEYS = { audio: "audio_kind", artwork: "artwork_kind" };
function KindSwitch({ label, value, onChange }) {
  const cur = value === "demo" ? "demo" : "final";
  return /* @__PURE__ */ jsx("div", { role: "radiogroup", "aria-label": `Lo\u1EA1i ${label}`, style: { display: "flex", border: `1px solid ${OR}`, borderRadius: 999, overflow: "hidden", background: "#fff" }, children: [["demo", "Demo"], ["final", "Ch\xEDnh th\u1EE9c"]].map(([k, lb]) => /* @__PURE__ */ jsx("button", { type: "button", role: "radio", "aria-checked": cur === k, onClick: () => onChange(k), style: { border: "none", cursor: "pointer", padding: "5px 10px", minHeight: 0, fontWeight: 800, fontSize: 12.5, fontFamily: "inherit", background: cur === k ? OR : "#fff", color: cur === k ? "#fff" : OR_DK, whiteSpace: "nowrap" }, children: lb }, k)) });
}
function ReleaseInfoSections({ token, inboxKey = "", f, setF, genreOpts = [], n0 = 1, core = true }) {
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const setIn = (grp, k, v) => setF((o) => ({ ...o, [grp]: { ...o[grp] || {}, [k]: v } }));
  const setGenre = (i, v) => setF((o) => ({ ...o, genres: o.genres.map((g, x) => x === i ? v : g) }));
  const dl = deadlineCheck(f.project_kind, f.release_date);
  const dOnly = isDeliverOnly(f);
  const tr = core && (f.release_type === "EP" || f.release_type === "Album") ? 1 : 0;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsx(Num, { n: n0 + 0, title: core ? "D\u1EEF li\u1EC7u s\u1EA3n ph\u1EA9m (Metadata)" : "Metadata b\u1ED5 sung / Extra metadata" }),
      core && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Field, { label: "T\xEAn s\u1EA3n ph\u1EA9m / Product title *", children: /* @__PURE__ */ jsx("input", { style: inp, value: f.song_title, onChange: (e) => set("song_title", e.target.value) }) }),
        /* @__PURE__ */ jsx(Field, { label: "Ngh\u1EC7 s\u0129 tr\xECnh b\xE0y / Main artist *", children: /* @__PURE__ */ jsx("input", { style: inp, value: f.performer, onChange: (e) => set("performer", e.target.value) }) }),
        /* @__PURE__ */ jsx(Field, { label: "Ngh\u1EC7 s\u0129 h\u1EE3p t\xE1c / Featuring artist", hint: "(n\u1EBFu c\xF3 / if any)", children: /* @__PURE__ */ jsx("input", { style: inp, value: f.featuring || "", onChange: (e) => set("featuring", e.target.value) }) }),
        /* @__PURE__ */ jsx(Field, { label: "S\xE1ng t\xE1c / Composer *", hint: "(t\xEAn ph\u1EA3i c\xF3 2 ch\u1EEF tr\u1EDF l\xEAn ho\u1EB7c d\xF9ng h\u1ECD & t\xEAn th\u1EADt / at least 2 words or your real full name)", children: /* @__PURE__ */ jsx("input", { style: inp, value: f.composer, onChange: (e) => set("composer", e.target.value) }) }),
        /* @__PURE__ */ jsx(Field, { label: "Ng\u01B0\u1EDDi vi\u1EBFt l\u1EDDi / Lyricist", hint: "(n\u1EBFu kh\xE1c ng\u01B0\u1EDDi s\xE1ng t\xE1c / if different from the composer)", children: /* @__PURE__ */ jsx("input", { style: inp, value: f.lyricist, onChange: (e) => set("lyricist", e.target.value) }) }),
        /* @__PURE__ */ jsx(Field, { label: "Nh\xE0 s\u1EA3n xu\u1EA5t / Producer", children: /* @__PURE__ */ jsx("input", { style: inp, value: f.producer, onChange: (e) => set("producer", e.target.value) }) }),
        /* @__PURE__ */ jsx(Field, { label: "Ng\u01B0\u1EDDi ph\u1ED1i \xE2m / Mixer", children: /* @__PURE__ */ jsx("input", { style: inp, value: f.mixer, onChange: (e) => set("mixer", e.target.value) }) }),
        /* @__PURE__ */ jsx(LyricsField, { value: f.lyrics, onChange: (v) => set("lyrics", v) })
      ] }),
      /* @__PURE__ */ jsx(Field, { label: "Th\u1EC3 lo\u1EA1i / Genre", hint: "(t\u1ED1i \u0111a 02 th\u1EC3 lo\u1EA1i m\xF4 t\u1EA3 \u0111\xFAng nh\u1EA5t v\u1EC1 b\xE0i h\xE1t / up to 2 genres that best describe the song)", children: /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: f.genres.slice(0, 2).map((g, i) => genreOpts.length ? /* @__PURE__ */ jsxs("select", { style: { ...inp, flex: "1 1 180px", width: "auto" }, value: g, onChange: (e) => setGenre(i, e.target.value), children: [
        /* @__PURE__ */ jsx("option", { value: "", children: `\u2014 Th\u1EC3 lo\u1EA1i ${i + 1} \u2014` }),
        genreOpts.filter((o) => o.value === g || !f.genres.includes(o.value)).map((o) => /* @__PURE__ */ jsx("option", { value: o.value, children: o.label }, o.value)),
        g && !genreOpts.some((o) => o.value === g) && /* @__PURE__ */ jsx("option", { value: g, children: g })
      ] }, i) : /* @__PURE__ */ jsx("input", { style: { ...inp, flex: "1 1 180px", width: "auto" }, placeholder: `Th\u1EC3 lo\u1EA1i ${i + 1}`, value: g, onChange: (e) => setGenre(i, e.target.value) }, i)) }) }),
      !(f.release_type === "EP" || f.release_type === "Album") && /* @__PURE__ */ jsx(Field, { label: "Preview Time", hint: "(\u0111o\u1EA1n nh\u1EA1c TikTok 60s b\u1EAFt \u0111\u1EA7u t\u1EEB)", children: /* @__PURE__ */ jsx("input", { style: inp, placeholder: "vd 1:05", value: f.preview_time, onChange: (e) => set("preview_time", e.target.value) }) }),
      /* @__PURE__ */ jsx(ProfilePicker, { f, set })
    ] }),
    core && /* @__PURE__ */ jsx(TracksDetail, { f, setF, n: n0 + 1 }),
    /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsx(Num, { n: n0 + 1 + tr, title: "Th\u1EDDi gian ph\xE1t h\xE0nh", sub: "\u0110\u1EC3 \u0111\u1EA3m b\u1EA3o k\u1EBF ho\u1EA1ch ph\xE1t h\xE0nh v\xE0 h\u1ED7 tr\u1EE3 qu\u1EA3ng b\xE1 \u0111\u1EA1t hi\u1EC7u qu\u1EA3 t\u1ED1t nh\u1EA5t." }),
      /* @__PURE__ */ jsx("label", { style: lab, children: "Lo\u1EA1i d\u1EF1 \xE1n *" }),
      PROJECT_KINDS.map((k) => /* @__PURE__ */ jsxs("label", { style: optBox(f.project_kind === k.key), children: [
        /* @__PURE__ */ jsx("input", { type: "radio", name: "kind", checked: f.project_kind === k.key, onChange: () => set("project_kind", k.key), style: { width: 20, height: 20, accentColor: OR, marginTop: 2 } }),
        /* @__PURE__ */ jsxs("span", { children: [
          k.label,
          /* @__PURE__ */ jsx("span", { style: { display: "block", ...hintS }, children: k.sub })
        ] })
      ] }, k.key)),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx("div", { style: { flex: "1 1 200px" }, children: /* @__PURE__ */ jsx(Field, { label: "Ng\xE0y ph\xE1t h\xE0nh *", children: /* @__PURE__ */ jsx("input", { type: "date", style: inp, value: f.release_date, onChange: (e) => set("release_date", e.target.value) }) }) }),
        /* @__PURE__ */ jsx("div", { style: { flex: "1 1 160px" }, children: /* @__PURE__ */ jsx(Field, { label: "Gi\u1EDD ph\xE1t h\xE0nh", children: /* @__PURE__ */ jsx("input", { type: "time", style: inp, value: f.release_time, onChange: (e) => set("release_time", e.target.value) }) }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { marginTop: 10, padding: "10px 14px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: dl.level === "warn" ? "#fdecec" : dl.level === "ok" ? "#e9f7ee" : "#f1f1f1", color: dl.level === "warn" ? "#a01818" : dl.level === "ok" ? "#17652f" : "#444" }, children: [
        dl.level === "warn" ? "\u26A0\uFE0F " : dl.level === "ok" ? "\u2705 " : "\u2139\uFE0F ",
        dl.text
      ] }),
      dl.late && /* @__PURE__ */ jsxs("label", { style: { display: "flex", gap: 10, alignItems: "flex-start", marginTop: 8, padding: "10px 12px", background: "#fff", border: `1px solid ${f.late_ack ? OR : "#f3b4b4"}`, borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 600 }, children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: !!f.late_ack, onChange: (e) => set("late_ack", e.target.checked), style: { width: 20, height: 20, accentColor: OR, marginTop: 1, flex: "none" } }),
        /* @__PURE__ */ jsx("span", { children: "T\xF4i hi\u1EC3u d\u1EF1 \xE1n g\u1EEDi ch\u01B0a \u0111\u1EE7 th\u1EDDi h\u1EA1n t\u1ED1i thi\u1EC3u \u2014 VIEENT c\xF3 th\u1EC3 kh\xF4ng k\u1ECBp h\u1ED7 tr\u1EE3 \u0111\xFAng ng\xE0y ph\xE1t h\xE0nh. *" })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" }, children: /* @__PURE__ */ jsx("div", { style: { flex: "1 1 200px" }, children: /* @__PURE__ */ jsx(Field, { label: "Ng\xE0y ph\xE1t h\xE0nh demo TikTok", hint: "(n\u1EBFu c\xF3)", children: /* @__PURE__ */ jsx("input", { type: "date", style: inp, value: f.tiktok_demo_date, onChange: (e) => set("tiktok_demo_date", e.target.value) }) }) }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsx(Num, { n: n0 + 2 + tr, title: "File s\u1EA3n ph\u1EA9m", sub: "B\u1EA5m T\u1EA3i l\xEAn \u0111\u1EC3 g\u1EEDi th\u1EB3ng v\xE0o th\u01B0 m\u1EE5c Drive c\u1EE7a s\u1EA3n ph\u1EA9m (t\u1ED1i \u0111a 500MB/file), ho\u1EB7c d\xE1n link n\u1EBFu file l\u1EDBn h\u01A1n." }),
      FILE_FIELDS.map((x) => /* @__PURE__ */ jsx(
        FileSlot,
        {
          token,
          inboxKey,
          field: `files.${x.key}`,
          label: x.label + (x.key === "audio" || x.key === "artwork" ? " *" : ""),
          hint: x.hint,
          value: f.files?.[x.key],
          onChange: (v) => setIn("files", x.key, v),
          inlineExtra: KIND_KEYS[x.key] ? /* @__PURE__ */ jsx(KindSwitch, { label: x.label, value: f[KIND_KEYS[x.key]], onChange: (v) => set(KIND_KEYS[x.key], v) }) : null
        },
        x.key
      ))
    ] }),
    /* @__PURE__ */ jsx("div", { style: { ...card, border: `2px solid ${dOnly ? OR : BORDER}`, padding: "16px 18px" }, children: !f.project_kind ? /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx("b", { children: 'Ch\u1ECDn "Lo\u1EA1i d\u1EF1 \xE1n" \u1EDF tr\xEAn' }),
      " \u0111\u1EC3 bi\u1EBFt c\u1EA7n \u0111i\u1EC1n th\xEAm ph\u1EA7n n\xE0o."
    ] }) : dOnly ? /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx("b", { children: "Ch\u1EC9 ph\xE1t h\xE0nh / Only deliver" }),
      /* @__PURE__ */ jsx("span", { style: { display: "block", ...hintS, marginTop: 2 }, children: "V\u1EDBi lo\u1EA1i d\u1EF1 \xE1n n\xE0y, b\u1EA1n kh\xF4ng c\u1EA7n \u0111i\u1EC1n c\xE1c ph\u1EA7n T\u01B0 li\u1EC7u truy\u1EC1n th\xF4ng, \u0110\u1ECBnh h\u01B0\u1EDBng n\u1ED9i dung v\xE0 Thi\u1EBFt k\u1EBF." })
    ] }) : /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx("b", { children: "Pitching & h\u1ED7 tr\u1EE3 truy\u1EC1n th\xF4ng" }),
      /* @__PURE__ */ jsxs("span", { style: { display: "block", ...hintS, marginTop: 2 }, children: [
        "C\u1EA7n \u0111i\u1EC1n \xEDt nh\u1EA5t ",
        REST_MIN,
        " m\u1EE5c \u1EDF c\xE1c ph\u1EA7n b\xEAn d\u01B0\u1EDBi (hi\u1EC7n \u0111\xE3 \u0111i\u1EC1n ",
        Math.min(restFilled(f), 99),
        "/",
        REST_MIN,
        '). N\u1EBFu ch\u1EC9 c\u1EA7n ph\xE1t h\xE0nh, h\xE3y \u0111\u1ED5i "Lo\u1EA1i d\u1EF1 \xE1n" th\xE0nh Ch\u1EC9 ph\xE1t h\xE0nh.'
      ] })
    ] }) }),
    f.project_kind === "pitching" && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { style: card, children: [
        /* @__PURE__ */ jsx(Num, { n: n0 + 3 + tr, title: "T\u01B0 li\u1EC7u truy\u1EC1n th\xF4ng (Promo assets)", sub: `C\u1EA7n \u0111i\u1EC1n \xEDt nh\u1EA5t ${REST_MIN} m\u1EE5c trong c\xE1c ph\u1EA7n Promo / \u0110\u1ECBnh h\u01B0\u1EDBng / Thi\u1EBFt k\u1EBF (lo\u1EA1i d\u1EF1 \xE1n Pitching).` }),
        PROMO_FIELDS.map((x) => /* @__PURE__ */ jsx(FileSlot, { token, inboxKey, field: `promo.${x.key}`, label: x.label, hint: x.hint, value: f.promo?.[x.key], onChange: (v) => setIn("promo", x.key, v) }, x.key)),
        /* @__PURE__ */ jsx("h3", { style: { margin: "22px 0 0", fontSize: 17 }, children: "\u0110\u1ECBnh h\u01B0\u1EDBng n\u1ED9i dung" }),
        DIRECTION_FIELDS.map((x) => /* @__PURE__ */ jsx(Field, { label: x.label, hint: x.hint, children: /* @__PURE__ */ jsx("textarea", { style: { ...inp, minHeight: 80, resize: "vertical" }, value: f.direction?.[x.key] || "", onChange: (e) => setIn("direction", x.key, e.target.value) }) }, x.key))
      ] }),
      f.project_kind === "pitching" && /* @__PURE__ */ jsxs("div", { style: card, children: [
        /* @__PURE__ */ jsx(Num, { n: n0 + 4 + tr, title: "T\u01B0 li\u1EC7u thi\u1EBFt k\u1EBF (Design specs)", sub: "\xC1p d\u1EE5ng cho c\xE1c d\u1EF1 \xE1n \u0111\u0103ng k\xFD Pitching Editorial Banner tr\xEAn c\xE1c n\u1EC1n t\u1EA3ng nh\u1EA1c s\u1ED1." }),
        DESIGN_FIELDS.map((x) => /* @__PURE__ */ jsx(FileSlot, { token, inboxKey, field: `design.${x.key}`, label: x.label, hint: x.hint, value: f.design?.[x.key], onChange: (v) => setIn("design", x.key, v) }, x.key))
      ] })
    ] })
  ] });
}

// lib/tgUploadAsk.js
function askAllowedHere(m, text) {
  const t = String(text || "");
  const claimLike = (/tiktok\.com/i.test(t) || /\bclaim\b/i.test(t)) && driveIds(t).length === 0;
  if (claimLike) return false;
  const only = String(process.env.FRIDAY_UPLOAD_ASK_THREADS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (only.length) return !!(m?.is_topic_message && m.message_thread_id && only.includes(String(m.message_thread_id)));
  return true;
}
function driveIds(text) {
  const ids = /* @__PURE__ */ new Set();
  for (const m of String(text || "").matchAll(/https?:\/\/(?:drive|docs)\.google\.com\/[^\s)]+/gi)) {
    const u = m[0];
    const a = /\/(?:folders|d)\/([A-Za-z0-9_-]{15,})/.exec(u) || /[?&]id=([A-Za-z0-9_-]{15,})/.exec(u);
    if (a) ids.add(a[1]);
  }
  return [...ids];
}

// _to_delete/t718.jsx
import { jsx as jsx2 } from "react/jsx-runtime";
var h = renderToStaticMarkup(/* @__PURE__ */ jsx2(ReleaseInfoSections, { token: "t", f: { ...EMPTY }, setF: () => {
}, core: true }));
console.log("switches", (h.match(/Chính thức/g) || []).length, h.includes("Lo\u1EA1i File h\xECnh"));
var T = { is_topic_message: true, message_thread_id: 77 };
var claim = "Hi\u1EBFu \u01A1i claim gi\xFAp ch\u1ECB https://www.tiktok.com/music/abc-123?x=1";
var up = "Hi\u1EBFu \u01A1i up gi\xFAp https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv";
console.log("claim", askAllowedHere(T, claim), "upload", askAllowedHere(T, up));
process.env.FRIDAY_UPLOAD_ASK_THREADS = "77,88";
console.log("env in", askAllowedHere(T, up), "env out", askAllowedHere({ is_topic_message: true, message_thread_id: 5 }, up), "no topic", askAllowedHere({}, up));
