"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useTheme } from "./ThemeContext";
import { useAuth } from "./AuthContext";
import { canRunPackageSimulator } from "./permissions";

const NAV = [
  { label: "Dashboard", href: "/releases" },
  { label: "Workstation", href: "/workstation" },
  { label: "Tickets", href: "/tickets" },
  // Round 56 added "Report" (coherent read across releases/booking/package
  // data — tables + charts). Round 57 merged the old standalone "Summary"
  // worklist (per-team not-done counts) into Report as a second tab ("Team
  // Worklist"), so there's just one nav entry now. /summary still works —
  // it redirects to /report — but isn't linked from the sidebar anymore.
  { label: "Report", href: "/report" },
  // Round 82 item 1 — read-only compiled overview of every workstation +
  // ticket type, one row each with a clickable row count.
  { label: "Task Table", href: "/task-table" },
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
  const showArNav = profile?.segment === "AR" || profile?.role === "dev";
  const showPackageRunner = canRunPackageSimulator(profile);
  // Khác goes last, after AR_NAV — see the comment above AR_NAV/KHAC_HREF.
  const navItems = [...NAV, ...(showArNav ? AR_NAV : []), { label: khacLabel, href: KHAC_HREF }].map(
    (item, i) => ({ ...item, num: String(i + 1).padStart(2, "0") })
  );

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

  return (
    <>
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
          bottom: 0,
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
