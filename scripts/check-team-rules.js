#!/usr/bin/env node
// Round 683 — team / role guard. Run before every push:  npm run check:teams
// Fails when code (new or changed) breaks the team-membership rules in TEAM_RULES.md. Existing, reviewed spots are frozen in
// scripts/team-rules-baseline.json — a file may not get MORE of them. After a deliberate fix or a reviewed exception:  npm run check:teams -- --update-baseline
// Mark a single reviewed line with a trailing comment:  // roster-ok   (roster select)   // segment-ok   (segment compare)   // role-ok   (role compare)
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BASE = path.join(__dirname, "team-rules-baseline.json");
const update = process.argv.includes("--update-baseline");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

const counts = {};          // file -> { roster, segment, role }
const hard = [];            // always-fail findings
for (const abs of [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))]) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  if (rel === "lib/roster.js") continue;
  const text = fs.readFileSync(abs, "utf8");
  const lines = text.split("\n");
  const c = { roster: 0, segment: 0, role: 0 };
  lines.forEach((line, i) => {
    // 1) roster-style select that names segment but not segments_extra  -> second / extra teams silently vanish
    const m = line.match(/from\("profiles"\)\s*\.select\(\s*"([^"]*)"/);
    if (m && /\bsegment\b/.test(m[1]) && !/segments_extra|\*/.test(m[1]) && !/roster-ok/.test(line)) c.roster += 1;
    // 2) comparing someone's segment with a team literal: only the ACTIVE team matches (use hasTeam / anyTeam / memberOfTeam)
    if (/\.segment\s*[!=]==?\s*["'][A-Za-z]+["']/.test(line) && !/segment-ok/.test(line)) c.segment += 1;
    // 3) role === "admin": misses Super admin (use isAdminRole / isAdminOrAbove from lib/permissions.js)
    if (/role\s*[!=]==?\s*["']admin["']/.test(line) && !/role-ok/.test(line) && rel !== "lib/permissions.js") c.role += 1;
  });
  // 4) a file that builds team PIC lists with filterProfilesByTeam / resolveAutoAssignee must load the roster with rosterQuery
  if (rel !== "lib/workstationHelpers.js" && /filterProfilesByTeam\(|resolveAutoAssignee\(/.test(text) && !/rosterQuery\(/.test(text) && !/roster-ok/.test(text)) {
    hard.push(`${rel}: uses filterProfilesByTeam/resolveAutoAssignee but does not load people with rosterQuery() (lib/roster.js)`);
  }
  if (c.roster || c.segment || c.role) counts[rel] = c;
}

if (update) {
  fs.writeFileSync(BASE, JSON.stringify(counts, null, 1) + "\n");
  console.log("baseline updated:", Object.keys(counts).length, "files");
  process.exit(hard.length ? 1 : 0);
}

const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, "utf8")) : {};
const NAMES = { roster: "profiles select without segments_extra (use rosterQuery)", segment: "direct segment === \"Team\" compare (use hasTeam/anyTeam/memberOfTeam)", role: "role === \"admin\" (use isAdminRole)" };
const problems = [...hard];
for (const [file, c] of Object.entries(counts)) {
  for (const k of Object.keys(NAMES)) {
    const allowed = (base[file] && base[file][k]) || 0;
    if (c[k] > allowed) problems.push(`${file}: ${c[k] - allowed} new  ${NAMES[k]}`);
  }
}
if (problems.length) {
  console.error("Team/role rules broken (see TEAM_RULES.md):\n - " + problems.join("\n - "));
  console.error("\nIf a spot is reviewed and fine: add the marker comment on that line, or run: npm run check:teams -- --update-baseline");
  process.exit(1);
}
console.log("team rules OK");
