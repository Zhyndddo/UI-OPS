// Round 638 — one place for the "VIEENT internal" sender used by the rights form emails (server only).
// Settings live in Vercel env (the password never goes in the database). Every RIGHTS_* value is optional and falls back to the digest mailbox:
//   RIGHTS_SMTP_HOST / RIGHTS_SMTP_PORT / RIGHTS_SMTP_SECURE / RIGHTS_SMTP_USER / RIGHTS_SMTP_PASS   (own mailbox, e.g. no-reply@)
//   RIGHTS_FROM_EMAIL (address shown), RIGHTS_FROM_NAME (display name, default "VIEENT OPS"), RIGHTS_REPLY_TO (optional)
import nodemailer from "nodemailer";

export function rightsMailer() {
  const e = process.env;
  const host = e.RIGHTS_SMTP_HOST || e.SMTP_HOST, user = e.RIGHTS_SMTP_USER || e.SMTP_USER, pass = e.RIGHTS_SMTP_PASS || e.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const own = !!e.RIGHTS_SMTP_HOST;
  const transport = nodemailer.createTransport({
    host, port: parseInt((own ? e.RIGHTS_SMTP_PORT : e.SMTP_PORT) || "587", 10),
    secure: (own ? e.RIGHTS_SMTP_SECURE : e.SMTP_SECURE) === "true", auth: { user, pass },
  });
  const addr = e.RIGHTS_FROM_EMAIL || e.DIGEST_FROM_EMAIL || user;
  const from = addr.includes("<") ? addr : `"${(e.RIGHTS_FROM_NAME || "VIEENT OPS").replace(/["\r\n]/g, "")}" <${addr}>`;
  return { transport, from, replyTo: e.RIGHTS_REPLY_TO || undefined };
}
