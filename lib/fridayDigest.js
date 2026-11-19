// Round 658 — the digest text builder shared by the pg_cron route and the Claude relay route, plus the
// "who posted this slot today" claim (table friday_posts) so a relay post and the fallback never double up.
import { buildDigest } from "./digestData";
import { renderDigestTelegram } from "./telegram";
import { loadStuck, loadChatSignals, loadOwners, renderActions } from "./friday";
import { loadIntakeGaps } from "./tgIntake";

export async function buildSlotText(sb, slot) {
  const digest = await buildDigest(sb);
  await loadOwners(sb, digest.missingDataRows);
  let text = renderDigestTelegram(digest, slot);
  try { text += "\n\n" + renderActions(digest, await loadStuck(sb), slot !== "morning", await loadChatSignals(sb, digest.missingDataRows).catch(() => ({})), await loadIntakeGaps(sb).catch(() => [])); } catch (e) { /* digest still goes out without the action block */ }
  return { digest, text };
}

export const vnDay = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

// true = this caller now owns the slot for today. A duplicate key = someone already posted. Any other error
// (e.g. the SQL was not run yet) fails OPEN so a missing table can never silence the group.
export async function claimSlot(sb, slot, by) {
  const { error } = await sb.from("friday_posts").insert({ day: vnDay(), slot, posted_by: by });
  if (!error) return true;
  return error.code !== "23505";
}
export async function releaseSlot(sb, slot) {
  await sb.from("friday_posts").delete().eq("day", vnDay()).eq("slot", slot);
}
export async function slotPostedBy(sb, slot) {
  const { data } = await sb.from("friday_posts").select("posted_by").eq("day", vnDay()).eq("slot", slot).maybeSingle();
  return data?.posted_by || null;
}
