"use client";
// Round 698 — the "Thông tin phát hành" sections, shared by the stand-alone info form and the combined rights + info page.
import { useState, useRef, useEffect } from "react";
import { resumableUpload, sessionStatus, cancelSession } from "./driveResumable";
import { previewSeconds, FILE_FIELDS, PROMO_FIELDS, DIRECTION_FIELDS, DESIGN_FIELDS, PROJECT_KINDS, PLATFORMS, REQUIRED_PLATFORMS, deadlineCheck, restFilled, REST_MIN, isDeliverOnly } from "./releaseInfoForm";
import { infoBlocks } from "./releaseInfoDocs";
import { buildInfoPdf } from "./releaseInfoPdf";

export const OR = "#f26a0f", OR_DK = "#c2410c", BORDER = "#f5d9c3";
export const card = { background: "#fff", border: "1px solid #ececec", borderRadius: 24, padding: "22px 22px 24px", marginBottom: 18 };
export const inp = { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #ddd", borderRadius: 10, fontSize: 15, background: "#fff", color: "#111", fontFamily: "inherit" };
const lab = { display: "block", fontWeight: 700, fontSize: 14, margin: "14px 0 5px", color: "#222" };
export const hintS = { fontWeight: 400, color: "#777", fontSize: 12.5 };
const optBox = (on) => ({ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "#fff", border: `1px solid ${on ? OR : BORDER}`, borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 15, marginBottom: 8 });

export function Num({ n, title, sub }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 20, background: "#fdeadd", color: OR_DK, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
        <h2 style={{ margin: 0, fontSize: 21 }}>{title}</h2>
      </div>
      {sub && <div style={{ ...hintS, margin: "6px 0 0 52px" }}>{sub}</div>}
    </div>
  );
}
export function Field({ label, hint, children }) { return (<div><label style={lab}>{label} {hint && <span style={hintS}>{hint}</span>}</label>{children}</div>); }

export const dlBtn = { display: "block", padding: "12px 14px", borderRadius: 12, border: `1px solid ${OR}`, background: "#fff", color: OR_DK, fontWeight: 800, textDecoration: "none", fontSize: 15 };
const mb = (n) => (n / 1048576).toFixed(1) + " MB";
const post = async (path, body) => {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};

// At most 2 files go up at the same time (more just fight for the same connection); the rest wait their turn.
const gate = { n: 0, q: [] };
const acquire = () => new Promise((res) => { const go = () => { gate.n++; res(); }; if (gate.n < 2) go(); else gate.q.push(go); });
const release = () => { gate.n--; const nx = gate.q.shift(); if (nx) nx(); };
const SESS_DAYS = 6;   // Drive keeps a resumable session for a week
const sessKey = (who, field, f) => `ri-up:${who}:${field}:${f.name}:${f.size}:${f.lastModified}`;
const lsGet = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v && Date.now() - v.at < SESS_DAYS * 864e5 ? v : null; } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

// Link box + "Tải lên" button: the file goes straight to the product's Drive folder (resumable, 8 MB pieces), the box then holds its Drive link.
// Interrupted (refresh, sleep, lost signal)? pick the SAME file again and it continues where Drive stopped. "Huỷ" stops and drops the half-sent file.
function FileSlot({ token, inboxKey, field, label, hint, value, onChange, inlineExtra = null }) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [note, setNote] = useState("");
  const [info, setInfo] = useState("");   // "x MB / y MB" or "waiting"
  // Round 708 — the artwork picture is shown on the page: from the file just picked, or later (token link) from a small server-made thumbnail
  const isArt = field === "files.artwork";
  const [thumb, setThumb] = useState("");
  const [thumbBad, setThumbBad] = useState(false);
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);
  useEffect(() => { setThumbBad(false); }, [value]);
  const remoteThumb = isArt && !thumb && token && /^https?:\/\/(drive|docs)\.google\.com\//i.test(String(value || "")) && !thumbBad ? `/api/release-info/thumb?token=${encodeURIComponent(token)}&v=${encodeURIComponent(String(value).slice(-40))}` : "";
  const shown = thumb || remoteThumb;
  const ctl = useRef(null);
  useEffect(() => {
    if (!busy) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  useEffect(() => () => { ctl.current?.abort(); }, []);
  function cancel() { ctl.current?.abort(); }
  async function pick(e) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file || busy) return;
    const ac = new AbortController(); ctl.current = ac;
    setBusy(true); setPct(0); setNote(""); setInfo("Đang chờ tới lượt…");
    const api = token ? "/api/release-info/upload" : "/api/release-info/inbox";
    const who = token ? { token } : { inboxKey };
    if (isArt && /^image\//.test(file.type || "") && file.size < 60 * 1048576) setThumb(URL.createObjectURL(file)); else if (isArt) setThumb("");
    const key = sessKey(token ? token.slice(-24) : inboxKey, field, file);
    let held = false, sess = null;
    try {
      await acquire(); held = true;
      if (ac.signal.aborted) throw Object.assign(new Error("Đã huỷ"), { name: "AbortError" });
      let startAt = 0, fileId = null, done = false;
      sess = lsGet(key);
      if (sess) {   // same file as an interrupted upload: ask Drive how far it got
        const st = await sessionStatus(sess.uploadUrl, file.size, ac.signal);
        if (st?.done) { fileId = st.id; done = true; }
        else if (st && !st.expired && st.next != null) startAt = st.next;
        else if (!st || st.expired) { if (st?.expired) { sess = null; lsDel(key); } else startAt = 0; }
      }
      if (!sess) {
        const init = await post(api, { ...who, action: "init", field, filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size });
        sess = { uploadUrl: init.uploadUrl, name: init.name, at: Date.now() };
        lsSet(key, sess); startAt = 0;
      }
      const onProgress = (r) => { setPct(Math.round(r * 100)); setInfo(`${mb(r * file.size)} / ${mb(file.size)}`); };
      if (startAt > 0) { setNote(`Tiếp tục từ ${mb(startAt)}…`); onProgress(startAt / file.size); }
      if (!done) {
        try {
          const r = await resumableUpload({ file, uploadUrl: sess.uploadUrl, startAt, signal: ac.signal, onProgress });
          fileId = r.id;
        } catch (err) {
          if (err.code === "expired") {   // the session died: start over once with a fresh one
            lsDel(key);
            const init = await post(api, { ...who, action: "init", field, filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size });
            sess = { uploadUrl: init.uploadUrl, name: init.name, at: Date.now() }; lsSet(key, sess);
            const r = await resumableUpload({ file, uploadUrl: sess.uploadUrl, startAt: 0, signal: ac.signal, onProgress });
            fileId = r.id;
          } else if (err.maybeDone) { fileId = null; /* the last piece may have landed: let the server check by name */ }
          else throw err;
        }
      }
      setInfo("Đang xác nhận…");
      const fin = await post(api, { ...who, action: "finalize", field, name: sess.name, size: file.size, fileId });
      lsDel(key);
      onChange(fin.file.url); setNote(`✓ Đã tải lên: ${file.name} (${mb(file.size)})`);
    } catch (err) {
      if (err.name === "AbortError") {
        if (sess?.uploadUrl) cancelSession(sess.uploadUrl);
        lsDel(key); setNote("Đã huỷ tải lên.");
      } else if (err.code === "cors") {
        setNote("⚠️ Trình duyệt/mạng này không gửi trực tiếp được lên Drive. Hãy thử mạng khác hoặc dán link (Drive/WeTransfer) vào ô bên trên.");
      } else {
        setNote("⚠️ " + (err.message || "Không tải lên được") + " — bấm Tải lên và chọn lại ĐÚNG file này để tiếp tục từ chỗ đã gửi, hoặc dán link thay thế.");
      }
    }
    if (held) release();
    setBusy(false); setInfo("");
  }
  return (
    <Field label={label} hint={hint ? `(${hint})` : ""}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div className="fs-wrap" style={{ position: "relative", flex: "1 1 220px", display: "flex", flexDirection: "column", minWidth: 0 }}>
          {inlineExtra && <style>{`@media (max-width: 560px) { .fs-sw { position: static !important; transform: none !important; align-self: flex-start; margin: 0 0 6px !important; } .fs-wrap .fs-in { padding-right: 12px !important; } }`}</style>}
          {inlineExtra && <div className="fs-sw" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", zIndex: 1 }}>{inlineExtra}</div>}
          <input className="fs-in" style={{ ...inp, width: "100%", paddingRight: inlineExtra ? 142 : 12 }} placeholder="Thêm link hoặc bấm Tải lên / Add a link or press Upload" value={value || ""} onChange={(e) => onChange(e.target.value)} />
        </div>
        {(token || inboxKey) && (busy
          ? <button type="button" onClick={cancel} style={{ flex: "0 0 auto", padding: "11px 14px", borderRadius: 10, border: "1px solid #c33", color: "#a01818", fontWeight: 800, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap", background: "#fff" }}>✕ Huỷ ({pct}%)</button>
          : <label style={{ flex: "0 0 auto", padding: "11px 14px", borderRadius: 10, border: `1px solid ${OR}`, color: OR_DK, fontWeight: 800, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap", background: "#fff" }}>
            ⬆ Tải lên
            <input type="file" style={{ display: "none" }} onChange={pick} />
          </label>)}
      </div>
      {isArt && shown && <img src={shown} alt="Artwork" onError={() => { if (!thumb) setThumbBad(true); }} style={{ display: "block", width: 120, height: 120, objectFit: "cover", borderRadius: 14, border: "1px solid #ddd", marginTop: 8, background: "#f4f4f4" }} />}
      {busy && <div style={{ height: 6, background: "#eee", borderRadius: 3, marginTop: 6 }}><div style={{ width: pct + "%", height: 6, background: OR, borderRadius: 3 }} /></div>}
      {busy && <div style={{ ...hintS, marginTop: 4 }}>{info} · Đừng đóng trang cho tới khi xong. Mất mạng thì tự thử lại.</div>}
      {note && <div style={{ ...hintS, marginTop: 4, color: note.startsWith("⚠️") ? "#a01818" : "#17652f" }}>{note}</div>}
    </Field>
  );
}

// Round 714 — real platform logos (public/brand/platform-icons/pf-*.png; YouTube reuses the existing icon)
const PL_LOGO = { spotify: "/brand/platform-icons/pf-spotify.png", apple: "/brand/platform-icons/pf-apple.png", zing: "/brand/platform-icons/pf-zing.png", nct: "/brand/platform-icons/pf-nct.png", tiktok: "/brand/platform-icons/pf-tiktok.png", facebook: "/brand/platform-icons/pf-facebook.png", instagram: "/brand/platform-icons/pf-instagram.png", youtube: "/brand/platform-icons/pf-youtube.png" };
const PlatformBadge = ({ k, size = 34 }) => { const name = PLATFORMS.find((x) => x.key === k)?.label || k; return <img src={PL_LOGO[k] || ""} alt={name} title={name} width={size} height={size} style={{ flex: "none", width: size, height: size, objectFit: "contain", borderRadius: size * 0.22, display: "block" }} />; };
function ProfilePicker({ f, set }) {
  const rows = Array.isArray(f.profiles) ? f.profiles : [];
  const upd = (i, url) => set("profiles", rows.map((r, x) => (x === i ? { ...r, url } : r)));
  const add = (p) => set("profiles", [...rows, { p, url: "" }].slice(0, 16));
  const del = (i) => set("profiles", rows.filter((_, x) => x !== i));
  const miss = (k) => !f.profile_returning && !rows.some((r) => r.p === k && String(r.url || "").trim());
  return (
    <Field label="Link profile nghệ sĩ trên các nền tảng nhạc số" hint="(nếu lần đầu phát hành với VIEENT — bắt buộc Spotify và Apple Music)">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "2px 0 10px" }}>
        {PLATFORMS.map((x) => <button key={x.key} type="button" onClick={() => add(x.key)} title={`Thêm ${x.label}`} aria-label={`Thêm ${x.label}`} style={{ border: "1px dashed #bbb", background: "#fff", borderRadius: 22, padding: 3, cursor: "pointer", minHeight: 0 }}><PlatformBadge k={x.key} /></button>)}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <PlatformBadge k={r.p} />
          <input style={{ ...inp, flex: "1 1 auto", width: "auto", borderColor: REQUIRED_PLATFORMS.includes(r.p) && miss(r.p) ? "#e8a0a0" : "#ddd" }} placeholder={`Link ${PLATFORMS.find((x) => x.key === r.p)?.label || ""}${REQUIRED_PLATFORMS.includes(r.p) && !f.profile_returning ? " *" : ""}`} value={r.url || ""} onChange={(e) => upd(i, e.target.value)} inputMode="url" />
          <button type="button" onClick={() => del(i)} aria-label="Xoá dòng" style={{ flex: "0 0 auto", width: 40, height: 40, borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer", color: "#a01818", fontWeight: 800 }}>✕</button>
        </div>
      ))}
      {!f.profile_returning && REQUIRED_PLATFORMS.filter((k) => !rows.some((r) => r.p === k)).map((k) => <div key={k} style={{ ...hintS, marginTop: 6, color: "#a01818" }}>Thiếu {PLATFORMS.find((x) => x.key === k).label} — bấm biểu tượng ở trên để thêm.</div>)}
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
        <input type="checkbox" checked={!!f.profile_returning} onChange={(e) => set("profile_returning", e.target.checked)} style={{ width: 20, height: 20, accentColor: OR, flex: "none", marginTop: 1 }} />
        <span>Nghệ sĩ đã phát hành với VIEENT trước đây — không bắt buộc điền lại (vẫn có thể thêm / đổi link).</span>
      </label>
    </Field>
  );
}

export const EMPTY = { sender_name: "", audio_kind: "final", artwork_kind: "final", song_title: "", performer: "", composer: "", producer: "", mixer: "", lyricist: "", genres: ["", ""], featuring: "", profiles: [{ p: "spotify", url: "" }, { p: "apple", url: "" }], profile_returning: false, project_kind: "", release_date: "", release_time: "", preview_time: "", tiktok_demo_date: "", lyrics: "", profile_links: "", files: {}, promo: {}, design: {}, direction: {}, contact_email: "", label: "", release_type: "", tracks: [{ title: "" }, { title: "" }], deliver_only: false, late_ack: false };
// Phone shell for the info sections (the rights form has its own copy of the base rules).
export const INFO_MOBILE_CSS = `
  html, body { overflow-x: hidden; }
  .rf-shell, .rf-shell * { box-sizing: border-box; min-width: 0; }
  .rf-shell { overflow-wrap: anywhere; -webkit-text-size-adjust: 100%; }
  .rf-shell input, .rf-shell textarea, .rf-shell select, .rf-shell button { max-width: 100%; font-size: 16px; }
  @media (max-width: 560px) {
    .rf-shell { padding: 12px 10px 40px !important; }
    .rf-shell h1 { font-size: 25px !important; line-height: 1.2 !important; }
    .rf-shell h2 { font-size: 18px !important; }
    .rf-shell div[style*="border-radius: 24px"] { padding: 16px 14px 18px !important; border-radius: 18px !important; }
    .rf-shell div[style*="flex: 1 1 200px"], .rf-shell div[style*="flex: 1 1 160px"], .rf-shell select { flex: 1 1 100% !important; }
    .rf-shell input[type="date"], .rf-shell input[type="time"] { min-height: 44px; }
    .rf-shell button, .rf-shell label[style*="cursor"] { min-height: 44px; }
    .rf-shell a[style*="border: 1px solid"] { padding: 14px !important; }
  }
`;

// Documents after submit: draw the PDF in the browser, the server builds both .docx and files all three in the product's Drive folder.
export async function makeInfoDocs(token, answers) {
  try {
    const pdf = await buildInfoPdf(infoBlocks(answers));
    const pdfUrl = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
    let bin = ""; for (let i = 0; i < pdf.length; i += 0x8000) bin += String.fromCharCode.apply(null, pdf.subarray(i, i + 0x8000));
    let res = null;
    try { res = await post("/api/release-info/docs", { token, pdfBase64: btoa(bin) }); } catch (e) { res = { ok: false, errors: { all: e.message } }; }
    return { status: "ready", pdfUrl, docs: res.docs || null, msg: res.ok ? "" : "Chưa lưu được đủ file vào Drive (" + Object.values(res.errors || {}).join("; ") + "). Bạn vẫn tải được file bên dưới." };
  } catch (e) { return { status: "ready", pdfUrl: "", docs: null, msg: "Không tạo được PDF: " + (e.message || e) }; }
}
export function InfoDocsPanel({ token, out }) {
  return (
    <div style={{ ...card, padding: "18px 20px", textAlign: "left" }}>
      <b>Tài liệu phát hành</b>
      {out.status === "working" && <p style={{ margin: "10px 0 0" }}>Đang tạo PDF và file Word, và lưu vào thư mục Drive của sản phẩm…</p>}
      {out.status === "ready" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {out.pdfUrl && <a href={out.pdfUrl} download="thong-tin-phat-hanh.pdf" style={dlBtn}>⬇ Tải PDF — Thông tin phát hành</a>}
          <a href={`/api/release-info/docs?token=${encodeURIComponent(token)}&kind=info`} style={dlBtn}>⬇ Tải file Word — Thông tin phát hành (.docx)</a>
          <a href={`/api/release-info/docs?token=${encodeURIComponent(token)}&kind=metadata`} style={dlBtn}>⬇ Tải file Word — Metadata (Lyrics) (.docx)</a>
          {out.docs && !out.msg && <div style={hintS}>✓ Đã lưu vào thư mục Drive của sản phẩm (Data).</div>}
          {out.msg && <div style={{ ...hintS, color: "#a01818" }}>{out.msg}</div>}
        </div>
      )}
    </div>
  );
}

export function prefillInfo(j) {
  const a = j.saved?.answers || {};
  const g = Array.isArray(a.genres) ? [...a.genres, "", ""].slice(0, 2) : ["", ""];
  return { ...EMPTY, ...a, tracks: Array.isArray(a.tracks) && a.tracks.length ? a.tracks.map((t) => (typeof t === "string" ? { title: t } : t)) : [{ title: "" }, { title: "" }], genres: g, profiles: Array.isArray(a.profiles) && a.profiles.length ? a.profiles : EMPTY.profiles, files: a.files || {}, promo: a.promo || {}, design: a.design || {}, direction: a.direction || {},
    song_title: a.song_title ?? j.release.title, performer: a.performer ?? j.release.performer, composer: a.composer ?? j.release.composer, release_date: a.release_date ?? j.release.release_date ?? "" };
}

// core=true: also asks the 5 basic metadata fields (stand-alone page). core=false: they come from the rights section above, only extras are asked.
// how many numbered sections the info part shows (the combined page numbers its last section from this)
export const infoSectionCount = (f) => 3 + (f.project_kind === "pitching" ? 2 : 0);   // Round 714: the tracks section is placed by the page (section 2), not counted here

// Round 714 — per-track details as its own section (stand-alone page: section 2; combined page: placed above "Xác nhận quyền" as section 2)
export function TracksDetail({ f, setF, n = 2 }) {
  if (!(f.release_type === "EP" || f.release_type === "Album")) return null;
  return (
    <div style={card}>
          <Num n={n} title={`Chi tiết từng track (${f.release_type})`} sub="Không bắt buộc. Để trống = giống thông tin chung ở trên. Bấm vào track để mở." />
          {(f.tracks || []).map((t, i) => (
            <details key={i} style={{ border: "1px solid #ececec", borderRadius: 12, padding: "10px 12px", marginTop: 10, background: "#fff" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>{i + 1}. {t.title || `Track ${i + 1}`}</summary>
              <Field label="Nghệ sĩ trình bày / Main artist"><input style={inp} value={t.performer ?? f.performer ?? ""} onChange={(e) => setF((o) => ({ ...o, tracks: o.tracks.map((x, xi) => (xi === i ? { ...x, performer: e.target.value } : x)) }))} /></Field>
              <Field label="Nghệ sĩ hợp tác / Featuring artist"><input style={inp} placeholder={f.featuring || ""} value={t.featuring || ""} onChange={(e) => setF((o) => ({ ...o, tracks: o.tracks.map((x, xi) => (xi === i ? { ...x, featuring: e.target.value } : x)) }))} /></Field>
              <Field label={<>Preview Time (giây)<InfoTip text="Nhập số giây (vd 75) hoặc dạng phút:giây (vd 1:15 hoặc 01:15) — hệ thống tự đổi sang giây khi bạn bấm ra ngoài ô." /></>} hint="(đoạn nhạc TikTok 60s bắt đầu từ giây thứ…)"><input style={inp} inputMode="text" placeholder="vd 65 hoặc 1:05" onBlur={(e) => { const v = previewSeconds(e.target.value); if (v !== e.target.value) setF((o) => ({ ...o, tracks: o.tracks.map((x, xi) => (xi === i ? { ...x, preview_time: v } : x)) })); }} value={t.preview_time || ""} onChange={(e) => setF((o) => ({ ...o, tracks: o.tracks.map((x, xi) => (xi === i ? { ...x, preview_time: e.target.value } : x)) }))} /></Field>
              {[["composer", "Sáng tác / Composer"], ["lyricist", "Người viết lời / Lyricist"], ["producer", "Nhà sản xuất / Producer"], ["mixer", "Người phối âm / Mixer"]].map(([k, lb]) => (
                <Field key={k} label={lb}><input style={inp} value={t[k] || ""} onChange={(e) => setF((o) => ({ ...o, tracks: o.tracks.map((x, xi) => (xi === i ? { ...x, [k]: e.target.value } : x)) }))} /></Field>
              ))}
              <Field label="Lời bài hát / Lyrics"><textarea style={{ ...inp, minHeight: 110, resize: "vertical" }} value={t.lyrics || ""} onChange={(e) => setF((o) => ({ ...o, tracks: o.tracks.map((x, xi) => (xi === i ? { ...x, lyrics: e.target.value } : x)) }))} /></Field>
            </details>
          ))}
        </div>
  );
}

export function InfoTip({ text }) {
  const [on, setOn] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 6, verticalAlign: "text-bottom", lineHeight: 1 }}>
      <button type="button" title={text} aria-label="Giải thích" onClick={() => setOn((v) => !v)} onBlur={() => setOn(false)} style={{ width: 17, height: 17, minHeight: 0, borderRadius: 9, border: `1px solid ${OR}`, background: on ? OR : "#fff", color: on ? "#fff" : OR_DK, fontWeight: 800, fontSize: 11, cursor: "pointer", padding: 0, lineHeight: "15px" }}>i</button>
      {on && <span role="tooltip" style={{ position: "absolute", zIndex: 5, left: 0, top: 28, width: 260, maxWidth: "70vw", background: "#222", color: "#fff", fontSize: 13, lineHeight: 1.45, fontWeight: 500, borderRadius: 10, padding: "9px 12px", boxShadow: "0 4px 14px rgba(0,0,0,.25)" }}>{text}</span>}
    </span>
  );
}

// Round 717 — shared lyrics, section 1: a link (Drive / Docs…) OR the full text
const isUrlOnly = (v) => /^https?:\/\/\S+$/i.test(String(v || "").trim());
export function LyricsField({ value, onChange }) {
  return (
    <Field label="Lời bài hát / Lyrics" hint="(dán link Drive / Docs chứa lời, hoặc dán toàn bộ lời bài hát / paste a link or the full lyrics)">
      <textarea style={{ ...inp, minHeight: isUrlOnly(value) ? 64 : 180, resize: "vertical" }} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="Điền link lyric hoặc dán toàn bộ lời bài hát ở đây" />
      {isUrlOnly(value) && <div style={{ ...hintS, marginTop: 4, color: "#17652f" }}>✓ Đang dùng link lời bài hát.</div>}
    </Field>
  );
}

// Round 718 — Demo / Chính thức switch shown inside the audio and artwork fields (saved as audio_kind / artwork_kind)
const KIND_KEYS = { audio: "audio_kind", artwork: "artwork_kind" };
function KindSwitch({ label, value, onChange }) {
  const cur = value === "demo" ? "demo" : "final";
  return (
    <div role="radiogroup" aria-label={`Loại ${label}`} style={{ display: "flex", border: `1px solid ${OR}`, borderRadius: 999, overflow: "hidden", background: "#fff" }}>
      {[["demo", "Demo"], ["final", "Chính thức"]].map(([k, lb]) => <button key={k} type="button" role="radio" aria-checked={cur === k} onClick={() => onChange(k)} style={{ border: "none", cursor: "pointer", padding: "5px 10px", minHeight: 0, fontWeight: 800, fontSize: 12.5, fontFamily: "inherit", background: cur === k ? OR : "#fff", color: cur === k ? "#fff" : OR_DK, whiteSpace: "nowrap" }}>{lb}</button>)}
    </div>
  );
}

export function ReleaseInfoSections({ token, inboxKey = "", f, setF, genreOpts = [], n0 = 1, core = true }) {
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const setIn = (grp, k, v) => setF((o) => ({ ...o, [grp]: { ...(o[grp] || {}), [k]: v } }));
  const setGenre = (i, v) => setF((o) => ({ ...o, genres: o.genres.map((g, x) => (x === i ? v : g)) }));
  const dl = deadlineCheck(f.project_kind, f.release_date);
  const dOnly = isDeliverOnly(f);
  const tr = core && (f.release_type === "EP" || f.release_type === "Album") ? 1 : 0;
  return (
    <>
        <div style={card}>
          <Num n={n0 + 0} title={core ? "Dữ liệu sản phẩm (Metadata)" : "Metadata bổ sung / Extra metadata"} />
          {core && (<>
          <Field label="Tên sản phẩm / Product title *"><input style={inp} value={f.song_title} onChange={(e) => set("song_title", e.target.value)} /></Field>
          <Field label="Nghệ sĩ trình bày / Main artist *"><input style={inp} value={f.performer} onChange={(e) => set("performer", e.target.value)} /></Field>
          <Field label="Nghệ sĩ hợp tác / Featuring artist" hint="(nếu có / if any)"><input style={inp} value={f.featuring || ""} onChange={(e) => set("featuring", e.target.value)} /></Field>
          <Field label="Sáng tác / Composer *" hint="(tên phải có 2 chữ trở lên hoặc dùng họ & tên thật / at least 2 words or your real full name)"><input style={inp} value={f.composer} onChange={(e) => set("composer", e.target.value)} /></Field>
          <Field label="Người viết lời / Lyricist" hint="(nếu khác người sáng tác / if different from the composer)"><input style={inp} value={f.lyricist} onChange={(e) => set("lyricist", e.target.value)} /></Field>
          <Field label="Nhà sản xuất / Producer"><input style={inp} value={f.producer} onChange={(e) => set("producer", e.target.value)} /></Field>
          <Field label="Người phối âm / Mixer"><input style={inp} value={f.mixer} onChange={(e) => set("mixer", e.target.value)} /></Field>
          <LyricsField value={f.lyrics} onChange={(v) => set("lyrics", v)} />
          </>)}
          <Field label="Thể loại / Genre" hint="(tối đa 02 thể loại mô tả đúng nhất về bài hát / up to 2 genres that best describe the song)">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {f.genres.slice(0, 2).map((g, i) => genreOpts.length ? (
                <select key={i} style={{ ...inp, flex: "1 1 180px", width: "auto" }} value={g} onChange={(e) => setGenre(i, e.target.value)}>
                  <option value="">{`— Thể loại ${i + 1} —`}</option>
                  {genreOpts.filter((o) => o.value === g || !f.genres.includes(o.value)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  {g && !genreOpts.some((o) => o.value === g) && <option value={g}>{g}</option>}
                </select>
              ) : (
                <input key={i} style={{ ...inp, flex: "1 1 180px", width: "auto" }} placeholder={`Thể loại ${i + 1}`} value={g} onChange={(e) => setGenre(i, e.target.value)} />
              ))}
            </div>
          </Field>
          {!(f.release_type === "EP" || f.release_type === "Album") && (
            <Field label={<>Preview Time (giây)<InfoTip text="Nhập số giây (vd 75) hoặc dạng phút:giây (vd 1:15 hoặc 01:15) — hệ thống tự đổi sang giây khi bạn bấm ra ngoài ô." /></>} hint="(đoạn nhạc TikTok 60s bắt đầu từ giây thứ…)"><input style={inp} inputMode="text" placeholder="vd 65 hoặc 1:05" onBlur={(e) => { const v = previewSeconds(e.target.value); if (v !== e.target.value) set("preview_time", v); }} value={f.preview_time} onChange={(e) => set("preview_time", e.target.value)} /></Field>
          )}
          <ProfilePicker f={f} set={set} />
        </div>

        {core && <TracksDetail f={f} setF={setF} n={n0 + 1} />}

        <div style={card}>
          <Num n={n0 + 1 + tr} title="Thời gian phát hành" sub="Để đảm bảo kế hoạch phát hành và hỗ trợ quảng bá đạt hiệu quả tốt nhất." />
          <label style={lab}>Loại dự án *</label>
          {PROJECT_KINDS.map((k) => (
            <label key={k.key} style={optBox(f.project_kind === k.key)}>
              <input type="radio" name="kind" checked={f.project_kind === k.key} onChange={() => set("project_kind", k.key)} style={{ width: 20, height: 20, accentColor: OR, marginTop: 2 }} />
              <span>{k.label}<span style={{ display: "block", ...hintS }}>{k.sub}</span></span>
            </label>
          ))}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}><Field label="Ngày phát hành *"><input type="date" style={inp} value={f.release_date} onChange={(e) => set("release_date", e.target.value)} /></Field></div>
            <div style={{ flex: "1 1 160px" }}><Field label="Giờ phát hành"><input type="time" style={inp} value={f.release_time} onChange={(e) => set("release_time", e.target.value)} /></Field></div>
          </div>
          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: dl.level === "warn" ? "#fdecec" : dl.level === "ok" ? "#e9f7ee" : "#f1f1f1", color: dl.level === "warn" ? "#a01818" : dl.level === "ok" ? "#17652f" : "#444" }}>
            {dl.level === "warn" ? "⚠️ " : dl.level === "ok" ? "✅ " : "ℹ️ "}{dl.text}
          </div>
          {dl.late && (
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 8, padding: "10px 12px", background: "#fff", border: `1px solid ${f.late_ack ? OR : "#f3b4b4"}`, borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
              <input type="checkbox" checked={!!f.late_ack} onChange={(e) => set("late_ack", e.target.checked)} style={{ width: 20, height: 20, accentColor: OR, marginTop: 1, flex: "none" }} />
              <span>Tôi hiểu dự án gửi chưa đủ thời hạn tối thiểu — VIEENT có thể không kịp hỗ trợ đúng ngày phát hành. *</span>
            </label>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}><Field label="Ngày phát hành demo TikTok" hint="(nếu có)"><input type="date" style={inp} value={f.tiktok_demo_date} onChange={(e) => set("tiktok_demo_date", e.target.value)} /></Field></div>
          </div>
        </div>

        <div style={card}>
          <Num n={n0 + 2 + tr} title="File sản phẩm" sub="Bấm Tải lên để gửi thẳng vào thư mục Drive của sản phẩm (tối đa 500MB/file), hoặc dán link nếu file lớn hơn." />
          {FILE_FIELDS.map((x) => <FileSlot key={x.key} token={token} inboxKey={inboxKey} field={`files.${x.key}`} label={x.label + (x.key === "audio" || x.key === "artwork" ? " *" : "")} hint={x.hint} value={f.files?.[x.key]} onChange={(v) => setIn("files", x.key, v)}
            inlineExtra={KIND_KEYS[x.key] ? <KindSwitch label={x.label} value={f[KIND_KEYS[x.key]]} onChange={(v) => set(KIND_KEYS[x.key], v)} /> : null} />)}
        </div>

        <div style={{ ...card, border: `2px solid ${dOnly ? OR : BORDER}`, padding: "16px 18px" }}>
          {!f.project_kind ? <span><b>Chọn "Loại dự án" ở trên</b> để biết cần điền thêm phần nào.</span>
            : dOnly ? <span><b>Chỉ phát hành / Only deliver</b><span style={{ display: "block", ...hintS, marginTop: 2 }}>Với loại dự án này, bạn không cần điền các phần Tư liệu truyền thông, Định hướng nội dung và Thiết kế.</span></span>
            : <span><b>Pitching & hỗ trợ truyền thông</b><span style={{ display: "block", ...hintS, marginTop: 2 }}>Cần điền ít nhất {REST_MIN} mục ở các phần bên dưới (hiện đã điền {Math.min(restFilled(f), 99)}/{REST_MIN}). Nếu chỉ cần phát hành, hãy đổi "Loại dự án" thành Chỉ phát hành.</span></span>}
        </div>

        {f.project_kind === "pitching" && (<>
        <div style={card}>
          <Num n={n0 + 3 + tr} title="Tư liệu truyền thông (Promo assets)" sub={`Cần điền ít nhất ${REST_MIN} mục trong các phần Promo / Định hướng / Thiết kế (loại dự án Pitching).`} />
          {PROMO_FIELDS.map((x) => <FileSlot key={x.key} token={token} inboxKey={inboxKey} field={`promo.${x.key}`} label={x.label} hint={x.hint} value={f.promo?.[x.key]} onChange={(v) => setIn("promo", x.key, v)} />)}
          <h3 style={{ margin: "22px 0 0", fontSize: 17 }}>Định hướng nội dung</h3>
          {DIRECTION_FIELDS.map((x) => <Field key={x.key} label={x.label} hint={x.hint}><textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={f.direction?.[x.key] || ""} onChange={(e) => setIn("direction", x.key, e.target.value)} /></Field>)}
        </div>

        {f.project_kind === "pitching" && (
          <div style={card}>
            <Num n={n0 + 4 + tr} title="Tư liệu thiết kế (Design specs)" sub="Áp dụng cho các dự án đăng ký Pitching Editorial Banner trên các nền tảng nhạc số." />
            {DESIGN_FIELDS.map((x) => <FileSlot key={x.key} token={token} inboxKey={inboxKey} field={`design.${x.key}`} label={x.label} hint={x.hint} value={f.design?.[x.key]} onChange={(v) => setIn("design", x.key, v)} />)}
          </div>
        )}
        </>)}

    </>
  );
}
