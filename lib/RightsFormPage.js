"use client";

import { useEffect, useRef, useState } from "react";
import { RIGHTS, META_FIELDS, cleanDeclaration } from "./rightsForm";
import { buildRightsPdf } from "./rightsPdf";

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
function Check({ on, onChange, label, sub }) {
  return (
    <label style={optBox(on)}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 20, height: 20, accentColor: OR }} />
      <span>{label}{sub && <span style={{ display: "block", fontWeight: 400, fontSize: 13, color: "#666" }}>{sub}</span>}</span>
    </label>
  );
}

export default function RightsFormPage({ token = "" }) {
  // token empty = the ONE public link (blank form, nothing remembered: refresh / new device = fresh form).
  const [state, setState] = useState(token ? "loading" : "ready");   // loading | ready | bad | done
  const [f, setF] = useState({ song_title: "", composer: "", performer: "", producer: "", mixer: "", owned: {}, licensed: {}, proof: "", platforms: "", platforms_note: "", term: "", term_note: "", signer_name: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
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

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setRight = (grp, key, on) => setF((p) => {
    const other = grp === "owned" ? "licensed" : "owned";
    return { ...p, [grp]: { ...p[grp], [key]: on }, [other]: on ? { ...p[other], [key]: false } : p[other] };
  });

  function pos(e) { const r = pad.current.getBoundingClientRect(); return [(e.clientX - r.left) * (pad.current.width / r.width), (e.clientY - r.top) * (pad.current.height / r.height)]; }
  function down(e) { drawing.current = true; const c = pad.current.getContext("2d"); const [x, y] = pos(e); c.lineWidth = 4; c.lineCap = "round"; c.strokeStyle = "#111"; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.1, y + 0.1); c.stroke(); inked.current = true; pad.current.setPointerCapture?.(e.pointerId); }
  function move(e) { if (!drawing.current) return; const c = pad.current.getContext("2d"); const [x, y] = pos(e); c.lineTo(x, y); c.stroke(); }
  function up() { drawing.current = false; }
  function clearPad() { const c = pad.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); inked.current = false; }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    const v = cleanDeclaration(f);
    if (!v.ok) { setErr(v.error); return; }
    if (!inked.current) { setErr("Vui lòng ký vào ô Chữ ký."); return; }
    setBusy(true);
    try {
      const fam = getComputedStyle(document.body).fontFamily;
      const bytes = await buildRightsPdf(v.data, pad.current, fam);
      let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      const pdfBlobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const r = await fetch("/api/rights-declaration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, form: v.data, pdfBase64: btoa(bin), website: hp.current?.value || "" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || `Lỗi ${r.status}`); setResult({ pdfBlobUrl, failed: true }); setBusy(false); return; }
      setResult({ pdfBlobUrl, pdfSaved: j.pdfSaved });
      setState("done");
      const a = document.createElement("a"); a.href = pdfBlobUrl; a.download = `Khai-bao-ban-quyen-${(v.data.song_title || "ca-khuc").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40)}.pdf`; document.body.appendChild(a); a.click(); a.remove();
    } catch (ex) { setErr("Có lỗi khi tạo file PDF. Vui lòng thử lại."); }
    setBusy(false);
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
        <p>Cảm ơn bạn. Bộ phận AR của VIEENT sẽ kiểm tra và xác nhận. File PDF đã được tải xuống máy bạn.</p>
        <a href={result?.pdfBlobUrl} download="Khai-bao-ban-quyen.pdf" style={{ color: OR_DK, fontWeight: 700 }}>Tải lại file PDF</a>
        {result?.pdfSaved === false && <p style={{ fontSize: 13, color: "#888" }}>Lưu ý: bản PDF chưa lưu được lên hệ thống — vui lòng giữ lại file vừa tải và gửi cho AR nếu được yêu cầu.</p>}
      </div>
    </div></div>
  );

  const anyLicensed = RIGHTS.some((r) => f.licensed[r.key]);
  const input = { width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 16, border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit" };
  return (
    <form onSubmit={submit} style={wrap} autoComplete="off"><div style={inner}>
      <input ref={hp} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <b style={{ letterSpacing: 1 }}>VIEENT</b><span style={{ color: "#555", fontSize: 13, fontWeight: 600 }}>Hướng dẫn khai báo bản quyền · Ca khúc mới</span>
      </div>
      <span style={{ background: OR, color: "#fff", fontWeight: 800, padding: "8px 18px", borderRadius: 20, fontSize: 14, display: "inline-block" }}>FORM KHAI BÁO</span>
      <h1 style={{ fontSize: 34, margin: "14px 0 4px", lineHeight: 1.15 }}>Khai báo bản quyền ca khúc mới</h1>
      <p style={{ color: "#555", marginTop: 0 }}>Vui lòng điền và tích đủ các mục.</p>

      <div style={card}>
        <Num n={1} title="Thông tin metadata" />
        {META_FIELDS.map((m) => (
          <div key={m.key} style={{ marginBottom: 10 }}>
            <label style={{ fontWeight: 700, fontSize: 14 }}>{m.label}:</label>
            <input style={{ ...input, color: OR_DK, fontWeight: 700 }} value={f[m.key]} onChange={(e) => set(m.key, e.target.value)} maxLength={200} />
          </div>
        ))}
      </div>

      <div style={card}>
        <Num n={2} title="Xác nhận quyền" />
        <div style={{ background: "#fdf1e8", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 16 }}>
          <p style={{ marginTop: 0 }}>Tôi cam kết có <b>đầy đủ 3 quyền</b> để phát hành ca khúc này, gồm:</p>
          <div style={{ fontWeight: 700, margin: "10px 0 8px" }}>Các quyền tôi sở hữu:</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {RIGHTS.map((r) => <Check key={r.key} on={!!f.owned[r.key]} onChange={(on) => setRight("owned", r.key, on)} label={r.vi} sub={`(${r.en})`} />)}
          </div>
          <div style={{ fontWeight: 700, margin: "16px 0 8px" }}>Các quyền được cấp phép sử dụng bởi chủ sở hữu quyền:</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {RIGHTS.map((r) => <Check key={r.key} on={!!f.licensed[r.key]} onChange={(on) => setRight("licensed", r.key, on)} label={r.vi} sub={`(${r.en})`} />)}
          </div>
          <div style={{ background: "#fde3d3", border: "1px solid #f2b58e", color: "#b0390b", fontWeight: 700, borderRadius: 12, padding: "12px 14px", margin: "14px 0", fontSize: 14 }}>
            Đối với các quyền được cấp phép, vui lòng gửi kèm xác nhận từ chủ sở hữu: ảnh chụp màn hình tin nhắn / email hoặc hợp đồng.
          </div>
          {anyLicensed && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontWeight: 700, fontSize: 14 }}>Link minh chứng từ chủ sở hữu (nếu có — Drive, email, hợp đồng…):</label>
              <textarea style={{ ...input, minHeight: 64 }} value={f.proof} onChange={(e) => set("proof", e.target.value)} maxLength={500} placeholder="Dán link Drive chứa ảnh chụp / hợp đồng, hoặc ghi rõ đã gửi cho ai" />
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
          {f.term === "limited" && <input style={{ ...input, marginTop: 8 }} placeholder="Thời hạn (ví dụ: 01/2026 – 12/2028)" value={f.term_note} onChange={(e) => set("term_note", e.target.value)} maxLength={200} />}
        </div>
      </div>

      <div style={card}>
        <Num n={3} title="Người gửi ký xác nhận" />
        <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
          <span>Chữ ký:</span><button type="button" onClick={clearPad} style={{ border: "none", background: "none", color: OR_DK, fontWeight: 700, cursor: "pointer" }}>Xóa ký lại</button>
        </div>
        <canvas ref={pad} width={1000} height={260} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          style={{ width: "100%", height: "auto", aspectRatio: "1000/260", border: "2px dashed #aaa", borderRadius: 14, touchAction: "none", background: "#fff" }} />
      </div>

      {err && <div style={{ background: "#fde8e8", border: "1px solid #f3b4b4", color: "#a11", borderRadius: 12, padding: "12px 14px", marginBottom: 14, fontWeight: 600 }}>{err}
        {result?.failed && <div style={{ marginTop: 6 }}><a href={result.pdfBlobUrl} download="Khai-bao-ban-quyen.pdf" style={{ color: OR_DK }}>Tải file PDF vừa tạo</a></div>}</div>}
      <button type="submit" disabled={busy} style={{ width: "100%", padding: "16px", background: OR, color: "#fff", border: "none", borderRadius: 14, fontSize: 18, fontWeight: 800, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
        {busy ? "Đang gửi…" : "Gửi khai báo & tải PDF"}
      </button>
      <p style={{ marginTop: 18, borderTop: "2px solid #222", paddingTop: 12, fontWeight: 700 }}><span style={{ color: OR_DK }}>Lưu ý:</span> Thiếu xác nhận nào, bài hát sẽ chưa được phát hành.</p>
    </div></form>
  );
}
