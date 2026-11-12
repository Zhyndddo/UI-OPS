"use client";

import { useEffect, useState } from "react";

// Round 600 — PUBLIC role card (no login). Opened by scanning the QR on the player's Ma Sói screen. The token in the link is the key.
// Tap the card to flip it (so a quick glance over the shoulder shows nothing); it can be reopened any time during the game.
const THEME = {
  wolf:       { c1: "#7a0f1a", c2: "#1b0509", art: "🐺", team: "PHE SÓI" },
  whitewolf:  { c1: "#8a8f99", c2: "#24262b", art: "🐺", team: "PHE SÓI" },
  halfwolf:   { c1: "#5b2a6e", c2: "#1b0509", art: "🌗", team: "PHE SÓI" },
  villager:   { c1: "#2d6a3a", c2: "#0f2515", art: "🧑‍🌾", team: "PHE DÂN LÀNG" },
  seer:       { c1: "#3b3f9e", c2: "#12143a", art: "🔮", team: "PHE DÂN LÀNG" },
  witch:      { c1: "#7b2f8f", c2: "#220d2b", art: "🧪", team: "PHE DÂN LÀNG" },
  hunter:     { c1: "#8a5a1f", c2: "#2b1b08", art: "🏹", team: "PHE DÂN LÀNG" },
  guard:      { c1: "#1f6a8a", c2: "#082331", art: "🛡️", team: "PHE DÂN LÀNG" },
  cupid:      { c1: "#b0346e", c2: "#35091e", art: "💘", team: "PHE DÂN LÀNG" },
  idiot:      { c1: "#a88a1c", c2: "#2e2606", art: "🤡", team: "PHE DÂN LÀNG" },
  silencer:   { c1: "#4a5560", c2: "#14181c", art: "🤐", team: "PHE DÂN LÀNG" },
  whisperer:  { c1: "#6a4bc4", c2: "#1a1236", art: "🎶", team: "PHE THỔI SÁO" },
  seerapprentice: { c1: "#4a52b8", c2: "#14183f", art: "🔭", team: "PHE DÂN LÀNG" },
  wolfcub:    { c1: "#8a3a1a", c2: "#220a05", art: "🐺", team: "PHE SÓI" },
  detective:  { c1: "#3a6a7a", c2: "#0c1d24", art: "🕵️", team: "PHE DÂN LÀNG" },
  scapegoat:  { c1: "#7a6a3a", c2: "#221d0c", art: "🐐", team: "PHE DÂN LÀNG" },
  fool:       { c1: "#b8721c", c2: "#2e1a05", art: "🤡", team: "PHE RIÊNG — THẰNG NGU" },
  prince:     { c1: "#b08a1c", c2: "#2e2406", art: "👑", team: "PHE DÂN LÀNG" },
  diseased:   { c1: "#5f7a2a", c2: "#161f08", art: "🤢", team: "PHE DÂN LÀNG" },
  medium:     { c1: "#4b3a8a", c2: "#150f2e", art: "🕯️", team: "PHE DÂN LÀNG" },
  scryer:     { c1: "#8a1f3a", c2: "#220509", art: "🔭", team: "PHE SÓI" },
  rogue:      { c1: "#6a5a3a", c2: "#1b160a", art: "🦝", team: "PHE DÂN LÀNG" },
  ghost:      { c1: "#5a6a8a", c2: "#12161f", art: "👻", team: "PHE DÂN LÀNG" },
  wildchild:  { c1: "#2f7a4a", c2: "#0b2514", art: "🌿", team: "PHE DÂN LÀNG" },
  elder:      { c1: "#6b5a3a", c2: "#1e180d", art: "👴", team: "PHE DÂN LÀNG" },
};

export default function RoleCardPage() {
  const [card, setCard] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let t = "";
    try { t = new URLSearchParams(window.location.search).get("t") || ""; } catch (e) { t = ""; }
    if (!t) { setErr("Thiếu mã thẻ. Hãy quét lại mã QR trên màn hình Ma Sói."); return; }
    fetch("/api/ma-soi-role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t }) })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`); setCard(j); })
      .catch((e) => setErr(e.message));
  }, []);

  const th = THEME[card?.role] || THEME.villager;
  const title = (card?.title || "").replace(/^Bạn là\s*/i, "");

  return (
    <div style={{ minHeight: "100vh", background: "#0b0d10", color: "#f3efe6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "system-ui, sans-serif" }}>
      {!card && !err && <div style={{ opacity: 0.7 }}>Đang tải thẻ…</div>}
      {err && <div style={{ maxWidth: 340, textAlign: "center", lineHeight: 1.6 }}><div style={{ fontSize: 40 }}>🌫️</div>{err}</div>}
      {card && (
        <>
          <div style={{ marginBottom: 14, fontSize: 13, opacity: 0.75 }}>{card.name} · {card.alive ? "còn sống" : "💀 đã chết"}{card.status === "finished" ? " · ván đã kết thúc" : ""}</div>
          <button
            type="button"
            onClick={() => setOpen((x) => !x)}
            aria-label={open ? "Úp thẻ lại" : "Lật thẻ"}
            style={{ width: "min(340px, 88vw)", minHeight: 460, borderRadius: 22, border: "2px solid rgba(255,255,255,0.18)", padding: 22, cursor: "pointer", color: "inherit", textAlign: "center", boxShadow: "0 18px 50px rgba(0,0,0,0.6)",
              background: open ? `radial-gradient(circle at 50% 18%, ${th.c1}, ${th.c2} 78%)` : "repeating-linear-gradient(45deg, #1a1d22, #1a1d22 14px, #14171b 14px, #14171b 28px)" }}
          >
            {!open ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 416, gap: 12 }}>
                <div style={{ fontSize: 64 }}>🎭</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>Chạm để lật thẻ</div>
                <div style={{ fontSize: 12.5, opacity: 0.7, maxWidth: 220 }}>Đảm bảo không ai nhìn vào màn hình của bạn.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 11.5, letterSpacing: 2, opacity: 0.85, fontWeight: 700 }}>{th.team}</div>
                {th.art === "🐺" && card.role !== "whitewolf" ? <img src="/ma-soi/wolf.png" alt="" width={130} style={{ display: "block" }} /> : <div style={{ fontSize: 96, lineHeight: 1.1 }}>{th.art}</div>}
                <div style={{ fontWeight: 900, fontSize: 24, textTransform: "uppercase", letterSpacing: 0.5 }}>{title || card.label}</div>
                <div style={{ fontSize: 14.5, lineHeight: 1.6, opacity: 0.95, textAlign: "left", whiteSpace: "pre-wrap" }}>{card.body}</div>
                <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 6 }}>Chạm lần nữa để úp thẻ</div>
              </div>
            )}
          </button>
          <div style={{ marginTop: 14, fontSize: 12, opacity: 0.55, maxWidth: 320, textAlign: "center" }}>Đừng chia sẻ link/QR này — ai có nó sẽ thấy vai trò của bạn.</div>
        </>
      )}
    </div>
  );
}
