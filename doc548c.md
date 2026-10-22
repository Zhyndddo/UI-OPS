# Round 548c — switcher layout choice (Auto / Row / Column) + one cycle button

Request: "let's do both, and allow user to change in config (or a button … like the theme switcher), but please also do the tab switch I ask above" (no page numbers in the row layout; ONE button that swaps between the banners in order).

## What changed (tester account only, as in 548/548b)
- **Choice:** topbar account menu → Settings → "Section switcher": **Auto** (one row when every banner fits, otherwise a column), **Row** (always a row; phones still get a column), **Column** (always a column). Stored per browser like the theme (`switcherLayout` in localStorage; new lib/switcherPrefs.js). Default Auto.
- **One cycle button** replaces the page numbers in every layout: "⇄ 1/3" — each click shows the next set of banners in order, wrapping round. It only appears when the banners don't fit in one set. The "—" quick list (numbered dropdown) still appears when there are more than 3 sets.
- Phones: always the vertical column.

## Files
lib/SectionSwitcher.js, lib/switcherPrefs.js (new), lib/TopBar.js (Settings row). Replaces the 548b SectionSwitcher. No SQL.

## Going global later
Drop the tester check in TopBar (`showSwitcherPref`) along with the other gates listed in doc548.md.

## Checked
next build clean. Chromium: Auto → column when the row can't hold everything; Row → one row + "⇄ 1/N", clicking cycles to the next set; Column → column; phone width → column even with Row saved. Not tested against the live app.
