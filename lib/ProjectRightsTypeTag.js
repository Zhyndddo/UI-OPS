"use client";

import { useState } from "react";
import { PROJECT_RIGHTS_TYPES, projectRightsTypeInfo, projectRightsTypePillClass } from "./projectRightsType";

// Round 294 — a small popup anchored right under the pill, NOT a big
// centered modal — explicit request: "popup show normally, not the big
// panel". Modeled on app/releases/page.js's AdminSubteamSummaryButton
// pattern (position: absolute under the trigger, no dark overlay,
// dismissed by an invisible full-screen click-catcher) rather than
// lib/CopyrightRightsPopup.js's fixed/inset:0 centered-modal pattern.
//
// One component, reused everywhere this tag shows: the Releases index
// (editable inline), the release detail page, the New Release create
// form, the Phái Sinh batch grid (per line item), and the Phái Sinh
// ticket list (single "Phái sinh" tickets, editable; Kho Nhạc-family rows
// show a read-only per-item breakdown instead — see PhaiSinhRow).
//
// canEdit=false renders a plain read-only pill (or a muted "—" when
// unset) with no click handler at all — used for viewers who can see the
// tag (lib/permissions.js's canViewProjectRightsType) but not change it,
// though today canView/canEdit share the exact same gate.
export default function ProjectRightsTypeTag({ styles, value, canEdit, onChange, align = "left" }) {
  const [open, setOpen] = useState(false);
  const info = projectRightsTypeInfo(value);

  if (!canEdit) {
    return info ? (
      <span className={`${styles.pill} ${projectRightsTypePillClass(styles, value)}`} title={info.requirement}>{info.short}</span>
    ) : (
      <span style={{ color: "var(--text-faint)", fontSize: 11 }}>—</span>
    );
  }

  return (
    <span style={{ position: "relative", display: "inline-block" }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={info ? `${styles.pill} ${projectRightsTypePillClass(styles, value)}` : undefined}
        style={
          info
            ? { border: "none", cursor: "pointer" }
            : { fontSize: 11, color: "var(--text-faint)", background: "none", border: "1px dashed var(--border-strong)", borderRadius: 10, padding: "2px 8px", cursor: "pointer" }
        }
        title={info ? info.requirement : "Click to set the project rights type"}
      >
        {info ? info.short : "+ Loại Dự Án"}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 449 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: "absolute", top: "calc(100% + 4px)", [align]: 0, zIndex: 450,
              minWidth: 260, maxWidth: 320, background: "var(--bg-card)", border: "1px solid var(--border-strong)",
              borderRadius: 8, padding: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            {PROJECT_RIGHTS_TYPES.map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => { onChange(t.code); setOpen(false); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: value === t.code ? "rgba(255,255,255,0.06)" : "none",
                  border: "none", borderRadius: 6, padding: "6px 8px", marginBottom: 2, cursor: "pointer", color: "var(--text)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  <span className={`${styles.pill} ${projectRightsTypePillClass(styles, t.code)}`}>{t.short}</span>
                  {t.label}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>{t.requirement}</div>
              </button>
            ))}
            {value && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid var(--border-strong)", marginTop: 4, paddingTop: 6, fontSize: 11, color: "var(--text-faint)", cursor: "pointer" }}
              >
                Clear tag
              </button>
            )}
          </div>
        </>
      )}
    </span>
  );
}
