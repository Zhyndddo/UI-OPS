"use client";

import { useEffect, useState } from "react";

// Round 87 — shared mobile-breakpoint hook, the foundation the rest of the
// mobile plan builds on (see DATA_FIXES.md's Round 87 entry for the full
// phased plan). 768px is the line used everywhere in this round's mobile
// work (AppShell/Sidebar/TopBar) — phone vs tablet/desktop.
//
// Starts as `false` (desktop) until the first client-side effect runs —
// this app has no server-rendered layout data to key off (every page here
// is already a "use client" component, e.g. ThemeContext's own toggle),
// so a brief desktop-layout flash on a phone's very first paint is the
// same trade-off already made elsewhere, not a new one.
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setIsMobile(mq.matches);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}
