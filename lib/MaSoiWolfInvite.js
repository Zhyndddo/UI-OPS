"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "./supabaseClient";
import { playHowl } from "./maSoiHowl";

// Round 582 — a small wolf in the bottom-right corner that invites people to a Ma Sói game while its lobby is open.
// Egress-safe: it asks the server at most once every 30 minutes per browser (result cached in localStorage),
// never polls, and stays hidden on /ma-soi itself, once the person joined, or after they closed it for that game.
const CACHE_KEY = "ms_invite_cache";
const DISMISS_KEY = "ms_invite_dismissed";
const TTL_MS = 30 * 60 * 1000;

function readLS(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }

export default function MaSoiWolfInvite() {
  const pathname = usePathname();
  const router = useRouter();
  const [game, setGame] = useState(null); // { id, players } while a lobby is open and the person has not joined

  useEffect(() => {
    if (!pathname || pathname.startsWith("/ma-soi")) return;
    let off = false;
    (async () => {
      let c = readLS(CACHE_KEY);
      if (!c || Date.now() - (c.at || 0) > TTL_MS) {
        try {
          const { data } = await supabase.auth.getSession();
          const token = data?.session?.access_token;
          if (!token) return;
          const r = await fetch("/api/ma-soi", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "state" }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return;
          const g = j.game;
          c = { at: Date.now(), id: g && g.status === "lobby" && !j.joined ? String(g.id || g.created_at || "lobby") : null, players: (j.players || []).length };
          writeLS(CACHE_KEY, c);
        } catch (e) { return; }
      }
      if (off || !c.id) return;
      const dis = readLS(DISMISS_KEY);
      if (dis && dis === c.id) return;
      setGame(c);
    })();
    return () => { off = true; };
  }, [pathname]);

  if (!game || (pathname || "").startsWith("/ma-soi")) return null;

  function close(e) {
    e.stopPropagation();
    writeLS(DISMISS_KEY, game.id);
    setGame(null);
  }
  function open() {
    playHowl();
    router.push("/ma-soi");
  }

  return (
    <div onClick={open} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") open(); }}
      title="Mở Ma Sói"
      style={{ position: "fixed", right: 14, bottom: "calc(var(--bottombar-height, 0px) + 16px)", zIndex: 900, display: "flex", alignItems: "flex-end", gap: 6, cursor: "pointer" }}>
      <div style={{ background: "var(--bg-card)", border: "1px solid #ff7a1a", borderRadius: 12, padding: "8px 12px", fontSize: 12.5, lineHeight: 1.4, maxWidth: 190, boxShadow: "0 4px 18px rgba(0,0,0,.35)", position: "relative" }}>
        <div style={{ fontWeight: 800 }}>🐺 Ma Sói đang mở!</div>
        <div style={{ color: "var(--text-faint)" }}>{game.players ? `${game.players} người đã vào — ` : ""}bấm để tham gia nhé.</div>
        <button type="button" aria-label="Đóng" onClick={close}
          style={{ position: "absolute", top: -9, right: -9, width: 20, height: 20, borderRadius: 999, border: "1px solid var(--border)", background: "var(--bg-card)", color: "inherit", fontSize: 11, lineHeight: "16px", cursor: "pointer", padding: 0 }}>×</button>
      </div>
      <img src="/ma-soi/wolf.png" alt="" width={58} style={{ display: "block", filter: "drop-shadow(0 3px 6px rgba(0,0,0,.4))" }} />
    </div>
  );
}
