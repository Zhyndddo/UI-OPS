"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useTheme } from "./ThemeContext";

const NAV = [
  { num: "01", label: "Dashboard", href: "/releases" },
  { num: "02", label: "New Release", href: "/new-release" },
  { num: "03", label: "Booking", href: "/booking" },
  { num: "04", label: "Tickets", href: "/tickets" },
  { num: "05", label: "Artists", href: "/artists" },
  { num: "06", label: "Labels", href: "/labels" },
  { num: "07", label: "Summary", href: "/summary" },
  { num: "08", label: "Tools", href: "/" },
];

export const SIDEBAR_WIDTH = 250;

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [totalReleases, setTotalReleases] = useState(null);

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
        {NAV.map((item) => {
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
