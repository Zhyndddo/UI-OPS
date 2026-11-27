"use client";
// Round 701 — first page of the combined form: label + release type (Single / EP / Album, with a tracklist for EP/Album) + the terms text.
import { useEffect, useState } from "react";
import { OR, OR_DK, BORDER, card, inp, Field, hintS } from "./ReleaseInfoSections";

export const RELEASE_TYPES = [{ key: "Single", label: "Single" }, { key: "EP", label: "EP" }, { key: "Album", label: "Album" }];

const sec = { margin: "0 0 16px" };
const warn = { display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 12px", background: "#fffdf3", border: "1px solid #f1e3a6", borderRadius: 12, margin: "10px 0" };
const dot = (c) => <span style={{ color: c, fontSize: 13, lineHeight: "22px", flex: "none" }}>●</span>;
const PROJECTS = [
  { name: "Dự án Pitching & Hỗ trợ truyền thông", min: "Trước tối thiểu 14 ngày", why: "Dành cho các dự án muốn Pitching Playlist/Banner trên các nền tảng và nhận hỗ trợ đồng hành truyền thông từ VIEENT." },
  { name: "Dự án chỉ Phát hành/Phân phối (Không Pitching)", min: "Trước tối thiểu 04 ngày làm việc", why: "Phát hành chuẩn quy trình, kỹ thuật và đảm bảo đúng ngày phát hành." },
  { name: "Dự án Gấp (Phát hành trong 24 - 48h)", min: "Tùy theo từng nền tảng", why: "• TikTok: Tối thiểu 24h.\n• Zing MP3: Tối thiểu 48h (chỉ nhận từ Thứ 2 – Thứ 5).\n• Meta (Facebook/Instagram): Tối thiểu 04 ngày." },
];

// Round 716 — the label box is plain typing (no suggestions from the Labels list). AR matches it to a real label in the workstation when the song cannot be matched.
function LabelPick({ value, onChange }) {
  return <input style={inp} value={value || ""} maxLength={120} autoComplete="off" onChange={(e) => onChange(e.target.value)} placeholder="Gõ tên hãng đĩa (hoặc tên nghệ sĩ nếu không có hãng)" />;
}

// Round 707 — the 01/02 terms text, now shown collapsed just above the signer section of the form page
export function TermsBlock() {
  return (
    <details id="terms-block" style={{ ...card, padding: "14px 18px" }}>
      <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 17 }}>Chính sách bản quyền & quy định thời gian gửi dự án (bấm để xem)</summary>
      <div style={{ ...card, border: "1px solid #222", borderRadius: 14, padding: "18px 16px" }}>
        <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.25 }}>01 . XÁC NHẬN BẢN QUYỀN & CAM KẾT SỬ DỤNG<br />(COPYRIGHT DECLARATION & TERMS)</h2>
        <p style={{ margin: "8px 0 0" }}>Bằng việc điền và gửi Bản Thông Tin Phát Hành này, Quý Đối tác và Nghệ sĩ cam kết:</p>
        <div style={warn}><span style={{ fontSize: 22, lineHeight: "22px" }}>⚠️</span><div>
          <b>QUYỀN SỞ HỮU & TÍNH SÁNG TẠO</b>
          <p style={sec}>Cam kết tác phẩm gửi phát hành là tác phẩm nguyên bản, tự sáng tạo, không sao chép/nhái lại và tuân thủ đúng Luật Sở hữu trí tuệ.</p>
          <p style={{ margin: "0 0 6px" }}><b>Đối với các Sản phẩm KHÔNG sở hữu 100%:</b><br />Đối tác bắt buộc khai báo đầy đủ, chính xác thông tin các bên liên quan + thời hạn sở hữu cụ thể đối với 03 nhóm quyền:</p>
          <div>○ <b>Master Rights</b> <i>(Quyền Nhà xuất bản / Bản Ghi)</i></div>
          <div>○ <b>Performing Rights</b> <i>(Quyền Biểu diễn / Nghệ sĩ)</i></div>
          <div>○ <b>Publishing Rights</b> <i>(Quyền Tác giả / Sáng tác)</i></div>
        </div></div>
        <div style={warn}><span style={{ fontSize: 22, lineHeight: "22px" }}>⚠️</span><div>
          <b>CAM KẾT CHỐNG GIAN LẬN & TRÁCH NHIỆM PHÁP LÝ</b>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>{dot("#111")}<span>Nghiêm cấm mọi hành vi khai báo giả mạo, gian lận hoặc cung cấp thông tin/tài liệu sai sự thật.</span></div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>{dot("#111")}<span>Trong trường hợp phát sinh tranh chấp, vi phạm bản quyền hoặc gian lận thông tin: <b>Quý Đối tác chịu hoàn toàn trách nhiệm trước pháp luật, đồng thời chi trả toàn bộ chi phí bồi thường thiệt hại liên quan</b>.</span></div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>{dot("#111")}<span>Bên phát hành có quyền <b>ngay lập tức gỡ bỏ sản phẩm, tạm dừng hợp tác và khấu trừ doanh thu</b> để khắc phục hậu quả.</span></div>
        </div></div>
      </div>

      <div style={{ ...card, border: "1px solid #222", borderRadius: 14, padding: "18px 16px" }}>
        <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.25 }}>02 . QUY ĐỊNH VỀ THỜI GIAN GỬI DỰ ÁN<br />(DEADLINE SEEDING & RELEASE)</h2>
        <p style={{ margin: "8px 0 12px" }}>Để đảm bảo kế hoạch phát hành và hỗ trợ quảng bá đạt hiệu quả tốt nhất, Quý Đối tác và Nghệ sĩ vui lòng lưu ý các mốc thời gian sau:</p>
        {PROJECTS.map((p) => (
          <div key={p.name} style={{ background: "#f3f3f3", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
            <div style={{ fontWeight: 800 }}>{p.name}</div>
            <div style={{ marginTop: 4 }}><span style={hintS}>Thời gian gửi tối thiểu: </span><b>{p.min}</b></div>
            <div style={{ marginTop: 4, whiteSpace: "pre-line" }}><span style={hintS}>Mục đích: </span>{p.why}</div>
          </div>
        ))}
      </div>

    </details>
  );
}

// Round 708 — label + Single/EP/Album + tracklist (page 1 of the form, and the top of the re-access page)
export function ProductCard({ f, setF }) {
  const isMulti = f.release_type === "EP" || f.release_type === "Album";
  const tracks = Array.isArray(f.tracks) && f.tracks.length ? f.tracks.map((t) => (typeof t === "string" ? { title: t } : t)) : [{ title: "" }, { title: "" }];
  const setTrack = (i, v) => setF((o) => ({ ...o, tracks: tracks.map((t, x) => (x === i ? { ...t, title: v } : t)) }));
  const addTrack = () => setF((o) => ({ ...o, tracks: [...tracks, { title: "" }].slice(0, 40) }));
  const delTrack = (i) => setF((o) => ({ ...o, tracks: tracks.filter((_, x) => x !== i) }));
  return (
    <>
      <div style={card}>
        <h2 style={{ margin: "0 0 12px", fontSize: 21 }}>Sản phẩm</h2>
        <Field label="Label / Hãng đĩa *" hint="(ghi tên hãng đĩa, hoặc tên nghệ sĩ nếu không có hãng)"><LabelPick value={f.label} onChange={(v) => setF((o) => ({ ...o, label: v }))} /></Field>
        <label style={{ display: "block", fontWeight: 700, fontSize: 14, margin: "14px 0 6px" }}>Loại hình / Type *</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {RELEASE_TYPES.map((t) => {
            const on = f.release_type === t.key;
            return (
              <label key={t.key} style={{ flex: "1 1 100px", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#fff", border: `1px solid ${on ? OR : BORDER}`, borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
                <input type="radio" name="release_type" checked={on} onChange={() => setF((o) => ({ ...o, release_type: t.key }))} style={{ width: 20, height: 20, accentColor: OR }} />{t.label}
              </label>
            );
          })}
        </div>
        {isMulti && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Tracklist {f.release_type} <span style={hintS}>(ít nhất 2 track — ghi đúng thứ tự phát hành)</span></div>
            {tracks.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <span style={{ flex: "0 0 28px", color: OR_DK, fontWeight: 800, textAlign: "right" }}>{i + 1}</span>
                <input style={{ ...inp, flex: "1 1 auto", width: "auto" }} placeholder={`Tên track ${i + 1}`} value={t.title || ""} maxLength={200} onChange={(e) => setTrack(i, e.target.value)} />
                {tracks.length > 2 && <button type="button" onClick={() => delTrack(i)} aria-label={`Xoá track ${i + 1}`} style={{ flex: "0 0 auto", width: 40, height: 40, borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer", color: "#a01818", fontWeight: 800 }}>✕</button>}
              </div>
            ))}
            <button type="button" onClick={addTrack} style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, border: `1px dashed ${OR}`, background: "#fff", color: OR_DK, fontWeight: 800, cursor: "pointer" }}>+ Thêm track</button>
          </div>
        )}
      </div>
    </>
  );
}

export default function ReleaseIntroStep({ f, setF, onNext, err, demo }) {
  return (
    <>
      {demo && <div style={{ background: "#fff4d6", border: "1px solid #f0d58a", borderRadius: 12, padding: "10px 14px", margin: "12px 0 0", fontSize: 14 }}><b>BẢN DEMO</b> — dùng cho sản phẩm thử. Gửi ở cuối form sẽ tạo khai báo thật (có email mã, ticket cho AR).</div>}
      <span style={{ background: OR, color: "#fff", fontWeight: 800, padding: "8px 18px", borderRadius: 20, fontSize: 14, display: "inline-block", marginTop: 12 }}>THÔNG TIN PHÁT HÀNH</span>
      <h1 style={{ fontSize: 34, margin: "14px 0 14px", lineHeight: 1.15, color: OR }}>THÔNG TIN PHÁT HÀNH</h1>

      <ProductCard f={f} setF={setF} />

      {err && <div role="alert" style={{ background: "#fde8e8", border: "1px solid #f3b4b4", color: "#a11", borderRadius: 12, padding: "12px 14px", marginBottom: 14, fontWeight: 600 }}>{err}</div>}
      <button type="button" onClick={onNext} style={{ width: "100%", padding: "16px", background: OR, color: "#fff", border: "none", borderRadius: 14, fontSize: 18, fontWeight: 800, cursor: "pointer" }}>Tiếp tục →</button>
    </>
  );
}
