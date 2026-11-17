// Round 638 — Dropbox Sign (HelloSign) API v3, server only. Key in env DROPBOX_SIGN_API_KEY; test mode is ON unless DROPBOX_SIGN_TEST_MODE=false.
// Callback URL (set once in Dropbox Sign -> API settings): https://<site>/api/dropbox-sign/callback
import { createHmac, timingSafeEqual } from "crypto";

const BASE = "https://api.hellosign.com/v3";
const key = () => String(process.env.DROPBOX_SIGN_API_KEY || "").trim();
export const dropboxConfigured = () => !!key();
export const dropboxTestMode = () => String(process.env.DROPBOX_SIGN_TEST_MODE || "").trim().toLowerCase() !== "false";
const auth = () => "Basic " + Buffer.from(key() + ":").toString("base64");

// Sends the PDF to ONE signer (the right holder). fields = [{ x, y, width, height, page }] in PDF points from the top-left.
export async function sendForSignature({ pdf, title, subject, message, name, email, declarationId, field }) {
  const fd = new FormData();
  fd.append("title", String(title).slice(0, 250));
  fd.append("subject", String(subject).slice(0, 250));
  fd.append("message", String(message).slice(0, 4000));
  fd.append("signers[0][email_address]", email);
  fd.append("signers[0][name]", String(name).slice(0, 120));
  fd.append("test_mode", dropboxTestMode() ? "1" : "0");
  fd.append("metadata[declaration_id]", declarationId);
  fd.append("signing_options[draw]", "1");
  fd.append("signing_options[type]", "1");
  fd.append("signing_options[upload]", "0");
  fd.append("signing_options[phone]", "0");
  fd.append("signing_options[default_type]", "draw");
  fd.append("form_fields_per_document", JSON.stringify([[{ api_id: "holder_signature", name: "Chữ ký chủ sở hữu quyền", type: "signature", required: true, signer: 0, page: 1, ...field }]]));
  fd.append("files[0]", new Blob([pdf], { type: "application/pdf" }), "Khai-bao-ban-quyen.pdf");
  const res = await fetch(`${BASE}/signature_request/send`, { method: "POST", headers: { Authorization: auth() }, body: fd });
  const j = await res.json().catch(() => ({}));
  const id = j?.signature_request?.signature_request_id;
  if (!res.ok || !id) throw new Error(j?.error?.error_msg || `Dropbox Sign HTTP ${res.status}`);
  return { id, test: dropboxTestMode() };
}

export async function downloadSignedPdf(requestId) {
  const res = await fetch(`${BASE}/signature_request/files/${encodeURIComponent(requestId)}?file_type=pdf`, { headers: { Authorization: auth() } });
  if (!res.ok) throw new Error(`Dropbox Sign files HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// event_hash = HMAC-SHA256(api key, event_time + event_type), hex
export function eventHashOk(event) {
  if (!key() || !event?.event_hash) return false;
  const want = createHmac("sha256", key()).update(String(event.event_time) + String(event.event_type)).digest("hex");
  const a = Buffer.from(String(event.event_hash)), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
