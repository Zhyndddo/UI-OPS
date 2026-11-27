"use client";

// _to_delete/pg719.jsx
import { useMemo, useRef, useState } from "react";

// lib/vcrrmFee.js
var LCS = 253e4;
var VAT = 0.1;
var DEFAULT_MONTHS = 12;
var TYPES = [
  ["C\xE0 ph\xEA \xB7 gi\u1EA3i kh\xE1t", 15, 0.35, 50, 0.04, 0.02, 1, 8],
  ["Nh\xE0 h\xE0ng \xB7 ph\xF2ng h\u1ED9i th\u1EA3o, h\u1ED9i ngh\u1ECB", 50, 2, 100, 0.05, 0.03, 1, 8],
  ["C\u1EEDa h\xE0ng \xB7 ph\xF2ng tr\u01B0ng b\xE0y (showroom)", 50, 0.35, 100, 8e-3, 6e-3, 1, 5],
  ["CLB th\u1EC3 d\u1EE5c \xB7 ch\u0103m s\xF3c s\u1EE9c kh\u1ECFe, th\u1EA9m m\u1EF9", 50, 0.5, 100, 0.011, 9e-3, 1, 10],
  ["Khu vui ch\u01A1i gi\u1EA3i tr\xED", 200, 0.7, 500, 3e-3, 1e-3, 1, 12],
  ["Trung t\xE2m th\u01B0\u01A1ng m\u1EA1i \xB7 cao \u1ED1c v\u0103n ph\xF2ng", 200, 1.5, 500, 0.3, 0.2, 100, 50],
  ["Si\xEAu th\u1ECB", 500, 1.25, 1e3, 0.3, 0.2, 100, 10]
];
var PROVINCES = [
  ["H\xE0 N\u1ED9i", 1],
  ["TP. H\u1ED3 Ch\xED Minh", 1],
  ["H\u1EA3i Ph\xF2ng", 0.8],
  ["\u0110\xE0 N\u1EB5ng", 0.8],
  ["C\u1EA7n Th\u01A1", 0.8],
  ["Hu\u1EBF", 0.8],
  ["An Giang", 0.5],
  ["B\u1EAFc Ninh", 0.5],
  ["C\xE0 Mau", 0.5],
  ["Cao B\u1EB1ng", 0.2],
  ["\u0110\u1EAFk L\u1EAFk", 0.5],
  ["\u0110i\u1EC7n Bi\xEAn", 0.2],
  ["\u0110\u1ED3ng Nai", 0.5],
  ["\u0110\u1ED3ng Th\xE1p", 0.5],
  ["Gia Lai", 0.5],
  ["H\xE0 T\u0129nh", 0.5],
  ["H\u01B0ng Y\xEAn", 0.5],
  ["Kh\xE1nh H\xF2a", 0.5],
  ["Lai Ch\xE2u", 0.2],
  ["L\xE2m \u0110\u1ED3ng", 0.5],
  ["L\u1EA1ng S\u01A1n", 0.2],
  ["L\xE0o Cai", 0.5],
  ["Ngh\u1EC7 An", 0.5],
  ["Ninh B\xECnh", 0.5],
  ["Ph\xFA Th\u1ECD", 0.5],
  ["Qu\u1EA3ng Ng\xE3i", 0.5],
  ["Qu\u1EA3ng Ninh", 0.5],
  ["Qu\u1EA3ng Tr\u1ECB", 0.5],
  ["S\u01A1n La", 0.2],
  ["T\xE2y Ninh", 0.5],
  ["Th\xE1i Nguy\xEAn", 0.5],
  ["Thanh H\xF3a", 0.5],
  ["Tuy\xEAn Quang", 0.2],
  ["V\u0129nh Long", 0.5]
];
var key = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
var PROV_ALIASES = { "tp hcm": "TP. H\u1ED3 Ch\xED Minh", "tphcm": "TP. H\u1ED3 Ch\xED Minh", "hcm": "TP. H\u1ED3 Ch\xED Minh", "ho chi minh": "TP. H\u1ED3 Ch\xED Minh", "sai gon": "TP. H\u1ED3 Ch\xED Minh", "sg": "TP. H\u1ED3 Ch\xED Minh", "ha noi": "H\xE0 N\u1ED9i", "hn": "H\xE0 N\u1ED9i", "thua thien hue": "Hu\u1EBF", "tp hue": "Hu\u1EBF", "thanh pho ho chi minh": "TP. H\u1ED3 Ch\xED Minh" };
var PROV_KEYS = [...PROVINCES.map(([n]) => [key(n.replace(/^TP\.\s*/, "")), n]), ...Object.entries(PROV_ALIASES).map(([k, n]) => [k, n])];
function matchProvince(text) {
  const k = key(String(text || "").replace(/^(tp|thanh pho|tinh)\.?\s+/i, "")), k2 = key(text);
  if (!k && !k2) return "";
  const hit = PROV_KEYS.find(([pk]) => pk === k || pk === k2);
  return hit ? hit[1] : "";
}
function detectProvince(address) {
  const a = " " + key(address) + " ";
  let best = null;
  for (const [pk, name] of PROV_KEYS) {
    if (pk.length < 2) continue;
    const i = a.lastIndexOf(" " + pk + " ");
    if (i >= 0 && (!best || i + pk.length > best.end || i + pk.length === best.end && pk.length > best.len)) best = { name, end: i + pk.length, len: pk.length };
  }
  return best ? best.name : "";
}
var TYPE_WORDS = [
  [0, ["ca phe", "cafe", "coffee", "giai khat", "tra sua", "tra "]],
  [1, ["nha hang", "restaurant", "hoi thao", "hoi nghi", "phong tiec", "quan an"]],
  [2, ["cua hang", "showroom", "trung bay", "shop", "store"]],
  [3, ["clb", "cau lac bo", "the duc", "gym", "fitness", "yoga", "spa", "tham my", "cham soc suc khoe", "suc khoe"]],
  [4, ["vui choi", "giai tri"]],
  [5, ["trung tam thuong mai", "tttm", "cao oc", "van phong", "mall", "vincom", "aeon"]],
  [6, ["sieu thi", "supermarket", "hypermarket"]]
];
function matchType(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return -1;
  if (/^[1-7]$/.test(raw)) return Number(raw) - 1;
  const k = key(raw);
  const exact = TYPES.findIndex(([n]) => key(n) === k);
  if (exact >= 0) return exact;
  for (const [i, words] of TYPE_WORDS) if (words.some((w) => (" " + k + " ").includes(" " + key(w) + " ") || k.includes(key(w).trim()))) return i;
  return -1;
}
var num = (v) => {
  if (v == null || v === "") return NaN;
  const s = String(v).trim().replace(/\s|m2|m²/gi, "");
  const n = Number(s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, ""));
  return n;
};
function calcRow(r, lcs = LCS) {
  const out = { ok: false, warn: [], err: "" };
  const t = r.typeIdx != null && r.typeIdx >= 0 ? TYPES[r.typeIdx] : null;
  const area = num(r.area);
  const monthsRaw = r.months === "" || r.months == null ? DEFAULT_MONTHS : num(r.months);
  if (!t) out.err = "Ch\u01B0a nh\u1EADn ra lo\u1EA1i h\xECnh";
  else if (!(area > 0)) out.err = "Thi\u1EBFu di\u1EC7n t\xEDch (m\xB2)";
  else if (!(monthsRaw > 0)) out.err = "Th\u1EDDi h\u1EA1n (th\xE1ng) kh\xF4ng h\u1EE3p l\u1EC7";
  if (out.err) return out;
  const [, B, C, D, E, F, G, H] = t;
  const coef = C + E * Math.max(0, Math.min(area, D) - B) / G + F * Math.max(0, area - D) / G;
  const capped = Math.min(coef, H);
  const prov = r.province || "";
  const urbanRow = PROVINCES.find(([n]) => n === prov);
  if (!urbanRow) out.warn.push("Ch\u01B0a nh\u1EADn ra t\u1EC9nh/TP \u2192 t\u1EA1m t\xEDnh 100% nh\u01B0 phi\u1EBFu g\u1ED1c");
  const urban = urbanRow ? urbanRow[1] : 1;
  const year = Math.round(lcs * capped * urban);
  const term = Math.round(year / 12 * monthsRaw);
  const vat = Math.round(term * VAT);
  return { ok: true, warn: out.warn, err: "", area, months: monthsRaw, coef, capped, capHit: coef > H, province: prov, urban, year, term, vat, total: term + vat };
}
var COLS = ["T\xEAn c\u01A1 s\u1EDF / chi nh\xE1nh", "\u0110\u1ECBa ch\u1EC9 kinh doanh", "T\u1EC9nh / Th\xE0nh ph\u1ED1", "Lo\u1EA1i h\xECnh", "Di\u1EC7n t\xEDch (m\xB2)", "Th\u1EDDi h\u1EA1n (th\xE1ng)"];
var HEADER_WORDS = /ten co so|dia chi|tinh|loai hinh|dien tich|thoi han|chi nhanh/;
function splitLine(line) {
  if (line.includes("	")) return line.split("	");
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if ((c === "," || c === ";") && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}
function rowFromCells(c) {
  const [name = "", address = "", provRaw = "", typeRaw = "", area = "", months = ""] = c.map((x) => String(x ?? "").trim());
  const province = matchProvince(provRaw) || detectProvince(address) || detectProvince(name);
  return { name, address, provRaw, province, typeRaw, typeIdx: matchType(typeRaw), area, months };
}
function parsePaste(text) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  lines.forEach((l, i) => {
    const cells = splitLine(l);
    if (i === 0 && HEADER_WORDS.test(key(cells.join(" "))) && !(num(cells[4]) > 0)) return;
    rows.push(rowFromCells(cells));
  });
  return rows;
}
var vnd = (n) => Number.isFinite(n) ? Math.round(n).toLocaleString("vi-VN") : "";

// _to_delete/pg719.jsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var AppShell = ({ children }) => children;
var styles = new Proxy({}, { get: (_, k) => String(k) });
var uid = 0;
var withId = (r) => ({ ...r, id: ++uid, provAuto: !r.provRaw && !!r.province });
var blank = () => withId({ name: "", address: "", provRaw: "", province: "", typeRaw: "", typeIdx: -1, area: "", months: "" });
var cell = { padding: "4px 6px", borderBottom: "1px solid var(--border)", verticalAlign: "top", fontSize: 12.5 };
var inp = { width: "100%", boxSizing: "border-box", padding: "5px 7px", fontSize: 12.5, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "inherit", fontFamily: "inherit" };
function VcrrmFeePage() {
  const [rows, setRows] = useState([]);
  const [text, setText] = useState("");
  const [defType, setDefType] = useState(-1);
  const [defMonths, setDefMonths] = useState(String(DEFAULT_MONTHS));
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);
  const calc = useMemo(() => rows.map((r) => {
    const typeIdx = r.typeIdx >= 0 ? r.typeIdx : !String(r.typeRaw || "").trim() ? defType : -1;
    const months = String(r.months).trim() === "" ? defMonths : r.months;
    return calcRow({ ...r, typeIdx, months });
  }), [rows, defType, defMonths]);
  const tot = useMemo(() => calc.reduce((a, c) => c.ok ? { n: a.n + 1, year: a.year + c.year, term: a.term + c.term, vat: a.vat + c.vat, total: a.total + c.total } : a, { n: 0, year: 0, term: 0, vat: 0, total: 0 }), [calc]);
  const bad = calc.filter((c) => !c.ok).length, warn = calc.filter((c) => c.ok && c.warn.length).length;
  function load(newRows, append) {
    const list = newRows.map(withId);
    setRows((o) => append ? [...o, ...list] : list);
    setMsg(`\u0110\xE3 n\u1EA1p ${list.length} d\xF2ng.`);
  }
  const upd = (id, patch) => setRows((o) => o.map((r) => {
    if (r.id !== id) return r;
    const n = { ...r, ...patch };
    if ("address" in patch && r.provAuto) {
      n.province = detectProvince(patch.address) || "";
    }
    if ("province" in patch) n.provAuto = false;
    if ("typeIdx" in patch) n.typeRaw = patch.typeIdx >= 0 ? TYPES[patch.typeIdx][0] : r.typeRaw;
    return n;
  }));
  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: "" });
      load(parsePaste(aoa.map((r) => r.slice(0, 6).join("	")).join("\n")), false);
    } catch (err) {
      setMsg("Kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c file: " + (err?.message || err));
    }
  }
  const outHead = [...COLS, "H\u1EC7 s\u1ED1 di\u1EC7n t\xEDch", "H\u1EC7 s\u1ED1 sau tr\u1EA7n", "T\u1EC9nh/TP \xE1p d\u1EE5ng", "H\u1EC7 s\u1ED1 \u0111\xF4 th\u1ECB", "Ph\xED / n\u0103m (ch\u01B0a GTGT)", "Ph\xED theo th\u1EDDi h\u1EA1n (ch\u01B0a GTGT)", "GTGT 10%", "T\u1ED5ng thanh to\xE1n", "Ghi ch\xFA"];
  const outRows = () => rows.map((r, i) => {
    const c = calc[i];
    return [
      r.name,
      r.address,
      r.province,
      r.typeIdx >= 0 ? TYPES[r.typeIdx][0] : r.typeRaw,
      r.area,
      String(r.months).trim() === "" ? defMonths : r.months,
      c.ok ? c.coef.toFixed(3) : "",
      c.ok ? c.capped.toFixed(3) : "",
      c.ok ? c.province : "",
      c.ok ? c.urban : "",
      c.ok ? c.year : "",
      c.ok ? c.term : "",
      c.ok ? c.vat : "",
      c.ok ? c.total : "",
      c.ok ? c.warn.join("; ") : c.err
    ];
  });
  const csvEsc = (v) => {
    const s = String(v ?? "");
    return /[",;\n\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3e3);
  }
  const stamp = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const totalRow = () => ["T\u1ED4NG", "", "", "", "", "", "", "", "", "", tot.year, tot.term, tot.vat, tot.total, `${tot.n} c\u01A1 s\u1EDF`];
  const copyTsv = async () => {
    try {
      await navigator.clipboard.writeText([outHead, ...outRows(), totalRow()].map((r) => r.join("	")).join("\n"));
      setMsg("\u0110\xE3 copy \u2014 d\xE1n th\u1EB3ng v\xE0o Excel / Google Sheets.");
    } catch (e) {
      setMsg("Tr\xECnh duy\u1EC7t kh\xF4ng cho copy.");
    }
  };
  const dlCsv = () => download(`vcrrm-nhac-nen-${stamp()}.csv`, new Blob(["\uFEFF" + [outHead, ...outRows(), totalRow()].map((r) => r.map(csvEsc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  async function dlXlsx() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([outHead, ...outRows(), totalRow()]);
    ws["!cols"] = [22, 34, 16, 30, 10, 10, 10, 10, 16, 10, 16, 18, 14, 16, 34].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ph\xED nh\u1EA1c n\u1EC1n");
    XLSX.writeFile(wb, `vcrrm-nhac-nen-${stamp()}.xlsx`);
  }
  const th = { ...cell, fontWeight: 700, background: "var(--bg-hover)", position: "sticky", top: 0, whiteSpace: "nowrap", zIndex: 2 };
  const num2 = { ...cell, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
  return /* @__PURE__ */ jsx(AppShell, { children: /* @__PURE__ */ jsx("div", { className: styles.page, children: /* @__PURE__ */ jsxs("div", { className: styles.container, style: { maxWidth: 1400 }, children: [
    /* @__PURE__ */ jsx("div", { className: styles.eyebrow, children: "// VCRRM \xB7 Nh\u1EA1c n\u1EC1n" }),
    /* @__PURE__ */ jsx("h1", { className: styles.title, children: "T\xEDnh ph\xED nh\u1EA1c n\u1EC1n \u2014 nhi\u1EC1u \u0111\u1ECBa \u0111i\u1EC3m c\xF9ng l\xFAc" }),
    /* @__PURE__ */ jsxs("p", { style: { color: "var(--text-faint)", fontSize: 12.5, marginTop: -12, marginBottom: 16, lineHeight: 1.55 }, children: [
      "C\xF9ng c\xF4ng th\u1EE9c v\u1EDBi phi\u1EBFu khai b\xE1o VCRRM (Ph\u1EE5 l\u1EE5c II N\u0110 17/2023, s\u1EEDa \u0111\u1ED5i N\u0110 134/2026): ph\xED/n\u0103m = LCS (",
      vnd(LCS),
      " \u0111) \xD7 h\u1EC7 s\u1ED1 di\u1EC7n t\xEDch (c\xF3 tr\u1EA7n theo lo\u1EA1i h\xECnh) \xD7 h\u1EC7 s\u1ED1 \u0111\xF4 th\u1ECB theo t\u1EC9nh/TP n\u01A1i kinh doanh; ph\xED theo th\u1EDDi h\u1EA1n = ph\xED/n\u0103m \xF7 12 \xD7 s\u1ED1 th\xE1ng; c\u1ED9ng GTGT ",
      VAT * 100,
      "%. Ch\u1EC9 l\xE0 m\u1EE9c tham kh\u1EA3o \u2014 VCRRM ch\u1ED1t theo th\u1EF1c t\u1EBF. Ch\u01B0a g\u1ED3m quy\u1EC1n t\xE1c gi\u1EA3 (VCPMC)."
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 14 }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontWeight: 800, marginBottom: 6 }, children: "1. D\xE1n t\u1EEB Excel (\u0111\xFAng th\u1EE9 t\u1EF1 c\u1ED9t) ho\u1EB7c ch\u1ECDn file" }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "var(--text-faint)", marginBottom: 8 }, children: [
        COLS.map((c, i) => /* @__PURE__ */ jsxs("span", { className: styles.statusBadge, style: { marginRight: 4 }, children: [
          String.fromCharCode(65 + i),
          " \xB7 ",
          c
        ] }, c)),
        /* @__PURE__ */ jsx("br", {}),
        "\u0110\u1ECBa ch\u1EC9 c\xF3 t\xEAn t\u1EC9nh/TP th\xEC c\u1ED9t T\u1EC9nh c\xF3 th\u1EC3 \u0111\u1EC3 tr\u1ED1ng (t\u1EF1 nh\u1EADn). Lo\u1EA1i h\xECnh g\xF5 t\u1EF1 do \u0111\u01B0\u1EE3c (c\xE0 ph\xEA, nh\xE0 h\xE0ng, c\u1EEDa h\xE0ng, gym/spa, khu vui ch\u01A1i, TTTM, si\xEAu th\u1ECB) ho\u1EB7c s\u1ED1 1\u20137. D\xF2ng ti\xEAu \u0111\u1EC1 t\u1EF1 b\u1ECF qua. Th\u1EDDi h\u1EA1n tr\u1ED1ng = m\u1EB7c \u0111\u1ECBnh b\xEAn d\u01B0\u1EDBi."
      ] }),
      /* @__PURE__ */ jsx("textarea", { className: styles.input, style: { width: "100%", minHeight: 110, fontFamily: "monospace", fontSize: 12 }, value: text, onChange: (e) => setText(e.target.value), placeholder: "Qu\xE1n A	12 L\xEA L\u1EE3i, Qu\u1EADn 1, TP.HCM		C\xE0 ph\xEA	80	12\nNh\xE0 h\xE0ng B	5 Tr\u1EA7n Ph\xFA, \u0110\xE0 N\u1EB5ng		Nh\xE0 h\xE0ng	287	6" }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ jsx("button", { className: styles.btnPrimary, onClick: () => {
          load(parsePaste(text), false);
        }, disabled: !text.trim(), children: "N\u1EA1p v\xE0o b\u1EA3ng (thay th\u1EBF)" }),
        /* @__PURE__ */ jsx("button", { className: styles.btnSecondary, onClick: () => {
          load(parsePaste(text), true);
          setText("");
        }, disabled: !text.trim(), children: "Th\xEAm v\xE0o cu\u1ED1i" }),
        /* @__PURE__ */ jsx("button", { className: styles.btnSecondary, onClick: () => fileRef.current?.click(), children: "\u2B06 Ch\u1ECDn file .xlsx / .csv" }),
        /* @__PURE__ */ jsx("input", { ref: fileRef, type: "file", accept: ".xlsx,.xls,.csv,.tsv,.ods", style: { display: "none" }, onChange: onFile }),
        /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsxs("label", { style: { fontSize: 12 }, children: [
          "M\u1EB7c \u0111\u1ECBnh lo\u1EA1i h\xECnh (khi \u0111\u1EC3 tr\u1ED1ng):",
          " ",
          /* @__PURE__ */ jsxs("select", { style: { ...inp, width: 230, display: "inline-block" }, value: defType, onChange: (e) => setDefType(Number(e.target.value)), children: [
            /* @__PURE__ */ jsx("option", { value: -1, children: "\u2014 kh\xF4ng \u2014" }),
            TYPES.map(([n], i) => /* @__PURE__ */ jsx("option", { value: i, children: n }, n))
          ] })
        ] }),
        /* @__PURE__ */ jsxs("label", { style: { fontSize: 12 }, children: [
          "Th\u1EDDi h\u1EA1n m\u1EB7c \u0111\u1ECBnh (th\xE1ng):",
          " ",
          /* @__PURE__ */ jsx("input", { style: { ...inp, width: 60, display: "inline-block" }, inputMode: "numeric", value: defMonths, onChange: (e) => setDefMonths(e.target.value) })
        ] })
      ] }),
      msg && /* @__PURE__ */ jsx("div", { style: { marginTop: 8, fontSize: 12.5, color: "var(--accent)" }, children: msg })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("b", { children: "2. K\u1EBFt qu\u1EA3" }),
      /* @__PURE__ */ jsxs("span", { className: styles.statusBadge, children: [
        rows.length,
        " d\xF2ng \xB7 ",
        tot.n,
        " t\xEDnh \u0111\u01B0\u1EE3c"
      ] }),
      bad > 0 && /* @__PURE__ */ jsxs("span", { className: styles.statusBadge, style: { background: "rgba(209,59,59,0.18)" }, children: [
        bad,
        " d\xF2ng thi\u1EBFu/kh\xF4ng nh\u1EADn ra"
      ] }),
      warn > 0 && /* @__PURE__ */ jsxs("span", { className: styles.statusBadge, style: { background: "rgba(255,167,38,0.2)" }, children: [
        warn,
        " d\xF2ng ch\u01B0a nh\u1EADn ra t\u1EC9nh (t\u1EA1m 100%)"
      ] }),
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx("button", { className: styles.btnSecondary, onClick: () => setRows((o) => [...o, blank()]), children: "+ Th\xEAm d\xF2ng" }),
      /* @__PURE__ */ jsx("button", { className: styles.btnSecondary, onClick: copyTsv, disabled: !rows.length, children: "Copy (d\xE1n v\xE0o Excel)" }),
      /* @__PURE__ */ jsx("button", { className: styles.btnSecondary, onClick: dlCsv, disabled: !rows.length, children: "\u2B07 CSV" }),
      /* @__PURE__ */ jsx("button", { className: styles.btnSecondary, onClick: dlXlsx, disabled: !rows.length, children: "\u2B07 Excel" }),
      /* @__PURE__ */ jsx("button", { className: styles.btnSecondary, onClick: () => {
        if (window.confirm("Xo\xE1 to\xE0n b\u1ED9 b\u1EA3ng?")) {
          setRows([]);
          setMsg("");
        }
      }, disabled: !rows.length, children: "Xo\xE1 h\u1EBFt" })
    ] }),
    rows.length === 0 ? /* @__PURE__ */ jsx("div", { className: styles.emptyState, children: "Ch\u01B0a c\xF3 d\xF2ng n\xE0o \u2014 d\xE1n d\u1EEF li\u1EC7u \u1EDF tr\xEAn r\u1ED3i b\u1EA5m \u201CN\u1EA1p v\xE0o b\u1EA3ng\u201D." }) : /* @__PURE__ */ jsx("div", { style: { overflow: "auto", maxHeight: "68vh", border: "1px solid var(--border)", borderRadius: 10 }, children: /* @__PURE__ */ jsxs("table", { style: { borderCollapse: "collapse", width: "100%", minWidth: 1250 }, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { children: ["#", "T\xEAn c\u01A1 s\u1EDF", "\u0110\u1ECBa ch\u1EC9 kinh doanh", "T\u1EC9nh / TP", "Lo\u1EA1i h\xECnh", "m\xB2", "Th\xE1ng", "H\u1EC7 s\u1ED1 DT", "Sau tr\u1EA7n", "\u0110\xF4 th\u1ECB", "Ph\xED / n\u0103m", "Ph\xED theo k\u1EF3", "GTGT", "T\u1ED5ng", ""].map((h, i) => /* @__PURE__ */ jsx("th", { style: { ...th, textAlign: i >= 7 && i <= 13 ? "right" : "left" }, children: h }, i)) }) }),
      /* @__PURE__ */ jsx("tbody", { children: rows.map((r, i) => {
        const c = calc[i];
        return /* @__PURE__ */ jsxs("tr", { style: { background: !c.ok ? "rgba(209,59,59,0.06)" : c.warn.length ? "rgba(255,167,38,0.07)" : "transparent" }, children: [
          /* @__PURE__ */ jsx("td", { style: cell, children: i + 1 }),
          /* @__PURE__ */ jsx("td", { style: { ...cell, minWidth: 130 }, children: /* @__PURE__ */ jsx("input", { style: inp, value: r.name, onChange: (e) => upd(r.id, { name: e.target.value }) }) }),
          /* @__PURE__ */ jsx("td", { style: { ...cell, minWidth: 240 }, children: /* @__PURE__ */ jsx("input", { style: inp, value: r.address, onChange: (e) => upd(r.id, { address: e.target.value }) }) }),
          /* @__PURE__ */ jsx("td", { style: { ...cell, minWidth: 130 }, children: /* @__PURE__ */ jsxs("select", { style: { ...inp, borderColor: !r.province ? "#e0a040" : "var(--border)" }, value: r.province, onChange: (e) => upd(r.id, { province: e.target.value }), children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "\u2014 ch\u01B0a r\xF5 \u2014" }),
            PROVINCES.map(([n]) => /* @__PURE__ */ jsx("option", { value: n, children: n }, n))
          ] }) }),
          /* @__PURE__ */ jsx("td", { style: { ...cell, minWidth: 190 }, children: /* @__PURE__ */ jsxs("select", { style: { ...inp, borderColor: r.typeIdx < 0 && defType < 0 ? "#d13b3b" : "var(--border)" }, value: r.typeIdx, onChange: (e) => upd(r.id, { typeIdx: Number(e.target.value) }), children: [
            /* @__PURE__ */ jsx("option", { value: -1, children: r.typeRaw ? `? \u201C${r.typeRaw}\u201D \u2014 ch\u1ECDn l\u1EA1i` : defType >= 0 ? `(m\u1EB7c \u0111\u1ECBnh) ${TYPES[defType][0]}` : "\u2014 ch\u1ECDn lo\u1EA1i h\xECnh \u2014" }),
            TYPES.map(([n], k) => /* @__PURE__ */ jsx("option", { value: k, children: n }, n))
          ] }) }),
          /* @__PURE__ */ jsx("td", { style: { ...cell, width: 70 }, children: /* @__PURE__ */ jsx("input", { style: { ...inp, textAlign: "right" }, inputMode: "decimal", value: r.area, onChange: (e) => upd(r.id, { area: e.target.value }) }) }),
          /* @__PURE__ */ jsx("td", { style: { ...cell, width: 56 }, children: /* @__PURE__ */ jsx("input", { style: { ...inp, textAlign: "right" }, inputMode: "numeric", placeholder: defMonths, value: r.months, onChange: (e) => upd(r.id, { months: e.target.value }) }) }),
          c.ok ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("td", { style: num2, children: c.coef.toFixed(2) }),
            /* @__PURE__ */ jsxs("td", { style: num2, title: c.capHit ? "\u0110\xE3 ch\u1EA1m tr\u1EA7n c\u1EE7a lo\u1EA1i h\xECnh" : "", children: [
              c.capped.toFixed(2),
              c.capHit ? " \u26D4" : ""
            ] }),
            /* @__PURE__ */ jsxs("td", { style: num2, children: [
              Math.round(c.urban * 100),
              "%"
            ] }),
            /* @__PURE__ */ jsx("td", { style: num2, children: vnd(c.year) }),
            /* @__PURE__ */ jsx("td", { style: num2, children: vnd(c.term) }),
            /* @__PURE__ */ jsx("td", { style: num2, children: vnd(c.vat) }),
            /* @__PURE__ */ jsx("td", { style: { ...num2, fontWeight: 800 }, children: vnd(c.total) })
          ] }) : /* @__PURE__ */ jsx("td", { colSpan: 7, style: { ...cell, color: "#d13b3b", fontSize: 12 }, children: c.err }),
          /* @__PURE__ */ jsxs("td", { style: cell, children: [
            /* @__PURE__ */ jsx("button", { title: "Xo\xE1 d\xF2ng", "aria-label": "Xo\xE1 d\xF2ng", onClick: () => setRows((o) => o.filter((x) => x.id !== r.id)), style: { border: "none", background: "none", cursor: "pointer", color: "#d13b3b", fontWeight: 800 }, children: "\u2715" }),
            c.ok && c.warn.length > 0 && /* @__PURE__ */ jsx("div", { title: c.warn.join("; "), style: { fontSize: 11, color: "#d98a00" }, children: "\u26A0" })
          ] })
        ] }, r.id);
      }) }),
      /* @__PURE__ */ jsx("tfoot", { children: /* @__PURE__ */ jsxs("tr", { style: { fontWeight: 800 }, children: [
        /* @__PURE__ */ jsxs("td", { style: { ...cell, position: "sticky", bottom: 0, background: "var(--bg-hover)" }, colSpan: 10, children: [
          "T\u1ED4NG (",
          tot.n,
          " c\u01A1 s\u1EDF)"
        ] }),
        /* @__PURE__ */ jsx("td", { style: { ...num2, position: "sticky", bottom: 0, background: "var(--bg-hover)" }, children: vnd(tot.year) }),
        /* @__PURE__ */ jsx("td", { style: { ...num2, position: "sticky", bottom: 0, background: "var(--bg-hover)" }, children: vnd(tot.term) }),
        /* @__PURE__ */ jsx("td", { style: { ...num2, position: "sticky", bottom: 0, background: "var(--bg-hover)" }, children: vnd(tot.vat) }),
        /* @__PURE__ */ jsx("td", { style: { ...num2, position: "sticky", bottom: 0, background: "var(--bg-hover)" }, children: vnd(tot.total) }),
        /* @__PURE__ */ jsx("td", { style: { ...cell, position: "sticky", bottom: 0, background: "var(--bg-hover)" } })
      ] }) })
    ] }) }),
    /* @__PURE__ */ jsx("p", { style: { color: "var(--text-faint)", fontSize: 11.5, marginTop: 10 }, children: "\u26D4 = \u0111\xE3 ch\u1EA1m tr\u1EA7n theo lo\u1EA1i h\xECnh. T\u1EC9nh/TP ch\u01B0a r\xF5 th\xEC phi\u1EBFu g\u1ED1c t\xEDnh h\u1EC7 s\u1ED1 \u0111\xF4 th\u1ECB 100% \u2014 d\xF2ng \u0111\xF3 \u0111\u01B0\u1EE3c t\xF4 v\xE0ng, h\xE3y ch\u1ECDn t\u1EC9nh \u0111\xFAng. B\u1EA3ng t\u1EC9nh theo sheet DM c\u1EE7a phi\u1EBFu (34 t\u1EC9nh/TP); \u0111\u1ECBa ch\u1EC9 ghi t\xEAn t\u1EC9nh c\u0169 c\xF3 th\u1EC3 c\u1EA7n ch\u1ECDn tay." })
  ] }) }) });
}
export {
  VcrrmFeePage as default
};
