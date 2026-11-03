// Round 583 — one-page PDF around a JPEG picture. No dependency. The page is A4 portrait (the invitation is 1055 x 1491 = A4 ratio),
// the JPEG bytes are embedded as-is (DCTDecode), so the PDF is about the size of the JPEG.
export function jpegToPdf(jpeg, imgW, imgH) {
  const enc = new TextEncoder();
  const PW = 595.28, PH = 841.89;
  const chunks = [];
  const offsets = [];
  let len = 0;
  const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; chunks.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); push(body); push("\nendobj\n"); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = len;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push("\nendstream\nendobj\n");
  const content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len;
  let x = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) x += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  push(x + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
