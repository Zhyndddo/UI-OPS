"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "./ThemeContext";
import { useAuth } from "./AuthContext";
import { supabase } from "./supabaseClient";
import NotificationBell from "./NotificationBell";
import { ROLE_LABELS } from "./permissions";

// Matches the doc: orange bar, click to go home (the Dashboard, not the
// Tools diagnostic), right side shows ONLY the account name, click opens
// Info (role/team display) / Settings / Logout. Real identity now — Info
// shows the actual profiles row, not an editable simulation. "Change
// password" used to say "doesn't apply" (magic-link sign-in, no password
// existed) — per explicit request, Info now has a real "Change Password"
// control. Supabase Auth's `updateUser({ password })` works on any signed-
// in session regardless of how they signed in, so this SETS a password on
// top of magic-link — it doesn't replace or disable magic-link sign-in,
// which still works exactly as before.
//
// Design's Overload toggle moved OUT of here — it's specific to Design
// tickets, so it now lives on the Design ticket page itself (see
// app/tickets/design/page.js) instead of floating globally in every
// team's topbar.
// Round 57 — added "teamlead" now that it's a real rank between exc and
// admin (see lib/permissions.js). "dev" is deliberately never an option
// here — you can't view-as the top rank, only look down from it.
const VIEW_AS_ROLES = ["exc", "teamlead", "admin"];
// Same real-assignable-team list as app/config/page.js's TEAMS (OPS
// hidden, split into Youtube/Publishing/Operation) — see lib/teamTypes.js.
const VIEW_AS_TEAMS = ["AR", "Marketing", "Design", "Youtube", "Publishing", "Operation", "Legal"];

export default function TopBar() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { profile, realProfile, viewAs, setViewAs, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const isRealDev = realProfile?.role === "dev";
  const [pwOpen, setPwOpen] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState(null); // { type: "error" | "success", text }

  async function handleChangePassword() {
    setPwMessage(null);
    if (pw1.length < 6) {
      setPwMessage({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }
    if (pw1 !== pw2) {
      setPwMessage({ type: "error", text: "Passwords don't match." });
      return;
    }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setPwSaving(false);
    if (error) {
      setPwMessage({ type: "error", text: error.message });
      return;
    }
    setPw1("");
    setPw2("");
    setPwMessage({ type: "success", text: "Password set — you can now sign in with it, or keep using magic-link." });
  }

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
              Role: <span style={{ color: "var(--text)" }}>{ROLE_LABELS[profile?.role] || profile?.role}</span>
              {profile?.segment && <> · Team: <span style={{ color: "var(--text)" }}>{profile.segment}</span></>}
            </div>
            {!pwOpen ? (
              <button
                onClick={() => { setPwOpen(true); setPwMessage(null); }}
                style={{ marginTop: 6, background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: "var(--text)", cursor: "pointer" }}
              >
                Change Password
              </button>
            ) : (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 6 }}>
                  Sets a password on your account — magic-link sign-in still works either way.
                </div>
                <input
                  type="password"
                  placeholder="New password"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", fontSize: 11, padding: "6px 8px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 4, marginBottom: 6 }}
                />
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", fontSize: 11, padding: "6px 8px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 4, marginBottom: 6 }}
                />
                {pwMessage && (
                  <div style={{ fontSize: 10, marginBottom: 6, color: pwMessage.type === "error" ? "var(--error-fg)" : "var(--success-fg)" }}>
                    {pwMessage.text}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={handleChangePassword}
                    disabled={pwSaving}
                    style={{ flex: 1, background: "var(--accent)", color: "var(--accent-on)", border: "none", borderRadius: 4, padding: "6px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                  >
                    {pwSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => { setPwOpen(false); setPw1(""); setPw2(""); setPwMessage(null); }}
                    style={{ flex: 1, background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "6px 0", fontSize: 11, fontWeight: 700, color: "var(--text)", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
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
                  {VIEW_AS_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
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
