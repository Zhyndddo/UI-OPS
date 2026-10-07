"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { readMagicLinkThemeLock } from "../../../lib/magicLinkThemeLock";
import styles from "../../shared.module.css";

// Round 480 — public, no-login FROZEN snapshot of one Cost Marketing
// TikTok Booking tab + month, laid out like the team's sheet. Reads only
// the cost_mkt_snapshots row (payload copied at mint time) — nothing live.
const ORANGE = "#ff9f1c";
const fmt = (n) => new Intl.NumberFormat("vi-VN").format(Math.round(Number(n) || 0));

export default function CostReportPage() {
  const { token } = useParams();
  const [row, setRow] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [themeLock, setThemeLock] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    readMagicLinkThemeLock(supabase).then(setThemeLock);
  }, []);

  useEffect(() => {
    if (!supabase || !token) return;
    supabase.from("cost_mkt_snapshots").select("*").eq("token", token).maybeSingle().then(({ data, error: err }) => {
      if (err || !data) setError("This link doesn't look valid, or it was removed. Double-check the URL you were sent.");
      else { setRow(data); document.title = `${data.title} — Cost report`; }
      setLoading(false);
    });
  }, [token]);

  if (loading) return <div className={styles.page} data-theme={themeLock || undefined}><div className={styles.container}>Loading…</div></div>;
  if (error) return <div className={styles.page} data-theme={themeLock || undefined}><div className={styles.container} style={{ maxWidth: 640 }}><div className={styles.errorBox}>{error}</div></div></div>;

  const p = row.payload || {};
  const cell = { border: "1px solid #d9d9d9", padding: "7px 10px", fontSize: 13 };
  const head = { ...cell, fontWeight: 800, fontSize: 11, textAlign: "center", background: "#fff", color: "#111", textTransform: "uppercase" };
  const box = (label, value) => (
    <div style={{ border: "1px solid #d9d9d9" }}>
      <div style={{ background: ORANGE, color: "#fff", fontWeight: 800, fontSize: 11, textAlign: "center", padding: "6px 4px", textTransform: "uppercase" }}>{label}</div>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 22, padding: "14px 6px", color: "#111" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ background: "#fff", minHeight: "100vh", color: "#111", padding: "16px 12px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.2fr) minmax(0, 1.4fr)", border: "1px solid #d9d9d9" }}>
          <div style={{ padding: "14px 16px", borderRight: "1px solid #d9d9d9" }}>
            <div style={{ fontSize: 15, letterSpacing: 0.5 }}>TIKTOK BOOKING</div>
            <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.05 }}>{p.brandLabel || "—"}</div>
            <div style={{ fontSize: 34, fontWeight: 300, marginTop: 6 }}>{fmt(p.net)}</div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Net = tổng chi phí − cashback</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "auto auto auto", alignContent: "start" }}>
            <div style={{ gridColumn: "1 / span 2", padding: "10px 16px", fontSize: 28, fontWeight: 300, borderBottom: "1px solid #d9d9d9", textTransform: "uppercase" }}>
              {p.monthLabel || "Tất cả"}{p.year ? <span style={{ fontSize: 14, color: "#888", marginLeft: 8 }}>{p.year}</span> : null}
            </div>
            {box("Tổng chi phí", fmt(p.tongChiPhi))}
            {box("Cashback", fmt(p.cashback))}
            {box("Tổng dự án", fmt(p.tongDuAn))}
            {box("Tổng số post", fmt(p.tongSoPost))}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
            <thead>
              <tr>
                <th style={{ ...head, width: 44 }}>STT</th>
                <th style={head}>Album name</th>
                <th style={head}>Nghệ sĩ</th>
                <th style={head}>Total post</th>
                <th style={head}>No. booking post</th>
                <th style={head}>No. supported post</th>
                <th style={head}>Actual cost</th>
              </tr>
            </thead>
            <tbody>
              {(p.rows || []).map((r, i) => (
                <tr key={i}>
                  <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                  <td style={cell}>{r.album}</td>
                  <td style={cell}>{r.artist}</td>
                  <td style={{ ...cell, textAlign: "center" }}>{r.totalPost || ""}</td>
                  <td style={{ ...cell, textAlign: "center" }}>{r.booking ?? ""}</td>
                  <td style={{ ...cell, textAlign: "center" }}>{r.support ?? ""}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.actualCost ? fmt(r.actualCost) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: "#888", fontSize: 11, marginTop: 12 }}>
          Frozen snapshot · {row.title} · created {new Date(row.created_at).toLocaleString()}{row.created_by ? ` by ${row.created_by}` : ""}. Numbers don't change after this point.
        </p>
      </div>
    </div>
  );
}
