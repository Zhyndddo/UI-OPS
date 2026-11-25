"use client";
// Round 695 — "Thông tin phát hành" (step 2 of the /khai-bao handout form). DEMO route first: /khai-bao-demo/<same signed token>.
// Round 695 = form + save + deadline warning. Uploads, PDF + .docx and the staff tabs come in the next rounds.
import { useEffect, useState } from "react";
import { PROJECT_KINDS, FILE_FIELDS, PROMO_FIELDS, DIRECTION_FIELDS, DESIGN_FIELDS, deadlineCheck } from "./releaseInfoForm";

const OR = "#f26a0f", OR_DK = "#c2410c", BORDER = "#f5d9c3";
const card = { background: "#fff", border: "1px solid #ececec", borderRadius: 24, padding: "22px 22px 24px", marginBottom: 18 };
const inp = { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #ddd", borderRadius: 10, fontSize: 15, background: "#fff", color: "#111", fontFamily: "inherit" };
const lab = { display: "block", fontWeight: 700, fontSize: 14, margin: "14px 0 5px", color: "#222" };
const hintS = { fontWeight: 400, color: "#777", fontSize: 12.5 };
const optBox = (on) => ({ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "#fff", border: `1px solid ${on ? OR : BORDER}`, borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 15, marginBottom: 8 });

function Num({ n, title, sub }) {
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
function Field({ label, hint, children }) { return (<div><label style={lab}>{label} {hint && <span style={hintS}>{hint}</span>}</label>{children}</div>); }

const EMPTY = { song_title: "", performer: "", composer: "", producer: "", mixer: "", lyricist: "", genres: ["", "", ""], project_kind: "", release_date: "", release_time: "", preview_time: "", tiktok_demo_date: "", lyrics: "", profile_links: "", files: {}, promo: {}, design: {}, direction: {}, contact_email: "" };

export default function ReleaseInfoFormPage({ token, demo }) {
  const [state, setState] = useState("loading");   // loading | ready | bad | done
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedNote, setSavedNote] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/release-info?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (!j?.release) { setState("bad"); return; }
        const a = j.saved?.answers || {};
        const g = Array.isArray(a.genres) ? [...a.genres, "", "", ""].slice(0, 3) : ["", "", ""];
        setF({ ...EMPTY, ...a, genres: g, files: a.files || {}, promo: a.promo || {}, design: a.design || {}, direction: a.direction || {},
          song_title: a.song_title ?? j.release.title, performer: a.performer ?? j.release.performer, composer: a.composer ?? j.release.composer, release_date: a.release_date ?? j.release.release_date ?? "" });
        if (j.saved) setSavedNote(`Đã có bản lưu trước (${j.saved.status}). Bạn có thể sửa và gửi lại.`);
        setState("ready");
      })
      .catch(() => alive && setState("bad"));
    return () => { alive = false; };
  }, [token]);

  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const setIn = (grp, k, v) => setF((o) => ({ ...o, [grp]: { ...(o[grp] || {}), [k]: v } }));
  const setGenre = (i, v) => setF((o) => ({ ...o, genres: o.genres.map((g, x) => (x === i ? v : g)) }));
  const dl = deadlineCheck(f.project_kind, f.release_date);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/release-info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, answers: f }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErr(j.error || "Không gửi được. Vui lòng thử lại."); window.scrollTo({ top: 0, behavior: "smooth" }); }
      else setState("done");
    } catch { setErr("Mất kết nối. Vui lòng thử lại."); }
    setBusy(false);
  }

  const wrap = { minHeight: "100vh", background: "#fafafa", color: "#111", fontFamily: "Arial, Helvetica, sans-serif", padding: "24px 14px 60px" };
  const inner = { maxWidth: 760, margin: "0 auto" };
  if (state === "loading") return <div style={wrap}><div style={inner}>Đang tải…</div></div>;
  if (state === "bad") return <div style={wrap}><div style={inner}><h1>Link không hợp lệ</h1><p>Link này không đúng hoặc đã bị thay đổi. Vui lòng xin lại link từ VIEENT.</p></div></div>;
  if (state === "done") return (
    <div style={wrap}><div style={inner}>
      <h1 style={{ fontSize: 26 }}>Đã lưu thông tin phát hành{demo ? " (demo)" : ""}</h1>
      <p>Cảm ơn bạn. {demo ? "Đây là bản demo: dữ liệu được lưu để kiểm tra, PDF / file Word sẽ có ở bước tiếp theo." : "VIEENT sẽ kiểm tra và liên hệ nếu cần bổ sung."}</p>
      <button type="button" onClick={() => setState("ready")} style={{ padding: "12px 18px", borderRadius: 12, border: `1px solid ${OR}`, background: "#fff", color: OR_DK, fontWeight: 800, cursor: "pointer" }}>← Quay lại chỉnh sửa</button>
    </div></div>
  );

  return (
    <div style={wrap}>
      <form style={inner} onSubmit={submit}>
        {demo && <div style={{ background: "#fff4d6", border: "1px solid #f0d58a", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 14 }}><b>BẢN DEMO</b> — chỉ để VIEENT xem thử giao diện. Dữ liệu gửi ở đây chỉ dùng để kiểm tra.</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ letterSpacing: 1 }}>VIEENT</b><span style={{ color: "#666", fontSize: 14 }}>Bước 2 · Thông tin phát hành</span></div>
        <h1 style={{ fontSize: 32, margin: "14px 0 4px", lineHeight: 1.15 }}>Thông tin phát hành</h1>
        <p style={{ color: "#555", margin: "0 0 18px" }}>Vui lòng cung cấp đầy đủ và chính xác để sản phẩm hiển thị chuẩn xác trên các nền tảng nhạc số. Ô có dấu * là bắt buộc.</p>
        {savedNote && <div style={{ background: "#eef6ff", border: "1px solid #bcd6f5", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 14 }}>{savedNote}</div>}
        {err && <div role="alert" style={{ background: "#fdecec", border: "1px solid #f3b4b4", color: "#a01818", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontWeight: 700 }}>{err}</div>}

        <div style={card}>
          <Num n={1} title="Dữ liệu sản phẩm (Metadata)" />
          <Field label="Tên bài hát *"><input style={inp} value={f.song_title} onChange={(e) => set("song_title", e.target.value)} /></Field>
          <Field label="Nghệ sĩ trình bày *"><input style={inp} value={f.performer} onChange={(e) => set("performer", e.target.value)} /></Field>
          <Field label="Sáng tác *" hint="(tên phải có 2 chữ trở lên hoặc dùng họ & tên thật)"><input style={inp} value={f.composer} onChange={(e) => set("composer", e.target.value)} /></Field>
          <Field label="Người viết lời (Thơ)" hint="(nếu khác người sáng tác)"><input style={inp} value={f.lyricist} onChange={(e) => set("lyricist", e.target.value)} /></Field>
          <Field label="Producer"><input style={inp} value={f.producer} onChange={(e) => set("producer", e.target.value)} /></Field>
          <Field label="Mixer"><input style={inp} value={f.mixer} onChange={(e) => set("mixer", e.target.value)} /></Field>
          <Field label="Thể loại" hint="(tối đa 03 thể loại mô tả đúng nhất về bài hát)">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{f.genres.map((g, i) => <input key={i} style={{ ...inp, flex: "1 1 180px", width: "auto" }} placeholder={`Thể loại ${i + 1}`} value={g} onChange={(e) => setGenre(i, e.target.value)} />)}</div>
          </Field>
          <Field label="Lời bài hát"><textarea style={{ ...inp, minHeight: 180, resize: "vertical" }} value={f.lyrics} onChange={(e) => set("lyrics", e.target.value)} /></Field>
        </div>

        <div style={card}>
          <Num n={2} title="Thời gian phát hành" sub="Để đảm bảo kế hoạch phát hành và hỗ trợ quảng bá đạt hiệu quả tốt nhất." />
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
          <Num n={3} title="File sản phẩm" sub="Demo: dán link (Drive / WeTransfer…). Vòng sau: tải thẳng lên thư mục Drive của sản phẩm." />
          {FILE_FIELDS.map((x) => <Field key={x.key} label={x.label} hint={`(${x.hint})`}><input style={inp} placeholder="https://" value={f.files?.[x.key] || ""} onChange={(e) => setIn("files", x.key, e.target.value)} /></Field>)}
          <Field label="Link profile nghệ sĩ trên các nền tảng nhạc số" hint="(nếu lần đầu phát hành với VIEENT)"><textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={f.profile_links} onChange={(e) => set("profile_links", e.target.value)} /></Field>
        </div>

        <div style={card}>
          <Num n={4} title="Tư liệu truyền thông (Promo assets)" sub="Không bắt buộc — càng đủ càng giúp VIEENT hỗ trợ tốt hơn." />
          {PROMO_FIELDS.map((x) => <Field key={x.key} label={x.label} hint={`(${x.hint})`}><input style={inp} placeholder="https://" value={f.promo?.[x.key] || ""} onChange={(e) => setIn("promo", x.key, e.target.value)} /></Field>)}
          <h3 style={{ margin: "22px 0 0", fontSize: 17 }}>Định hướng nội dung</h3>
          {DIRECTION_FIELDS.map((x) => <Field key={x.key} label={x.label} hint={x.hint}><textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={f.direction?.[x.key] || ""} onChange={(e) => setIn("direction", x.key, e.target.value)} /></Field>)}
        </div>

        {f.project_kind === "pitching" && (
          <div style={card}>
            <Num n={5} title="Tư liệu thiết kế (Design specs)" sub="Áp dụng cho các dự án đăng ký Pitching Editorial Banner trên các nền tảng nhạc số." />
            {DESIGN_FIELDS.map((x) => <Field key={x.key} label={x.label} hint={`(${x.hint})`}><input style={inp} placeholder="https://" value={f.design?.[x.key] || ""} onChange={(e) => setIn("design", x.key, e.target.value)} /></Field>)}
          </div>
        )}

        <div style={card}>
          <Field label="Email liên hệ" hint="(không bắt buộc ở bản demo)"><input style={inp} type="email" value={f.contact_email} onChange={(e) => set("contact_email", e.target.value)} /></Field>
          <button type="submit" disabled={busy} style={{ marginTop: 18, width: "100%", padding: "15px 18px", borderRadius: 14, border: "none", background: OR, color: "#fff", fontSize: 17, fontWeight: 800, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>{busy ? "Đang gửi…" : "Gửi thông tin phát hành"}</button>
        </div>
      </form>
    </div>
  );
}
