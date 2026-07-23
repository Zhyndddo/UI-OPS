"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "./ThemeContext";
import { useAuth } from "./AuthContext";
import { supabase } from "./supabaseClient";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Matches the doc: orange bar, click to go home, right side shows ONLY the
// account name, click opens Info (role/team display) / Settings / Logout.
// Real identity now — Info shows the actual profiles row, not an editable
// simulation. "Change password" doesn't apply since this app uses
// magic-link auth (no password exists to change) — noted honestly rather
// than building a fake control for it.
export default function TopBar() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [overload, setOverload] = useState(null); // { active, date }

  // Design team's Overload soft lock — matches v1 exactly: a same-day
  // toggle that auto-resets if the stored date isn't today.
  const isDesignExecutor = profile?.segment === "Design";

  useEffect(() => {
    if (!supabase || !isDesignExecutor) return;
    (async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "design_overload").maybeSingle();
      let val = data?.value || { active: false, date: null };
      if (val.date !== todayStr()) {
        val = { active: false, date: todayStr() };
        await supabase.from("app_settings").update({ value: val }).eq("key", "design_overload");
      }
      setOverload(val);
    })();
  }, [isDesignExecutor]);

  async function toggleOverload() {
    const next = { active: !overload.active, date: todayStr() };
    setOverload(next);
    await supabase.from("app_settings").update({ value: next }).eq("key", "design_overload");
  }

  async function handleLogout() {
    setOpen(false);
    await signOut();
    router.push("/login");
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
          justifyContent: "space-between",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <div>
          {isDesignExecutor && overload && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleOverload(); }}
              title="When active, new Design tickets can't pick today as their deadline"
              style={{
                background: overload.active ? "#1a1a1a" : "rgba(0,0,0,0.15)",
                color: overload.active ? "#ffca4d" : "var(--accent-on)",
                border: "1px solid rgba(0,0,0,0.2)",
                borderRadius: 6,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {overload.active ? "🔒 Overloaded" : "Overload"}
            </button>
          )}
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
