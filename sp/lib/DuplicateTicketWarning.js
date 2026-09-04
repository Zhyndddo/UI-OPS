"use client";

// Round 167 — the ONE popup shape for every "one ticket per key" warning
// across the app (see claude/one-ticket-per-key-rule.md), starting with
// Artist Profile this round. Deliberately warning-ONLY per explicit
// request — "only warning, no bypass confirm" — there is no "create it
// anyway" button here. Whatever was skipped stays skipped; a genuinely
// new request for that same key has to go through that ticket type's own
// list page ("+ New Ticket"), not through re-ticking the same gate.
//
// items: array of plain strings — whatever should read as "already
// exists" (an artist name, a release title, etc.), already resolved by
// the caller; this component doesn't know or care what a "key" means for
// any given ticket type.
export default function DuplicateTicketWarning({ items, onClose, title, note }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 24, maxWidth: 460, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>⚠ {title || "Already exists — skipped"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 0, marginBottom: 12 }}>
          {note || "These already have a ticket, so a duplicate wasn't created for them. The rest of your Save went through normally."}
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
          {items.map((label) => <li key={label}>{label}</li>)}
        </ul>
        <button onClick={onClose} style={{ marginTop: 18, width: "100%", padding: "8px 14px", borderRadius: 6, border: "none", background: "#ff6b1a", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          OK
        </button>
      </div>
    </div>
  );
}
