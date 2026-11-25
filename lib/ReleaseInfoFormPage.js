"use client";
// Round 695/698 — stand-alone "Thông tin phát hành" page (demo: /khai-bao-demo/<token>/thong-tin, live: /khai-bao/<token>/thong-tin). The sections live in ReleaseInfoSections.js (also used by the combined rights + info page).
import { useEffect, useState } from "react";
import { OR, OR_DK, card, hintS, inp, Field, EMPTY, ReleaseInfoSections, InfoDocsPanel, makeInfoDocs, prefillInfo, INFO_MOBILE_CSS } from "./ReleaseInfoSections";

export default function ReleaseInfoFormPage({ token, demo }) {
  const [state, setState] = useState("loading");   // loading | ready | bad | done
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedNote, setSavedNote] = useState("");
  const [genreOpts, setGenreOpts] = useState([]);   // [{ value, label }] from Config (lookup_options "genre")
  const [out, setOut] = useState({ status: "idle", pdfUrl: "", docs: null, msg: "" });   // generated documents after submit

  useEffect(() => {
    let alive = true;
    fetch(`/api/release-info?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (!j?.release) { setState("bad"); return; }
        setF(prefillInfo(j));
        setGenreOpts(Array.isArray(j.genres) ? j.genres : []);
        if (j.saved) setSavedNote(`Đã có bản lưu trước (${j.saved.status}). Bạn có thể sửa và gửi lại.`);
        setState("ready");
      })
      .catch(() => alive && setState("bad"));
    return () => { alive = false; };
  }, [token]);


  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/release-info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, answers: f, demo: !!demo }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErr(j.error || "Không gửi được. Vui lòng thử lại."); window.scrollTo({ top: 0, behavior: "smooth" }); }
      else { setState("done"); setOut({ status: "working", pdfUrl: "", docs: null, msg: "" }); makeInfoDocs(token, j.answers || f).then(setOut); }
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
      <p>Cảm ơn bạn. {demo ? "Đây là bản demo: dữ liệu được lưu để kiểm tra." : "VIEENT sẽ kiểm tra và liên hệ nếu cần bổ sung."}</p>
      <InfoDocsPanel token={token} out={out} />
      <button type="button" onClick={() => setState("ready")} style={{ padding: "12px 18px", borderRadius: 12, border: `1px solid ${OR}`, background: "#fff", color: OR_DK, fontWeight: 800, cursor: "pointer" }}>← Quay lại chỉnh sửa</button>
    </div></div>
  );

  return (
    <div style={wrap} className="rf-shell">
      <style>{INFO_MOBILE_CSS}</style>
      <form style={inner} onSubmit={submit}>
        {demo && <div style={{ background: "#fff4d6", border: "1px solid #f0d58a", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 14 }}><b>BẢN DEMO</b> — chỉ để VIEENT xem thử giao diện. Dữ liệu gửi ở đây chỉ dùng để kiểm tra.</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ letterSpacing: 1 }}>VIEENT</b><span style={{ color: "#666", fontSize: 14 }}>Bước 2 · Thông tin phát hành</span></div>
        <h1 style={{ fontSize: 32, margin: "14px 0 4px", lineHeight: 1.15 }}>Thông tin phát hành</h1>
        <p style={{ color: "#555", margin: "0 0 18px" }}>Vui lòng cung cấp đầy đủ và chính xác để sản phẩm hiển thị chuẩn xác trên các nền tảng nhạc số. Ô có dấu * là bắt buộc.</p>
        {savedNote && <div style={{ background: "#eef6ff", border: "1px solid #bcd6f5", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 14 }}>{savedNote}</div>}
        {err && <div role="alert" style={{ background: "#fdecec", border: "1px solid #f3b4b4", color: "#a01818", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontWeight: 700 }}>{err}</div>}

        <ReleaseInfoSections token={token} f={f} setF={setF} genreOpts={genreOpts} />

        <div style={card}>
          <Field label="Email liên hệ" hint="(không bắt buộc ở bản demo)"><input style={inp} type="email" value={f.contact_email} onChange={(e) => set("contact_email", e.target.value)} /></Field>
          <button type="submit" disabled={busy} style={{ marginTop: 18, width: "100%", padding: "15px 18px", borderRadius: 14, border: "none", background: OR, color: "#fff", fontSize: 17, fontWeight: 800, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>{busy ? "Đang gửi…" : "Gửi thông tin phát hành"}</button>
        </div>
      </form>
    </div>
  );
}
