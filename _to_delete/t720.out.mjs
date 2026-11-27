// lib/releaseInfoForm.js
function previewSeconds(v) {
  const s = String(v == null ? "" : v).trim().replace(/\s*(s|giây|sec)$/i, "");
  if (/^\d+(\.\d+)?$/.test(s)) return String(Math.round(Number(s)));
  const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  if (!m) return String(v == null ? "" : v).trim();
  return String(m[3] != null ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]));
}

// _to_delete/t720.mjs
console.log(["75", "1:15", "01:15", "00:00", "1:02:03", "90s", "abc", "", "1.4", " 2:5 "].map((v) => JSON.stringify(previewSeconds(v))).join(" "));
