"use client";
// Round 562 — Config > Team Access (dev only). See lib/teamAccess.js for how the overrides are applied.
import { useEffect, useMemo, useState } from "react";
import { TICKET_TYPE_LABELS, WORKSTATION_TYPE_LABELS } from "./teamTypes";
import {
  ACCESS_TEAMS, ticketTypeKeys, workstationTypeKeys, defaultView, defaultExecutor,
  fetchTeamAccessRows, saveTeamAccess,
} from "./teamAccess";

const cell = { padding: "6px 8px", borderBottom: "1px solid var(--border)", fontSize: 12, textAlign: "center" };
const th = { ...cell, fontSize: 11, color: "var(--text-faint)", position: "sticky", top: 0, background: "var(--surface, var(--bg))" };

export default function TeamAccessSection() {
  const [kind, setKind] = useState("ticket");
  // draft = { "ticket|type|team": bool, ... } for view; exec = { "type": team|null } for executor
  const [view, setView] = useState({});
  const [exec, setExec] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");

  const ticketKeys = useMemo(ticketTypeKeys, []);
  const wsKeys = useMemo(workstationTypeKeys, []);

  function buildDraft(rows) {
    const v = {}, e = {};
    for (const k of ticketKeys) for (const t of ACCESS_TEAMS) v[`ticket|${k}|${t}`] = defaultView("ticket", k, t);
    for (const k of wsKeys) for (const t of ACCESS_TEAMS) v[`workstation|${k}|${t}`] = defaultView("workstation", k, t);
    for (const k of ticketKeys) e[k] = defaultExecutor(k);
    for (const r of rows) {
      v[`${r.kind}|${r.type_key}|${r.team}`] = !!r.can_view;
      if (r.kind === "ticket" && r.is_executor) e[r.type_key] = r.team;
    }
    setView(v); setExec(e);
  }

  async function load() {
    setMsg("");
    try { buildDraft(await fetchTeamAccessRows()); setLoaded(true); }
    catch (err) { setMsg(`Could not load team_access (${err.message || err}). Has sql/pending/add-round562-team-access.sql been run?`); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function toggle(k, team) {
    const key = `${kind}|${k}|${team}`;
    setView((p) => ({ ...p, [key]: !p[key] }));
  }
  function setExecutor(k, team) {
    setExec((p) => ({ ...p, [k]: team || null }));
    if (team) setView((p) => ({ ...p, [`ticket|${k}|${team}`]: true }));
  }

  // Everything that differs from the code defaults becomes one override row.
  function buildRows() {
    const rows = [], sync = [];
    for (const k of ticketKeys) {
      const ex = exec[k] ?? null;
      const exChanged = !!ex && ex !== defaultExecutor(k);
      for (const t of ACCESS_TEAMS) {
        const v = !!view[`ticket|${k}|${t}`];
        const isEx = exChanged && ex === t;
        if (v !== defaultView("ticket", k, t) || isEx) rows.push({ kind: "ticket", type_key: k, team: t, can_view: v, is_executor: isEx });
      }
      if (exChanged && ex) sync.push({ key: k, executor_team: ex });
    }
    for (const k of wsKeys) for (const t of ACCESS_TEAMS) {
      const v = !!view[`workstation|${k}|${t}`];
      if (v !== defaultView("workstation", k, t)) rows.push({ kind: "workstation", type_key: k, team: t, can_view: v, is_executor: false });
    }
    return { rows, sync };
  }
  const { rows: pending, sync: pendingSync } = loaded ? buildRows() : { rows: [], sync: [] };

  async function save() {
    const { rows, sync } = buildRows();
    const execLine = sync.length ? `\n\nExecutor changes: ${sync.map((s) => `${TICKET_TYPE_LABELS[s.key] || s.key} → ${s.executor_team}`).join(", ")}.\nThese also update the ticket tab's executor team, which is who gets the "new ticket" notification.` : "";
    if (!window.confirm(`Save ${rows.length} override${rows.length === 1 ? "" : "s"} vs. the code defaults?${execLine}\n\nPeople see the change the next time they load the app.`)) return;
    setSaving(true); setMsg("");
    try { await saveTeamAccess(rows, sync); setMsg(`Saved — ${rows.length} override${rows.length === 1 ? "" : "s"} active.`); await load(); }
    catch (err) { setMsg(`Save failed: ${err.message || err}`); }
    setSaving(false);
  }
  async function resetAll() {
    if (!window.confirm("Remove ALL overrides and go back to the hardcoded defaults in lib/teamTypes.js?\n(Ticket tabs' executor team set by earlier saves is not rolled back.)")) return;
    setSaving(true); setMsg("");
    try { await saveTeamAccess([], []); setMsg("Reset — everything is back to the code defaults."); await load(); }
    catch (err) { setMsg(`Reset failed: ${err.message || err}`); }
    setSaving(false);
  }

  const keys = (kind === "ticket" ? ticketKeys : wsKeys).filter((k) => {
    const label = (kind === "ticket" ? TICKET_TYPE_LABELS : WORKSTATION_TYPE_LABELS)[k] || k;
    return !q || `${label} ${k}`.toLowerCase().includes(q.toLowerCase());
  });
  const labels = kind === "ticket" ? TICKET_TYPE_LABELS : WORKSTATION_TYPE_LABELS;

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12, maxWidth: 760, lineHeight: 1.5 }}>
        Tick which teams can <b>see</b> each ticket / workstation (menus, lists, counters). For tickets, pick the <b>executor team</b>:
        that team gets the full working view and PIC list; every other team that can see it is a <b>requester</b> (plain table, narrow edit
        rights). Cells marked <span style={{ color: "var(--accent)" }}>●</span> differ from the code default. Dev always sees everything.
        This changes what the app shows, not database permissions.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {["ticket", "workstation"].map((k) => (
          <button key={k} onClick={() => setKind(k)} style={{ padding: "6px 12px", borderRadius: 6, border: kind === k ? "1px solid var(--accent)" : "1px solid var(--border)", background: kind === k ? "rgba(255,107,26,0.1)" : "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>
            {k === "ticket" ? "Tickets" : "Workstations"}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", fontSize: 12 }} />
        <div style={{ flex: 1 }} />
        <button onClick={resetAll} disabled={saving || !loaded} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", cursor: "pointer", fontSize: 12 }}>Reset to defaults</button>
        <button onClick={save} disabled={saving || !loaded} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
          {saving ? "Saving…" : `Save (${pending.length} override${pending.length === 1 ? "" : "s"})`}
        </button>
      </div>
      {msg && <div style={{ fontSize: 12, marginBottom: 10, color: msg.startsWith("Saved") || msg.startsWith("Reset") ? "var(--accent)" : "#ff6b6b" }}>{msg}</div>}
      {!loaded ? <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading…</div> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>{kind === "ticket" ? "Ticket" : "Workstation"}</th>
                {ACCESS_TEAMS.map((t) => <th key={t} style={th}>{t}</th>)}
                {kind === "ticket" && <th style={th}>Executor team</th>}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <td style={{ ...cell, textAlign: "left" }}>{labels[k] || k}<div style={{ fontSize: 10, color: "var(--text-faint)" }}>{k}</div></td>
                  {ACCESS_TEAMS.map((t) => {
                    const on = !!view[`${kind}|${k}|${t}`];
                    const changed = on !== defaultView(kind, k, t);
                    const isEx = kind === "ticket" && exec[k] === t;
                    return (
                      <td key={t} style={{ ...cell, background: isEx ? "rgba(255,107,26,0.08)" : undefined }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(k, t)} disabled={isEx} title={isEx ? "Executor team always sees it" : ""} />
                        {changed && <span style={{ color: "var(--accent)", marginLeft: 3 }}>●</span>}
                      </td>
                    );
                  })}
                  {kind === "ticket" && (
                    <td style={cell}>
                      <select value={exec[k] || ""} onChange={(e) => setExecutor(k, e.target.value)} style={{ fontSize: 12, background: "transparent", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 6px" }}>
                        {!defaultExecutor(k) && <option value="">— none (single view)</option>}
                        {ACCESS_TEAMS.map((t) => <option key={t} value={t}>{t}{defaultExecutor(k) === t ? " (default)" : ""}</option>)}
                      </select>
                      {(exec[k] ?? null) !== defaultExecutor(k) && <span style={{ color: "var(--accent)", marginLeft: 3 }}>●</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
