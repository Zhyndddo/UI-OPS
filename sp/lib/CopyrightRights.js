"use client";

import { useState } from "react";
import { COPYRIGHT_ITEMS, normalizeCopyrightChecklist, copyrightChecklistIsComplete, copyrightEntryIsDeclared, copyrightEntryIsComplete, copyrightEntryMissingFields } from "./copyrightChecklist";
import CopyrightRightsPopup from "./CopyrightRightsPopup";

// Round 115 — was CopyrightRightsTable.js: one row per track, 3 columns
// (Record producer / Performer / Author), each cell its own "+ Declare"
// button opening a single-right popup. Per explicit request:
//   1. "move the declare button to up, under each track... just one
//      declare button for all three [rights]... which has real data
//      filled in => a small pill indicating so"
//   2. "add 3 rights into 3 tabs for convenient input" (see
//      CopyrightRightsPopup)
// This file is no longer a table — it's two small pieces used directly by
// the callers instead: CopyrightSummaryBar (the "X/Y declared" badge +
// "Copy rights" button, unchanged from before, just pulled out on its
// own) and CopyrightRowStatus (3 pills + ONE "Declare/Edit Rights" button
// for a single checklist, opening CopyrightRightsPopup's 3-tab editor).
//
// TracklistSection (app/releases/[id]/page.js) now renders
// CopyrightSummaryBar once above the whole tracklist, and
// CopyrightRowStatus inline, directly under EACH track's own row — moved
// up out of the separate block that used to sit below every track, per
// item 1. CopyrightsTab's Single case (exactly one row, no "under each
// track" to move into) renders the same two pieces once, in place — same
// pills+one-button consolidation, just nothing to relocate.

export function CopyrightSummaryBar({ styles, declaredCount, totalCount, countLabel, onCopyRights }) {
  if (totalCount === 0) return null;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
      {onCopyRights && totalCount > 1 && (
        <button type="button" onClick={onCopyRights} className={styles.btnSmall} title="Copy the first row's Copyright Checklist to every other row">
          ⧉ Copy rights
        </button>
      )}
      <span
        className={styles.statusBadge}
        style={{
          background: declaredCount === totalCount ? "var(--success-bg, rgba(46,125,50,0.12))" : "var(--warn-bg, rgba(255,167,38,0.12))",
          color: declaredCount === totalCount ? "var(--success-fg, #2e7d32)" : "var(--warn-fg, #ffa726)",
        }}
      >
        {declaredCount === totalCount ? "✓ " : "⚠ "}{declaredCount}/{totalCount} {countLabel} fully declared
      </span>
    </div>
  );
}

// checklist — the raw (possibly un-normalized) 3-key jsonb value.
// trackLabel — shown in the popup's title; omit/null for the Single case.
// onSave(nextChecklist) — called once, with the full patched checklist,
// when the popup's Save button fires.
export function CopyrightRowStatus({ styles, checklist, trackLabel, onSave }) {
  const [open, setOpen] = useState(false);
  const normalized = normalizeCopyrightChecklist(checklist);
  const declaredCount = COPYRIGHT_ITEMS.filter((item) => copyrightEntryIsDeclared(normalized[item.key])).length;

  async function handleSave(next) {
    await onSave(next);
    setOpen(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={styles.btnSmall}
        style={{ fontSize: 12, padding: "4px 10px", whiteSpace: "nowrap" }}
      >
        {declaredCount > 0 ? "✎ Edit Rights" : "+ Declare Rights"}
      </button>
      {/* Round 165 fix — these pills used to go green off Owner alone
          (copyrightEntryIsDeclared), the same bar as "started," not the
          Owner+Contract+Validity Period bar Send Upload's gate actually
          checks (copyrightChecklistIsComplete). That gap is exactly what
          was reported: AR sees every pill green ("all data filled"), but
          Send Upload still blocks on Copyright Checklist with no visible
          reason why — because one right had its Owner filled but Contract
          or Validity Period left blank, invisible under the old pill.
          Now 3 states instead of 2: green only when that right is FULLY
          complete, amber when it's been started but isn't done yet (with
          a tooltip naming exactly what's still missing), gray when
          untouched. */}
      {COPYRIGHT_ITEMS.map((item) => {
        const entry = normalized[item.key];
        const complete = copyrightEntryIsComplete(entry);
        const declared = copyrightEntryIsDeclared(entry);
        const missing = complete ? [] : copyrightEntryMissingFields(entry);
        const tone = complete
          ? { background: "var(--success-bg, rgba(46,125,50,0.12))", color: "var(--success-fg, #2e7d32)", border: "none" }
          : declared
          ? { background: "var(--warn-bg, rgba(255,167,38,0.12))", color: "var(--warn-fg, #ffa726)", border: "none" }
          : { background: "var(--bg-card)", color: "var(--text-faint)", border: "1px solid var(--border)" };
        return (
          <span
            key={item.key}
            title={complete ? entry.owner : declared ? `Missing: ${missing.join(", ")}` : "Not declared yet"}
            style={{
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 999,
              whiteSpace: "nowrap",
              ...tone,
            }}
          >
            {complete ? "✓ " : declared ? "⚠ " : ""}{rightShortName(item.key)}
          </span>
        );
      })}
      {open && (
        <CopyrightRightsPopup
          trackLabel={trackLabel}
          checklist={normalized}
          onClose={() => setOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function rightShortName(key) {
  if (key === "master") return "Record producer";
  if (key === "vocal") return "Performer";
  if (key === "author") return "Author";
  return key;
}
