"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "./ThemeContext";
import { useAuth } from "./AuthContext";
import NotificationBell from "./NotificationBell";

// Matches the doc: orange bar, click to go home (the Dashboard, not the
// Tools diagnostic), right side shows ONLY the account name, click opens
// Info (role/team display) / Settings / Logout. Real identity now — Info
// shows the actual profiles row, not an editable simulation. "Change
// password" doesn't apply since this app uses magic-link sign-in, no
// password exists.
//
// Design's Overload toggle moved OUT of here — it's specific to Design
// tickets, so it now lives on the Design ticket page itself (see
// app/tickets/design/page.js) instead of floating globally in every
// team's topbar.
const VIEW_AS_ROLES = ["exc", "admin"];
const VIEW_AS_TEAMS = ["AR", "Marketing", "OPS", "Design", "Legal"];

export default function TopBar() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { profile, realProfile, viewAs, setViewAs, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const isRealDev = realProfile?.role === "dev";

  async function handleLogout() {
    setOpen(false);
    await signOut();
    router.push("/login");
  }

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 300 }}>
      <div
        onClick={() => router.push("/releases")}
        style={{
          background: viewAs ? "#7a3fd1" : "var(--accent)",
          color: "var(--accent-on)",
          padding: "10px 20px",
          minHeight: "var(--topbar-height)",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 14,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {viewAs && (
          <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.9 }}>
            👁 Viewing as {viewAs.role}{viewAs.segment ? ` · ${viewAs.segment}` : ""}
          </span>
        )}
        <div onClick={(e) => e.stopPropagation()}>
          <NotificationBell />
        </div>
        <div
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          style={{ cursor: "pointer" }}
        >
          {profile?.name || profile?.email || "Account"} ▾
        </div>
      </div>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "100%",
            right: 20,
            zIndex: 200,
            background: "var(--bg-card)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: 14,
            width: 260,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 6 }}>
              Info
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>
              {profile?.name || "—"} <span style={{ color: "var(--text-dim)" }}>({profile?.email})</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>
              Role: <span style={{ color: "var(--text)" }}>{profile?.role}</span>
              {profile?.segment && <> · Team: <span style={{ color: "var(--text)" }}>{profile.segment}</span></>}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
              Change password doesn't apply — this app uses magic-link sign-in, no password exists.
            </div>
          </div>

          {isRealDev && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 6 }}>
                View As
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 8 }}>
                Preview the app as another role/team — you're still really {realProfile?.name}, this only changes what UI renders.
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <select
                  value={viewAs?.role || ""}
                  onChange={(e) => setViewAs(e.target.value ? { role: e.target.value, segment: viewAs?.segment || VIEW_AS_TEAMS[0] } : null)}
                  style={{ flex: 1, fontSize: 11, padding: "5px 6px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 4 }}
                >
                  <option value="">— Me (dev) —</option>
                  {VIEW_AS_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <select
                  value={viewAs?.segment || ""}
                  disabled={!viewAs}
                  onChange={(e) => setViewAs(viewAs ? { ...viewAs, segment: e.target.value } : null)}
                  style={{ flex: 1, fontSize: 11, padding: "5px 6px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 4, opacity: viewAs ? 1 : 0.5 }}
                >
                  {VIEW_AS_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {viewAs && (
                <button
                  onClick={() => setViewAs(null)}
                  style={{ width: "100%", background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "5px 0", fontSize: 11, fontWeight: 700, color: "var(--text)", cursor: "pointer" }}
                >
                  Reset to me
                </button>
              )}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 6 }}>
              Settings
            </div>
            <button
              onClick={toggleTheme}
              style={{ width: "100%", background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "6px 0", fontSize: 11, fontWeight: 700, color: "var(--text)", cursor: "pointer", marginBottom: 6 }}
            >
              {theme === "dark" ? "☀ Switch to Light" : "☾ Switch to Dark"}
            </button>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              Zoom, Language — not built yet.
            </div>
          </div>

          <button
            onClick={handleLogout}
            style={{ width: "100%", background: "transparent", border: "1px solid var(--error-border)", color: "var(--error-fg)", borderRadius: 4, padding: "6px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
