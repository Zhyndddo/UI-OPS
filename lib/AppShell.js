"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Sidebar, { SIDEBAR_WIDTH } from "./Sidebar";
import TopBar from "./TopBar";
import { useAuth } from "./AuthContext";
import { useIsMobile } from "./useIsMobile";

// Wraps internal (staff-facing) pages with auth-gating + the sidebar +
// topbar. Deliberately NOT applied at the root layout level — the
// magic-link picker page (/pick-package/[token]) is for external artists,
// must never require login, and must never show internal navigation.
//
// Round 87 — mobile app shell, phase 1 of the mobile plan (see
// DATA_FIXES.md). Below the 768px breakpoint the sidebar becomes an
// off-canvas drawer (starts closed, opened via TopBar's hamburger) instead
// of a permanently-docked 250px column eating a third of a phone screen;
// content drops its marginLeft to 0 to match. Desktop is completely
// unaffected — isMobile stays false, sidebar renders open exactly as
// before, marginLeft stays SIDEBAR_WIDTH.
export default function AppShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, profile, loading, notInRoster, signOut, recheckRoster } = useAuth();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) {
      router.push("/login");
    }
  }, [loading, session, router]);

  // Auto-close the drawer on any navigation — covers every way a page can
  // change (nav Link clicks, the topbar's own click-to-go-home, logout's
  // router.push), not just the sidebar's own Link onClick handlers.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>Loading…</div>;
  }

  if (!session) {
    return null; // redirecting to /login
  }

  if (notInRoster) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
            Not on the team roster yet
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
            You're signed in, but this email isn't in the system yet. Ask an admin or dev to add you on
            the Team page before you can access anything here.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={recheckRoster}
              style={{ background: "var(--accent)", border: "none", borderRadius: 6, padding: "8px 20px", color: "var(--accent-on)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
            >
              Try Again
            </button>
            <button
              onClick={signOut}
              style={{ background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "8px 20px", color: "var(--text)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Sidebar open={isMobile ? sidebarOpen : true} onClose={() => setSidebarOpen(false)} mobile={isMobile} />
      <div style={{ marginLeft: isMobile ? 0 : SIDEBAR_WIDTH, minHeight: "100vh" }}>
        <TopBar isMobile={isMobile} onMenuClick={() => setSidebarOpen(true)} />
        {children}
      </div>
    </>
  );
}
