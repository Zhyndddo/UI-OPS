"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

// Round 675 — Noel tree extras: wish card, "my tree" editor (ornament + wish + picture), confetti. Server: app/api/noel-tree/route.js.
export const ORN = { star: "⭐", bell: "🔔", candy: "🍬", sock: "🧦", gift: "🎁", snowman: "⛄" };
const ORN_NAMES = { bulb: "Bóng đèn", star: "Ngôi sao", bell: "Chuông", candy: "Kẹo", sock: "Tất Noel", gift: "Quà", snowman: "Người tuyết" };

export async function noelFetch(path, opts = {}) {
  const { data } = await supabase.auth.getSession();
  return fetch(path, { cache: "no-store", ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${data?.session?.access_token || ""}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
}

// resize in the browser -> small JPEG data-URL (<= ~200K chars)
async function toSmallJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    for (const [side, q] of [[900, 0.75], [900, 0.6], [700, 0.6], [560, 0.55], [420, 0.5]]) {
      const k = Math.min(1, side / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", q);
      if (out.length <= 200000) return out;
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}

const overlay = { position: "fixed", inset: 0, zIndex: 9500, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const box = { width: "min(420px, 100%)", maxHeight: "90vh", overflowY: "auto", background: "var(--bg-card)", color: "var(--text)", border: "2px solid var(--border-strong)", borderRadius: 12, padding: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" };
const btn = { padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-input)", color: "var(--text)", cursor: "pointer", fontSize: 12 };

export function WishCard({ index, onClose }) {
  const [w, setW] = useState(null); const [err, setErr] = useState("");
  useEffect(() => {
    (async () => { try { const r = await noelFetch(`/api/noel-tree?wish=${index}`); const j = await r.json(); if (r.ok) setW(j); else setErr(j.error || "Không mở được lời chúc."); } catch { setErr("Không mở được lời chúc."); } })();
  }, [index]);
  async function remove() {
    if (!window.confirm("Xoá lời chúc này?")) return;
    try { await noelFetch("/api/noel-tree", { method: "POST", body: JSON.stringify({ action: "delete", index }) }); } catch { /* ignore */ }
    onClose(true);
  }
  return (
    <div style={overlay} onClick={() => onClose(false)}>
      <div style={{ ...box, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 22 }}>🎄✨</div>
        {!w && !err && <div style={{ padding: 20, color: "var(--text-muted)" }}>Đang mở…</div>}
        {err && <div style={{ padding: 20, color: "var(--text-muted)" }}>{err}</div>}
        {w && (
          <>
            {w.photo && <img src={w.photo} alt="" style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, margin: "8px 0", border: "1px solid var(--border)" }} />}
            <div style={{ fontSize: 15, lineHeight: 1.45, whiteSpace: "pre-wrap", margin: "8px 0" }}>{w.body}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>— {w.name || "Ẩn danh"}</div>
          </>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
          {w?.canDelete && <button type="button" style={btn} onClick={remove}>Xoá</button>}
          <button type="button" style={btn} onClick={() => onClose(false)}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

export function WishModal({ me, onClose }) {
  const [orn, setOrn] = useState(me?.ornament || "bulb");
  const [body, setBody] = useState(me?.wish?.body || "");
  const [photo, setPhoto] = useState(me?.wish?.photo || null);
  const [showName, setShowName] = useState(!!me?.wish?.showName);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const fileRef = useRef(null);
  async function pick(e) {
    const f = e.target.files?.[0]; if (!f) return;
    setMsg("Đang nén ảnh…");
    try { const out = await toSmallJpeg(f); if (out) { setPhoto(out); setMsg(""); } else setMsg("Ảnh quá lớn, thử ảnh khác nhé."); } catch { setMsg("Không đọc được ảnh."); }
    e.target.value = "";
  }
  async function save() {
    setBusy(true); setMsg("");
    try {
      await noelFetch("/api/noel-tree", { method: "POST", body: JSON.stringify({ action: "ornament", kind: orn }) });
      if (body.trim()) {
        const r = await noelFetch("/api/noel-tree", { method: "POST", body: JSON.stringify({ action: "wish", body, photo, showName }) });
        const j = await r.json().catch(() => ({})); if (!r.ok) { setMsg(j.error || "Lưu chưa được."); setBusy(false); return; }
      }
      onClose(true);
    } catch { setMsg("Lưu chưa được, thử lại nhé."); setBusy(false); }
  }
  async function removeMine() {
    if (!window.confirm("Xoá lời chúc của bạn?")) return;
    setBusy(true); try { await noelFetch("/api/noel-tree", { method: "POST", body: JSON.stringify({ action: "delete" }) }); } catch { /* ignore */ } onClose(true);
  }
  return (
    <div style={overlay} onClick={() => onClose(false)}>
      <div style={box} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>🎄 Cây Noel của bạn</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Chọn món trang trí treo lên cây (bạn nào đã vào app tháng 12 sẽ có một chỗ trên cây):</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {["bulb", ...Object.keys(ORN)].map((k) => (
            <button key={k} type="button" onClick={() => setOrn(k)} style={{ ...btn, background: orn === k ? "var(--accent)" : "var(--bg-input)", color: orn === k ? "var(--accent-on)" : "var(--text)" }}>{ORN[k] || "💡"} {ORN_NAMES[k]}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Lời chúc (bấm vào đồ trang trí của bạn trên cây là cả nhà đọc được):</div>
        <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 280))} rows={4} placeholder="Chúc cả nhà một mùa Giáng sinh ấm áp…" style={{ width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--text)", fontSize: 13, resize: "vertical" }} />
        <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "right" }}>{body.length}/280</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0", flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
          <button type="button" style={btn} onClick={() => fileRef.current?.click()}>🖼️ {photo ? "Đổi ảnh" : "Thêm ảnh"}</button>
          {photo && <button type="button" style={btn} onClick={() => setPhoto(null)}>Bỏ ảnh</button>}
        </div>
        {photo && <img src={photo} alt="" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, border: "1px solid var(--border)" }} />}
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, margin: "10px 0" }}><input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} /> Hiện tên của tôi (bỏ chọn = ẩn danh)</label>
        {msg && <div style={{ fontSize: 12, color: "var(--error-fg)", marginBottom: 6 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <div>{me?.wish && <button type="button" style={btn} onClick={removeMine} disabled={busy}>Xoá lời chúc</button>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={btn} onClick={() => onClose(false)}>Đóng</button>
            <button type="button" style={{ ...btn, background: "var(--accent)", color: "var(--accent-on)", fontWeight: 700 }} onClick={save} disabled={busy}>{busy ? "Đang lưu…" : "Lưu"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const CONF = ["#ff4d5e", "#ffd166", "#3ddc84", "#4cc9f0", "#ff9ff3", "#fff"];
export function Confetti() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: 40, width: 0, height: 0, pointerEvents: "none" }}>
      {Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2, d = 50 + (i % 5) * 18;
        return <span key={i} style={{ position: "absolute", width: 6, height: 9, background: CONF[i % CONF.length], borderRadius: 1, animation: "noelConf 1.3s ease-out forwards", "--dx": `${Math.cos(a) * d}px`, "--dy": `${Math.sin(a) * d - 60}px`, "--rot": `${i * 47}deg` }} />;
      })}
      <style>{"@keyframes noelConf{0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(var(--dx),calc(var(--dy) + 70px)) rotate(var(--rot));opacity:0}}"}</style>
    </div>
  );
}
