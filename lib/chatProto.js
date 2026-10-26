// Round 530 — chat gate + cost meter. Round 552: the chat is now open to every signed-in
// staff member; CHAT_PROTO_EMAILS only keeps the test-only extras (cost meter, adding channels).
export const CHAT_PROTO_EMAILS = ["an.thien@vieent.vn"];

export function canUseChatProto(profile) {
  return !!profile?.id;
}
// Round 559 — admin and above (role admin / dev, real profile — not View-As) create/delete channels and add people.
export function canManageChannels(profile) {
  return profile?.role === "admin" || profile?.role === "dev";
}
export function isChatAdmin(profile) {
  const email = (profile?.email || "").trim().toLowerCase();
  return !!email && CHAT_PROTO_EMAILS.includes(email);
}

// Tiny in-memory usage meter so the prototype can answer "what does this
// cost us?". Counts what THIS browser tab pulls from Supabase for chat.
// (Dashboard → Usage / Reports is still the source of truth; this is the
// "per open-panel minute" rate you multiply by staff and hours.)
export function createMeter() {
  return { startedAt: Date.now(), openMs: 0, openSince: null, requests: 0, rows: 0, bytes: 0, rtEvents: 0, rtBytes: 0 };
}
export function sizeOf(x) {
  try { return JSON.stringify(x ?? null).length; } catch { return 0; }
}
