"use client";

import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { uiConfirm, setUiNext, setDensity, readUiNext, readDensity, DENSITIES } from "../../lib/uiNext";

// Round 531 — preview page for the relayout pieces. Not linked from the menu:
// open /ui-lab directly. Turn "UI Next" on here and it applies to every page in
// THIS browser only (stored locally); nobody else sees it.
export default function UiLab() {
  const [on, setOn] = useState(false);
  const [density, setDens] = useState("normal");
  const [result, setResult] = useState("");

  useEffect(() => { setOn(readUiNext()); setDens(readDensity()); }, []);

  const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 16 };
  return (
    <AppShell>
      <div style={{ padding: 24, maxWidth: 900 }}>
        <h2 style={{ margin: "0 0 4px" }}>UI Lab — relayout preview</h2>
        <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>Opt-in per browser. Piece 1: focus rings, hover, density, skeletons, empty state, styled confirm. Next pieces: collapsible sidebar, saved views, mobile cards.</div>

        <div style={card}>
          <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 700 }}>
            <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); setUiNext(e.target.checked); }} /> UI Next on (this browser only)
          </label>
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            Row density:
            {DENSITIES.map((d) => (
              <button key={d} type="button" onClick={() => { setDens(d); setDensity(d); }} className="uix-btn" style={d === density ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}>{d}</button>
            ))}
            <span style={{ color: "var(--text-faint)" }}>(applies to every table when UI Next is on)</span>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Table: hover a row, Tab to focus the controls</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["Release", "Package", "Status"].map((h) => <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {[["Em Chọn Nghề Doanh Nhân", "Chỉ Phát Hành", "Done"], ["Giữ Mẹ", "INT MEDIA", "In progress"], ["Ngon Đèn Đưa Lối", "INT MEDIA", "Not started"]].map((r) => (
                <tr key={r[0]}>{r.map((c) => <td key={c} style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Skeleton loading (replaces plain "Loading…")</div>
          {[70, 90, 55].map((w, i) => <span key={i} className="uix-skeleton" style={{ height: 14, width: `${w}%`, marginBottom: 10 }} />)}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Empty state</div>
          <div className="uix-empty"><div className="uix-empty-icon">✿</div><div className="uix-empty-title">No results yet</div>Add a link or change the filters to see rows here.</div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Styled confirm (falls back to the browser popup when UI Next is off)</div>
          <button type="button" className="uix-btn uix-btn-primary" onClick={async () => setResult((await uiConfirm({ title: "Change the Social unit price?", message: "Packages already locked keep their frozen terms and saved prices. This change is logged with your name.", confirmLabel: "Change price" })) ? "Confirmed" : "Cancelled")}>Normal confirm</button>{" "}
          <button type="button" className="uix-btn uix-btn-danger" onClick={async () => setResult((await uiConfirm({ title: "Delete this entry?", message: "This cannot be undone.", confirmLabel: "Delete", tone: "danger" })) ? "Deleted (demo)" : "Cancelled")}>Danger confirm</button>
          <span style={{ marginLeft: 12, color: "var(--text-muted)" }}>{result}</span>
        </div>
      </div>
    </AppShell>
  );
}
