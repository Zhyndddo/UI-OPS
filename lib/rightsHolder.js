// Round 641 — in-house right-holder confirmation (server only): private link + email text.
import { sign, unsign } from "./rightsOtp";
import { RIGHTS } from "./rightsForm";

const esc = (x) => String(x || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
export const siteOrigin = (request) => {
  const h = (k) => request.headers.get(k) || "";
  const host = h("x-forwarded-host") || h("host");
  return host ? `${h("x-forwarded-proto") || "https"}://${host}` : new URL(request.url).origin;
};
export const makeHolderLink = (origin, id) => `${origin}/khai-bao/xac-nhan/${sign({ id, x: Date.now() + 14 * 24 * 3600 * 1000 }, "holder")}`;
export const readHolderToken = (t) => { const p = unsign(t, "holder"); return p && p.x > Date.now() && p.id ? p.id : null; };

export async function sendHolderMail(mail, row, link) {
  const rights = RIGHTS.filter((r) => row.licensed?.[r.key]).map((r) => r.vi).join(", ");
  await mail.transport.sendMail({
    from: mail.from, replyTo: mail.replyTo, to: row.holder_email,
    subject: `VIEENT — Xác nhận quyền ca khúc "${row.song_title}"`.slice(0, 150),
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.55">
<p>Xin chào ${esc(row.holder_name)},</p>
<p><b>${esc(row.signer_name || "Người khai báo")}</b> đã khai báo với VIEENT rằng bạn là chủ sở hữu các quyền đã cấp phép cho ca khúc <b>${esc(row.song_title)}</b>${rights ? ` (${esc(rights)})` : ""}.</p>
<p>Vui lòng mở liên kết dưới đây để xem nội dung và xác nhận (cần nhập mã gửi về email này):</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#f26a0f;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">Xem &amp; xác nhận</a></p>
<p style="font-size:12px;color:#666">Liên kết có hiệu lực 14 ngày. Nếu bạn không biết về việc này, hãy bỏ qua email hoặc chọn "Từ chối" trên trang xác nhận.</p></div>`,
  });
}
