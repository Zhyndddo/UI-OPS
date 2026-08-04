#!/usr/bin/env node
// Retention pruning for the two backup folders — run right after
// scripts/backup.js, before committing, from inside the data-backups
// checkout (so its relative "backups/…" paths line up).
//
//   node scripts/prune-backups.js
//
// Daily backups roll off after BACKUP_DAILY_KEEP_DAYS (default 7) — that's
// the "grab yesterday's version back" window. Weekly backups roll off
// after BACKUP_WEEKLY_KEEP_DAYS (default 90, ~13 weeks) — a longer safety
// net in case something needs undoing further back than a week.

const fs = require("fs");
const path = require("path");

function pruneDir(dir, keepDays) {
  if (!fs.existsSync(dir)) return;
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(dir)) {
    const m = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m) continue;
    const fileDate = new Date(`${m[1]}T00:00:00Z`).getTime();
    if (fileDate < cutoff) {
      fs.unlinkSync(path.join(dir, file));
      console.log(`Pruned ${path.join(dir, file)}`);
    }
  }
}

const DAILY_KEEP_DAYS = Number(process.env.BACKUP_DAILY_KEEP_DAYS || 7);
const WEEKLY_KEEP_DAYS = Number(process.env.BACKUP_WEEKLY_KEEP_DAYS || 90);

pruneDir(path.join("backups", "daily"), DAILY_KEEP_DAYS);
pruneDir(path.join("backups", "weekly"), WEEKLY_KEEP_DAYS);
