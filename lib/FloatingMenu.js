"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Round 467 — dropdown that can't be clipped. The inline search pickers
// (PIC tags, artist/label/shared-label inputs, profile + related-DID search)
// used `position: absolute; top: 100%` inside their own wrapper, so any
// ancestor with overflow set (every ticket table's scroll box) cut the list
// off — the PIC list in Sony Publish was half hidden under the table edge.
//
// This renders the menu into document.body with `position: fixed`, placed
// from the anchor's on-screen rectangle, so no ancestor overflow/stacking
// context can clip it. It flips to open UPWARD when there is not enough room
// below, caps its height to the room that is actually there, clamps to the
// viewport horizontally, and re-places itself on scroll/resize while open.
//
// Mount it only while the menu should be showing (callers keep their own
// `open && matches.length > 0 &&` condition). The root carries
// data-floating-menu so a caller's document-level "click outside" handler can
// ignore clicks inside the portal (it is no longer a DOM child of the wrapper).
export default function FloatingMenu({ anchorRef, children, style, maxHeight = 240, minWidth = 180 }) {
  const [pos, setPos] = useState(null);
  const placeRef = useRef(null);

  placeRef.current = () => {
    const el = anchorRef?.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const below = vh - r.bottom;
    const above = r.top;
    const want = Math.min(maxHeight, 200);
    const flip = below < want + 12 && above > below;
    const room = (flip ? above : below) - 12;
    const width = Math.max(r.width, minWidth);
    const left = Math.max(8, Math.min(r.left, vw - width - 8));
    const next = {
      left,
      width,
      top: flip ? undefined : r.bottom + 4,
      bottom: flip ? vh - r.top + 4 : undefined,
      maxHeight: Math.max(120, Math.min(maxHeight, room)),
    };
    // Skip the state write when nothing moved — this runs after every render.
    setPos((prev) =>
      prev && prev.left === next.left && prev.width === next.width && prev.top === next.top &&
      prev.bottom === next.bottom && prev.maxHeight === next.maxHeight
        ? prev
        : next
    );
  };

  useLayoutEffect(() => {
    placeRef.current();
  });

  useEffect(() => {
    const onMove = () => placeRef.current();
    window.addEventListener("scroll", onMove, true); // capture: also fires for scroll inside the table's own scroll box
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, []);

  if (!pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-floating-menu="true"
      style={{
        position: "fixed",
        zIndex: 5000,
        left: pos.left,
        width: pos.width,
        top: pos.top,
        bottom: pos.bottom,
        maxHeight: pos.maxHeight,
        overflowY: "auto",
        ...style,
      }}
    >
      {children}
    </div>,
    document.body
  );
}
