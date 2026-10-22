"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthContext";
import { isUiTester } from "./uiTesters";
import { getNotDoneCount } from "./notDoneCounts";
import {
  TEAM_TICKET_TYPES, TICKET_TYPE_LABELS, TICKET_ROUTES, SHARED_TICKET_TYPES,
  TEAM_WORKSTATION_TYPES, WORKSTATION_TYPE_LABELS, WORKSTATION_ROUTES,
  typesForTeam,
} from "./teamTypes";

// Round 548 — corner section switcher (TESTER ONLY for now, see lib/uiTesters.js).
// Replaces the wrapping row of pills (lib/TypeSwitcher.js) on Workstation and
// Tickets pages with ONE button under the topbar, right corner, labelled like the
// sidebar item. Click: the button turns once, then the other workstation / ticket
// types slide in from the right as a vertical stack of banners (the one you are
// on is left out). Click the button again, click outside, press Esc or pick a
// banner: the banners slide back out and the button turns once more.
//
// Too many banners for the screen height? They split into pages; the page numbers
// sit to the left of the button and swap the stack. With more than three pages a
// small dash button opens a numbered list of every banner to jump straight to one.
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

  const pageSize = Math.max(3, Math.floor((vh - 44 - 46 - 16 - 24 - 56) / ROW_H));
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = items.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    function measure() { setVh(window.innerHeight || 800); }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
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
  const delay = (i) => (reduced ? "0ms" : `${i * 35}ms`);
  const outDelay = (i) => (reduced ? "0ms" : `${(visible.length - 1 - i) * 22}ms`);

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
        onClick={closeNow}
        className={`sws-banner ${closing ? "sws-out" : ""}`}
        style={{ "--d": closing ? outDelay(i) : delay(i), height: num ? 32 : ROW_H - 6 }}
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
        {open && showDash && (
          <button type="button" title="Quick list of everything" aria-label="Quick list of everything" aria-pressed={preview} onClick={() => setPreview((p) => !p)} style={{ ...chipBase, padding: "6px 9px" }} className={preview ? "sws-page-on" : ""}>
            —
          </button>
        )}
        {open && pages > 1 && !preview && Array.from({ length: pages }, (_, p) => (
          <button key={p} type="button" onClick={() => setPage(p)} style={chipBase} className={`sws-page ${p === safePage ? "sws-page-on" : ""}`} aria-label={`Page ${p + 1}`}>
            {p + 1}
          </button>
        ))}
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

      {open && !preview && (
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
