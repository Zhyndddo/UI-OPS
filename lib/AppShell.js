"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar, { SIDEBAR_WIDTH } from "./Sidebar";
import TopBar from "./TopBar";
import { useAuth } from "./AuthContext";

// Wraps internal (staff-facing) pages with auth-gating + the sidebar +
// topbar. Deliberately NOT applied at the root layout level — the
// magic-link picker page (/pick-package/[token]) is for external artists,
// must never require login, and must never show internal navigation.
export default function AppShell({ children }) {
  const router = useRouter();
  const { session, profile, loading, notInRoster, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !session) {
      router.push("/login");
    }
  }, [loading, session, router]);

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
          <button
            onClick={signOut}
            style={{ background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "8px 20px", color: "var(--text)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      <div style={{ marginLeft: SIDEBAR_WIDTH, minHeight: "100vh" }}>
        <TopBar />
        {children}
      </div>
    </>
  );
}
