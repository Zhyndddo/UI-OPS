"use client";

import { useEffect, useState } from "react";
import qrcode from "./vendor/qrcode-generator";

// Round 600 — "📱 QR" button on the player's role card: shows a QR that opens the private role card on a phone (/ma-soi/role?t=…).
// The link is the player's own and reopenable; closing this popup hides the QR from the screen again.
export default function RoleQR({ call, btnStyle, inline = false }) {
  const [open, setOpen] = useState(false);
  const [img, setImg] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function show() {
    setErr(""); setBusy(true); setOpen(true);
    try {
      const j = await call({ action: "role_token" });
      const link = `${window.location.origin}/ma-soi/role?t=${j.token}`;
      const qr = qrcode(0, "M"); qr.addData(link); qr.make();
      setUrl(link); setImg(qr.createDataURL(7, 16));
    } catch (e) { setErr(e.message || "Không tạo được QR."); }
    setBusy(false);
  }
  function close() { setOpen(false); setImg(""); setUrl(""); }

  // inline mode: the role is NOT written on the page at all — only this code is shown, and the card opens on the phone
  useEffect(() => { if (inline) show(); }, [inline]); // eslint-disable-line react-hooks/exhaustive-deps
  if (inline) {
    return (
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ background: "#fff", borderRadius: 10, padding: 6, minWidth: 150, minHeight: 150, display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 12 }}>
          {img ? <img src={img} alt="QR vai trò" width={150} height={150} style={{ display: "block", imageRendering: "pixelated" }} /> : (err ? <span style={{ color: "#c0392b", padding: 8 }}>{err}</span> : "Đang tạo mã…")}
        </div>
        <div style={{ flex: 1, minWidth: 180, fontSize: 13.5, lineHeight: 1.55 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>🎭 Vai trò của bạn nằm trong mã QR</div>
          Mở camera điện thoại và quét để xem vai trò riêng tư (lật thẻ trên điện thoại). Có thể quét lại bất cứ lúc nào.
          {url && <div style={{ fontSize: 11.5, marginTop: 6, opacity: 0.75 }}>Không quét được? <a href={url} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>Mở thẻ trên thiết bị này</a></div>}
          {err && <button type="button" style={{ ...btnStyle, marginTop: 8 }} onClick={show}>Thử lại</button>}
        </div>
      </div>
    );
  }

  return (
    <>
      <button type="button" style={btnStyle} onClick={show} title="Quét bằng điện thoại để xem vai trò riêng tư">📱 QR</button>
      {open && (
        <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 20, maxWidth: 340, width: "100%", textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>📱 Quét để xem vai trò</div>
            <div style={{ fontSize: 12.5, color: "#555", marginBottom: 10 }}>Mở camera điện thoại và quét mã. Thẻ chỉ hiện trên điện thoại của bạn — có thể quét lại bất cứ lúc nào.</div>
            {busy && <div style={{ padding: 40 }}>Đang tạo mã…</div>}
            {err && <div style={{ color: "#c0392b", padding: 12 }}>{err}</div>}
            {img && <img src={img} alt="QR vai trò" style={{ width: "100%", maxWidth: 260, imageRendering: "pixelated" }} />}
            {url && <div style={{ fontSize: 11, color: "#777", wordBreak: "break-all", marginTop: 8 }}>Không quét được? <a href={url} target="_blank" rel="noreferrer">Mở link trực tiếp</a></div>}
            <button type="button" onClick={close} style={{ marginTop: 14, padding: "9px 18px", fontWeight: 700, borderRadius: 8, border: "none", background: "#111", color: "#fff", cursor: "pointer" }}>Đóng</button>
          </div>
        </div>
      )}
    </>
  );
}
