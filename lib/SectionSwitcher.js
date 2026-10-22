"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthContext";
import { isUiTester } from "./uiTesters";
import { readSwitcherLayout } from "./switcherPrefs";
import { getNotDoneCount } from "./notDoneCounts";
import {
  TEAM_TICKET_TYPES, TICKET_TYPE_LABELS, TICKET_ROUTES, SHARED_TICKET_TYPES,
  TEAM_WORKSTATION_TYPES, WORKSTATION_TYPE_LABELS, WORKSTATION_ROUTES,
  typesForTeam,
} from "./teamTypes";

// Round 548/549 — corner section switcher (TESTER ONLY for now, see lib/uiTesters.js).
// Replaces the wrapping row of pills (lib/TypeSwitcher.js) on Workstation and
// Tickets pages with ONE button under the topbar, right corner, labelled like the
// sidebar item. Click: the button turns once, then the other workstation / ticket
// types slide in (the one you are on is left out). Click the button again, click
// outside, press Esc or pick a banner: they slide back out and the button turns again.
//
// Layout (lib/switcherPrefs.js, set in the topbar's Settings panel): "Auto" = one
// horizontal row when every banner fits, otherwise a vertical stack; "Row" / "Column"
// force one. Phones always get the vertical stack. If a layout still has too many
// banners, ONE cycle button (⇄ 1/3) swaps between the sets in order; with more than
// three sets a small dash button opens a numbered list to jump straight to one.
// Order is fixed (same order as the old pills) so nothing moves between opens;
// counts are loaded the first time you open it and reused for a minute.
const SECTIONS = {
  workstation: {
    label: "Workstation", allLabel: "All Workstations", kind: "workstation", indexRoute: "/workstation",
    mapping: TEAM_WORKSTATION_TYPES, labels: WORKSTATION_TYPE_LABELS, routes: WORKSTATION_ROUTES,
  },
  ticket: {
    label: "Tickets", allLabel: "All Tickets", kind: "ticket", indexRoute: "/tickets",
    mapping: TEAM_TICKET_TYPES, labels: TICKET_TYPE_LABELS, routes: TICKET_ROUTES,
  },
};

export function sectionForPath(pathname) {
  const p = pathname || "";
  if (p === "/workstation" || p.startsWith("/workstation/") || p === "/booking" || p.startsWith("/booking/")) return "workstation";
  if (p === "/tickets" || p.startsWith("/tickets/")) return "ticket";
  return null;
}

export function currentTypeKey(routes, pathname) {
  let best = null;
  let len = -1;
  for (const [k, r] of Object.entries(routes)) {
    if ((pathname === r || pathname.startsWith(r + "/")) && r.length > len) { best = k; len = r.length; }
  }
  return best;
}

const ROW_H = 40;
const COUNT_TTL_MS = 60 * 1000;
const DASH_AFTER_PAGES = 3;
const SIDEBAR_W = 250; // same as Sidebar's SIDEBAR_WIDTH (not imported: that file pulls in the whole sidebar)

export default function SectionSwitcher({ isMobile }) {
  const pathname = usePathname();
  const { profile, realProfile } = useAuth();
  const tester = isUiTester(realProfile);
  const sectionKey = tester ? sectionForPath(pathname) : null;
  const section = sectionKey ? SECTIONS[sectionKey] : null;

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [spin, setSpin] = useState(0);
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState(false);
  const [vh, setVh] = useState(800);
  const [vw, setVw] = useState(1200);
  const [layoutPref, setLayoutPref] = useState("auto");
  const [counts, setCounts] = useState({});
  const countsAt = useRef(0);
  const rootRef = useRef(null);
  const closeTimer = useRef(null);

  const isDev = profile?.role === "dev";
  const current = section ? currentTypeKey(section.routes, pathname || "") : null;

  // Fixed order, same as the old pills; the page you are on is left out.
  const items = useMemo(() => {
    if (!section) return [];
    let types = typesForTeam(section.mapping, profile?.segment, isDev);
    if (section.kind === "ticket") types = [...new Set([...types, ...SHARED_TICKET_TYPES])];
    const list = types
      .filter((k) => k !== current && section.routes[k])
      .map((k) => ({ key: k, label: section.labels[k] || k, href: section.routes[k] }));
    list.push({ key: "__all", label: section.allLabel, href: section.indexRoute, isAll: true });
    return list;
  }, [section, profile?.segment, isDev, current]);

  // Desktop: banners sit in ONE horizontal row to the left of the button; if they do not
  // fit the width they split into rows, and the numbers swap which row is shown.
  // Mobile: a vertical stack under the button, split by window height instead.
  const estW = (it) => Math.min(260, 26 + it.label.length * 7.4 + (it.isAll ? 0 : 34));
  const pageSize = Math.max(3, Math.floor((vh - 44 - 46 - 16 - 24 - 56) / ROW_H));
  const rowAvail = Math.min(vw - SIDEBAR_W - 32 - 150, 1100);
  const packRows = (avail) => {
    const rows = [];
    let cur = [];
    let w = 0;
    items.forEach((it) => {
      const iw = estW(it) + 6;
      if (cur.length && w + iw > avail) { rows.push(cur); cur = []; w = 0; }
      cur.push(it); w += iw;
    });
    if (cur.length) rows.push(cur);
    return rows;
  };
  // Phones: always the vertical stack. Otherwise the saved preference: "horizontal" /
  // "vertical", or "auto" = a single row when everything fits in it, else the vertical stack.
  const fitsOneRow = packRows(rowAvail).length <= 1;
  const horizontal = !isMobile && (layoutPref === "horizontal" || (layoutPref === "auto" && fitsOneRow));
  let groups;
  if (horizontal) {
    // Several rows only happen when "Row" is forced: one cycle button swaps between them.
    groups = packRows(rowAvail - (packRows(rowAvail).length > 1 ? 70 : 0));
  } else {
    groups = [];
    for (let i = 0; i < items.length; i += pageSize) groups.push(items.slice(i, i + pageSize));
  }
  const pages = Math.max(1, groups.length);
  const safePage = Math.min(page, pages - 1);
  const visible = groups[safePage] || [];
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    function measure() { setVh(window.innerHeight || 800); setVw(window.innerWidth || 1200); }
    measure();
    const sync = () => setLayoutPref(readSwitcherLayout());
    sync();
    window.addEventListener("resize", measure);
    window.addEventListener("switcher-layout-change", sync);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("switcher-layout-change", sync); };
  }, []);

  const closeNow = useCallback(() => {
    clearTimeout(closeTimer.current);
    setOpen(false); setClosing(false); setPreview(false);
  }, []);

  const closeAnimated = useCallback(() => {
    if (!open || closing) return;
    setClosing(true);
    setSpin((n) => n + 1);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(closeNow, reduced ? 0 : 260 + visible.length * 22);
  }, [open, closing, closeNow, reduced, visible.length]);

  // Leaving the page closes it immediately; resets paging for the new section.
  useEffect(() => { closeNow(); setPage(0); }, [pathname, closeNow]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) { if (rootRef.current && !rootRef.current.contains(e.target)) closeAnimated(); }
    function onKey(e) { if (e.key === "Escape") closeAnimated(); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeAnimated]);

  // Counts: loaded when first opened, reused for a minute.
  useEffect(() => {
    if (!open || !section || !profile) return undefined;
    if (Date.now() - countsAt.current < COUNT_TTL_MS && Object.keys(counts).length > 0) return undefined;
    let cancelled = false;
    countsAt.current = Date.now();
    items.filter((i) => !i.isAll).forEach((i) => {
      getNotDoneCount(section.kind, i.key, profile)
        .then((n) => { if (!cancelled) setCounts((prev) => ({ ...prev, [`${section.kind}:${i.key}`]: n })); })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [open, section, profile, items]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!section) return null;

  function toggle() {
    if (open && !closing) { closeAnimated(); return; }
    clearTimeout(closeTimer.current);
    setClosing(false);
    setSpin((n) => n + 1);
    setPage(0);
    setPreview(false);
    setOpen(true);
  }

  const countOf = (i) => (i.isAll ? null : counts[`${section.kind}:${i.key}`]);
  const showDash = pages > DASH_AFTER_PAGES;
  // Desktop: the banner nearest the button moves first on the way in; vertical: top first.
  const delay = (i) => (reduced ? "0ms" : `${(horizontal ? visible.length - 1 - i : i) * 35}ms`);
  const outDelay = (i) => (reduced ? "0ms" : `${(horizontal ? i : visible.length - 1 - i) * 22}ms`);
  // How far a banner starts from its place (desktop): back at the button, so they fan out leftwards.
  const dist = (i) => visible.slice(i + 1).reduce((sum, it) => sum + estW(it) + 6, 0) + estW(visible[i]) + 20;

  const chipBase = {
    border: "1px solid var(--border-strong)", background: "var(--bg-card)", color: "var(--text)",
    borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "6px 10px", lineHeight: 1,
  };

  // A plain render function (not a component) so rows keep their DOM node, and
  // their slide-in animation does not replay, when counts arrive.
  function renderRow(item, i, num) {
    const n = countOf(item);
    return (
      <Link
        key={item.key}
        href={item.href}
        onClick={() => {
          // "All …" has to open the picker, not bounce back: the index page jumps straight to the
          // last type you used unless that memory is cleared first (same as the old "← All" button).
          if (item.isAll) { try { window.localStorage.removeItem(`last_${section.kind}_type`); } catch {} }
          closeNow();
        }}
        className={`sws-banner ${horizontal && !num ? "sws-h" : ""} ${closing ? "sws-out" : ""}`}
        style={{ "--d": closing ? outDelay(i) : delay(i), "--dist": !num && horizontal ? `${Math.round(dist(i))}px` : undefined, height: num ? 32 : ROW_H - 6 }}
      >
        {num ? <span className="sws-num">{num}</span> : null}
        <span className="sws-name">{item.label}</span>
        {n != null && <span className={`sws-count ${n > 0 ? "sws-count-on" : ""}`}>{n}</span>}
      </Link>
    );
  }

  return (
    <div
      ref={rootRef}
      className="sws-root"
      style={{ position: "fixed", top: "calc(var(--topbar-height) + 8px)", right: isMobile ? 8 : 16, zIndex: 60, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}
    >
      <style>{`
        @keyframes sws-turn { from { transform: rotateY(0deg); } to { transform: rotateY(360deg); } }
        @keyframes sws-in { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes sws-away { from { transform: translateX(0); opacity: 1; } to { transform: translateX(120%); opacity: 0; } }
        .sws-turn { animation: sws-turn .55s cubic-bezier(.4,.1,.2,1); }
        .sws-banner { display: flex; align-items: center; gap: 8px; min-width: 190px; max-width: 80vw; padding: 0 12px; border-radius: 8px; border: 1px solid var(--border-strong); background: var(--bg-card); color: var(--text); text-decoration: none; font-size: 12px; font-weight: 700; box-shadow: 0 4px 14px rgba(0,0,0,.25); animation: sws-in .3s cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--d, 0ms); }
        @keyframes sws-in-h { from { transform: translateX(var(--dist, 120%)); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes sws-away-h { from { transform: translateX(0); opacity: 1; } to { transform: translateX(var(--dist, 120%)); opacity: 0; } }
        .sws-banner.sws-h { animation-name: sws-in-h; min-width: 0; white-space: nowrap; }
        .sws-banner.sws-h.sws-out { animation-name: sws-away-h; }
        .sws-banner.sws-out { animation: sws-away .22s ease-in both; animation-delay: var(--d, 0ms); }
        .sws-banner:hover, .sws-banner:focus-visible { border-color: var(--accent); outline: none; }
        .sws-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sws-num { min-width: 18px; text-align: center; font-size: 10px; color: var(--accent); }
        .sws-count { font-size: 10px; font-weight: 800; border-radius: 10px; padding: 1px 6px; background: var(--bg-hover); color: var(--text-faint); }
        .sws-count-on { background: var(--accent); color: var(--accent-on); }
        .sws-page { min-width: 26px; text-align: center; }
        .sws-page-on { border-color: var(--accent) !important; color: var(--accent) !important; }
        .sws-list { max-height: calc(100vh - 44px - 46px - 90px); overflow-y: auto; padding: 4px; border: 1px solid var(--border-strong); border-radius: 10px; background: var(--bg-card); box-shadow: 0 8px 24px rgba(0,0,0,.35); display: flex; flex-direction: column; gap: 4px; animation: sws-in .25s ease both; }
        .sws-list .sws-banner { box-shadow: none; animation: none; }
        @media (prefers-reduced-motion: reduce) { .sws-turn, .sws-banner, .sws-list { animation: none !important; } }
      `}</style>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {horizontal && open && !preview && (
          <div key={`${safePage}-${items.length}`} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {visible.map((item, i) => renderRow(item, i, 0))}
          </div>
        )}
        {open && showDash && (
          <button type="button" title="Quick list of everything" aria-label="Quick list of everything" aria-pressed={preview} onClick={() => setPreview((p) => !p)} style={{ ...chipBase, padding: "6px 9px" }} className={preview ? "sws-page-on" : ""}>
            —
          </button>
        )}
        {open && pages > 1 && !preview && (
          <button
            type="button"
            onClick={() => setPage((safePage + 1) % pages)}
            style={{ ...chipBase, padding: "6px 10px" }}
            className="sws-page"
            title="Show the next set of banners"
            aria-label={`Show the next set of banners (${safePage + 1} of ${pages})`}
          >
            ⇄ {safePage + 1}/{pages}
          </button>
        )}
        <button
          key={spin}
          type="button"
          onClick={toggle}
          aria-expanded={open && !closing}
          className={spin > 0 && !reduced ? "sws-turn" : ""}
          style={{ ...chipBase, background: open ? "var(--accent)" : "var(--bg-card)", color: open ? "var(--accent-on)" : "var(--text)", borderColor: open ? "var(--accent)" : "var(--border-strong)", display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", boxShadow: "0 2px 8px rgba(0,0,0,.2)" }}
        >
          {section.label}
          <span aria-hidden="true" style={{ fontSize: 10 }}>{open && !closing ? "▸" : "◂"}</span>
        </button>
      </div>

      {!horizontal && open && !preview && (
        <div key={`${safePage}-${items.length}`} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
          {visible.map((item, i) => renderRow(item, i, 0))}
        </div>
      )}
      {open && preview && (
        <div className="sws-list">
          {items.map((item, i) => renderRow(item, 0, i + 1))}
        </div>
      )}
    </div>
  );
}
