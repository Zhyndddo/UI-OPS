# UI shell — BottomBar (pagination + watermark)

Round 284. Request: "top bar, left side bar, and bottom bar — bottom bar is
for paging and this logo watermark." Top bar and left sidebar already
existed (Round 87/246); this adds the third piece: a site-wide fixed bottom
bar that (a) takes over pagination controls from every page that has them,
replacing the inline "Showing X–Y of Z / page size / Prev / Next" block that
used to render inline at the bottom of each table, and (b) shows the VIEENT
logo mark, small, centered.

## Scoping decisions (from the user)

- Fixed bottom bar **replaces** inline pagination everywhere, rather than
  living alongside it (recommended option, confirmed).
- Watermark: small, dead-center in the bar (not a giant background image).
- Shown on **every page**, not just pages with something to paginate right
  now — "we are going to page everything thing since they will pile up any
  way." That's a forward-looking statement, not a promise this round adds
  pagination to lists that don't have it yet (Task Table, Milestone Log,
  etc.) — those stay out of scope until asked for separately.

## Architecture

Same "fixed chrome + reserve the space via a CSS var" pattern TopBar already
established (see TopBar.js / `--topbar-height`), mirrored for the bottom:

- **`app/globals.css`** — new `--bottombar-height: 46px` in `:root`,
  alongside `--topbar-height`. Not theme-specific (not a color), so it's
  defined once, not per-theme.
- **`lib/BottomBarContext.js`** (new) — `BottomBarProvider` /
  `useBottomBarSlot()`. Any number of pages/components can "register" a
  `{left, right}` JSX pair keyed by a stable id (`useId()`); the context
  tracks registration order via a monotonic counter (`orderRef`, not object
  key order, which isn't reliably insertion-ordered) and exposes whichever
  entry registered *most recently* as `active`. That "most recent wins"
  rule is what makes route transitions behave correctly — the outgoing
  page's Pagination instance unmounts (unregisters) as the incoming one
  mounts (registers), and ordinary render/effect timing means there's no
  visible flicker either way.
- **`lib/BottomBar.js`** (new) — the actual fixed bar. `position: fixed,
  bottom: 0, left: isMobile ? 0 : SIDEBAR_WIDTH, right: 0, zIndex: 300`
  (same left-offset idiom as TopBar, same z-index too — they're both shell
  chrome, never expected to overlap each other since one's pinned top and
  the other bottom). Three-region flex layout: left slot (`active?.left`),
  the logo (fixed 24px height, always rendered even when nothing's
  registered), right slot (`active?.right`) — both side regions are
  `flex: 1 1 0`, which is what keeps the logo pinned to the true middle
  regardless of how much content either side has.
- **`lib/Pagination.js`** (rewritten, same external props/signature) — no
  longer renders the controls inline. Instead it builds the same
  count-text + page-size-select + prev/next JSX it always did, and
  registers that into `BottomBarContext` via `useEffect`, returning `null`.
  All 26 existing call sites needed zero changes — same import, same props,
  same JSX position in the caller; the relocation is entirely internal to
  this file.
- **`lib/AppShell.js`** — wraps its existing tree in `<BottomBarProvider>`,
  adds `paddingBottom: "var(--bottombar-height)"` next to the existing
  `paddingTop` on the content column, and renders `<BottomBar
  isMobile={isMobile} />` once, site-wide (after `<BoSungDataReminder />`,
  same level as `<TopBar>`/`<Sidebar>`).
- **`public/vieent-logo-watermark.png`** (new) — cropped from the
  user-supplied banner image (bounding-box crop of non-white/non-transparent
  pixels via PIL) down to just the orange circular mark, transparent PNG,
  213×233px source, rendered at 24px height in the bar.

## Collision sweep

A site-wide fixed bar spanning the bottom ~46px of every page risks
covering anything else that was already anchored near the bottom of the
viewport. Swept every `position: "fixed"` usage in the codebase:

- The large majority are `inset: 0` full-screen modal/overlay backdrops at
  zIndex 400+ — safely above BottomBar's 300, not a concern.
- Two floating "Save" action buttons were real collisions — both were
  `bottom: 24, zIndex: 250` (below BottomBar's 300, and would render
  partly/fully underneath it):
  - `app/releases/[id]/page.js` — floating Save button.
  - `app/new-release/page.js` — floating "Tạo Release" button.
  Fixed by changing `bottom: 24` → `bottom: "calc(var(--bottombar-height) +
  24px)"` on both, so they float just above the bar instead of behind it.
- `lib/Sidebar.js`'s own fixed column (`top: 0, bottom: 0`, zIndex 100) —
  on desktop this never overlaps BottomBar at all (BottomBar's `left:
  SIDEBAR_WIDTH` starts exactly where the sidebar column ends). On mobile,
  though, BottomBar spans the full width (`left: 0`) and outranks the
  drawer's zIndex 100 with its own 300 — so with the drawer open, its
  bottom-most content (the theme light/dark toggle button) would render
  underneath the fixed bottom bar. Fixed by making the drawer's own
  `bottom` mobile-conditional: `bottom: mobile ? "var(--bottombar-height)"
  : 0`, same "stop short by the reserved height" idiom AppShell already
  uses for page content.

No other bottom-anchored fixed elements were found.

## Explicitly out of scope this round

- Adding pagination to lists that don't have any yet (Task Table, Milestone
  Log, etc.) — the user's own framing ("pile up anyway") was forward-
  looking, not a request to do that now.

## Round 285 — mobile layout was broken, now fixed

The desktop single-row layout (count | logo | controls, each region
`overflow: hidden`) was reused unconditionally, including on phones. The
pagination controls alone (page-size select + Prev + "Page X / Y" + Next)
measure ~318px wide with real numbers in them — more than fits in a
375px-wide phone bar even with nothing else in it. `overflow: hidden` on
the right-hand region silently clipped the select and the Prev button off
the left edge; only "Page X / Y" and Next → were ever reachable on mobile.
Confirmed with a Playwright screenshot at 375px before fixing — see
screenshot in this round's delivery notes.

Fix, in `lib/BottomBar.js` (`isMobile` branch) + `app/globals.css`:

- Mobile gets a stacked two-row layout instead of the desktop three-region
  row: logo on its own row up top (shrunk to 16px, still dead-center),
  pagination controls on a full-width row below.
- The count text ("Showing X–Y of Z") is dropped on mobile — no room for
  it once the controls need the whole row; "Page X / Y" already conveys
  position. Desktop keeps it.
- The controls row wraps in `overflow-x: auto` as a safety net — measured
  it against the controls' actual width at 320/375/414px viewports and it
  fits without needing to scroll at any of them, but the scroll fallback
  means even a narrower phone can still reach Next by swiping instead of
  losing it entirely.
- `--bottombar-height` gets a `@media (max-width: 768px)` override (46px →
  78px, same breakpoint `useIsMobile()` uses) for the taller two-row bar.
  Since `AppShell`'s `paddingBottom` and `Sidebar`'s mobile-drawer `bottom`
  offset both read the same CSS var, the extra reserved space follows
  automatically — no separate mobile-specific change needed in either
  file.

Desktop layout/behavior is unchanged.
