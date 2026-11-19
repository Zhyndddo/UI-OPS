// Round 660 — every private message Friday pushes on her own (tag DMs, new tickets, /watch) goes through here:
// quiet hours and weekends are respected (the message waits in tg_outbox), and people covering for the owner get a copy.
import { supabaseAdmin as db } from "./supabaseAdmin";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const vnClock = (d = new Date()) => new Date(d.getTime() + 7 * 3600000);   // read with getUTC*() = Vietnam wall clock
export const vnDate = (d = new Date()) => vnClock(d).toISOString().slice(0, 10);

export async function sendOne(chatId, html, markup) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: String(html).slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) }) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && !!j.ok, blocked: r.status === 403, messageId: j.result?.message_id };
  } catch (e) { return { ok: false }; }
}

// null = not quiet now; otherwise the moment (a Date) the quiet period ends.
export function quietUntil(lk, now = new Date()) {
  const v = vnClock(now), h = v.getUTCHours(), dow = v.getUTCDay();
  const from = lk.quiet_from, to = lk.quiet_to;
  let end = null;   // as Vietnam wall clock
  if (from != null && to != null && from !== to) {
    const inQuiet = from < to ? h >= from && h < to : h >= from || h < to;
    if (inQuiet) { const e = new Date(v); e.setUTCMinutes(0, 0, 0); if (from > to && h >= from) e.setUTCDate(e.getUTCDate() + 1); e.setUTCHours(to); end = e; }
  }
  if (lk.quiet_weekend && (dow === 0 || dow === 6)) {
    const e = new Date(v); e.setUTCMinutes(0, 0, 0); e.setUTCDate(e.getUTCDate() + (dow === 6 ? 2 : 1)); e.setUTCHours(to ?? 8);
    if (!end || e > end) end = e;
  }
  return end ? new Date(end.getTime() - 7 * 3600000) : null;
}

const LINK_COLS = "profile_id, dm_chat_id, quiet_from, quiet_to, quiet_weekend, tag_dm";
const LINK_COLS_BASE = "profile_id, dm_chat_id";
// the person + anyone covering for them today
export async function recipientsFor(profileId) {
  let { data: own, error: e1 } = await db.from("tg_links").select(LINK_COLS).eq("profile_id", profileId).maybeSingle();
  if (e1) ({ data: own } = await db.from("tg_links").select(LINK_COLS_BASE).eq("profile_id", profileId).maybeSingle());   // a column from an older SQL round is missing: still deliver
  const out = own ? [{ ...own, covering: null }] : [];
  const { data: cov } = await db.from("tg_cover").select("cover_profile_id").eq("profile_id", profileId).gte("until", vnDate());
  if (cov?.length) {
    let { data: links, error: e2 } = await db.from("tg_links").select(LINK_COLS).in("profile_id", cov.map((c) => c.cover_profile_id));
    if (e2) ({ data: links } = await db.from("tg_links").select(LINK_COLS_BASE).in("profile_id", cov.map((c) => c.cover_profile_id)));
    if (links?.length) {
      const { data: who } = await db.from("profiles").select("name").eq("id", profileId).maybeSingle();
      links.forEach((l) => { if (!out.some((o) => o.profile_id === l.profile_id)) out.push({ ...l, covering: who?.name || "đồng nghiệp" }); });
    }
  }
  return out;
}

async function recordInbox(profileId, kind, ref, title, chatId, messageId) {
  if (kind !== "ticket" || !ref) return;
  await db.from("tg_inbox").upsert({ profile_id: profileId, kind, ref_id: String(ref), title: title || null, dm_chat_id: chatId, dm_msg_id: messageId || null, status: "open" }, { onConflict: "profile_id,kind,ref_id" });
}

// opts: { markup, kind, ref, title, urgent (skip quiet hours), tagPref (honour tg_links.tag_dm = false) }
export async function queueDm(profileId, html, opts = {}) {
  const res = { sent: 0, queued: 0, blocked: 0 };
  for (const r of await recipientsFor(profileId)) {
    if (opts.tagPref && r.tag_dm === false) continue;
    const text = r.covering ? `<i>(bạn đang thay ${esc(r.covering)})</i>\n${html}` : html;
    const until = opts.urgent ? null : quietUntil(r);
    if (until) {
      await db.from("tg_outbox").insert({ profile_id: r.profile_id, dm_chat_id: r.dm_chat_id, html: text, markup: opts.markup || null, kind: opts.kind || null, ref_id: opts.ref ? String(opts.ref) : null, title: opts.title || null, not_before: until.toISOString() });
      res.queued += 1; continue;
    }
    const out = await sendOne(r.dm_chat_id, text, opts.markup);
    if (out.ok) { res.sent += 1; await recordInbox(r.profile_id, opts.kind, opts.ref, opts.title, r.dm_chat_id, out.messageId).catch(() => {}); } else if (out.blocked) res.blocked += 1;
  }
  return res;
}

// tick: deliver what waited out its quiet hours
export async function flushOutbox() {
  const { data: rows } = await db.from("tg_outbox").select("*").is("sent_at", null).lte("not_before", new Date().toISOString()).order("id").limit(60);
  const res = { sent: 0, blocked: 0 };
  for (const o of rows || []) {
    const out = await sendOne(o.dm_chat_id, o.html, o.markup);
    await db.from("tg_outbox").update({ sent_at: new Date().toISOString() }).eq("id", o.id);   // never retried: a blocked bot would loop forever
    if (out.ok) { res.sent += 1; await recordInbox(o.profile_id, o.kind, o.ref_id, o.title, o.dm_chat_id, out.messageId).catch(() => {}); } else if (out.blocked) res.blocked += 1;
  }
  return res;
}
