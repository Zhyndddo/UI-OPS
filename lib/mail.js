// Round 611 — tiny shared SMTP sender (same SMTP_* env vars the daily digest uses).
import nodemailer from "nodemailer";

let transporter = null;
export function mailConfigured() { return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS); }

export async function sendMail(to, subject, html) {
  if (!mailConfigured()) return { sent: false, reason: "SMTP not configured" };
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT || "587", 10), secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  try {
    await transporter.sendMail({ from: process.env.DIGEST_FROM_EMAIL || process.env.SMTP_USER, to, subject, html });
    return { sent: true };
  } catch (e) { return { sent: false, reason: "SMTP error: " + e.message }; }
}
