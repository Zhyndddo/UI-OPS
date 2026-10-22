# Round 548b — corner switcher: horizontal on desktop, vertical on mobile; "All …" fixed

Feedback on 548: "vertical for mobile, horizontal for desktop. And the 'All workstation' may be hooked wrong — it just refreshes the current page."

## Changes (lib/SectionSwitcher.js only; replaces the 548 copy)
- **Desktop:** banners now sit in ONE horizontal row to the left of the button and fan out leftwards from the button (nearest banner first). If they do not fit the width (sidebar and button width are taken off), they split into rows; the numbers left of the button swap the row; more than 3 rows adds the "—" quick list (a numbered dropdown under the button).
- **Mobile (≤ the app's mobile breakpoint):** unchanged vertical stack under the button.
- **"All Workstations / All Tickets":** the index page (/workstation, /tickets) jumps straight to the last type you used (`last_workstation_type` / `last_ticket_type` in this browser), so the link landed back on the same page. The banner now clears that memory first, exactly like the old "← All …" button did, so the picker opens.
- Row splitting uses an estimate of each banner's width (label length), so a row can occasionally hold one banner fewer than would physically fit; nothing overflows.

## Files
lib/SectionSwitcher.js (+ this doc). No SQL. Tester account only, as in 548.

## Checked
next build clean. Chromium test: 1600px wide → 2 rows with numbers; 1000px → 5 rows + dash; 420px mobile → vertical stack; "All Workstations" clears the saved type and goes to /workstation. Not tested against the live app.
