"use client";
// Round 641 — public page opened from the right holder's email link: read what is declared, type full name, tick consent, enter the emailed code.
import { useEffect, useState } from "react";

const OR = "#f26a0f", OR_DK = "#c2410c";
const card = { background: "#fff", border: "1px solid #f0e2d6", borderRadius: 20, padding: 20, marginBottom: 16 };
const input = { width: "100%", boxSizing: "border-box", padding: "12px", fontSize: 16, border: "1px solid #ddd", borderRadius: 10, fontFamily: "inherit" };
const fmt = (s) => (s ? new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "");

export default function RightsHolderPage({ token }) {
  const [state, setState] = useState("loading");   // loading | bad | ready | done | declined | already
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [otp, setOtp] = useState({ challenge: "", code: "", cool: 0 });
  const post = async (payload) => { const r = await fetch("/api/rights-holder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, ...payload }) }); return { r, j: await r.json().catch(() => ({})) }; };
  const client = () => { try { return { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: navigator.language, screen: `${screen.width}x${screen.height}`, platform: navigator.userAgentData?.platform || navigator.platform || "" }; } catch (e) { return {}; } };

  useEffect(() => {
    let live = true;
    fetch(`/api/rights-holder?t=${encodeURIComponent(token)}`).then(async (r) => ({ r, j: await r.json().catch(() => ({})) })).then(({ r, j }) => {
      if (!live) return;
      if (!r.ok) { setErr(j.error || ""); setState("bad"); return; }
      setInfo(j);
      setState(j.status === "signed" ? "already" : j.status === "declined" ? "declined" : j.status === "sent" ? "ready" : "bad");
    }).catch(() => live && setState("bad"));
    return () => { live = false; };
  }, [token]);
  useEffect(() => { if (otp.cool <= 0) return; const t = setTimeout(() => setOtp((o) => ({ ...o, cool: o.cool - 1 })), 1000); return () => clearTimeout(t); }, [otp.cool]);

  async function sendCode() {
    setBusy(true); setErr("");
    const { r, j } = await post({ action: "send_code", consent: true });
    if (!r.ok) setErr(j.error || `Lỗi ${r.status}`); else setOtp({ challenge: j.challenge, code: "", cool: 60 });
    setBusy(false);
  }
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    if (name.trim().length < 2) { setErr("Vui lòng gõ họ tên đầy đủ của bạn."); return; }
    if (!consent) { setErr("Vui lòng tích đồng ý cho VIEENT ghi nhận thông tin xác minh."); return; }
    if (!otp.challenge) { await sendCode(); return; }
    if (!/^\d{6}$/.test(otp.code)) { setErr("Nhập mã 6 số đã gửi về email của bạn."); return; }
    setBusy(true);
    const { r, j } = await post({ action: "confirm", consent: true, typed_name: name.trim(), challenge: otp.challenge, code: otp.code, client: client() });
    setBusy(false);
    if (!r.ok) { setErr(j.error || `Lỗi ${r.status}`); return; }
    setState("done");
  }
  async function decline() {
    if (busy || !window.confirm("Bạn chắc chắn muốn TỪ CHỐI khai báo này?")) return;
    setBusy(true);
    const { r, j } = await post({ action: "decline", client: client() });
    setBusy(false);
    if (!r.ok) { setErr(j.error || `Lỗi ${r.status}`); return; }
    setState("declined");
  }

  const wrap = { minHeight: "100vh", background: "#fafafa", color: "#111", padding: "20px 16px 48px" };
  const inner = { maxWidth: 640, margin: "0 auto" };
  const msg = (icon, title, text) => <div style={wrap}><div style={inner}><div style={{ ...card, textAlign: "center" }}><div style={{ fontSize: 44 }}>{icon}</div><h1 style={{ fontSize: 24 }}>{title}</h1><p>{text}</p></div></div></div>;
  if (state === "loading") return <div style={wrap}><div style={inner}>Đang tải…</div></div>;
  if (state === "bad") return msg("⚠️", "Liên kết không dùng được", err || "Liên kết không đúng hoặc đã hết hạn. Vui lòng nhờ VIEENT gửi lại.");
  if (state === "done") return msg("✅", "Đã xác nhận", "Cảm ơn bạn. VIEENT đã ghi nhận xác nhận quyền của bạn. Bạn có thể đóng trang này.");
  if (state === "already") return msg("✅", "Bạn đã xác nhận", `Xác nhận được ghi nhận lúc ${fmt(info?.signed_at)}. Cảm ơn bạn.`);
  if (state === "declined") return msg("🚫", "Đã từ chối", "VIEENT đã ghi nhận việc bạn từ chối khai báo này.");

  const d = info.decl;
  const row = (k, v) => <div style={{ marginBottom: 6 }}><b>{k}:</b> {v || "—"}</div>;
  return (
    <form onSubmit={submit} style={wrap}><div style={inner}>
      <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 6 }}>VIEENT</div>
      <h1 style={{ fontSize: 26, margin: "0 0 14px" }}>Xác nhận quyền ca khúc</h1>
      <div style={card}>
        <p style={{ marginTop: 0 }}>Xin chào <b>{info.holder_name}</b>. <b>{d.signer_name}</b> khai báo với VIEENT rằng bạn là chủ sở hữu các quyền sau, và đã cho phép phát hành:</p>
        {row("Bài hát", d.song_title)}
        {row("Trình bày", d.performer)}
        {row("Sáng tác", d.composer)}
        {row("Quyền được cấp phép", d.licensed.join(", "))}
        {row("Nền tảng", d.platforms === "all" ? "Tất cả các nền tảng" : d.platforms === "some" ? `Một số: ${d.platforms_note || ""}` : "")}
        {row("Thời hạn đăng tải", d.term === "perpetual" ? "Vĩnh viễn" : `Có thời hạn ${d.term_note || ""}`)}
        {row("Ngày khai báo", fmt(d.submitted_at))}
      </div>
      <div style={card}>
        <label style={{ fontWeight: 700, fontSize: 14 }}>Gõ họ tên đầy đủ của bạn để xác nhận:</label>
        <input style={{ ...input, marginTop: 6 }} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Họ và tên" />
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "14px 0", fontSize: 14, fontWeight: 600 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 20, height: 20, accentColor: OR, marginTop: 2, flex: "none" }} />
          <span>Tôi xác nhận các thông tin trên là đúng và đồng ý cho VIEENT ghi nhận địa chỉ IP, thiết bị, nền tảng, vị trí gần đúng và thời gian — chỉ nhằm xác định người xác nhận.</span>
        </label>
        {otp.challenge && (
          <div style={{ background: "#f4f8ff", border: "1px solid #c7d8f5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Đã gửi mã 6 số tới {info.holder_email}. Nhập mã:</div>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp.code} onChange={(e) => setOtp((o) => ({ ...o, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="______"
              style={{ ...input, fontSize: 26, letterSpacing: 10, textAlign: "center", fontWeight: 800 }} />
            <button type="button" disabled={busy || otp.cool > 0} onClick={sendCode} style={{ marginTop: 8, border: "none", background: "none", color: OR_DK, fontWeight: 700, cursor: otp.cool > 0 ? "default" : "pointer", opacity: otp.cool > 0 ? 0.5 : 1 }}>
              {otp.cool > 0 ? `Gửi lại mã sau ${otp.cool}s` : "Gửi lại mã"}
            </button>
          </div>
        )}
        {err && <div style={{ background: "#fde8e8", border: "1px solid #f3b4b4", color: "#a11", borderRadius: 12, padding: "12px 14px", marginBottom: 12, fontWeight: 600 }}>{err}</div>}
        <button type="submit" disabled={busy} style={{ width: "100%", padding: 16, background: OR, color: "#fff", border: "none", borderRadius: 14, fontSize: 18, fontWeight: 800, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? "Đang xử lý…" : otp.challenge ? "Xác nhận mã & hoàn tất" : "Gửi mã xác nhận về email"}
        </button>
        <button type="button" onClick={decline} disabled={busy} style={{ marginTop: 12, border: "none", background: "none", color: "#a11", fontWeight: 700, cursor: "pointer" }}>Thông tin không đúng — Từ chối</button>
      </div>
    </div></form>
  );
}
