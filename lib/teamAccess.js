// Round 562 — "Team Access" authorizor (Config > Team Access, dev only).
//
// HOW IT WORKS (read this first if you are taking this over):
//   * lib/teamTypes.js stays the single source of DEFAULTS (which team sees which ticket / workstation) and
//     lib/ticketConfigs.js holds each ticket's default executorTeam. Nothing there changed in shape.
//   * Table public.team_access holds only OVERRIDES (rows that differ from the defaults). Empty table = defaults.
//   * AuthContext calls loadTeamAccess() once the profile is known. It applies the overrides IN PLACE onto the same
//     exported objects (TEAM_TICKET_TYPES, TEAM_WORKSTATION_TYPES, TICKET_CONFIGS[k].executorTeam,
//     DUAL_VIEW_EXECUTOR_TEAM) so every existing consumer (switchers, sidebar, task table, counters) just works.
//   * The last result is cached in localStorage so a slow/failed fetch still starts from the last known setup.
//   * This controls what the app SHOWS (menus, lists, which side of a dual-view ticket you get). It is not a
//     database permission wall — Supabase RLS is still "any signed-in staff". Server routes (daily digest cron)
//     use the code defaults.
import { supabase } from "./supabaseClient";
import {
  TEAMS, TEAM_TICKET_TYPES, TEAM_WORKSTATION_TYPES, TICKET_TYPE_LABELS, WORKSTATION_TYPE_LABELS, SHARED_TICKET_TYPES,
} from "./teamTypes";
import { TICKET_CONFIGS } from "./ticketConfigs";
import { DUAL_VIEW_EXECUTOR_TEAM } from "./notDoneCounts";

// The only account allowed to open Config > Team Access. Change it here if ownership ever moves
// (the database function save_team_access additionally requires role = 'dev').
export const ACCESS_EDITOR_EMAIL = "an.thien@vieent.vn";
export function canEditTeamAccess(profile) {
  return profile?.role === "dev" && (profile?.email || "").trim().toLowerCase() === ACCESS_EDITOR_EMAIL;
}

const CACHE_KEY = "team_access_v1";
const clone = (x) => JSON.parse(JSON.stringify(x));

// Snapshot of the code defaults, taken once at module load (before any override is applied).
const DEFAULTS = {
  ticket: clone(TEAM_TICKET_TYPES),
  workstation: clone(TEAM_WORKSTATION_TYPES),
  executor: Object.fromEntries(Object.entries(TICKET_CONFIGS).map(([k, c]) => [k, c.executorTeam ?? null])),
  dual: clone(DUAL_VIEW_EXECUTOR_TEAM),
};

export const ACCESS_TEAMS = TEAMS;
export const ticketTypeKeys = () => Object.keys(TICKET_TYPE_LABELS).filter((k) => !SHARED_TICKET_TYPES.includes(k));
export const workstationTypeKeys = () => Object.keys(WORKSTATION_TYPE_LABELS);

export function defaultView(kind, typeKey, team) {
  return (DEFAULTS[kind]?.[team] || []).includes(typeKey);
}
export function defaultExecutor(typeKey) {
  return DEFAULTS.executor[typeKey] ?? DEFAULTS.dual[typeKey] ?? null;
}

function setList(target, team, list) {
  if (!target[team]) target[team] = [];
  target[team].length = 0;
  target[team].push(...list);
}

// Resets everything to the defaults, then layers the override rows on top. Idempotent.
export function applyTeamAccessRows(rows) {
  for (const kind of ["ticket", "workstation"]) {
    const target = kind === "ticket" ? TEAM_TICKET_TYPES : TEAM_WORKSTATION_TYPES;
    const teams = new Set([...Object.keys(DEFAULTS[kind]), ...Object.keys(target)]);
    for (const team of teams) setList(target, team, DEFAULTS[kind][team] || []);
  }
  for (const [k, v] of Object.entries(DEFAULTS.executor)) if (TICKET_CONFIGS[k]) TICKET_CONFIGS[k].executorTeam = v;
  for (const k of Object.keys(DUAL_VIEW_EXECUTOR_TEAM)) delete DUAL_VIEW_EXECUTOR_TEAM[k];
  Object.assign(DUAL_VIEW_EXECUTOR_TEAM, DEFAULTS.dual);

  for (const r of rows || []) {
    if (r.kind !== "ticket" && r.kind !== "workstation") continue;
    const target = r.kind === "ticket" ? TEAM_TICKET_TYPES : TEAM_WORKSTATION_TYPES;
    const list = (target[r.team] || []).filter((k) => k !== r.type_key);
    if (r.can_view) list.push(r.type_key);
    setList(target, r.team, list);
    if (r.kind === "ticket" && r.is_executor) {
      if (TICKET_CONFIGS[r.type_key]) TICKET_CONFIGS[r.type_key].executorTeam = r.team;
      DUAL_VIEW_EXECUTOR_TEAM[r.type_key] = r.team;
    }
  }
  // A team with no default entry and nothing left in it should not appear as an empty row in the dev overview pages.
  for (const kind of ["ticket", "workstation"]) {
    const target = kind === "ticket" ? TEAM_TICKET_TYPES : TEAM_WORKSTATION_TYPES;
    for (const team of Object.keys(target)) if (!DEFAULTS[kind][team] && target[team].length === 0) delete target[team];
  }
}

export function readCachedRows() {
  try { return JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; }
}
function writeCachedRows(rows) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch {}
}

export async function fetchTeamAccessRows() {
  const { data, error } = await supabase.from("team_access").select("kind, type_key, team, can_view, is_executor");
  if (error) throw error;
  return data || [];
}

// Called by AuthContext. Never throws; never blocks longer than `timeoutMs`.
export async function loadTeamAccess(timeoutMs = 2500) {
  if (typeof window === "undefined" || !supabase) return;
  const cached = readCachedRows();
  if (cached) applyTeamAccessRows(cached);
  try {
    const rows = await Promise.race([
      fetchTeamAccessRows(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("team_access timeout")), timeoutMs)),
    ]);
    applyTeamAccessRows(rows);
    writeCachedRows(rows);
  } catch (e) {
    // table not created yet / offline / slow: keep cache or code defaults
    if (!cached) applyTeamAccessRows([]);
  }
}

// rows: override rows to store ([] = reset to defaults). syncTabs: [{key, executor_team}] for deliberately changed executors.
export async function saveTeamAccess(rows, syncTabs = []) {
  const { error } = await supabase.rpc("save_team_access", { p_rows: rows, p_sync_tabs: syncTabs });
  if (error) throw error;
  applyTeamAccessRows(rows);
  writeCachedRows(rows);
}
