"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useTheme } from "./ThemeContext";
import { useAuth } from "./AuthContext";

const NAV = [
  { num: "01", label: "Dashboard", href: "/releases" },
  { num: "02", label: "Workstation", href: "/workstation" },
  { num: "03", label: "Tickets", href: "/tickets" },
  { num: "04", label: "Summary", href: "/summary" },
];
// Pulled out of the Tickets switcher onto the main sidebar directly, per
// request — "Khác" (the shared catch-all ticket type every team can use)
// gets its own top-level shortcut instead of being one option among many
// once you're already inside Tickets. Its label is admin-editable (Config
// -> Sidebar Label, dev-only) via app_settings.khac_sidebar_label — this
// is just the fallback shown before that setting loads or if it's never
// been set. See DEFAULT_KHAC_LABEL below.
const KHAC_HREF = "/tickets/khac";
const DEFAULT_KHAC_LABEL = "Cứu mạng Zhyn ơi";
// New Release, Tools, Artists, and Labels are deliberately not in the
// main nav for everyone else — Artists/Labels live in Reference (sidebar
// bottom) already, no need for a duplicate top-level entry. AR is the
// exception: they're the team that actually owns/maintains these two
// tables day to day, so they get direct top-level shortcuts too (in
// addition to, not instead of, the Reference entries everyone else uses).
const AR_NAV = [
  { num: "06", label: "Artist List", href: "/artists" },
  { num: "07", label: "Label List", href: "/labels" },
];

export const SIDEBAR_WIDTH = 250;

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { profile } = useAuth();
  const [totalReleases, setTotalReleases] = useState(null);
  const [khacLabel, setKhacLabel] = useState(DEFAULT_KHAC_LABEL);
  const showArNav = profile?.segment === "AR" || profile?.role === "dev";
  const navItems = [...NAV, { num: "05", label: khacLabel, href: KHAC_HREF }, ...(showArNav ? AR_NAV : [])];

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
      }}
    >
      <div style={{ padding: "24px 20px 16px" }}>
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
  );
}
