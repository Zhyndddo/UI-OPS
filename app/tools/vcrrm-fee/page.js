"use client";

import { useMemo, useRef, useState } from "react";
import AppShell from "../../../lib/AppShell";
import styles from "../../shared.module.css";
import { TYPES, PROVINCES, COLS, LCS, VAT, DEFAULT_MONTHS, calcRow, parsePaste, detectProvince, vnd } from "../../../lib/vcrrmFee";

// Round 719 — VCRRM nhạc nền: fee for many business locations at once (same formula as the sheet "Phiếu khai báo nhạc nền").
// Paste rows from Excel in the form's column order: Tên cơ sở · Địa chỉ · Tỉnh/TP · Loại hình · Diện tích (m²) · Thời hạn (tháng).
let uid = 0;
const withId = (r) => ({ ...r, id: ++uid, provAuto: !r.provRaw && !!r.province });
const blank = () => withId({ name: "", address: "", provRaw: "", province: "", typeRaw: "", typeIdx: -1, area: "", months: "" });
const cell = { padding: "4px 6px", borderBottom: "1px solid var(--border)", verticalAlign: "top", fontSize: 12.5 };
const inp = { width: "100%", boxSizing: "border-box", padding: "5px 7px", fontSize: 12.5, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "inherit", fontFamily: "inherit" };

export default function VcrrmFeePage() {
  const [rows, setRows] = useState([]);
  const [text, setText] = useState("");
  const [defType, setDefType] = useState(-1);
  const [defMonths, setDefMonths] = useState(String(DEFAULT_MONTHS));
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  const calc = useMemo(() => rows.map((r) => {
    const typeIdx = r.typeIdx >= 0 ? r.typeIdx : (!String(r.typeRaw || "").trim() ? defType : -1);
    const months = String(r.months).trim() === "" ? defMonths : r.months;
    return calcRow({ ...r, typeIdx, months });
  }), [rows, defType, defMonths]);

  const tot = useMemo(() => calc.reduce((a, c) => (c.ok ? { n: a.n + 1, year: a.year + c.year, term: a.term + c.term, vat: a.vat + c.vat, total: a.total + c.total } : a), { n: 0, year: 0, term: 0, vat: 0, total: 0 }), [calc]);
  const bad = calc.filter((c) => !c.ok).length, warn = calc.filter((c) => c.ok && c.warn.length).length;

  function load(newRows, append) {
    const list = newRows.map(withId);
    setRows((o) => (append ? [...o, ...list] : list));
    setMsg(`Đã nạp ${list.length} dòng.`);
  }
  const upd = (id, patch) => setRows((o) => o.map((r) => {
    if (r.id !== id) return r;
    const n = { ...r, ...patch };
    if ("address" in patch && r.provAuto) { n.province = detectProvince(patch.address) || ""; }
    if ("province" in patch) n.provAuto = false;
    if ("typeIdx" in patch) n.typeRaw = patch.typeIdx >= 0 ? TYPES[patch.typeIdx][0] : r.typeRaw;
    return n;
  }));

  async function onFile(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: "" });
      load(parsePaste(aoa.map((r) => r.slice(0, 6).join("\t")).join("\n")), false);
    } catch (err) { setMsg("Không đọc được file: " + (err?.message || err)); }
  }

  const outHead = [...COLS, "Hệ số diện tích", "Hệ số sau trần", "Tỉnh/TP áp dụng", "Hệ số đô thị", "Phí / năm (chưa GTGT)", "Phí theo thời hạn (chưa GTGT)", "GTGT 10%", "Tổng thanh toán", "Ghi chú"];
  const outRows = () => rows.map((r, i) => {
    const c = calc[i];
    return [r.name, r.address, r.province, r.typeIdx >= 0 ? TYPES[r.typeIdx][0] : r.typeRaw, r.area, String(r.months).trim() === "" ? defMonths : r.months,
      c.ok ? c.coef.toFixed(3) : "", c.ok ? c.capped.toFixed(3) : "", c.ok ? c.province : "", c.ok ? c.urban : "", c.ok ? c.year : "", c.ok ? c.term : "", c.ok ? c.vat : "", c.ok ? c.total : "", c.ok ? c.warn.join("; ") : c.err];
  });
  const csvEsc = (v) => { const s = String(v ?? ""); return /[",;\n\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function download(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
  const stamp = () => new Date().toISOString().slice(0, 10);
  const totalRow = () => ["TỔNG", "", "", "", "", "", "", "", "", "", tot.year, tot.term, tot.vat, tot.total, `${tot.n} cơ sở`];
  const copyTsv = async () => { try { await navigator.clipboard.writeText([outHead, ...outRows(), totalRow()].map((r) => r.join("\t")).join("\n")); setMsg("Đã copy — dán thẳng vào Excel / Google Sheets."); } catch (e) { setMsg("Trình duyệt không cho copy."); } };
  const dlCsv = () => download(`vcrrm-nhac-nen-${stamp()}.csv`, new Blob(["﻿" + [outHead, ...outRows(), totalRow()].map((r) => r.map(csvEsc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  async function dlXlsx() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([outHead, ...outRows(), totalRow()]);
    ws["!cols"] = [22, 34, 16, 30, 10, 10, 10, 10, 16, 10, 16, 18, 14, 16, 34].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Phí nhạc nền");
    XLSX.writeFile(wb, `vcrrm-nhac-nen-${stamp()}.xlsx`);
  }

  const th = { ...cell, fontWeight: 700, background: "var(--bg-hover)", position: "sticky", top: 0, whiteSpace: "nowrap", zIndex: 2 };
  const num = { ...cell, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1400 }}>
          <div className={styles.eyebrow}>// VCRRM · Nhạc nền</div>
          <h1 className={styles.title}>Tính phí nhạc nền — nhiều địa điểm cùng lúc</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginTop: -12, marginBottom: 16, lineHeight: 1.55 }}>
            Cùng công thức với phiếu khai báo VCRRM (Phụ lục II NĐ 17/2023, sửa đổi NĐ 134/2026): phí/năm = LCS ({vnd(LCS)} đ) × hệ số diện tích (có trần theo loại hình) × hệ số đô thị theo tỉnh/TP nơi kinh doanh; phí theo thời hạn = phí/năm ÷ 12 × số tháng; cộng GTGT {VAT * 100}%. Chỉ là mức tham khảo — VCRRM chốt theo thực tế. Chưa gồm quyền tác giả (VCPMC).
          </p>

          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>1. Dán từ Excel (đúng thứ tự cột) hoặc chọn file</div>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 8 }}>
              {COLS.map((c, i) => <span key={c} className={styles.statusBadge} style={{ marginRight: 4 }}>{String.fromCharCode(65 + i)} · {c}</span>)}
              <br />Địa chỉ có tên tỉnh/TP thì cột Tỉnh có thể để trống (tự nhận). Loại hình gõ tự do được (cà phê, nhà hàng, cửa hàng, gym/spa, khu vui chơi, TTTM, siêu thị) hoặc số 1–7. Dòng tiêu đề tự bỏ qua. Thời hạn trống = mặc định bên dưới.
            </div>
            <textarea className={styles.input} style={{ width: "100%", minHeight: 110, fontFamily: "monospace", fontSize: 12 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Quán A\t12 Lê Lợi, Quận 1, TP.HCM\t\tCà phê\t80\t12\nNhà hàng B\t5 Trần Phú, Đà Nẵng\t\tNhà hàng\t287\t6"} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
              <button className={styles.btnPrimary} onClick={() => { load(parsePaste(text), false); }} disabled={!text.trim()}>Nạp vào bảng (thay thế)</button>
              <button className={styles.btnSecondary} onClick={() => { load(parsePaste(text), true); setText(""); }} disabled={!text.trim()}>Thêm vào cuối</button>
              <button className={styles.btnSecondary} onClick={() => fileRef.current?.click()}>⬆ Chọn file .xlsx / .csv</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.ods" style={{ display: "none" }} onChange={onFile} />
              <span style={{ flex: 1 }} />
              <label style={{ fontSize: 12 }}>Mặc định loại hình (khi để trống):{" "}
                <select style={{ ...inp, width: 230, display: "inline-block" }} value={defType} onChange={(e) => setDefType(Number(e.target.value))}>
                  <option value={-1}>— không —</option>
                  {TYPES.map(([n], i) => <option key={n} value={i}>{n}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Thời hạn mặc định (tháng):{" "}
                <input style={{ ...inp, width: 60, display: "inline-block" }} inputMode="numeric" value={defMonths} onChange={(e) => setDefMonths(e.target.value)} />
              </label>
            </div>
            {msg && <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--accent)" }}>{msg}</div>}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
            <b>2. Kết quả</b>
            <span className={styles.statusBadge}>{rows.length} dòng · {tot.n} tính được</span>
            {bad > 0 && <span className={styles.statusBadge} style={{ background: "rgba(209,59,59,0.18)" }}>{bad} dòng thiếu/không nhận ra</span>}
            {warn > 0 && <span className={styles.statusBadge} style={{ background: "rgba(255,167,38,0.2)" }}>{warn} dòng chưa nhận ra tỉnh (tạm 100%)</span>}
            <span style={{ flex: 1 }} />
            <button className={styles.btnSecondary} onClick={() => setRows((o) => [...o, blank()])}>+ Thêm dòng</button>
            <button className={styles.btnSecondary} onClick={copyTsv} disabled={!rows.length}>Copy (dán vào Excel)</button>
            <button className={styles.btnSecondary} onClick={dlCsv} disabled={!rows.length}>⬇ CSV</button>
            <button className={styles.btnSecondary} onClick={dlXlsx} disabled={!rows.length}>⬇ Excel</button>
            <button className={styles.btnSecondary} onClick={() => { if (window.confirm("Xoá toàn bộ bảng?")) { setRows([]); setMsg(""); } }} disabled={!rows.length}>Xoá hết</button>
          </div>

          {rows.length === 0 ? (
            <div className={styles.emptyState}>Chưa có dòng nào — dán dữ liệu ở trên rồi bấm “Nạp vào bảng”.</div>
          ) : (
            <div style={{ overflow: "auto", maxHeight: "68vh", border: "1px solid var(--border)", borderRadius: 10 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1250 }}>
                <thead>
                  <tr>
                    {["#", "Tên cơ sở", "Địa chỉ kinh doanh", "Tỉnh / TP", "Loại hình", "m²", "Tháng", "Hệ số DT", "Sau trần", "Đô thị", "Phí / năm", "Phí theo kỳ", "GTGT", "Tổng", ""].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 7 && i <= 13 ? "right" : "left" }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const c = calc[i];
                    return (
                      <tr key={r.id} style={{ background: !c.ok ? "rgba(209,59,59,0.06)" : c.warn.length ? "rgba(255,167,38,0.07)" : "transparent" }}>
                        <td style={cell}>{i + 1}</td>
                        <td style={{ ...cell, minWidth: 130 }}><input style={inp} value={r.name} onChange={(e) => upd(r.id, { name: e.target.value })} /></td>
                        <td style={{ ...cell, minWidth: 240 }}><input style={inp} value={r.address} onChange={(e) => upd(r.id, { address: e.target.value })} /></td>
                        <td style={{ ...cell, minWidth: 130 }}>
                          <select style={{ ...inp, borderColor: !r.province ? "#e0a040" : "var(--border)" }} value={r.province} onChange={(e) => upd(r.id, { province: e.target.value })}>
                            <option value="">— chưa rõ —</option>
                            {PROVINCES.map(([n]) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </td>
                        <td style={{ ...cell, minWidth: 190 }}>
                          <select style={{ ...inp, borderColor: r.typeIdx < 0 && defType < 0 ? "#d13b3b" : "var(--border)" }} value={r.typeIdx} onChange={(e) => upd(r.id, { typeIdx: Number(e.target.value) })}>
                            <option value={-1}>{r.typeRaw ? `? “${r.typeRaw}” — chọn lại` : defType >= 0 ? `(mặc định) ${TYPES[defType][0]}` : "— chọn loại hình —"}</option>
                            {TYPES.map(([n], k) => <option key={n} value={k}>{n}</option>)}
                          </select>
                        </td>
                        <td style={{ ...cell, width: 70 }}><input style={{ ...inp, textAlign: "right" }} inputMode="decimal" value={r.area} onChange={(e) => upd(r.id, { area: e.target.value })} /></td>
                        <td style={{ ...cell, width: 56 }}><input style={{ ...inp, textAlign: "right" }} inputMode="numeric" placeholder={defMonths} value={r.months} onChange={(e) => upd(r.id, { months: e.target.value })} /></td>
                        {c.ok ? (<>
                          <td style={num}>{c.coef.toFixed(2)}</td>
                          <td style={num} title={c.capHit ? "Đã chạm trần của loại hình" : ""}>{c.capped.toFixed(2)}{c.capHit ? " ⛔" : ""}</td>
                          <td style={num}>{Math.round(c.urban * 100)}%</td>
                          <td style={num}>{vnd(c.year)}</td>
                          <td style={num}>{vnd(c.term)}</td>
                          <td style={num}>{vnd(c.vat)}</td>
                          <td style={{ ...num, fontWeight: 800 }}>{vnd(c.total)}</td>
                        </>) : (<td colSpan={7} style={{ ...cell, color: "#d13b3b", fontSize: 12 }}>{c.err}</td>)}
                        <td style={cell}>
                          <button title="Xoá dòng" aria-label="Xoá dòng" onClick={() => setRows((o) => o.filter((x) => x.id !== r.id))} style={{ border: "none", background: "none", cursor: "pointer", color: "#d13b3b", fontWeight: 800 }}>✕</button>
                          {c.ok && c.warn.length > 0 && <div title={c.warn.join("; ")} style={{ fontSize: 11, color: "#d98a00" }}>⚠</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 800 }}>
                    <td style={{ ...cell, position: "sticky", bottom: 0, background: "var(--bg-hover)" }} colSpan={10}>TỔNG ({tot.n} cơ sở)</td>
                    <td style={{ ...num, position: "sticky", bottom: 0, background: "var(--bg-hover)" }}>{vnd(tot.year)}</td>
                    <td style={{ ...num, position: "sticky", bottom: 0, background: "var(--bg-hover)" }}>{vnd(tot.term)}</td>
                    <td style={{ ...num, position: "sticky", bottom: 0, background: "var(--bg-hover)" }}>{vnd(tot.vat)}</td>
                    <td style={{ ...num, position: "sticky", bottom: 0, background: "var(--bg-hover)" }}>{vnd(tot.total)}</td>
                    <td style={{ ...cell, position: "sticky", bottom: 0, background: "var(--bg-hover)" }} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p style={{ color: "var(--text-faint)", fontSize: 11.5, marginTop: 10 }}>
            ⛔ = đã chạm trần theo loại hình. Tỉnh/TP chưa rõ thì phiếu gốc tính hệ số đô thị 100% — dòng đó được tô vàng, hãy chọn tỉnh đúng. Bảng tỉnh theo sheet DM của phiếu (34 tỉnh/TP); địa chỉ ghi tên tỉnh cũ có thể cần chọn tay.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
