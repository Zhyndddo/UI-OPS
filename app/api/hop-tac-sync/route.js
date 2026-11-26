// Round 702 — Hợp Đồng ticket (Publishing / Youtube / Nhạc Số) <-> the label's contract tag, kept in sync on the SERVER the moment the ticket changes.
//   POST { ticketId }  (signed-in staff) ->
//     ticket status COMPLETE  => the label's tag turns done (green) + stores contractUrl / sentDate / signedDate on the tag;
//                                first done tag also signs the label (strips "HĐ - ") and, for Publishing, locks Phụ Lục Publishing on its releases.
//     moved away from COMPLETE => the tag goes back to "in flight" (done=false). (Sign-off side effects are not undone.)
// Before this the Labels page decided "done" by the LAST status option, which is REFUND for these tickets.
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../lib/supabaseAdmin";
import { HOP_TAC_TICKET_TYPE } from "../../../lib/labelHopTacStatus";
import { hasLabelPrefix, stripLabelPrefix, withLabelPrefix } from "../../../lib/labelHelpers";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const bad = (error, status = 400) => NextResponse.json({ error }, { status, headers: noStore });
const TAG_BY_TYPE = Object.fromEntries(Object.entries(HOP_TAC_TICKET_TYPE).map(([tag, type]) => [type, tag]));
const clean = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

export async function POST(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  const me = await getCallerProfile(request);
  if (!me) return bad("Unauthorized", 401);
  let b = null; try { b = await request.json(); } catch { /* below */ }
  const ticketId = Number(b?.ticketId);
  if (!Number.isFinite(ticketId)) return bad("ticketId missing");

  const { data: t } = await supabaseAdmin.from("tickets").select("id, tab_id, status, data").eq("id", ticketId).maybeSingle();
  if (!t) return bad("Ticket not found.", 404);
  const { data: tab } = await supabaseAdmin.from("ticket_tabs").select("key").eq("id", t.tab_id).maybeSingle();
  const tag = TAG_BY_TYPE[tab?.key];
  if (!tag) return NextResponse.json({ ok: true, skipped: "not a Hợp Đồng ticket" }, { headers: noStore });
  const d = t.data || {};

  // the label: by id (tickets made from the Label list) or through the DID's release (tickets made by hand)
  let label = null;
  if (d.labelId) { const { data } = await supabaseAdmin.from("labels").select("*").eq("id", d.labelId).maybeSingle(); label = data || null; }
  if (!label && d.releaseId) {
    const { data: rel } = await supabaseAdmin.from("releases").select("label").eq("did", String(d.releaseId).trim()).maybeSingle();
    const name = stripLabelPrefix(rel?.label || "");
    if (name) { const { data } = await supabaseAdmin.from("labels").select("*").in("label_name", [name, withLabelPrefix(name)]).limit(1); label = data?.[0] || null; }
  }
  if (!label) return NextResponse.json({ ok: true, skipped: "no label found for this ticket" }, { headers: noStore });

  const status = t.status;
  const complete = status === "COMPLETE";
  const status_map = { ...(label.hop_tac_status || {}) };
  const prev = status_map[tag] || null;
  const details = { contractUrl: clean(d.contractUrl, 500), sentDate: clean(d.sentDate, 10), signedDate: clean(d.signedDate, 10) };
  const mine = !prev || prev.ticketId === t.id || !prev.ticketId;   // never take over a tag that belongs to a different ticket
  if (!complete && !(prev && prev.ticketId === t.id)) return NextResponse.json({ ok: true, skipped: "ticket not complete" }, { headers: noStore });
  if (!mine) return NextResponse.json({ ok: true, skipped: "tag belongs to another ticket" }, { headers: noStore });

  const entry = { ...(prev || {}), sentToLegal: true, ticketId: t.id, done: complete, ...details };
  if (!complete) delete entry.simulated;
  status_map[tag] = entry;
  const hop_tac = Array.isArray(label.hop_tac) ? [...label.hop_tac] : [];
  if (!hop_tac.includes(tag)) hop_tac.push(tag);
  let labelName = label.label_name;
  const upd = { hop_tac_status: status_map, hop_tac };
  const firstDone = complete && !prev?.done;
  if (firstDone && hasLabelPrefix(labelName)) { labelName = stripLabelPrefix(labelName); upd.label_name = labelName; upd.contract_signed = true; }
  const { error } = await supabaseAdmin.from("labels").update(upd).eq("id", label.id);
  if (error) return bad("Không cập nhật được label: " + error.message, 500);
  if (firstDone && tag === "Publishing") await supabaseAdmin.from("releases").update({ gate_phu_luc_publishing: "false" }).eq("label", labelName);
  return NextResponse.json({ ok: true, tag, labelName, done: complete }, { headers: noStore });
}
