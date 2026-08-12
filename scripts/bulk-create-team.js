#!/usr/bin/env node
// Bulk-add team members without using Supabase's invite-by-email flow —
// the free-tier shared SMTP Supabase uses for `inviteUserByEmail` (what
// Config -> Team's "+ Add" button calls, see
// app/api/admin/invite-user/route.js) is capped at ~2 emails/hour, which
// makes adding ~20 people one at a time impractical. This script instead
// creates each auth user directly with a generated password and
// `email_confirm: true` — that API call never sends an email at all, so
// the rate limit doesn't apply. You hand out the generated passwords
// yourself (Slack, Zalo, whatever) instead of Supabase emailing them.
//
// Input is a CSV with a header row: name,email,role,segment
//   - role: exc | teamlead | admin | dev (matches ROLES in lib/permissions.js — round 57 added teamlead)
//   - segment: AR | Marketing | OPS | Design — required unless role=dev
//   - email can be a real address OR a placeholder/dummy one (e.g.
//     person1@vieent.temp) if you don't have everyone's real email yet —
//     nothing here depends on the email being deliverable, since no mail
//     ever gets sent. Fix it later from Config -> Team, whose Email cell
//     is now editable (see app/api/admin/update-email/route.js) — editing
//     it there updates BOTH the login email and the profile record
//     together, which is the part a raw SQL UPDATE would miss.
//
// Generated passwords are written to a local output CSV
// (team-created-credentials.csv, next to wherever you run this from) —
// NOT just printed to the terminal/Actions log, so a temporary password
// doesn't end up sitting in CI log history. Treat that output file as
// sensitive: hand out each password over a private channel, then delete
// the file once everyone's logged in and set their own password via the
// normal "forgot password" flow.
//
// Idempotent: skips any row whose email already has a profiles row.
// Defaults to a DRY RUN — pass --confirm to actually create accounts.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bulk-create-team.js team.csv
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bulk-create-team.js team.csv --confirm

const fs = require("fs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const confirm = process.argv.includes("--confirm");
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: node scripts/bulk-create-team.js <team.csv> [--confirm]");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ROLES = ["exc", "teamlead", "admin", "dev"]; // round 57 — must match lib/permissions.js's ROLES
const TEAMS = ["AR", "Marketing", "OPS", "Design"];

function parseCsv(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] || ""));
    return row;
  });
}

function genPassword() {
  // 16 random bytes, base64url — long enough, no characters that cause
  // copy/paste trouble in a CSV or a chat message.
  return crypto.randomBytes(16).toString("base64url");
}

async function main() {
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  if (rows.length === 0) {
    console.log("No data rows found in " + file);
    return;
  }

  const results = []; // { name, email, password } for the output CSV
  let created = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const name = row.name;
    const email = row.email;
    const role = row.role || "exc";
    const segment = role === "dev" ? null : row.segment;

    if (!name || !email) {
      console.log(`SKIP — missing name or email: ${JSON.stringify(row)}`);
      skipped++;
      continue;
    }
    if (!ROLES.includes(role)) {
      console.log(`SKIP — "${email}": role "${role}" isn't one of ${ROLES.join("/")}.`);
      skipped++;
      continue;
    }
    if (role !== "dev" && !TEAMS.includes(segment)) {
      console.log(`SKIP — "${email}": segment "${segment}" isn't one of ${TEAMS.join("/")} (required unless role=dev).`);
      skipped++;
      continue;
    }

    console.log(`${email}: "${name}" — role=${role}${segment ? ` segment=${segment}` : ""}`);

    if (!confirm) continue;

    const { data: existing } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
    if (existing) {
      console.log(`  -> profile already exists for ${email}, skipping.`);
      skipped++;
      continue;
    }

    const password = genPassword();
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no confirmation email sent — see file header
    });
    if (authErr) {
      console.error(`  -> FAILED (auth user): ${authErr.message}`);
      failed++;
      continue;
    }

    const { error: profileErr } = await supabase.from("profiles").insert({
      name,
      email,
      role,
      segment,
      auth_id: authUser.user.id,
    });
    if (profileErr) {
      console.error(`  -> FAILED (profile row, auth user WAS created — you'll need to link it by hand): ${profileErr.message}`);
      failed++;
      continue;
    }

    results.push({ name, email, password });
    created++;
  }

  if (confirm && results.length > 0) {
    const outPath = "team-created-credentials.csv";
    const csv = "name,email,password\n" + results.map((r) => `${r.name},${r.email},${r.password}`).join("\n") + "\n";
    fs.writeFileSync(outPath, csv);
    console.log(`\nWrote ${results.length} generated password(s) to ${outPath} — hand these out over a private channel, then delete the file.`);
  }

  console.log(`\n${confirm ? "Done." : "Dry run complete — nothing created."} Created: ${created}, Skipped: ${skipped}, Failed: ${failed}.`);
  if (!confirm) console.log("Re-run with --confirm to actually create these accounts.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
