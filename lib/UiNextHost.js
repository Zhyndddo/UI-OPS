"use client";

import { useEffect, useRef, useState } from "react";
import { readUiNext, readDensity } from "./uiNext";

// Round 531 — mounted once in AppShell. Applies the UI Next attributes to <html>
// and hosts the styled confirm dialog (uiConfirm in lib/uiNext.js).
export default function UiNextHost() {
  const [dlg, setDlg] = useState(null);
  const okRef = useRef(null);

  useEffect(() => {
    function apply() {
      const el = document.documentElement;
      if (readUiNext()) { el.setAttribute("data-ui", "next"); el.setAttribute("data-density", readDensity()); }
      else { el.removeAttribute("data-ui"); el.removeAttribute("data-density"); }
    }
    try {
      const q = new URLSearchParams(window.location.search).get("uinext");
      if (q === "1" || q === "0") window.localStorage.setItem("uiNext", q);
    } catch {}
    apply();
    window.addEventListener("uix-change", apply);
    const onConfirm = (e) => setDlg(e.detail);
    window.addEventListener("uix-confirm", onConfirm);
    return () => { window.removeEventListener("uix-change", apply); window.removeEventListener("uix-confirm", onConfirm); };
  }, []);

  useEffect(() => { if (dlg) okRef.current?.focus(); }, [dlg]);

  if (!dlg) return null;
  function done(v) { const r = dlg.resolve; setDlg(null); r(v); }
  const danger = dlg.tone === "danger";
  return (
    <div className="uix-backdrop" onClick={() => done(false)} onKeyDown={(e) => { if (e.key === "Escape") done(false); }} role="presentation">
      <div className="uix-dialog" role="alertdialog" aria-modal="true" aria-labelledby="uix-d-title" onClick={(e) => e.stopPropagation()}>
        <div id="uix-d-title" className="uix-dialog-title">{dlg.title || "Are you sure?"}</div>
        {dlg.message && <div className="uix-dialog-msg">{dlg.message}</div>}
        <div className="uix-dialog-actions">
          <button type="button" className="uix-btn" onClick={() => done(false)}>{dlg.cancelLabel || "Cancel"}</button>
          <button type="button" ref={okRef} className={`uix-btn ${danger ? "uix-btn-danger" : "uix-btn-primary"}`} onClick={() => done(true)}>{dlg.confirmLabel || "Continue"}</button>
        </div>
      </div>
    </div>
  );
}
