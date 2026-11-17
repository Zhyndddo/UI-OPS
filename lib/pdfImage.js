// Round 633 — smallest possible PDF writer: ONE page that is ONE JPEG (the filled form drawn on a canvas).
// jpegBytes: Uint8Array of a JPEG, w/h its pixel size. Page is 595pt wide, height follows the image ratio.
export function jpegToPdf(jpegBytes, w, h) {
  const pw = 595, ph = Math.round((595 * h) / w);
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let len = 0;
  const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); body(); push("\nendobj\n"); };
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`); push(jpegBytes); push("\nendstream"); });
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  const xref = len;
  push(`xref\n0 6\n0000000000 65535 f \n` + [1, 2, 3, 4, 5].map((n) => String(offsets[n]).padStart(10, "0") + " 00000 n \n").join(""));
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(len);
  let p = 0;
  for (const b of parts) { out.set(b, p); p += b.length; }
  return out;
}
