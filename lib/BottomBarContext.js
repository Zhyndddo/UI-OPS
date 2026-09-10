"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

// Round 284 — the shell's new fixed BottomBar (see lib/BottomBar.js) is
// site-wide chrome mounted once in AppShell, but the pagination controls
// it shows are page-specific and live arbitrarily deep in whatever page is
// currently mounted (see lib/Pagination.js, unchanged at every one of its
// 26 call sites — it now registers into this context instead of rendering
// inline). This context is the plumbing that gets a page's pagination
// controls out to that shell-level bar.
//
// Only one page is ever really "active" at a time (Next.js's app router
// fully swaps route content), but registrations are keyed by a per-
// instance id and ordered by an insertion counter rather than trusted to
// object-key iteration order — during a route transition the outgoing
// page's Pagination can unmount slightly before or after the incoming
// page's registers, and relying on dict order could flash the wrong one.
// Highest `order` among currently-registered entries always wins.
const BottomBarContext = createContext(null);

export function BottomBarProvider({ children }) {
  const [entries, setEntries] = useState({}); // id -> { left, right, order }
  const orderRef = useRef(0);

  const register = useCallback((id, content) => {
    setEntries((prev) => ({ ...prev, [id]: { ...content, order: orderRef.current++ } }));
  }, []);

  const unregister = useCallback((id) => {
    setEntries((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const active = useMemo(() => {
    const list = Object.values(entries);
    if (list.length === 0) return null;
    return list.reduce((best, e) => (e.order > best.order ? e : best));
  }, [entries]);

  const value = useMemo(() => ({ register, unregister, active }), [register, unregister, active]);

  return <BottomBarContext.Provider value={value}>{children}</BottomBarContext.Provider>;
}

// Returns { register, unregister, active }. `active` is { left, right } |
// null — the two React nodes the current page's Pagination wants shown
// (see lib/Pagination.js), or null when nothing's registered (a page with
// nothing to paginate, or totalRows === 0).
export function useBottomBarSlot() {
  const ctx = useContext(BottomBarContext);
  // Outside a BottomBarProvider (shouldn't happen for any AppShell-wrapped
  // page, but e.g. a page rendered standalone in tests) — degrade to a
  // harmless no-op rather than crashing.
  if (!ctx) {
    return { register: () => {}, unregister: () => {}, active: null };
  }
  return ctx;
}
