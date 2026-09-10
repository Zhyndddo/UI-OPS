"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useTheme } from "./ThemeContext";
import { useAuth } from "./AuthContext";
import { canRunPackageSimulator, isAdminOrAbove } from "./permissions";
import { loadMyActiveSecretMessages, getHiddenSecretMessageIds } from "./secretMessages";

const NAV = [
  { label: "Dashboard", href: "/releases" },
  { label: "Workstation", href: "/workstation" },
  { label: "Tickets", href: "/tickets" },
  // Round 56 added "Report" (coherent read across releases/booking/package
  // data — tables + charts). Round 57 merged the old standalone "Summary"
  // worklist (per-team not-done counts) into Report as a second tab ("Team
  // Worklist"), so there's just one nav entry now. /summary still works —
  // it redirects to /report — but isn't linked from the sidebar anymore.
  // Round 255 — devOnly per explicit request ("lock the report sidebar
  // item for dev role only"). Same convention every other role gate in
  // this app already uses (there's no real access control anywhere — see
  // sql/reference/prod_schema_clean.sql, no RLS at all — so "hide the nav
  // link" IS the actual gate, same as Tools/Task Table etc. being visible
  // to everyone by design); app/report/page.js itself has no matching
  // redirect guard, consistent with that same convention.
  // Round 273 — widened from dev-only to admin-and-up (isAdminOrAbove,
  // lib/permissions.js's 4-tier model — admin AND dev both pass now), per
  // explicit request ("add admin role to the sidebar item report").
  { label: "Report", href: "/report", adminOnly: true },
  // Round 82 item 1 — read-only compiled overview of every workstation +
  // ticket type, one row each with a clickable row count.
  { label: "Task Table", href: "/task-table" },
  // Round 172 item 3 — kanban calendar of releases (last/this/next week,
  // grouped by pipeline stage), per explicit request.
  { label: "Calendar", href: "/calendar" },
  // Round 155 item 1 — compiled external-tools directory (team-per-tab,
  // grouped by page). Visible to everyone (view-only) same as every NAV
  // entry above — editing is dev-gated INSIDE the page itself, not by
  // hiding the sidebar link. Desktop-only content, but the link itself
  // still shows on mobile per explicit request ("mobile only get the
  // sidebar item") — see app/tool-directory/page.js's mobile branch.
  { label: "Tools", href: "/tool-directory" },
  // ============================================================================
  // Round 85 — TEMPORARY sidebar entry for a short-lived survey. Per
  // explicit request: delete this line (and the whole feature — see
  // DATA_FIXES.md's "Round 85" entry for the full checklist) once results
  // have been reported out, roughly 3-4 rounds from now.
  // ============================================================================
  { label: "Team Building Survey", href: "/team-building-survey" },
];
// Pulled out of the Tickets switcher onto the main sidebar directly, per
// request — "Khác" (the shared catch-all ticket type every team can use)
// gets its own top-level shortcut instead of being one option among many
// once you're already inside Tickets. Its label is admin-editable (Config
// -> Sidebar Label, dev-only) via app_settings.khac_sidebar_label — this
// is just the fallback shown before that setting loads or if it's never
// been set. See DEFAULT_KHAC_LABEL below.
//
// Position: always last, below everything else the current user has in
// their sidebar (including AR_NAV, which it used to sit above) — per
// explicit request. Numbers are no longer hardcoded per item; they're
// assigned by final array position in navItems below, so Khác always gets
// whatever number is last regardless of whether AR_NAV is shown.
const KHAC_HREF = "/tickets/khac";
const DEFAULT_KHAC_LABEL = "Cứu mạng Zhyn ơi";
// New Release, Tools, Artists, and Labels are deliberately not in the
// main nav for everyone else — Artists/Labels live in Reference (sidebar
// bottom) already, no need for a duplicate top-level entry. AR is the
// exception: they're the team that actually owns/maintains these two
// tables day to day, so they get direct top-level shortcuts too (in
// addition to, not instead of, the Reference entries everyone else uses).
const AR_NAV = [
  { label: "Artist List", href: "/artists" },
  { label: "Label List", href: "/labels" },
];
// Round 153 — item 3: new top-level shortcut straight to the New Release
// creation form (/new-release), dev-only per explicit request. Kept as
// its own small array (like AR_NAV) rather than folded into the shared
// NAV list, since it's conditionally spliced in below based on role.
const DEV_NAV = [{ label: "NEW REQUEST", href: "/new-release" }];

export const SIDEBAR_WIDTH = 250;

// Round 87 — open/onClose are only meaningful on mobile (see AppShell.js):
// desktop always passes open=true + mobile=false, so the transform below
// stays translateX(0), no backdrop/close-button render, and nothing here
// changes visually from before. onClose is always passed (even on desktop,
// where calling it is a harmless no-op — AppShell forces open=true
// regardless of its internal sidebarOpen state) so every Link below can
// close the drawer after navigating without extra plumbing.
export default function Sidebar({ open = true, onClose, mobile = false }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { profile } = useAuth();
  const [totalReleases, setTotalReleases] = useState(null);
  const [khacLabel, setKhacLabel] = useState(DEFAULT_KHAC_LABEL);
  const [secretMessages, setSecretMessages] = useState([]);
  const [secretPopup, setSecretPopup] = useState(null);
  const showArNav = profile?.segment === "AR" || profile?.role === "dev";
  const showPackageRunner = canRunPackageSimulator(profile);
  const isDev = profile?.role === "dev";
  const isAdminUp = isAdminOrAbove(profile);
  // Khác goes last, after AR_NAV/DEV_NAV — see the comment above
  // AR_NAV/KHAC_HREF. DEV_NAV placed after AR_NAV, same "extra shortcut
  // for a specific audience, above Khác" pattern. devOnly/adminOnly items
  // (just Report, Round 255/273) are dropped for anyone else before
  // numbering, so numbers stay contiguous instead of skipping.
  const navItems = [...NAV, ...(showArNav ? AR_NAV : []), ...(isDev ? DEV_NAV : []), { label: khacLabel, href: KHAC_HREF }]
    .filter((item) => !item.devOnly || isDev)
    .filter((item) => !item.adminOnly || isAdminUp)
    .map((item, i) => ({ ...item, num: String(i + 1).padStart(2, "0") }));

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "khac_sidebar_label")
      .maybeSingle()
      .then(({ data }) => { if (typeof data?.value === "string" && data.value.trim()) setKhacLabel(data.value); });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("releases")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => setTotalReleases(count ?? 0));
  }, []);

  // Round 269 — Secret Messages: polls the same way NotificationBell does
  // (every 30s, matching that existing convention rather than adding a
  // second polling cadence to reason about). The nav link only renders at
  // all while secretMessages.length > 0 — same "hide the link IS the gate"
  // convention as every other role-scoped item here (see the Report entry's
  // comment above), so there is deliberately no dedicated permission check
  // beyond "does a message actually target you right now."
  //
  // The one-time popup uses localStorage (not sessionStorage) keyed by
  // profile id, so a message pops up once per person, not once per browser
  // tab/session — closing and reopening the tab a minute later shouldn't
  // re-surface something they already saw pop up once already. Only the
  // MOST RECENT unseen message pops up on any given poll (not one popup per
  // message) to avoid stacking dialogs if several arrived at once.
  //
  // Round 297 — also filters out anything this profile has hidden for
  // themselves (see secretMessages.js's getHiddenSecretMessageIds). Hiding
  // is separate from the dev-side permanent record: it only drops the
  // message out of THIS profile's badge count/link-visibility/list, same
  // "hide the link IS the gate" convention, one filter earlier.
  useEffect(() => {
    if (!supabase || !profile?.id) return;
    let cancelled = false;
    async function poll() {
      const allRows = await loadMyActiveSecretMessages(supabase, profile);
      if (cancelled) return;
      const hidden = getHiddenSecretMessageIds(profile.id);
      const rows = allRows.filter((m) => !hidden.includes(m.id));
      setSecretMessages(rows);
      let seen = [];
      try {
        seen = JSON.parse(window.localStorage.getItem(`vieent_secret_seen_${profile.id}`) || "[]");
      } catch {}
      const unseen = rows.filter((m) => !seen.includes(m.id));
      if (unseen.length > 0) {
        setSecretPopup(unseen[0]);
      }
    }
    poll();
    const interval = setInterval(poll, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [profile?.id]);

  function dismissSecretPopup() {
    if (!secretPopup || !profile?.id) { setSecretPopup(null); return; }
    try {
      const seen = JSON.parse(window.localStorage.getItem(`vieent_secret_seen_${profile.id}`) || "[]");
      window.localStorage.setItem(`vieent_secret_seen_${profile.id}`, JSON.stringify([...seen, secretPopup.id].slice(-200)));
    } catch {}
    setSecretPopup(null);
  }

  return (
    <>
      {/* Round 269 — Secret Messages popup. Rendered fixed at the top level
          (not inside the sidebar's own fixed-width column) so it's never
          clipped by it, and above everything else (z-index 400, higher
          than TopBar's 300) since a secret message is meant to interrupt. */}
      {secretPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 24, maxWidth: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>🔒 SECRET MESSAGE</div>
            <div style={{ fontSize: 13, color: "var(--text)", whiteSpace: "pre-wrap", marginBottom: 18 }}>{secretPopup.message}</div>
            <button onClick={dismissSecretPopup} style={{ background: "var(--accent)", border: "none", borderRadius: 6, padding: "8px 20px", color: "var(--accent-on)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
              Got it
            </button>
          </div>
        </div>
      )}
      {/* Round 87 — backdrop, mobile-drawer mode only. Tapping it closes
          the drawer the same as tapping a nav link does. */}
      {mobile && open && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99 }}
        />
      )}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          // Round 284 — on desktop the new BottomBar starts at left:
          // SIDEBAR_WIDTH (see BottomBar.js), so it never overlaps this
          // column at all and bottom:0 here is still correct. On mobile
          // BottomBar spans the full width (left:0) and outranks this
          // drawer's zIndex 100 with its own 300, so without this the
          // drawer's bottom-most content (the theme toggle button, see
          // below) would render UNDER the fixed bottom bar whenever the
          // drawer is open — stop the column short by that same height
          // instead, same idiom AppShell already uses for page content.
          bottom: mobile ? "var(--bottombar-height)" : 0,
          width: SIDEBAR_WIDTH,
          background: "var(--bg)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          zIndex: 100,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.2s ease",
          boxShadow: mobile && open ? "4px 0 24px rgba(0,0,0,0.4)" : "none",
        }}
      >
      <div style={{ padding: "24px 20px 16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div
              style={{
                width: 20, height: 20, borderRadius: "50%",
                background: "var(--accent)", flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: 1 }}>VIEENT</span>
          </div>
          <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, letterSpacing: 1 }}>
            // PROJECT MGMT
          </div>
        </div>
        {mobile && (
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 2 }}
          >
            ✕
          </button>
        )}
      </div>

      <div style={{ borderBottom: "2px solid var(--accent)", marginBottom: 8 }} />

      <nav style={{ flex: 1, overflowY: "auto" }}>
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 20px",
                textDecoration: "none",
                color: active ? "var(--accent)" : "var(--text)",
                background: active ? "var(--bg-hover)" : "transparent",
                borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                fontSize: 13,
                fontWeight: active ? 700 : 400,
              }}
            >
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{item.num}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ borderTop: "1px solid var(--border)", padding: "10px 20px" }}>
        <Link
          href="/reference"
          style={{
            display: "block",
            padding: "6px 0",
            fontSize: 12,
            color: pathname === "/reference" ? "var(--accent)" : "var(--text-muted)",
            textDecoration: "none",
          }}
        >
          Reference
        </Link>
        <Link
          href="/config"
          style={{
            display: "block",
            padding: "6px 0",
            fontSize: 12,
            color: pathname === "/config" ? "var(--accent)" : "var(--text-muted)",
            textDecoration: "none",
          }}
        >
          Config
        </Link>
        {/* Round 269 — Secret Messages. Only rendered at all while there's
            an active message targeted at this profile — see the polling
            effect above and its comment for why that alone is the gate. */}
        {secretMessages.length > 0 && (
          <Link
            href="/secret-messages"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 0",
              fontSize: 12,
              color: pathname === "/secret-messages" ? "var(--accent)" : "var(--text-muted)",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            🔒 Secret ({secretMessages.length})
          </Link>
        )}
        {/* Round 58 — Package Runner. Only shown to admins on the
            Marketing team + dev (see canRunPackageSimulator), unlike
            Config/Reference above which everyone sees (Config self-gates
            per-tab instead). This one's a niche operational tool, not
            worth surfacing to roles that can never use it. */}
        {showPackageRunner && (
          <Link
            href="/package-runner"
            style={{
              display: "block",
              padding: "6px 0",
              fontSize: 12,
              color: pathname === "/package-runner" ? "var(--accent)" : "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            Package Runner
          </Link>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px" }}>
        <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
          // TOTAL
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 2 }}>
          {totalReleases === null ? "…" : totalReleases}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Releases</div>

        <button
          onClick={toggleTheme}
          style={{
            width: "100%",
            background: "transparent",
            border: "1px solid var(--border-strong)",
            borderRadius: 6,
            padding: "8px 0",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          {theme === "dark" ? "☀ LIGHT" : "☾ DARK"}
        </button>
      </div>
      </div>
    </>
  );
}
