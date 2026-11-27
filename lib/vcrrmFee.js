// Round 719 — VCRRM "phiếu khai báo nhạc nền" fee calculator, many locations at once.
// Same formula and tables as the sheet VCRRM-Phieu-khai-bao-nhacnen.xlsx (sheet "Khai báo" C40:C47, sheet "DM").
//   hệ số diện tích = C + E·max(0, min(area, D) − B)/G + F·max(0, area − D)/G   → capped at H (per business type)
//   phí/năm = round(LCS × hệ số sau trần × hệ số đô thị) ; phí theo thời hạn = round(phí/năm ÷ 12 × tháng) ; VAT 10%
export const LCS = 2530000;   // lương cơ sở — the sheet says "không thay đổi ô này"
export const VAT = 0.1;
export const DEFAULT_MONTHS = 12;

// [name, B(min area), C(base), D(max area), E(rate 1), F(rate 2), G(divisor), H(cap)]
export const TYPES = [
  ["Cà phê · giải khát", 15, 0.35, 50, 0.04, 0.02, 1, 8],
  ["Nhà hàng · phòng hội thảo, hội nghị", 50, 2, 100, 0.05, 0.03, 1, 8],
  ["Cửa hàng · phòng trưng bày (showroom)", 50, 0.35, 100, 0.008, 0.006, 1, 5],
  ["CLB thể dục · chăm sóc sức khỏe, thẩm mỹ", 50, 0.5, 100, 0.011, 0.009, 1, 10],
  ["Khu vui chơi giải trí", 200, 0.7, 500, 0.003, 0.001, 1, 12],
  ["Trung tâm thương mại · cao ốc văn phòng", 200, 1.5, 500, 0.3, 0.2, 100, 50],
  ["Siêu thị", 500, 1.25, 1000, 0.3, 0.2, 100, 10],
];
// province → hệ số đô thị (DM!J:K)
export const PROVINCES = [
  ["Hà Nội", 1], ["TP. Hồ Chí Minh", 1], ["Hải Phòng", 0.8], ["Đà Nẵng", 0.8], ["Cần Thơ", 0.8], ["Huế", 0.8],
  ["An Giang", 0.5], ["Bắc Ninh", 0.5], ["Cà Mau", 0.5], ["Cao Bằng", 0.2], ["Đắk Lắk", 0.5], ["Điện Biên", 0.2], ["Đồng Nai", 0.5], ["Đồng Tháp", 0.5],
  ["Gia Lai", 0.5], ["Hà Tĩnh", 0.5], ["Hưng Yên", 0.5], ["Khánh Hòa", 0.5], ["Lai Châu", 0.2], ["Lâm Đồng", 0.5], ["Lạng Sơn", 0.2], ["Lào Cai", 0.5],
  ["Nghệ An", 0.5], ["Ninh Bình", 0.5], ["Phú Thọ", 0.5], ["Quảng Ngãi", 0.5], ["Quảng Ninh", 0.5], ["Quảng Trị", 0.5], ["Sơn La", 0.2], ["Tây Ninh", 0.5],
  ["Thái Nguyên", 0.5], ["Thanh Hóa", 0.5], ["Tuyên Quang", 0.2], ["Vĩnh Long", 0.5],
];

// accent-insensitive key: "Đà Nẵng" → "da nang"
export const key = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const PROV_ALIASES = { "tp hcm": "TP. Hồ Chí Minh", "tphcm": "TP. Hồ Chí Minh", "hcm": "TP. Hồ Chí Minh", "ho chi minh": "TP. Hồ Chí Minh", "sai gon": "TP. Hồ Chí Minh", "sg": "TP. Hồ Chí Minh", "ha noi": "Hà Nội", "hn": "Hà Nội", "thua thien hue": "Huế", "tp hue": "Huế", "thanh pho ho chi minh": "TP. Hồ Chí Minh" };
const PROV_KEYS = [...PROVINCES.map(([n]) => [key(n.replace(/^TP\.\s*/, "")), n]), ...Object.entries(PROV_ALIASES).map(([k, n]) => [k, n])];

// the province typed in its own column ("HCM", "Ho Chi Minh", "TP. Hồ Chí Minh"…) → canonical name, or ""
export function matchProvince(text) {
  const k = key(String(text || "").replace(/^(tp|thanh pho|tinh)\.?\s+/i, "")), k2 = key(text);
  if (!k && !k2) return "";
  const hit = PROV_KEYS.find(([pk]) => pk === k || pk === k2);
  return hit ? hit[1] : "";
}
// find a province inside a free-text address; the one that appears LAST wins (addresses end with the province)
export function detectProvince(address) {
  const a = " " + key(address) + " ";
  let best = null;
  for (const [pk, name] of PROV_KEYS) {
    if (pk.length < 2) continue;
    const i = a.lastIndexOf(" " + pk + " ");
    if (i >= 0 && (!best || i + pk.length > best.end || (i + pk.length === best.end && pk.length > best.len))) best = { name, end: i + pk.length, len: pk.length };
  }
  return best ? best.name : "";
}

const TYPE_WORDS = [
  [0, ["ca phe", "cafe", "coffee", "giai khat", "tra sua", "tra "]],
  [1, ["nha hang", "restaurant", "hoi thao", "hoi nghi", "phong tiec", "quan an"]],
  [2, ["cua hang", "showroom", "trung bay", "shop", "store"]],
  [3, ["clb", "cau lac bo", "the duc", "gym", "fitness", "yoga", "spa", "tham my", "cham soc suc khoe", "suc khoe"]],
  [4, ["vui choi", "giai tri"]],
  [5, ["trung tam thuong mai", "tttm", "cao oc", "van phong", "mall", "vincom", "aeon"]],
  [6, ["sieu thi", "supermarket", "hypermarket"]],
];
// loại hình typed in any way → index into TYPES, or -1. Also accepts 1..7.
export function matchType(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return -1;
  if (/^[1-7]$/.test(raw)) return Number(raw) - 1;
  const k = key(raw);
  const exact = TYPES.findIndex(([n]) => key(n) === k);
  if (exact >= 0) return exact;
  for (const [i, words] of TYPE_WORDS) if (words.some((w) => (" " + k + " ").includes(" " + key(w) + " ") || k.includes(key(w).trim()))) return i;
  return -1;
}

const num = (v) => { if (v == null || v === "") return NaN; const s = String(v).trim().replace(/\s|m2|m²/gi, ""); const n = Number(s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, "")); return n; };

// one location → result row (never throws)
export function calcRow(r, lcs = LCS) {
  const out = { ok: false, warn: [], err: "" };
  const t = r.typeIdx != null && r.typeIdx >= 0 ? TYPES[r.typeIdx] : null;
  const area = num(r.area);
  const monthsRaw = r.months === "" || r.months == null ? DEFAULT_MONTHS : num(r.months);
  if (!t) out.err = "Chưa nhận ra loại hình";
  else if (!(area > 0)) out.err = "Thiếu diện tích (m²)";
  else if (!(monthsRaw > 0)) out.err = "Thời hạn (tháng) không hợp lệ";
  if (out.err) return out;
  const [, B, C, D, E, F, G, H] = t;
  const coef = C + (E * Math.max(0, Math.min(area, D) - B)) / G + (F * Math.max(0, area - D)) / G;
  const capped = Math.min(coef, H);
  const prov = r.province || "";
  const urbanRow = PROVINCES.find(([n]) => n === prov);
  if (!urbanRow) out.warn.push("Chưa nhận ra tỉnh/TP → tạm tính 100% như phiếu gốc");
  const urban = urbanRow ? urbanRow[1] : 1;
  const year = Math.round(lcs * capped * urban);
  const term = Math.round((year / 12) * monthsRaw);
  const vat = Math.round(term * VAT);
  return { ok: true, warn: out.warn, err: "", area, months: monthsRaw, coef, capped, capHit: coef > H, province: prov, urban, year, term, vat, total: term + vat };
}

// ---- paste parsing --------------------------------------------------------
// column order = the form: Tên cơ sở · Địa chỉ · Tỉnh/TP · Loại hình · Diện tích (m²) · Thời hạn (tháng)
export const COLS = ["Tên cơ sở / chi nhánh", "Địa chỉ kinh doanh", "Tỉnh / Thành phố", "Loại hình", "Diện tích (m²)", "Thời hạn (tháng)"];
const HEADER_WORDS = /ten co so|dia chi|tinh|loai hinh|dien tich|thoi han|chi nhanh/;

export function splitLine(line) {
  if (line.includes("\t")) return line.split("\t");
  // CSV fallback (quotes allowed)
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if ((c === "," || c === ";") && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur); return out;
}
export function rowFromCells(c) {
  const [name = "", address = "", provRaw = "", typeRaw = "", area = "", months = ""] = c.map((x) => String(x ?? "").trim());
  const province = matchProvince(provRaw) || detectProvince(address) || detectProvince(name);
  return { name, address, provRaw, province, typeRaw, typeIdx: matchType(typeRaw), area, months };
}
export function parsePaste(text) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  lines.forEach((l, i) => {
    const cells = splitLine(l);
    if (i === 0 && HEADER_WORDS.test(key(cells.join(" "))) && !(num(cells[4]) > 0)) return;   // header row
    rows.push(rowFromCells(cells));
  });
  return rows;
}
export const vnd = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("vi-VN") : "");
