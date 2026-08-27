"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Round 186 — "Cosmic" (user-facing name since round 216; internal
// value stayed "zhyn" — see lib/TopBar.js's round-216 note) is a real
// third theme value, not a dark-theme override. Three valid values:
// "dark" (orange, default), "light", "zhyn" (black/purple/blue/orange —
// see app/globals.css). Which ones an account is ALLOWED to pick is
// enforced in AuthContext.js (it clamps back to "dark" if the theme is
// "zhyn" but the signed-in account isn't the allowed one) and in
// TopBar.js (which only renders the "Zhyn's Special" option for that
// account) — this context itself just stores whichever value it's given
// and reflects it onto <html data-theme>. app/globals.css has one block
// per value: :root (dark), [data-theme="light"], [data-theme="zhyn"].
const VALID_THEMES = ["dark", "light", "zhyn"];

const ThemeContext = createContext({ theme: "dark", setTheme: () => {}, toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState("dark");

  // Read the saved preference once on mount — can't do this during the
  // initial render since localStorage isn't available server-side.
  useEffect(() => {
    const saved = window.localStorage.getItem("theme");
    if (VALID_THEMES.includes(saved)) setThemeState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  function setTheme(next) {
    if (VALID_THEMES.includes(next)) setThemeState(next);
  }

  // Kept for any old callers — cycles dark <-> light only (never lands on
  // "zhyn", since this has no notion of which account is allowed it).
  function toggleTheme() {
    setThemeState((t) => (t === "light" ? "dark" : "light"));
  }

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
