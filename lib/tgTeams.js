// Round 630 — per-team view. A person's team = profiles.segment. A release belongs to a team when its AR PIC or one of its
// workstation PICs is in that team; a stuck ticket belongs to the team(s) of its PIC(s). Used by /team and the morning DM.
import { buildDigest } from "./digestData";
import { loadOwners, loadStuck } from "./friday";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const NEAR = 7;
export const inTeam = (r, seg) => r.ownerSeg === seg || (r.opsSegs || []).includes(seg);
const normSeg = (s) => String(s || "").trim().toLowerCase();

export async function listSegments(db) {
  const { data } = await db.from("profiles").select("segment");
  return [...new Set((data || []).map((p) => p.segment).filter(Boolean))].sort();
}
export async function matchSegment(db, arg) {
  const segs = await listSegments(db), a = normSeg(arg);
  return { segs, seg: segs.find((s) => normSeg(s) === a) || segs.find((s) => normSeg(s).startsWith(a)) || null };
}
export async function segmentOfProfile(db, profileId) {
  const { data } = await db.from("profiles").select("segment").eq("id", profileId).maybeSingle();
  return data?.segment || null;
}

export async function teamHtml(db, seg) {
  const digest = await buildDigest(db);
  await loadOwners(db, digest.missingDataRows);
  const stuck = await loadStuck(db).catch(() => []);
  const rows = digest.missingDataRows.filter((r) => inTeam(r, seg));
  const over = rows.filter((r) => r.daysLeft <= 0), near = rows.filter((r) => r.daysLeft > 0 && r.daysLeft <= NEAR).sort((a, b) => a.daysLeft - b.daysLeft);
  const st = stuck.filter((s) => (s.segs || []).includes(seg));
  const L = [`<b>👥 Team ${esc(seg)}</b>`];
  if (!over.length && !near.length && !st.length) { L.push("", "Team bạn hiện không có release quá hạn / sắp đến hạn và không có ticket đứng yên. 🎉"); return L.join("\n"); }
  if (near.length) { L.push("", `<b>⏰ Sắp đến hạn — ${near.length}</b>`); near.slice(0, 8).forEach((r) => L.push(`• ${esc(r.title)}: thiếu ${esc(r.missing.join(", "))} · còn ${r.daysLeft} ngày`)); }
  if (over.length) { L.push("", `<b>🔥 Quá hạn — ${over.length}</b>`); over.slice(0, 10).forEach((r) => L.push(`• ${esc(r.title)}: thiếu ${esc(r.missing.join(", "))}`)); if (over.length > 10) L.push(`… và ${over.length - 10} release nữa`); }
  if (st.length) { L.push("", `<b>🧱 Ticket đứng yên ≥7 ngày — ${st.length}</b>`); st.slice(0, 6).forEach((s) => L.push(`• ${esc(s.type)}: ${esc(s.label)} (${esc(s.status || "—")}) — ${s.days} ngày · ${esc(s.who)}`)); }
  return L.join("\n");
}
