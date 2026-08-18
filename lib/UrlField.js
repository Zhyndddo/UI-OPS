"use client";

import { useState } from "react";

// One universal pattern for every URL field in the app. Collapses to a
// plain single-line box by default (matching a normal input, no extra
// chrome) — grows into a multi-line textarea, with a list of
// individually-openable links below, once there are 2+ URLs in it. Stored
// as one newline-joined string in the same text column that already
// existed — no schema change.
//
// Round 157 — fixed a real dead-end: `isMulti` used to be derived ONLY
// from the stored value already containing 2+ newline-separated URLs, but
// a plain single-line `<input>` element cannot contain a newline
// character at all — typing Enter does nothing, and pasting multi-line
// text into it gets flattened by the browser. So there was no way to
// actually GET to 2 URLs through this UI in the first place; the
// multi-line mode only ever showed up for values that arrived
// pre-populated with a newline some other way (an import script, direct
// DB edit). Reported against Link Sound TikTok specifically ("not really
// allow multiple url... quite short field comparing to others") but this
// was a bug in the shared component, affecting every URL field. Fixed by
// adding a small "+ Add another link" control that explicitly switches to
// multi-line mode (a real `<textarea>`, which DOES accept Enter/newlines)
// — `manualMulti` local state keeps it in that mode even while the count
// dips back to 0/1 mid-edit, rather than snapping back to the cramped
// single-line box on every keystroke.
//
// Round 88 follow-up 5 — `wide` opt-in, off by default everywhere this was
// already in use (Booking Board table cells, ticket forms, etc. all keep
// the original tight caps below — this changes nothing for them). Only the
// release detail page's URL tab passes `wide` — its fields sit in a full
// two-column form grid, not a narrow table column, so the ~110/150px caps
// from Round 80/81 (added specifically so a long URL/warning couldn't
// stretch a table column) were making every field look oddly short there
// for no reason relevant to that page. `wide` just drops the cap and lets
// the field fill its container's actual width instead.
export default function UrlField({ value, onChange, onBlur, styles, placeholder, disabled, disabledTitle, wide }) {
  const [manualMulti, setManualMulti] = useState(false);
  const urls = (value || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const isMulti = urls.length >= 2 || manualMulti;

  // Locked state — e.g. Smartlink while a release is in priority pitching
  // mode (see app/releases/[id]/page.js). Renders as a plain disabled box,
  // not editable, with the reason available as a hover title (truncated
  // to one line so it doesn't blow out narrow table cells).
  if (disabled) {
    return (
      // Round 80 — capped at maxWidth so a long URL/warning text can't
      // stretch its table column ("over-extend"). Round 81 item 3 —
      // tightened further to roughly the pixel width of "https://abc" per
      // the user's literal ask (was a much more generous 320).
      <div style={{ position: "relative", maxWidth: wide ? "none" : 110, width: wide ? "100%" : undefined }}>
        <input
          className={styles.input}
          style={{ opacity: 0.5, cursor: "not-allowed", paddingRight: urls.length === 1 ? 30 : undefined }}
          value={value || ""}
          disabled
          readOnly
          title={disabledTitle}
        />
        {urls.length === 1 && (
          <a
            href={urls[0]}
            target="_blank"
            rel="noopener noreferrer"
            title={urls[0]}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, textDecoration: "none" }}
          >
            🔗
          </a>
        )}
        {disabledTitle && (
          <div
            title={disabledTitle}
            style={{ fontSize: 10, color: "var(--error-fg, #e57373)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            ⚠ {disabledTitle}
          </div>
        )}
      </div>
    );
  }

  if (!isMulti) {
    return (
      // Round 80 — same maxWidth cap as the disabled branch above.
      // Round 81 item 3 — tightened to ~"https://abc" width, see above.
      <div style={{ maxWidth: wide ? "none" : 110, width: wide ? "100%" : undefined }}>
        <div style={{ position: "relative" }}>
          <input
            className={styles.input}
            style={{ width: "100%", boxSizing: "border-box", paddingRight: urls.length === 1 ? 30 : undefined }}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={placeholder || "https://…"}
          />
          {urls.length === 1 && (
            <a
              href={urls[0]}
              target="_blank"
              rel="noopener noreferrer"
              title={urls[0]}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, textDecoration: "none" }}
            >
              🔗
            </a>
          )}
        </div>
        {/* Round 157 — the only way to actually reach 2 URLs: a plain
            <input> can't hold a newline no matter what the user types or
            pastes, so switching to the real multi-line textarea has to be
            an explicit action, not something that emerges from typing. */}
        <button
          type="button"
          onClick={() => setManualMulti(true)}
          style={{ background: "none", border: "none", color: "var(--accent-soft)", fontSize: 10, cursor: "pointer", padding: "3px 0 0", display: "block" }}
        >
          + Add another link
        </button>
      </div>
    );
  }

  return (
    // Round 80 — same maxWidth cap as the two branches above. Round 81
    // item 3 — the multi-URL editing textarea keeps a little more room
    // than the single-URL display boxes (150 vs 110) since it's an actual
    // edit surface for pasting several links, not a read-only display.
    <div style={{ maxWidth: wide ? "none" : 150, width: wide ? "100%" : undefined }}>
      <textarea
        className={styles.textarea}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder || "https://…\nhttps://…"}
        // Round 157 — was rows={urls.length}, which is 0 or 1 right after
        // switching into multi-line mode via "+ Add another link" (before
        // a 2nd URL has actually been typed) — collapsed right back down
        // to the same cramped single-line height the button was meant to
        // escape. Floors at 2 so there's always visible room for a 2nd
        // line to type into.
        rows={Math.max(urls.length, 2)}
        style={{ fontSize: 13, minHeight: 0, width: "100%", boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6, alignItems: "center" }}>
        {urls.map((u, i) => (
          <a
            key={i}
            href={u}
            target="_blank"
            rel="noopener noreferrer"
            title={u}
            style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}
          >
            🔗 Link {i + 1}
          </a>
        ))}
        {/* Round 158 — explicit collapse-back control, per request ("if
            they don't really have more than 1 link, auto convert back... or
            a button, whichever's alright"). Chose a button over auto-revert
            — auto-collapsing on blur/change risked feeling jarring mid-edit
            (e.g. losing a freshly-added blank 2nd line the moment focus
            left). Safe by construction: isMulti is `urls.length >= 2 ||
            manualMulti`, so if 2+ real URLs are still present this is a
            no-op (immediately re-expands) — it can only actually collapse
            once there's genuinely 0 or 1 URL left. */}
        {urls.length <= 1 && (
          <button
            type="button"
            onClick={() => setManualMulti(false)}
            style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 10, cursor: "pointer", padding: 0 }}
          >
            − Collapse to single link
          </button>
        )}
      </div>
    </div>
  );
}
