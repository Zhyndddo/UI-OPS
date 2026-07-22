"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "./ThemeContext";
import { useCurrentUser } from "./CurrentUserContext";

const ROLES = ["Admin", "Dev", "OPS", "AR", "Marketing"];

// Matches the doc exactly: orange bar, click to go home, right side shows
// ONLY the account name, click opens Info / Settings / Logout. Since
// there's no real auth yet, "account name" is the simulated identity from
// CurrentUserContext — Info/Logout are honest about being placeholders
// rather than pretending to do something they can't.
export default function TopBar() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { name, role, setName, setRole } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);

  function handleLogout() {
    // No real session to end — this just clears the simulated identity
    // and sends you back to the default page, matching "click to return
    // to default view" for the bar itself.
    setName("Guest");
    setOpen(false);
    router.push("/");
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => router.push("/")}
        style={{
          background: "var(--accent)",
          color: "var(--accent-on)",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <div
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          style={{ cursor: "pointer" }}
        >
          {name} ▾
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
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
            No real login yet — this is a locally-simulated identity, not a real account.
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 6 }}>
              Info
            </div>
            {editingName ? (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  style={{ flex: 1, background: "var(--bg-input)", border: "1px solid var(--border-strong)", borderRadius: 4, color: "var(--text)", padding: "4px 8px", fontSize: 12 }}
                />
                <button
                  onClick={() => { setName(draftName || "Guest"); setEditingName(false); }}
                  style={{ background: "var(--accent)", color: "var(--accent-on)", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  Save
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Name: <span style={{ color: "var(--text)" }}>{name}</span>{" "}
                <button onClick={() => setEditingName(true)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11, padding: 0 }}>
                  edit
                </button>
              </div>
            )}
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
              Team/Role:{" "}
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-strong)", borderRadius: 4, color: "var(--text)", fontSize: 11, padding: "2px 4px" }}
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
              Change password — requires real Auth, not available yet.
            </div>
          </div>

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
