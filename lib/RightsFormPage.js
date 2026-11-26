"use client";

import { useEffect, useRef, useState } from "react";
import { RIGHTS, META_FIELDS, cleanDeclaration } from "./rightsForm";
import { buildRightsPdf } from "./rightsPdf";
import { cleanReleaseInfo } from "./releaseInfoForm";
import { ReleaseInfoSections, TracksDetail, InfoTip, LyricsField, EMPTY as INFO_EMPTY, InfoDocsPanel, makeInfoDocs, prefillInfo, infoSectionCount, INFO_MOBILE_CSS } from "./ReleaseInfoSections";
import ReleaseIntroStep, { TermsBlock } from "./ReleaseIntroStep";

// Round 633 — PUBLIC "Khai báo bản quyền ca khúc mới" (no login, per-release signed link). Not wrapped in AppShell.
// Submit = save the answers (pending, for AR) + store the signed PDF in Drive + download the same PDF here.
const OR = "#f26a0f", OR_DK = "#c2410c", BORDER = "#f5d9c3";
const card = { background: "#fff", border: "1px solid #ececec", borderRadius: 24, padding: "22px 22px 24px", marginBottom: 18 };
const optBox = (on) => ({ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#fff", border: `1px solid ${on ? OR : BORDER}`, borderRadius: 12, cursor: "pointer", flex: "1 1 200px", fontWeight: 700, fontSize: 15 });

function Num({ n, title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <span style={{ width: 40, height: 40, borderRadius: 20, background: "#fdeadd", color: OR_DK, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
      <h2 style={{ margin: 0, fontSize: 21 }}>{title}</h2>
    </div>
  );
}
const HELP = {
  song_title: "Tên chính thức của ca khúc, đúng như sẽ hiển thị khi phát hành. Gõ từ 3 chữ để chọn nhanh từ danh sách VIEENT.",
  composer: "Nhạc sĩ / người sáng tác (nhạc và lời). Nhiều người: cách nhau bằng dấu phẩy.",
  performer: "Ca sĩ / nghệ sĩ trình bày chính trên bản ghi.",
  producer: "Người sản xuất âm nhạc (hòa âm phối khí) của bản ghi.",
  mixer: "Người mix bản ghi.",
};
const RIGHT_HELP = {
  master: "Quyền của nhà sản xuất bản ghi âm: quyền đối với chính bản thu âm (file master) — ai bỏ vốn / sở hữu bản thu. Quyết định việc phát hành, phân phối, đăng tải bản ghi lên các nền tảng.",
  performing: "Quyền của người biểu diễn (ca sĩ, nhạc công): quyền đối với phần trình diễn có trong bản ghi — được nêu tên, bảo vệ sự toàn vẹn của phần biểu diễn, và cho phép / nhận thù lao khi bản ghi được khai thác.",
  publishing: "Quyền tác giả (nhạc và lời): quyền của nhạc sĩ / nhà xuất bản âm nhạc đối với chính tác phẩm âm nhạc — cho phép sao chép, phát hành, biểu diễn, đưa lên mạng bản nhạc / lời của ca khúc.",
};
const HOW_HELP = [
  ["Sở hữu", "Bạn (hoặc công ty bạn) là chủ của quyền đó."],
  ["Được cấp phép", "Quyền thuộc người khác, nhưng họ đã cho phép bạn phát hành — cần gửi kèm xác nhận (tin nhắn / email / hợp đồng)."],
];

function Check({ on, onChange, label, sub }) {
  return (
    <label style={optBox(on)}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 20, height: 20, accentColor: OR }} />
      <span>{label}{sub && <span style={{ display: "block", fontWeight: 400, fontSize: 13, color: "#666" }}>{sub}</span>}</span>
    </label>
  );
}

// Round 715 — one track's rights, collapsed by default (same fields as the shared block; empty = same as shared)
const trackRightsUsed = (t) => { const r = t.rights || {}; return !!(String(t.rights_note || "").trim() || r.platforms || r.term || r.proof || RIGHTS.some((x) => r.owned?.[x.key] || r.licensed?.[x.key])); };
function TrackRights({ n, t, upd, input, help }) {
  const r = t.rights || {};
  const setR = (patch) => upd({ rights: { ...r, ...patch } });
  const setRt = (grp, key, on) => { const other = grp === "owned" ? "licensed" : "owned"; setR({ [grp]: { ...(r[grp] || {}), [key]: on }, [other]: on ? { ...(r[other] || {}), [key]: false } : (r[other] || {}) }); };
  const used = trackRightsUsed(t);
  const anyLic = RIGHTS.some((x) => r.licensed?.[x.key]);
  const h = { fontWeight: 700, margin: "12px 0 8px", fontSize: 14 };
  return (
    <details style={{ border: `1px solid ${used ? OR : "#ececec"}`, borderRadius: 14, padding: "10px 12px", marginTop: 10, background: "#fff" }}>
      <summary style={{ cursor: "pointer", fontWeight: 700, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span>{n}. {t.title}</span>
        <span style={{ fontWeight: 600, fontSize: 12.5, color: used ? OR_DK : "#777" }}>{used ? "● đã ghi riêng" : "giống phần chung"}</span>
        <InfoTip text="Mở ra để điền quyền riêng cho track này nếu khác phần xác nhận chung (quyền sở hữu / cấp phép, nền tảng, thời hạn). Track nào giống phần chung thì không cần mở." />
      </summary>
      <div style={{ background: "#fdf1e8", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 12, marginTop: 10 }}>
        <div style={{ ...h, marginTop: 0 }}>Các quyền tôi sở hữu:</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {RIGHTS.map((x) => <Check key={x.key} on={!!r.owned?.[x.key]} onChange={(on) => setRt("owned", x.key, on)} label={x.vi} sub={`(${x.en})`} />)}
        </div>
        <div style={h}>Các quyền được cấp phép sử dụng bởi chủ sở hữu quyền:</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {RIGHTS.map((x) => <Check key={x.key} on={!!r.licensed?.[x.key]} onChange={(on) => setRt("licensed", x.key, on)} label={x.vi} sub={`(${x.en})`} />)}
        </div>
        {anyLic && (<div><label style={h}>Link minh chứng từ chủ sở hữu (nếu có):</label><textarea style={{ ...input, minHeight: 56 }} value={r.proof || ""} maxLength={500} onChange={(e) => setR({ proof: e.target.value })} /></div>)}
        <div style={h}>Nền tảng được cấp phép:</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Check on={r.platforms === "all"} onChange={(on) => setR({ platforms: on ? "all" : "" })} label="Tất cả các nền tảng" />
          <Check on={r.platforms === "some"} onChange={(on) => setR({ platforms: on ? "some" : "" })} label="Một số nền tảng theo thỏa thuận" />
        </div>
        {r.platforms === "some" && <input style={{ ...input, marginTop: 8 }} placeholder="Nền tảng nào? (ví dụ: Spotify, Zing MP3)" value={r.platforms_note || ""} maxLength={300} onChange={(e) => setR({ platforms_note: e.target.value })} />}
        <div style={h}>Thời hạn đăng tải bản ghi:</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Check on={r.term === "perpetual"} onChange={(on) => setR({ term: on ? "perpetual" : "" })} label="Vĩnh viễn" />
          <Check on={r.term === "limited"} onChange={(on) => setR({ term: on ? "limited" : "" })} label="Có thời hạn" />
        </div>
        {r.term === "limited" && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            {[["term_from", "Từ ngày"], ["term_to", "Đến ngày"]].map(([k, lab]) => (
              <label key={k} style={{ flex: "1 1 160px", fontSize: 13, fontWeight: 700 }}>{lab}:
                <input type="date" value={r[k] || ""} min={k === "term_to" ? r.term_from || undefined : undefined} onChange={(e) => setR({ [k]: e.target.value })} style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "9px 10px", fontSize: 15, border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit", background: "#fff" }} />
              </label>
            ))}
          </div>
        )}
        <div style={h}>Ghi chú thêm cho track này:</div>
        <textarea style={{ ...input, minHeight: 56 }} value={t.rights_note || ""} maxLength={600} placeholder="vd: beat mua của producer X, chỉ được cấp phép đến 12/2027" onChange={(e) => upd({ rights_note: e.target.value })} />
      </div>
    </details>
  );
}

const SHOW_RIGHT_EXPIRY = false;   // per-right "Thời hạn" pickers: hidden for now (data field kept)

export default function RightsFormPage({ token = "", withInfo = false, demo = false }) {
  const infoOn = !!withInfo;   // Round 698: rights + Thông tin phát hành on ONE page / one code / one submit (needs the per-release link for uploads)
  const [info, setInfo] = useState(INFO_EMPTY);
  const [step, setStep] = useState(withInfo ? 0 : 1);   // Round 701: page 0 = label + type + terms, page 1 = the form
  const [introErr, setIntroErr] = useState("");
  const [genreOpts, setGenreOpts] = useState([]);
  const [savedInfoStatus, setSavedInfoStatus] = useState("");   // Round 708 — this product already has a submitted info form -> offer the view / edit page
  const [inboxKey, setInboxKey] = useState("");   // Round 700: random folder key for uploads made before the song is linked to a product
  useEffect(() => { try { const a = new Uint8Array(12); crypto.getRandomValues(a); setInboxKey(Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("")); } catch (e) { /* uploads then need a product link */ } }, []);
  const [infoOut, setInfoOut] = useState({ status: "idle", pdfUrl: "", docs: null, msg: "" });
  const [help, setHelp] = useState(false);   // "Hướng dẫn" toggle: red hints inside the fields + what each right means
  const [picked, setPicked] = useState({ title: "", token: "" });   // song chosen from the search list
  const [sugg, setSugg] = useState([]);
  // token empty = the ONE public link (blank form, nothing remembered: refresh / new device = fresh form).
  const [state, setState] = useState(token ? "loading" : "ready");   // loading | ready | bad | done
  const [f, setF] = useState({ song_title: "", composer: "", performer: "", producer: "", mixer: "", owned: {}, licensed: {}, licensed_until: {}, contact_email: "", term_from: "", term_to: "", holder_name: "", holder_email: "", proof: "", platforms: "", platforms_note: "", term: "", term_note: "", signer_name: "" });
  const [err, setErr] = useState("");
  // Round 645 — duplicate song: { declared, masked, claim, release } from /api/rights-declaration?check=1
  const [dup, setDup] = useState(null);
  const [dupMode, setDupMode] = useState("");   // "" | "delete" | "copy"
  const [dd, setDd] = useState({ email: "", reason: "", challenge: "", code: "", msg: "", busy: false, copyMsg: "" });
  const [unlock, setUnlock] = useState(null);   // { replaceToken } once the OLD email proved
  const [changeReason, setChangeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");   // what the button says while working (masks the wait)
  const [consent, setConsent] = useState(false);   // "I agree ... for identifying purposes only"
  const tokens = useRef({ vt: "", st: "" });   // Round 649: server-signed "form opened" / "code sent" evidence
  const [otp, setOtp] = useState({ challenge: "", code: "", cool: 0 });   // email code step
  const clientInfo = () => { try { return { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: navigator.language, screen: `${screen.width}x${screen.height}`, platform: navigator.userAgentData?.platform || navigator.platform || "" }; } catch (e) { return {}; } };
  useEffect(() => {   // warm-ups so the first search / first PDF are not slow
    try { ["400", "600", "700", "800"].forEach((w) => document.fonts.load(`${w} 24px ${getComputedStyle(document.body).fontFamily}`, "Khai báo bản quyền")); } catch (e) { /* ignore */ }
    if (!token) fetch("/api/rights-declaration?q=_warm").catch(() => {});
    fetch("/api/rights-declaration?view=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.vt) tokens.current.vt = j.vt; }).catch(() => {});   // Round 649: "form opened" evidence for the audit trail
  }, [token]);
  useEffect(() => { if (otp.cool <= 0) return; const t = setTimeout(() => setOtp((o) => ({ ...o, cool: o.cool - 1 })), 1000); return () => clearTimeout(t); }, [otp.cool]);
  const [result, setResult] = useState(null);   // { pdfBlobUrl, pdfSaved }
  const pad = useRef(null);
  const hp = useRef(null);   // honeypot (bots fill it)
  const drawing = useRef(false);
  const inked = useRef(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/rights-declaration?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.release) { setState("bad"); return; }
        setF((p) => ({ ...p, song_title: j.release.title, performer: j.release.performer, composer: j.release.composer }));
        setState("ready");
      })
      .catch(() => setState("bad"));
  }, [token]);

  // Round 699: the product link that unlocks uploads + Drive documents = the link in the URL, or the product the artist picked from the search list (blank form)
  const multiRel = infoOn && (info.release_type === "EP" || info.release_type === "Album");
  const infoToken = token || (picked.token && picked.title === f.song_title ? picked.token : "");
  useEffect(() => {
    if (!infoOn) return;
    if (!infoToken) { fetch("/api/release-info?genres=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && Array.isArray(j.genres)) setGenreOpts(j.genres); }).catch(() => {}); return; }
    fetch(`/api/release-info?token=${encodeURIComponent(infoToken)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j?.release) return;
      setInfo((cur) => (draftAppliedRef.current ? cur : { ...prefillInfo(j), ...(j.saved ? {} : { lyricist: cur.lyricist, genres: cur.genres, lyrics: cur.lyrics, project_kind: cur.project_kind, release_time: cur.release_time, preview_time: cur.preview_time, tiktok_demo_date: cur.tiktok_demo_date, profile_links: cur.profile_links, release_date: cur.release_date || prefillInfo(j).release_date }) }));
      setGenreOpts(Array.isArray(j.genres) ? j.genres : []);
      setSavedInfoStatus(j.saved ? String(j.saved.status || "submitted") : "");
    }).catch(() => {});
  }, [infoOn, infoToken]);
  // Round 704 — draft autosave in THIS browser (a long lyrics box survives a refresh / the phone sleeping). Never stored: signature, email code, consent.
  const draftKey = `vieent_khaibao_draft_${token ? token.slice(0, 40) : "blank"}${demo ? "_demo" : ""}`;
  const restoredRef = useRef(false);
  const draftAppliedRef = useRef(false);
  const [draftNote, setDraftNote] = useState(false);
  useEffect(() => {
    if (state !== "ready" || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const d = JSON.parse(window.localStorage.getItem(draftKey) || "null");
      if (!d || !d.f || Date.now() - (d.at || 0) > 14 * 86400000) return;
      setF((p) => ({ ...p, ...d.f }));
      if (infoOn && d.info) setInfo((cur) => ({ ...cur, ...d.info }));
      if (d.picked && d.picked.title) setPicked(d.picked);
      if (infoOn && d.step === 1) setStep(1);
      draftAppliedRef.current = true; setDraftNote(true);
    } catch (e) { /* no storage: no draft */ }
  }, [state, draftKey, infoOn]);
  useEffect(() => {
    if (state !== "ready" || !restoredRef.current) return;
    const t = setTimeout(() => { try { window.localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), f, info: infoOn ? info : null, step, picked })); } catch (e) { /* storage full / blocked */ } }, 800);
    return () => clearTimeout(t);
  }, [state, draftKey, f, info, step, picked, infoOn]);
  const clearDraft = () => { try { window.localStorage.removeItem(draftKey); } catch (e) { /* ignore */ } };
  const reopenUrl = infoOn && infoToken ? `${typeof window !== "undefined" ? window.location.origin : ""}${demo ? "/khai-bao-demo/" : "/khai-bao/"}${encodeURIComponent(infoToken)}/thong-tin` : "";
  const reopenBox = infoOn && savedInfoStatus && reopenUrl ? (
    <div style={{ background: "#eef6ff", border: "1px solid #c7d8f5", borderRadius: 12, padding: "12px 14px", margin: "10px 0", fontSize: 14 }}>
      <b>Sản phẩm này đã có thông tin phát hành được gửi.</b> Bạn có thể xem lại, sửa và tải thêm file tại trang riêng.
      <div style={{ marginTop: 8 }}><a href={reopenUrl} style={{ display: "inline-block", padding: "10px 14px", borderRadius: 10, background: OR, color: "#fff", fontWeight: 800, textDecoration: "none" }}>Xem / sửa thông tin đã gửi →</a></div>
    </div>
  ) : null;
  const draftBox = draftNote ? <div style={{ background: "#eef6ff", border: "1px solid #c7d8f5", borderRadius: 12, padding: "10px 14px", margin: "12px 0 0", fontSize: 14 }}>Đã khôi phục bản nháp từ lần điền trước trên thiết bị này. <button type="button" onClick={() => { clearDraft(); window.location.reload(); }} style={{ border: "none", background: "none", color: "#c2410c", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Bắt đầu lại</button></div> : null;

  // the answers of the info part = the extra fields + the 5 basics the rights section already asks (one source) + the same email
  const mergedInfo = (d) => ({ ...info, song_title: d.song_title, performer: d.performer, composer: d.composer, producer: d.producer, mixer: d.mixer, contact_email: d.contact_email });

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // song-title search (debounced, 3+ letters). Free typing still works; picking a suggestion fills artist / composer and links the product.
  useEffect(() => {
    const q = f.song_title.trim();
    if (token || q.length < 3 || q === picked.title) { setSugg([]); return; }
    let live = true;
    const t = setTimeout(() => {
      fetch(`/api/rights-declaration?q=${encodeURIComponent(q)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) setSugg(j?.results || []); }).catch(() => {});
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [f.song_title, token, picked.title]);
  useEffect(() => {   // Round 645 — is this song (title + performer, ignoring accents / case / symbols) already declared?
    setUnlock(null); setDupMode(""); setDd((d) => ({ ...d, challenge: "", code: "", msg: "", copyMsg: "" }));
    const t = f.song_title.trim(), a = f.performer.trim();
    if (t.length < 2 || !a) { setDup(null); return; }
    let live = true;
    const h = setTimeout(() => {
      fetch(`/api/rights-declaration?check=1&title=${encodeURIComponent(t)}&artist=${encodeURIComponent(a)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) setDup(j); }).catch(() => {});
    }, 600);
    return () => { live = false; clearTimeout(h); };
  }, [f.song_title, f.performer]);
  const locked = !!(dup?.declared && !unlock);

  async function dupCall(payload) {
    setDd((d) => ({ ...d, busy: true, msg: "" }));
    const { r, j } = await post({ claim: dup.claim, ...payload });
    setDd((d) => ({ ...d, busy: false }));
    if (!r.ok) { setDd((d) => ({ ...d, msg: j.error || `Lỗi ${r.status}` })); return null; }
    return j;
  }
  async function viewOld() { setDupMode("copy"); const j = await dupCall({ action: "copy" }); if (j) setDd((d) => ({ ...d, copyMsg: `Đã gửi một bản sao chép khai báo đến hòm thư ${j.masked}. Vui lòng kiểm tra hòm thư của bạn.` })); }
  async function sendOldCode() {
    const j = await dupCall({ action: "old_code", typed_email: dd.email, reason: dd.reason });
    if (j) setDd((d) => ({ ...d, challenge: j.challenge, code: "" }));
  }
  async function verifyOld() {
    const j = await dupCall({ action: "old_verify", challenge: dd.challenge, code: dd.code.trim(), typed_email: dd.email, reason: dd.reason });
    if (j) { setUnlock({ replaceToken: j.replaceToken }); setChangeReason(dd.reason); }
  }
  function pick(s) {
    setF((p) => ({ ...p, song_title: s.title, performer: s.performer || p.performer, composer: s.composer || p.composer }));
    setPicked({ title: s.title, token: s.token });
    setSugg([]);
  }
  const setRight = (grp, key, on) => setF((p) => {
    const other = grp === "owned" ? "licensed" : "owned";
    return { ...p, [grp]: { ...p[grp], [key]: on }, [other]: on ? { ...p[other], [key]: false } : p[other] };
  });

  function pos(e) { const r = pad.current.getBoundingClientRect(); return [(e.clientX - r.left) * (pad.current.width / r.width), (e.clientY - r.top) * (pad.current.height / r.height)]; }
  function down(e) { drawing.current = true; const c = pad.current.getContext("2d"); const [x, y] = pos(e); c.lineWidth = 4; c.lineCap = "round"; c.strokeStyle = "#111"; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.1, y + 0.1); c.stroke(); inked.current = true; pad.current.setPointerCapture?.(e.pointerId); }
  function move(e) { if (!drawing.current) return; const c = pad.current.getContext("2d"); const [x, y] = pos(e); c.lineTo(x, y); c.stroke(); }
  function up() { drawing.current = false; }
  function clearPad() { const c = pad.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); inked.current = false; }

  const post = async (payload) => { const r = await fetch("/api/rights-declaration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ website: hp.current?.value || "", ...payload }) }); return { r, j: await r.json().catch(() => ({})) }; };

  async function sendCode(v) {
    setBusy(true);
    try {
      const { r, j } = await post({ action: "send_code", form: v.data, consent: true });
      if (!r.ok) { setErr(j.error || `Lỗi ${r.status}`); setBusy(false); return; }
      tokens.current.st = j.sentToken || "";
      setOtp({ challenge: j.challenge, code: "", cool: 60 });
    } catch (ex) { setErr("Không gửi được mã. Vui lòng thử lại."); }
    setBusy(false);
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    const v = cleanDeclaration(f);
    if (locked) { setErr("Bài hát này đã được khai báo — vui lòng chọn xoá khai báo cũ hoặc xem lại bản đã khai báo."); return; }
    if (!v.ok) { setErr(v.error); return; }
    if (unlock && changeReason.trim().length < 5) { setErr("Vui lòng nhập lý do thay đổi (ít nhất 5 ký tự)."); return; }
    if (infoOn) { const ci = cleanReleaseInfo(mergedInfo(v.data), { intro: true }); if (!ci.ok) { setErr(ci.error); window.scrollTo({ top: 0, behavior: "smooth" }); return; } }
    if (!inked.current) { setErr("Vui lòng ký vào ô Chữ ký."); return; }
    if (!consent) { setErr("Vui lòng tích đồng ý cho VIEENT ghi nhận thông tin xác minh."); return; }
    if (!otp.challenge) { await sendCode(v); return; }   // step 1: email the code
    if (!/^\d{6}$/.test(otp.code.trim())) { setErr("Nhập mã 6 số đã gửi về email của bạn."); return; }
    setBusy(true);
    try {
      setStage("Đang xác minh mã…");
      const vr = await post({ action: "verify", form: v.data, consent: true, challenge: otp.challenge, code: otp.code.trim(), client: clientInfo(), viewToken: tokens.current.vt, sentToken: tokens.current.st });
      if (!vr.r.ok) { setErr(vr.j.error || `Lỗi ${vr.r.status}`); setBusy(false); return; }
      const audit = vr.j.audit;
      setStage("Đang tạo file PDF…");
      const fam = getComputedStyle(document.body).fontFamily;
      const bytes = await buildRightsPdf(v.data, pad.current, fam, audit);
      let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      const pdfBlobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setStage("Đang lưu lên hệ thống & gửi email… (vài giây)");
      const { r, j } = await post({ token: token || (picked.token && picked.title === f.song_title ? picked.token : ""), form: v.data, pdfBase64: btoa(bin), auditToken: vr.j.auditToken, ...(infoOn ? { info: mergedInfo(v.data), infoDemo: !!demo, inboxKey } : {}), ...(unlock ? { replaceToken: unlock.replaceToken, change_reason: changeReason.trim() } : {}) });
      if (!r.ok) { setErr(j.error || `Lỗi ${r.status}`); setResult({ pdfBlobUrl, failed: true }); setBusy(false); return; }
      setResult({ replaced: !!j.replaced, pdfBlobUrl, pdfSaved: j.pdfSaved, emailed: !!j.emailed, email: v.data.contact_email, signRequested: !!j.signRequested, holderMailed: j.holderMailed, holderEmail: v.data.holder_email });
      if (infoOn) { setInfoOut({ status: "working", pdfUrl: "", docs: null, msg: "" }); if (infoToken) makeInfoDocs(infoToken, mergedInfo(v.data)).then(setInfoOut); else setInfoOut({ status: "unlinked", pdfUrl: "", docs: null, msg: "" }); }
      clearDraft();
      setState("done");
      if (j.emailed) { setBusy(false); return; }   // sent to their inbox: no automatic download
      const a = document.createElement("a"); a.href = pdfBlobUrl; a.download = `Khai-bao-ban-quyen-${(v.data.song_title || "ca-khuc").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40)}.pdf`; document.body.appendChild(a); a.click(); a.remove();
    } catch (ex) { setErr("Có lỗi khi tạo file PDF. Vui lòng thử lại."); }
    setBusy(false); setStage("");
  }

  const wrap = { minHeight: "100vh", background: "#fafafa", color: "#111", padding: "20px 16px 48px" };
  const inner = { maxWidth: 760, margin: "0 auto" };
  if (state === "loading") return <div style={wrap}><div style={inner}>Đang tải…</div></div>;
  if (state === "bad") return <div style={wrap}><div style={inner}><h1>Link không hợp lệ</h1><p>Link này không đúng hoặc đã bị thay đổi. Vui lòng xin lại link từ VIEENT.</p></div></div>;
  if (state === "done") return (
    <div style={wrap}><div style={inner}>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 44 }}>✅</div>
        <h1 style={{ fontSize: 26 }}>Đã gửi khai báo</h1>
        {result?.replaced && <p style={{ fontWeight: 700 }}>Khai báo mới đã thay thế khai báo cũ của bài hát (bản cũ được lưu lại để đối chiếu).</p>}
        <p>Cảm ơn bạn. Bộ phận AR của VIEENT sẽ kiểm tra và xác nhận. {result?.emailed ? `Bản khai báo (PDF) đã được gửi tới ${result.email}.` : "File PDF đã được tải xuống thiết bị của bạn."}{result?.email && !result?.emailed ? " Không gửi được email, nên file đã được tải về thiết bị." : ""}</p>
        {result?.signRequested && <p style={{ fontWeight: 700, color: "#2b4a7a" }}>{result.holderMailed === false ? `Chưa gửi được email xác nhận tới ${result.holderEmail} — AR sẽ gửi lại.` : `Đã gửi link xác nhận tới ${result.holderEmail}. Khai báo sẽ được AR xác nhận sau khi chủ sở hữu quyền xác nhận.`}</p>}
        <a href={result?.pdfBlobUrl} download="Khai-bao-ban-quyen.pdf" style={{ color: OR_DK, fontWeight: 700 }}>Tải lại file PDF</a>
        {infoOn && infoOut.status === "unlinked" && <div style={{ marginTop: 14, padding: "12px 14px", border: `1px solid ${BORDER}`, borderRadius: 14, textAlign: "left", fontSize: 14 }}><b>Thông tin phát hành đã được ghi nhận.</b> VIEENT sẽ liên kết với sản phẩm và tạo hồ sơ (PDF / Word) trong thư mục Drive của sản phẩm.</div>}
        {infoOn && infoToken && infoOut.status !== "unlinked" && <div style={{ marginTop: 14 }}><InfoDocsPanel token={infoToken} out={infoOut} /></div>}
        {reopenUrl && infoOut.status !== "unlinked" && (
          <div style={{ marginTop: 14, padding: "12px 14px", border: `1px solid ${BORDER}`, borderRadius: 14, textAlign: "left", fontSize: 14 }}>
            <b>Link để quay lại xem / sửa thông tin phát hành và tải thêm file</b>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <input readOnly value={reopenUrl} onFocus={(e) => e.target.select()} style={{ flex: "1 1 220px", minWidth: 0, padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10, fontSize: 14 }} />
              <button type="button" onClick={() => { try { navigator.clipboard.writeText(reopenUrl); } catch (e) { /* select the box */ } }} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${OR}`, background: "#fff", color: OR_DK, fontWeight: 800, cursor: "pointer" }}>Copy link</button>
            </div>
          </div>
        )}
        {!infoOn && process.env.NEXT_PUBLIC_RELEASE_INFO_STEP2 === "1" && (token || picked.token) && (
          <div style={{ marginTop: 18, padding: "14px 16px", border: `1px solid ${BORDER}`, borderRadius: 14, textAlign: "left" }}>
            <b>Bước 2 (tiếp theo): Thông tin phát hành</b>
            <div style={{ fontSize: 14, color: "#555", margin: "4px 0 10px" }}>Điền thêm thể loại, lời bài hát, ngày giờ phát hành, tải file audio / artwork…</div>
            <a href={`/khai-bao/${encodeURIComponent(token || picked.token)}/thong-tin`} style={{ display: "inline-block", padding: "11px 16px", borderRadius: 12, background: OR, color: "#fff", fontWeight: 800, textDecoration: "none" }}>Tiếp tục bước 2 →</a>
          </div>
        )}
        {result?.pdfSaved === false && <p style={{ fontSize: 13, color: "#888" }}>Lưu ý: bản PDF chưa lưu được lên hệ thống — vui lòng giữ lại file vừa tải và gửi cho AR nếu được yêu cầu.</p>}
      </div>
    </div></div>
  );

  const goStep = (n) => { setStep(n); try { window.scrollTo({ top: 0 }); } catch (e) { /* ignore */ } };
  function introNext() {
    const multi = info.release_type === "EP" || info.release_type === "Album";
    if (!String(info.label || "").trim()) { setIntroErr("Vui lòng nhập Label (hoặc ghi tên nghệ sĩ nếu không có hãng)."); return; }
    if (!info.release_type) { setIntroErr("Vui lòng chọn loại hình: Single / EP / Album."); return; }
    if (multi && (info.tracks || []).filter((t) => String((typeof t === "string" ? t : t?.title) || "").trim()).length < 2) { setIntroErr(`Vui lòng nhập tracklist của ${info.release_type} (ít nhất 2 track).`); return; }
    setIntroErr(""); goStep(1);
  }
  if (infoOn && step === 0) return (
    <div style={wrap} className="rf-shell"><style>{INFO_MOBILE_CSS}</style><div style={inner}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}><b style={{ letterSpacing: 1 }}>VIEENT</b><span style={{ color: "#666", fontSize: 14 }}>Bước 1/2</span></div>
      {draftBox}
      {reopenBox}
      <ReleaseIntroStep f={info} setF={setInfo} onNext={introNext} err={introErr} demo={demo} />
    </div></div>
  );

  const anyLicensed = RIGHTS.some((r) => f.licensed[r.key]);
  const input = { width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 16, border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit" };
  return (
    <form onSubmit={submit} style={wrap} autoComplete="off" className={`rf-shell${help ? " rf-help" : ""}`}><div style={inner}>
      <input ref={hp} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <b style={{ letterSpacing: 1 }}>VIEENT</b><button type="button" onClick={() => setHelp((h) => !h)} aria-pressed={help} title="Bấm để xem hướng dẫn điền form" style={{ color: help ? OR_DK : "#555", fontSize: 13, fontWeight: 700, background: help ? "#fdeadd" : "none", border: `1px dashed ${help ? OR : "#bbb"}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>ⓘ Hướng dẫn khai báo bản quyền · Ca khúc mới</button>
      </div>
      <span style={{ background: OR, color: "#fff", fontWeight: 800, padding: "8px 18px", borderRadius: 20, fontSize: 14, display: "inline-block" }}>FORM KHAI BÁO</span>
      {draftBox}
      {reopenBox}
      {infoOn && <button type="button" onClick={() => goStep(0)} style={{ border: "none", background: "none", color: OR_DK, fontWeight: 700, cursor: "pointer", padding: "10px 0 0", fontFamily: "inherit" }}>← {info.label || "Label"} · {info.release_type || "Loại hình"} (sửa)</button>}
      {demo && <div style={{ background: "#fff4d6", border: "1px solid #f0d58a", borderRadius: 12, padding: "10px 14px", margin: "12px 0 0", fontSize: 14 }}><b>BẢN DEMO</b> — dùng cho sản phẩm thử. Gửi ở đây sẽ tạo khai báo thật (có email mã, ticket cho AR) nên hãy dùng sản phẩm test.</div>}
      <h1 style={{ fontSize: 34, margin: "14px 0 4px", lineHeight: 1.15 }}>{infoOn ? "Khai báo bản quyền & thông tin phát hành" : "Khai báo bản quyền ca khúc mới"}</h1>
      {/* Round 649 — phone shell: nothing may be wider than the screen; text wraps instead of clipping; 16px inputs stop iOS zooming */}
      <style>{INFO_MOBILE_CSS}</style>
      <style>{`
        html, body { overflow-x: hidden; }
        .rf-shell, .rf-shell * { box-sizing: border-box; min-width: 0; }
        .rf-shell { overflow-wrap: anywhere; word-break: normal; -webkit-text-size-adjust: 100%; }
        .rf-shell input, .rf-shell textarea, .rf-shell select, .rf-shell button { max-width: 100%; font-size: 16px; }
        .rf-shell h1 { overflow-wrap: break-word; }
        @media (max-width: 560px) {
          .rf-shell { padding: 12px 10px 40px !important; }
          .rf-shell h1 { font-size: 25px !important; line-height: 1.2 !important; }
          .rf-shell h2 { font-size: 18px !important; }
          .rf-shell label { flex: 1 1 100% !important; }
          .rf-shell div[style*="flex: 1 1 200px"] { flex: 1 1 100% !important; }
          .rf-shell input[inputmode="numeric"] { letter-spacing: 6px !important; font-size: 22px !important; }
          .rf-shell input[type="date"] { min-height: 44px; }
          .rf-shell button { min-height: 44px; }
        }
        .rf-help input::placeholder, .rf-help textarea::placeholder { color: #d12a1c; opacity: 0.85; font-weight: 600; }
      `}</style>
      <p style={{ color: "#555", marginTop: 0 }}>Vui lòng điền và tích đủ các mục.{help && <b style={{ color: "#d12a1c" }}> Đang bật hướng dẫn: chữ đỏ trong ô là gợi ý cần điền.</b>}</p>

      <div style={card}>
        <Num n={1} title="Thông tin metadata" />
        {META_FIELDS.map((m) => (
          <div key={m.key} style={{ marginBottom: 10 }}>
            <label style={{ fontWeight: 700, fontSize: 14 }}>{m.label}:</label>
            <div style={{ position: "relative" }}>
              <input style={{ ...input, color: OR_DK, fontWeight: 700 }} value={f[m.key]} onChange={(e) => set(m.key, e.target.value)} maxLength={200}
                placeholder={help ? HELP[m.key] : ""} autoComplete="off" />
              {m.key === "song_title" && sugg.length > 0 && (
                <div style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%", background: "#fff", border: "1px solid #ddd", borderRadius: 10, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", marginTop: 4 }}>
                  {sugg.map((s, i) => (
                    <div key={i} onMouseDown={(e) => { e.preventDefault(); pick(s); }} style={{ padding: "10px 12px", cursor: "pointer", borderBottom: i < sugg.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                      <b>{s.title}</b><span style={{ color: "#777", fontSize: 13 }}> — {s.performer}</span>
                    </div>
                  ))}
                  <div style={{ padding: "6px 12px", fontSize: 12, color: "#888" }}>Không thấy bài của bạn? Cứ gõ tên đầy đủ.</div>
                </div>
              )}
            </div>
            {infoOn && m.key === "performer" && (
              <div style={{ marginTop: 10 }}>
                <label style={{ fontWeight: 700, fontSize: 14 }}>Nghệ sĩ hợp tác / Featuring artist <span style={{ fontWeight: 400, color: "#777", fontSize: 12.5 }}>(nếu có / if any)</span>:</label>
                <input style={{ ...input, color: OR_DK, fontWeight: 700 }} value={info.featuring || ""} onChange={(e) => setInfo((o) => ({ ...o, featuring: e.target.value }))} maxLength={200} autoComplete="off" />
              </div>
            )}
          </div>
        ))}
        {infoOn && <LyricsField value={info.lyrics} onChange={(v) => setInfo((o) => ({ ...o, lyrics: v }))} />}
      </div>

      {dup?.release && !dup.declared && <div style={{ background: "#eef6ff", border: "1px solid #c7d8f5", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 14 }}>Hệ thống nhận ra sản phẩm <b>{dup.release.title}</b> của VIEENT — khai báo sẽ được gắn vào sản phẩm này.</div>}
      {dup?.declared && !unlock && (
        <div style={{ ...card, border: "2px solid #d12a1c", background: "#fff5f4" }}>
          <div style={{ background: "#d12a1c", color: "#fff", fontWeight: 800, fontSize: 18, borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>Bài hát đã được khai báo, bạn có chắc muốn xoá khai báo cũ?</div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setDupMode("delete")} style={{ flex: 1, minWidth: 180, padding: "12px", fontWeight: 800, fontSize: 15, borderRadius: 12, border: "none", cursor: "pointer", background: dupMode === "delete" ? "#a11" : "#d12a1c", color: "#fff", fontFamily: "inherit" }}>1. Đồng ý xoá</button>
            <button type="button" onClick={viewOld} style={{ flex: 1, minWidth: 180, padding: "12px", fontWeight: 800, fontSize: 15, borderRadius: 12, border: "2px solid #d12a1c", cursor: "pointer", background: "#fff", color: "#d12a1c", fontFamily: "inherit" }}>2. Xem lại bản đã khai báo</button>
          </div>
          {dupMode === "delete" && (
            <div style={{ marginTop: 12, fontSize: 14 }}>
              <p style={{ margin: "0 0 8px" }}>Hãy nhập email bạn đã dùng để khai báo để xác nhận khai báo trước. Email đã sử dụng là <b>{dup.masked || "(không có)"}</b></p>
              <input type="email" style={input} placeholder="Email đã dùng để khai báo" value={dd.email} onChange={(e) => setDd((d) => ({ ...d, email: e.target.value }))} disabled={!!dd.challenge} />
              <textarea style={{ ...input, marginTop: 8, minHeight: 70 }} placeholder="Lý do xoá khai báo cũ" value={dd.reason} onChange={(e) => setDd((d) => ({ ...d, reason: e.target.value }))} maxLength={500} disabled={!!dd.challenge} />
              {!dd.challenge ? (
                <button type="button" disabled={dd.busy} onClick={sendOldCode} style={{ marginTop: 8, padding: "10px 16px", fontWeight: 800, borderRadius: 10, border: "none", background: "#d12a1c", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>{dd.busy ? "Đang gửi…" : "Gửi mã xác nhận về email cũ"}</button>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Đã gửi mã 6 số tới {dup.masked}. Nhập mã:</div>
                  <input inputMode="numeric" maxLength={6} value={dd.code} onChange={(e) => setDd((d) => ({ ...d, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="______" style={{ ...input, fontSize: 24, letterSpacing: 8, textAlign: "center", fontWeight: 800 }} />
                  <button type="button" disabled={dd.busy || dd.code.length !== 6} onClick={verifyOld} style={{ marginTop: 8, padding: "10px 16px", fontWeight: 800, borderRadius: 10, border: "none", background: "#d12a1c", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>{dd.busy ? "Đang kiểm tra…" : "Xác nhận & xoá khai báo cũ"}</button>
                </div>
              )}
            </div>
          )}
          {dupMode === "copy" && dd.copyMsg && <p style={{ marginTop: 12, fontWeight: 700 }}>{dd.copyMsg}</p>}
          {dd.msg && <div style={{ marginTop: 10, color: "#a11", fontWeight: 700 }}>{dd.msg}</div>}
        </div>
      )}
      {unlock && <div style={{ background: "#fff8e6", border: "1px solid #f0d089", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 14 }}>Đã xác nhận email cũ. Khai báo mới dưới đây sẽ <b>thay thế</b> khai báo cũ (bản cũ vẫn được lưu để đối chiếu).</div>}

      <div style={locked ? { filter: "blur(3px) grayscale(1)", opacity: 0.45, pointerEvents: "none", userSelect: "none" } : undefined} aria-hidden={locked}>
      {multiRel && <TracksDetail f={info} setF={setInfo} n={2} />}
      <div style={card}>
        <Num n={multiRel ? 3 : 2} title={multiRel ? `Xác nhận quyền — chung cho cả ${info.release_type}` : "Xác nhận quyền"} sub={multiRel ? `Phần này áp dụng chung cho tất cả các track trong ${info.release_type}. Track nào khác thì ghi chú riêng ở cuối mục.` : undefined} />
        <div style={{ background: "#fdf1e8", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 16 }}>
          <p style={{ marginTop: 0 }}>Tôi cam kết có <b>đầy đủ 3 quyền</b> để phát hành {multiRel ? `các ca khúc trong ${info.release_type} này` : "ca khúc này"}, gồm:</p>
          {help && (
            <div style={{ background: "#fff", border: "1px solid #f2b58e", borderRadius: 12, padding: "12px 14px", margin: "0 0 12px", fontSize: 13, lineHeight: 1.55, color: "#d12a1c" }}>
              {RIGHTS.map((r) => <div key={r.key} style={{ marginBottom: 6 }}><b>{r.vi} ({r.en}):</b> {RIGHT_HELP[r.key]}</div>)}
              {HOW_HELP.map(([k, v]) => <div key={k}><b>{k}:</b> {v}</div>)}
            </div>
          )}
          <div style={{ fontWeight: 700, margin: "10px 0 8px" }}>Các quyền tôi sở hữu:</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {RIGHTS.map((r) => <Check key={r.key} on={!!f.owned[r.key]} onChange={(on) => setRight("owned", r.key, on)} label={r.vi} sub={`(${r.en})`} />)}
          </div>
          <div style={{ fontWeight: 700, margin: "16px 0 8px" }}>Các quyền được cấp phép sử dụng bởi chủ sở hữu quyền:</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {RIGHTS.map((r) => (
              <div key={r.key} style={{ flex: "1 1 200px", display: "flex", flexDirection: SHOW_RIGHT_EXPIRY ? "column" : "row", gap: 6 }}>
                <Check on={!!f.licensed[r.key]} onChange={(on) => setRight("licensed", r.key, on)} label={r.vi} sub={`(${r.en})`} />
                {SHOW_RIGHT_EXPIRY && <label style={{ fontSize: 13, fontWeight: 700, opacity: f.licensed[r.key] ? 1 : 0.45 }}>Thời hạn (có hiệu lực đến ngày):
                  <input type="date" disabled={!f.licensed[r.key]} value={f.licensed_until[r.key] || ""} onChange={(e) => setF((p) => ({ ...p, licensed_until: { ...p.licensed_until, [r.key]: e.target.value } }))}
                    style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "9px 10px", fontSize: 15, border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit", background: f.licensed[r.key] ? "#fff" : "#f3f3f3" }} />
                </label>}
              </div>
            ))}
          </div>
          {SHOW_RIGHT_EXPIRY && help && <div style={{ color: "#d12a1c", fontSize: 12, fontWeight: 600, marginTop: 6 }}>Thời hạn: chọn ngày cuối cùng mà quyền được cấp phép còn hiệu lực. Để trống nếu không giới hạn / chưa rõ.</div>}
          <div style={{ background: "#fde3d3", border: "1px solid #f2b58e", color: "#b0390b", fontWeight: 700, borderRadius: 12, padding: "12px 14px", margin: "14px 0", fontSize: 14 }}>
            Đối với các quyền được cấp phép, vui lòng gửi kèm xác nhận từ chủ sở hữu: ảnh chụp màn hình tin nhắn / email hoặc hợp đồng.
          </div>
          {anyLicensed && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontWeight: 700, fontSize: 14 }}>Link minh chứng từ chủ sở hữu (nếu có — Drive, email, hợp đồng…):</label>
              <textarea style={{ ...input, minHeight: 64 }} value={f.proof} onChange={(e) => set("proof", e.target.value)} maxLength={500} placeholder={help ? "Dán link Drive chứa ảnh chụp tin nhắn / email / hợp đồng, hoặc ghi rõ đã gửi cho ai" : ""} />
            </div>
          )}
          <div style={{ fontWeight: 700, margin: "10px 0 8px" }}>Nền tảng được cấp phép:</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Check on={f.platforms === "all"} onChange={(on) => set("platforms", on ? "all" : "")} label="Tất cả các nền tảng" />
            <Check on={f.platforms === "some"} onChange={(on) => set("platforms", on ? "some" : "")} label="Một số nền tảng theo thỏa thuận" />
          </div>
          {f.platforms === "some" && <input style={{ ...input, marginTop: 8 }} placeholder="Nền tảng nào? (ví dụ: Spotify, Zing MP3)" value={f.platforms_note} onChange={(e) => set("platforms_note", e.target.value)} maxLength={300} />}
          <div style={{ fontWeight: 700, margin: "16px 0 8px" }}>Thời hạn đăng tải bản ghi:</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Check on={f.term === "perpetual"} onChange={(on) => set("term", on ? "perpetual" : "")} label="Vĩnh viễn" />
            <Check on={f.term === "limited"} onChange={(on) => set("term", on ? "limited" : "")} label="Có thời hạn" />
          </div>
          {f.term === "limited" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              {[["term_from", "Từ ngày"], ["term_to", "Đến ngày"]].map(([k, lab]) => (
                <label key={k} style={{ flex: "1 1 200px", fontSize: 13, fontWeight: 700 }}>{lab}:
                  <input type="date" value={f[k]} min={k === "term_to" ? f.term_from || undefined : undefined} onChange={(e) => set(k, e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "9px 10px", fontSize: 15, border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit", background: "#fff" }} />
                </label>
              ))}
            </div>
          )}
        </div>
        {multiRel && (info.tracks || []).some((t) => String((typeof t === "string" ? t : t?.title) || "").trim()) && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Track nào khác phần chung?<InfoTip text="Nếu một track có chủ sở hữu, quyền được cấp phép, nền tảng hoặc thời hạn khác với phần xác nhận chung ở trên, hãy ghi rõ ở ô của track đó (ví dụ: track 3 là beat mua của producer X, chỉ được cấp phép đến 12/2027). Track nào giống phần chung thì để trống." /></div>
            <div style={{ color: "#777", fontSize: 12.5, margin: "4px 0 8px" }}>Mỗi track mặc định giống phần chung ở trên. Bấm vào track để mở và điền riêng nếu track đó khác.</div>
            {(info.tracks || []).map((t, i) => { const tt = typeof t === "string" ? { title: t } : (t || {}); if (!String(tt.title || "").trim()) return null; return (
              <TrackRights key={i} n={i + 1} t={tt} input={input} help={help} upd={(patch) => setInfo((o) => ({ ...o, tracks: (o.tracks || []).map((x, xi) => (xi === i ? { ...(typeof x === "string" ? { title: x } : x), ...patch } : x)) }))} />
            ); })}
          </div>
        )}
      </div>

      {infoOn && <ReleaseInfoSections token={infoToken} inboxKey={infoToken ? "" : inboxKey} f={info} setF={setInfo} genreOpts={genreOpts} n0={multiRel ? 4 : 3} core={false} />}

      {infoOn && <TermsBlock />}

      <div style={card}>
        <Num n={infoOn ? (multiRel ? 4 : 3) + infoSectionCount(info) : 3} title="Người gửi ký xác nhận" />
        <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
          <span>Chữ ký:</span><button type="button" onClick={clearPad} style={{ border: "none", background: "none", color: OR_DK, fontWeight: 700, cursor: "pointer" }}>Xóa ký lại</button>
        </div>
        <canvas ref={pad} width={1000} height={260} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          style={{ width: "100%", height: "auto", aspectRatio: "1000/260", border: "2px dashed #aaa", borderRadius: 14, touchAction: "none", background: "#fff" }} />
        <div style={{ marginTop: 16 }}>
          <label style={{ fontWeight: 700, fontSize: 14 }}>Email của bạn (bắt buộc — mã xác nhận và bản khai báo sẽ gửi về đây):</label>
          <input type="email" inputMode="email" style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 16, border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit" }}
            value={f.contact_email} onChange={(e) => { set("contact_email", e.target.value); if (otp.challenge) setOtp({ challenge: "", code: "", cool: 0 }); }} maxLength={120} placeholder="ten@email.com" autoComplete="email"
            title="Mã xác nhận 6 số sẽ được gửi về email này; sau khi xác nhận, bản khai báo (PDF) cũng được gửi về đây." />
          <div style={{ marginTop: 6, background: "#fff7ed", border: "1px solid #f5d9c3", color: "#9a3412", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>
            ⓘ Mã xác nhận 6 số sẽ được gửi về email này; sau khi xác nhận, bản khai báo (PDF) cũng được gửi về đây.
          </div>
        </div>
      </div>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "0 0 14px", fontSize: 14, fontWeight: 600, background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: "12px 14px" }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 20, height: 20, accentColor: OR, marginTop: 2, flex: "none" }} />
        <span>Tôi đồng ý cho VIEENT ghi nhận thiết bị, nền tảng và thời gian khi tôi gửi khai báo này — chỉ nhằm mục đích xác định người khai báo.</span>
      </label>
      {unlock && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontWeight: 700, fontSize: 14 }}>Lý do thay đổi khai báo:</label>
          <textarea style={{ ...input, minHeight: 70 }} value={changeReason} onChange={(e) => setChangeReason(e.target.value)} maxLength={500} placeholder="Vì sao bạn khai báo lại?" />
        </div>
      )}
      {otp.challenge && (
        <div style={{ background: "#f4f8ff", border: "1px solid #c7d8f5", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Đã gửi mã 6 số tới {f.contact_email}. Nhập mã để xác nhận gửi:</div>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp.code} onChange={(e) => setOtp((o) => ({ ...o, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
            placeholder="______" style={{ width: "100%", boxSizing: "border-box", padding: "12px", fontSize: 26, letterSpacing: 10, textAlign: "center", fontWeight: 800, border: "1px solid #bbb", borderRadius: 10 }} />
          <button type="button" disabled={busy || otp.cool > 0} onClick={() => { const v = cleanDeclaration(f); if (v.ok) sendCode(v); }}
            style={{ marginTop: 8, border: "none", background: "none", color: OR_DK, fontWeight: 700, cursor: otp.cool > 0 ? "default" : "pointer", opacity: otp.cool > 0 ? 0.5 : 1 }}>
            {otp.cool > 0 ? `Gửi lại mã sau ${otp.cool}s` : "Gửi lại mã"}
          </button>
        </div>
      )}
      {err && <div style={{ background: "#fde8e8", border: "1px solid #f3b4b4", color: "#a11", borderRadius: 12, padding: "12px 14px", marginBottom: 14, fontWeight: 600 }}>{err}
        {result?.failed && <div style={{ marginTop: 6 }}><a href={result.pdfBlobUrl} download="Khai-bao-ban-quyen.pdf" style={{ color: OR_DK }}>Tải file PDF vừa tạo</a></div>}</div>}
      <button type="submit" disabled={busy} style={{ width: "100%", padding: "16px", background: OR, color: "#fff", border: "none", borderRadius: 14, fontSize: 18, fontWeight: 800, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
        {busy ? (stage || "Đang xử lý…") : otp.challenge ? "Xác nhận mã & gửi khai báo" : "Gửi mã xác nhận về email"}
      </button>
      <p style={{ marginTop: 18, borderTop: "2px solid #222", paddingTop: 12, fontWeight: 700 }}><span style={{ color: OR_DK }}>Lưu ý:</span> Thiếu xác nhận nào, bài hát sẽ chưa được phát hành.</p>
    </div></div></form>
  );
}
