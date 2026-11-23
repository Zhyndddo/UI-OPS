// Round 686 — ONE table of who may do what in Friday (Telegram). Read this file to audit the bot.
// Contexts: private = DM with the bot · internal = the main group + groups in TELEGRAM_CHAT_IDS (the "basket")
//           extra = TELEGRAM_EXTRA_CHAT_IDS · ar = TELEGRAM_AR_CHAT_IDS (AR groups are also "extra")
// linked: the person must have /link-ed their app account (the command shows internal numbers or acts as them).
// role: enforced inside the command (listed here so the table is complete).
export const COMMAND_RULES = {
  chatid:  { where: ["private", "internal", "extra", "ar"], note: "shows the chat id only" },
  help:    { where: ["private", "internal", "extra", "ar"] },
  start:   { where: ["private"] },
  link:    { where: ["private", "internal", "extra", "ar"], note: "private = link the account; in a group = turn #tags into links" },
  code:    { where: ["private"] },
  unlink:  { where: ["private"] },
  alert:   { where: ["private"] },
  alerts:  { where: ["private"] },
  tagalert:{ where: ["private"] },
  mytasks: { where: ["private", "internal"], linked: true, note: "the list is always sent to the DM, never the group" },
  misses:  { where: ["private", "internal"], linked: true, role: ["admin", "superadmin", "dev"] },
  ask:     { where: ["private", "internal", "extra", "ar"], linked: "private only" },
  team:    { where: ["private", "internal"], linked: "private only" },
  release: { where: ["private", "internal", "extra", "ar"], linked: "private only" },
  status:  { where: ["internal", "extra", "ar"] },
  missing: { where: ["internal"] },
  recap:   { where: ["internal", "ar"], note: "in the AR group it only summarises that group" },
  remind:  { where: ["private", "internal"], linked: true },
  watch:   { where: ["private", "internal"], linked: true },
  unwatch: { where: ["private", "internal"], linked: true },
  cover:   { where: ["private", "internal"], linked: true },
  quiet:   { where: ["private", "internal"], linked: true },
};

// Who may press which inline button (callback_data prefix). Enforced in each handler.
export const BUTTON_RULES = {
  "ok/no": "poster, a tagged @user, or the linked PIC (tgIntake.handleDecision)",
  "ua": "poster, a tagged @user, or a linked Upload PIC — Hiếu / Tâm (tgUploadAsk.handleUploadAsk)",
  "tk": "linked person who owns the ticket (tgInbox.handleTicketCb)",
  "rm": "linked person the reminder belongs to (tgRemind.handleReminder)",
  "wt/wx": "linked person (tgPlanner.handleWatchCb)",
  "ak/fb/ck": "linked person (tgAskLog.handleAskCb)",
  "tp/tx": "linked person (tgTags.handleTagPick)",
  "pg": "anyone in the chat — only turns a page of a long answer (tgPages.handlePageCb)",
};

export function chatContext({ isPrivate, isInternal, isExtra, isAr }) {
  if (isPrivate) return "private";
  if (isAr) return "ar";
  if (isExtra) return "extra";
  if (isInternal) return "internal";
  return "other";
}

// false = this command is not available in this kind of chat (the bot stays silent or says so)
export function commandAllowedHere(cmd, ctx) {
  const r = COMMAND_RULES[String(cmd || "").toLowerCase()];
  if (!r) return true;   // not a Friday command we know — other handlers decide
  return r.where.includes(ctx);
}
