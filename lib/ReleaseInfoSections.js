"use client";
// Round 698 — the "Thông tin phát hành" sections, shared by the stand-alone info form and the combined rights + info page.
import { useState } from "react";
import { FILE_FIELDS, PROMO_FIELDS, DIRECTION_FIELDS, DESIGN_FIELDS, PROJECT_KINDS, deadlineCheck, restFilled, REST_MIN } from "./releaseInfoForm";
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body) => {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};

// Link box + "Tải lên" button: the file goes straight to the product's Drive folder (resumable, 8 MB pieces), the box then holds its Drive link.
function FileSlot({ token, inboxKey, field, label, hint, value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [note, setNote] = useState("");
  async function pick(e) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file || busy) return;
    setBusy(true); setPct(0); setNote("");
    try {
      const api = token ? "/api/release-info/upload" : "/api/release-info/inbox";
      const who = token ? { token } : { inboxKey };
      const init = await post(api, { ...who, action: "init", field, filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size });
      const CH = 8 * 1024 * 1024;   // multiple of 256 KiB
      let start = 0, fileId = null;
      while (start < file.size) {
        const end = Math.min(start + CH, file.size);
        const range = `bytes ${start}-${end - 1}/${file.size}`;
        for (let attempt = 1; ; attempt++) {
          try {
            const res = await fetch(init.uploadUrl, { method: "PUT", headers: { "Content-Range": range }, body: file.slice(start, end) });
            if (res.status === 200 || res.status === 201) { try { fileId = (await res.json()).id; } catch { /* looked up by name */ } }
            else if (res.status !== 308) throw new Error(`Google trả lỗi HTTP ${res.status}`);
            break;
          } catch (err) {
            if (attempt >= 3) throw err;
            await sleep(1000 * attempt);
          }
        }
        start = end; setPct(Math.round((start / file.size) * 100));
      }
      const fin = await post(api, { ...who, action: "finalize", field, name: init.name, size: file.size, fileId });
      onChange(fin.file.url); setNote(`✓ Đã tải lên: ${file.name} (${mb(file.size)})`);
    } catch (err) { setNote("⚠️ " + (err.message || "Không tải lên được") + " — bạn có thể dán link thay thế."); }
    setBusy(false);
  }
  return (
    <Field label={label} hint={hint ? `(${hint})` : ""}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input style={{ ...inp, flex: "1 1 220px", width: "auto" }} placeholder="Thêm link hoặc bấm Tải lên / Add a link or press Upload" value={value || ""} onChange={(e) => onChange(e.target.value)} />
        {(token || inboxKey) && <label style={{ flex: "0 0 auto", padding: "11px 14px", borderRadius: 10, border: `1px solid ${OR}`, color: OR_DK, fontWeight: 800, fontSize: 14, cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap", background: "#fff" }}>
          {busy ? `${pct}%` : "⬆ Tải lên"}
          <input type="file" style={{ display: "none" }} disabled={busy} onChange={pick} />
        </label>}
      </div>
      {busy && <div style={{ height: 6, background: "#eee", borderRadius: 3, marginTop: 6 }}><div style={{ width: pct + "%", height: 6, background: OR, borderRadius: 3 }} /></div>}
      {note && <div style={{ ...hintS, marginTop: 4, color: note.startsWith("⚠️") ? "#a01818" : "#17652f" }}>{note}</div>}
    </Field>
  );
}

export const EMPTY = { song_title: "", performer: "", composer: "", producer: "", mixer: "", lyricist: "", genres: ["", "", ""], project_kind: "", release_date: "", release_time: "", preview_time: "", tiktok_demo_date: "", lyrics: "", profile_links: "", files: {}, promo: {}, design: {}, direction: {}, contact_email: "", label: "", release_type: "", tracks: ["", ""], deliver_only: false };
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
  const g = Array.isArray(a.genres) ? [...a.genres, "", "", ""].slice(0, 3) : ["", "", ""];
  return { ...EMPTY, ...a, tracks: Array.isArray(a.tracks) && a.tracks.length ? [...a.tracks, "", ""].slice(0, Math.max(2, a.tracks.length)) : ["", ""], genres: g, files: a.files || {}, promo: a.promo || {}, design: a.design || {}, direction: a.direction || {},
    song_title: a.song_title ?? j.release.title, performer: a.performer ?? j.release.performer, composer: a.composer ?? j.release.composer, release_date: a.release_date ?? j.release.release_date ?? "" };
}

// core=true: also asks the 5 basic metadata fields (stand-alone page). core=false: they come from the rights section above, only extras are asked.
// how many numbered sections the info part shows (the combined page numbers its last section from this)
export const infoSectionCount = (f) => 3 + (f.deliver_only ? 0 : 1 + (f.project_kind === "pitching" ? 1 : 0));

export function ReleaseInfoSections({ token, inboxKey = "", f, setF, genreOpts = [], n0 = 1, core = true }) {
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const setIn = (grp, k, v) => setF((o) => ({ ...o, [grp]: { ...(o[grp] || {}), [k]: v } }));
  const setGenre = (i, v) => setF((o) => ({ ...o, genres: o.genres.map((g, x) => (x === i ? v : g)) }));
  const dl = deadlineCheck(f.project_kind, f.release_date);
  return (
    <>
        <div style={card}>
          <Num n={n0 + 0} title={core ? "Dữ liệu sản phẩm (Metadata)" : "Metadata bổ sung / Extra metadata"} />
          {core && (<>
          <Field label="Tên bài hát / Song title *"><input style={inp} value={f.song_title} onChange={(e) => set("song_title", e.target.value)} /></Field>
          <Field label="Nghệ sĩ trình bày / Performing artist *"><input style={inp} value={f.performer} onChange={(e) => set("performer", e.target.value)} /></Field>
          <Field label="Sáng tác / Composer *" hint="(tên phải có 2 chữ trở lên hoặc dùng họ & tên thật / at least 2 words or your real full name)"><input style={inp} value={f.composer} onChange={(e) => set("composer", e.target.value)} /></Field>
          <Field label="Người viết lời / Lyricist" hint="(nếu khác người sáng tác / if different from the composer)"><input style={inp} value={f.lyricist} onChange={(e) => set("lyricist", e.target.value)} /></Field>
          <Field label="Nhà sản xuất / Producer"><input style={inp} value={f.producer} onChange={(e) => set("producer", e.target.value)} /></Field>
          <Field label="Người phối âm / Mixer"><input style={inp} value={f.mixer} onChange={(e) => set("mixer", e.target.value)} /></Field>
          </>)}
          <Field label="Thể loại / Genre" hint="(tối đa 03 thể loại mô tả đúng nhất về bài hát / up to 3 genres that best describe the song)">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {f.genres.map((g, i) => genreOpts.length ? (
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
          <Field label="Lời bài hát / Lyrics"><textarea style={{ ...inp, minHeight: 180, resize: "vertical" }} value={f.lyrics} onChange={(e) => set("lyrics", e.target.value)} /></Field>
        </div>

        <div style={card}>
          <Num n={n0 + 1} title="Thời gian phát hành" sub="Để đảm bảo kế hoạch phát hành và hỗ trợ quảng bá đạt hiệu quả tốt nhất." />
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
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}><Field label="Preview Time" hint="(đoạn nhạc TikTok 60s bắt đầu từ)"><input style={inp} placeholder="vd 1:05" value={f.preview_time} onChange={(e) => set("preview_time", e.target.value)} /></Field></div>
            <div style={{ flex: "1 1 200px" }}><Field label="Ngày phát hành demo TikTok" hint="(nếu có)"><input type="date" style={inp} value={f.tiktok_demo_date} onChange={(e) => set("tiktok_demo_date", e.target.value)} /></Field></div>
          </div>
        </div>

        <div style={card}>
          <Num n={n0 + 2} title="File sản phẩm" sub="Bấm Tải lên để gửi thẳng vào thư mục Drive của sản phẩm (tối đa 500MB/file), hoặc dán link nếu file lớn hơn." />
          {FILE_FIELDS.map((x) => <FileSlot key={x.key} token={token} inboxKey={inboxKey} field={`files.${x.key}`} label={x.label} hint={x.hint} value={f.files?.[x.key]} onChange={(v) => setIn("files", x.key, v)} />)}
          <Field label="Link profile nghệ sĩ trên các nền tảng nhạc số" hint="(nếu lần đầu phát hành với VIEENT)"><textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={f.profile_links} onChange={(e) => set("profile_links", e.target.value)} /></Field>
        </div>

        <div style={{ ...card, border: `2px solid ${f.deliver_only ? OR : BORDER}` }}>
          <label style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
            <span style={{ position: "relative", flex: "0 0 auto", width: 54, height: 30, borderRadius: 15, background: f.deliver_only ? OR : "#ccc", transition: "background .15s" }}>
              <span style={{ position: "absolute", top: 3, left: f.deliver_only ? 27 : 3, width: 24, height: 24, borderRadius: 12, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
              <input type="checkbox" checked={!!f.deliver_only} onChange={(e) => set("deliver_only", e.target.checked)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, margin: 0, cursor: "pointer" }} aria-label="Chỉ phát hành" />
            </span>
            <span><b style={{ fontSize: 16 }}>Chỉ phát hành / Only deliver</b>
              <span style={{ display: "block", ...hintS, marginTop: 2 }}>{f.deliver_only ? "Đã bật: không cần điền các phần Tư liệu truyền thông, Định hướng nội dung và Thiết kế." : `Đang tắt: cần điền ít nhất ${REST_MIN} mục ở các phần bên dưới (hiện đã điền ${Math.min(restFilled(f), 99)}/${REST_MIN}).`}</span></span>
          </label>
        </div>

        {!f.deliver_only && (<>
        <div style={card}>
          <Num n={n0 + 3} title="Tư liệu truyền thông (Promo assets)" sub={`Cần điền ít nhất ${REST_MIN} mục trong các phần Promo / Định hướng${f.project_kind === "pitching" ? " / Thiết kế" : ""}, hoặc bật "Chỉ phát hành" ở trên.`} />
          {PROMO_FIELDS.map((x) => <FileSlot key={x.key} token={token} inboxKey={inboxKey} field={`promo.${x.key}`} label={x.label} hint={x.hint} value={f.promo?.[x.key]} onChange={(v) => setIn("promo", x.key, v)} />)}
          <h3 style={{ margin: "22px 0 0", fontSize: 17 }}>Định hướng nội dung</h3>
          {DIRECTION_FIELDS.map((x) => <Field key={x.key} label={x.label} hint={x.hint}><textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={f.direction?.[x.key] || ""} onChange={(e) => setIn("direction", x.key, e.target.value)} /></Field>)}
        </div>

        {f.project_kind === "pitching" && (
          <div style={card}>
            <Num n={n0 + 4} title="Tư liệu thiết kế (Design specs)" sub="Áp dụng cho các dự án đăng ký Pitching Editorial Banner trên các nền tảng nhạc số." />
            {DESIGN_FIELDS.map((x) => <FileSlot key={x.key} token={token} inboxKey={inboxKey} field={`design.${x.key}`} label={x.label} hint={x.hint} value={f.design?.[x.key]} onChange={(v) => setIn("design", x.key, v)} />)}
          </div>
        )}
        </>)}

    </>
  );
}
