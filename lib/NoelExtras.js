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
    for (const [side, q] of [[800, 0.7], [700, 0.6], [560, 0.55], [420, 0.5]]) {
      const k = Math.min(1, side / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", q);
      if (out.length <= 150000) return out;
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}

const overlay = { position: "fixed", inset: 0, zIndex: 9500, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const box = { width: "min(420px, 100%)", maxHeight: "90vh", overflowY: "auto", background: "var(--bg-card)", color: "var(--text)", border: "2px solid var(--border-strong)", borderRadius: 12, padding: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" };
const btn = { padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-input)", color: "var(--text)", cursor: "pointer", fontSize: 12 };

export function WishCard({ index, onClose }) {
  const [list, setList] = useState(null); const [err, setErr] = useState(""); const [changed, setChanged] = useState(false);
  useEffect(() => {
    (async () => { try { const r = await noelFetch(`/api/noel-tree?wish=${index}`); const j = await r.json(); if (r.ok) setList(j.wishes || []); else setErr(j.error || "Không mở được lời chúc."); } catch { setErr("Không mở được lời chúc."); } })();
  }, [index]);
  async function remove(id) {
    if (!window.confirm("Xoá lời chúc này?")) return;
    try { await noelFetch("/api/noel-tree", { method: "POST", body: JSON.stringify({ action: "delete", id }) }); } catch { /* ignore */ }
    setList((l) => (l || []).filter((w) => w.id !== id)); setChanged(true);
  }
  return (
    <div style={overlay} onClick={() => onClose(changed)}>
      <div style={{ ...box, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 22 }}>🎄✨</div>
        {!list && !err && <div style={{ padding: 20, color: "var(--text-muted)" }}>Đang mở…</div>}
        {err && <div style={{ padding: 20, color: "var(--text-muted)" }}>{err}</div>}
        {list && list.length === 0 && <div style={{ padding: 20, color: "var(--text-muted)" }}>Chưa có lời chúc nào.</div>}
        {(list || []).map((w) => (
          <div key={w.id} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
            {w.photoUrl && <img src={w.photoUrl} alt="" style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8, marginBottom: 6, border: "1px solid var(--border)" }} />}
            <div style={{ fontSize: 15, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{w.body}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>— {w.name || "Ẩn danh"} {w.canDelete && <button type="button" style={{ ...btn, padding: "1px 8px", marginLeft: 8 }} onClick={() => remove(w.id)}>Xoá</button>}</div>
          </div>
        ))}
        <div style={{ marginTop: 12 }}><button type="button" style={btn} onClick={() => onClose(changed)}>Đóng</button></div>
      </div>
    </div>
  );
}

export function WishModal({ me, test, onClose }) {
  const [orn, setOrn] = useState(me?.ornament || "bulb");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState(null);
  const [showName, setShowName] = useState(false);
  const [mine, setMine] = useState(me?.wishes || []);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const [changed, setChanged] = useState(false);
  const fileRef = useRef(null);
  const max = me?.max || 10;
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
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setMsg(j.error || "Lưu chưa được."); setBusy(false); return; }
        if (photo && j.photoSaved === false) { setMsg("Lời chúc đã lưu nhưng ảnh chưa tải lên được (kiểm tra bucket noel-wishes)."); setBusy(false); setBody(""); setPhoto(null); setChanged(true); return; }
      }
      onClose(true);
    } catch { setMsg("Lưu chưa được, thử lại nhé."); setBusy(false); }
  }
  async function removeOne(id) {
    if (!window.confirm("Xoá lời chúc này?")) return;
    try { await noelFetch("/api/noel-tree", { method: "POST", body: JSON.stringify({ action: "delete", id }) }); } catch { /* ignore */ }
    setMine((l) => l.filter((w) => w.id !== id)); setChanged(true);
  }
  async function resetTest() {
    if (!window.confirm("Xoá toàn bộ dữ liệu thử của bạn (lời chúc, ảnh, đồ trang trí, bóng đèn)?")) return;
    setBusy(true); try { await noelFetch("/api/noel-tree", { method: "POST", body: JSON.stringify({ action: "reset" }) }); } catch { /* ignore */ } onClose(true);
  }
  return (
    <div style={overlay} onClick={() => onClose(changed)}>
      <div style={box} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>🎄 Cây Noel của bạn</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Chọn món trang trí treo lên cây (bạn nào đã vào app tháng 12 sẽ có một chỗ trên cây):</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {["bulb", ...Object.keys(ORN)].map((k) => (
            <button key={k} type="button" onClick={() => setOrn(k)} style={{ ...btn, background: orn === k ? "var(--accent)" : "var(--bg-input)", color: orn === k ? "var(--accent-on)" : "var(--text)" }}>{ORN[k] || "💡"} {ORN_NAMES[k]}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Viết thêm một lời chúc ({mine.length}/{max}) — bấm vào đồ trang trí của bạn trên cây là cả nhà đọc được:</div>
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
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" style={btn} onClick={() => onClose(changed)}>Đóng</button>
          <button type="button" style={{ ...btn, background: "var(--accent)", color: "var(--accent-on)", fontWeight: 700 }} onClick={save} disabled={busy}>{busy ? "Đang lưu…" : body.trim() ? "Gửi lời chúc" : "Lưu đồ trang trí"}</button>
        </div>
        {mine.length > 0 && (
          <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Lời chúc của bạn</div>
            {mine.map((w) => (
              <div key={w.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "3px 0" }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.hasPhoto ? "📷 " : ""}{w.body}</span>
                <span style={{ color: "var(--text-faint)" }}>{w.showName ? "tên" : "ẩn danh"}</span>
                <button type="button" style={{ ...btn, padding: "1px 8px" }} onClick={() => removeOne(w.id)}>Xoá</button>
              </div>
            ))}
          </div>
        )}
        {test && me?.canTest && (
          <div style={{ marginTop: 12, borderTop: "1px dashed var(--border)", paddingTop: 8 }}>
            <button type="button" style={{ ...btn, borderColor: "var(--error-border)" }} onClick={resetTest} disabled={busy}>🧪 Xoá hết dữ liệu thử của tôi</button>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>Chỉ hiện khi mở bằng ?noel=preview và tài khoản admin: xoá lời chúc, ảnh, đồ trang trí và bóng đèn của bạn để thử lại từ đầu.</div>
          </div>
        )}
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
