// Round 665 — hourly: read the team's tracking Google Sheet (tab "Reports") and copy each row's result back into the matching
// Report Conflict ticket (matched on Reported Link = "Link vi phạm"). Needs the sheet shared "anyone with the link can view".
// Writes data.sheetStatus / sheetResult / sheetResultDate / sheetCaseId / sheetSyncedAt. Never changes the ticket status.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const SHEET_ID = process.env.REPORT_CONFLICT_SHEET_ID || "1XdTEH-AZtERTbB_oSrG81CHd7BqGGdifwPxWdnl2Y6U";
const SHEET_TAB = process.env.REPORT_CONFLICT_SHEET_TAB || "Reports";

function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function normUrl(u) {
  let s = String(u || "").trim();
  if (!s) return "";
  try {
    const x = new URL(/^https?:/i.test(s) ? s : "https://" + s);
    const host = x.hostname.replace(/^(www|m|open)\./, "").toLowerCase();
    if (host === "youtube.com" && x.searchParams.get("v")) return "yt:" + x.searchParams.get("v");
    if (host === "youtu.be") return "yt:" + x.pathname.slice(1);
    return host + x.pathname.replace(/\/+$/, "").toLowerCase();
  } catch (e) { return s.toLowerCase(); }
}
const urlsOf = (v) => String(v || "").split(/[\s,;]+/).filter(Boolean).map(normUrl).filter(Boolean);
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && (request.headers.get("authorization") || "") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`, { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return NextResponse.json({ error: `Sheet not readable (${res?.status || "network"}) — share it as 'anyone with the link can view'.` }, { status: 502 });
  const grid = parseCsv(await res.text());
  if (grid.length < 2) return NextResponse.json({ ok: true, rows: 0 });
  const head = grid[0].map(norm), col = (...names) => head.findIndex((h) => names.some((n) => h === n));
  const iCase = col("ma case"), iUrl = col("link vi pham"), iStatus = col("trang thai"), iRes = col("ket qua & ghi chu", "ket qua"), iDate = col("ngay co ket qua");
  if (iUrl < 0) return NextResponse.json({ error: "Column 'Link vi phạm' not found in the sheet." }, { status: 422 });
  const bySheet = new Map();
  grid.slice(1).forEach((r) => { const k = normUrl(r[iUrl]); if (k) bySheet.set(k, r); });
  const { data: tab } = await supabaseAdmin.from("ticket_tabs").select("id").eq("key", "report_conflict").maybeSingle();
  if (!tab) return NextResponse.json({ error: "report_conflict tab missing." }, { status: 500 });
  const { data: tickets } = await supabaseAdmin.from("tickets").select("id, data").eq("tab_id", tab.id).is("deleted_at", null).not("data->>__mailSentAt", "is", null).limit(2000);
  let updated = 0, matched = 0;
  for (const t of tickets || []) {
    const hit = urlsOf(t.data?.reportedURL).map((k) => bySheet.get(k)).find(Boolean);
    if (!hit) continue;
    matched += 1;
    const next = { sheetCaseId: iCase >= 0 ? hit[iCase] || "" : "", sheetStatus: iStatus >= 0 ? hit[iStatus] || "" : "", sheetResult: iRes >= 0 ? hit[iRes] || "" : "", sheetResultDate: iDate >= 0 ? hit[iDate] || "" : "" };
    const d = t.data || {};
    if (Object.entries(next).every(([k, v]) => (d[k] || "") === v)) continue;
    await supabaseAdmin.from("tickets").update({ data: { ...d, ...next, sheetSyncedAt: new Date().toISOString() } }).eq("id", t.id);
    updated += 1;
  }
  return NextResponse.json({ ok: true, sheetRows: grid.length - 1, sentTickets: tickets?.length || 0, matched, updated });
}
