"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { PICTURE_TEMPLATES, MAX_NAMES_PER_BATCH, PUBLIC_MAX_NAMES } from "./pictureRenderConfig";
import { makeZip } from "./zipStore";

// Round 569 — Tools -> "Picture render": type names (one per line), get the designated picture with each name printed at the
// fixed spot (see lib/pictureRenderConfig.js). Download (one PNG, or one zip for several) and/or save to the Drive folder.
// Nothing is stored in the database. Admin / dev only (the server checks the role again).
const cache = {};   // template id -> { img, fontReady }

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the template picture " + src));
    img.src = src;
  });
}
async function loadAssets(t) {
  if (cache[t.id]) return cache[t.id];
  const a = { img: null, family: t.text.fallbackFamily };
  if (t.src) a.img = await loadImage(t.src);
  if (t.font?.src) {
    try {
      const face = new FontFace(t.font.family, `url(${t.font.src})`, { weight: t.font.weight || "400", style: t.font.style || "normal" });
      await face.load();
      document.fonts.add(face);
      a.family = `"${t.font.family}", ${t.text.fallbackFamily}`;
    } catch (e) { /* falls back to the system font */ }
  }
  cache[t.id] = a;
  return a;
}

function drawTemplate(ctx, t, a, name) {
  const W = a.img ? a.img.naturalWidth : t.width, H = a.img ? a.img.naturalHeight : t.height;
  const T = t.text;
  if (a.img) ctx.drawImage(a.img, 0, 0, W, H);
  else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#3a3355"); g.addColorStop(1, "#8a4b1d");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = `600 30px ${T.fallbackFamily}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText("PLACEHOLDER PICTURE — send the real one", W / 2, 90);
    ctx.setLineDash([14, 10]); ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 3;
    const bx = T.align === "left" ? T.x : T.align === "right" ? T.x - T.maxWidth : T.x - T.maxWidth / 2;
    ctx.strokeRect(bx, T.y - T.fontSize * 0.8, T.maxWidth, T.fontSize * 1.6); ctx.setLineDash([]);
  }
  let text = String(name || "").trim();
  if (T.uppercase) text = text.toLocaleUpperCase("vi-VN");
  let size = T.fontSize;
  const set = () => { ctx.font = `${T.fontStyle || "normal"} ${T.fontWeight} ${size}px ${a.family}`; };
  set();
  while (ctx.measureText(text).width > T.maxWidth && size > T.minFontSize) { size -= 2; set(); }
  ctx.fillStyle = T.color; ctx.textAlign = T.align; ctx.textBaseline = T.baseline;
  ctx.fillText(text, T.x, T.y);
  return { W, H };
}

async function renderBlob(t, name, type = "image/png", quality) {
  const a = await loadAssets(t);
  const c = document.createElement("canvas");
  const probe = c.getContext("2d");
  const W = a.img ? a.img.naturalWidth : t.width, H = a.img ? a.img.naturalHeight : t.height;
  c.width = W; c.height = H;
  drawTemplate(probe, t, a, name);
  return new Promise((res) => c.toBlob((b) => res(b), type, quality));
}

const safeFile = (s) => String(s || "picture").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "picture";
const mb = (n) => (n / 1048576).toFixed(1) + " MB";

// publicCode = the shared access code when this is the PUBLIC page (/picture, no login); leave empty inside the staff Tools tab.
export default function PictureRender({ publicCode = "" }) {
  const t = PICTURE_TEMPLATES[0];
  const isPublic = !!publicCode;
  const maxNames = isPublic ? PUBLIC_MAX_NAMES : MAX_NAMES_PER_BATCH;
  const [text, setText] = useState("");
  const [toDrive, setToDrive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);       // [{ name, state: "wait"|"ok"|"fail", drive: ""|"ok"|"skip"|"fail", note }]
  const [msg, setMsg] = useState("");
  const previewRef = useRef(null);

  const names = Array.from(new Set(text.split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean)));
  const tooMany = names.length > maxNames;

  // live preview of the first name
  useEffect(() => {
    let dead = false;
    (async () => {
      const a = await loadAssets(t);
      if (dead || !previewRef.current) return;
      const c = previewRef.current;
      c.width = a.img ? a.img.naturalWidth : t.width; c.height = a.img ? a.img.naturalHeight : t.height;
      drawTemplate(c.getContext("2d"), t, a, names[0] || "Nguyễn Văn A");
    })().catch((e) => setMsg(e.message));
    return () => { dead = true; };
  }, [names[0], t.id]);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  }

  async function saveToDrive(blob, filename) {
    const auth = isPublic ? { "x-access-code": encodeURIComponent(publicCode) } : { Authorization: `Bearer ${await token()}` };
    const r = await fetch(isPublic ? "/api/picture-render-public" : "/api/picture-render", {
      method: "POST",
      headers: { ...auth, "Content-Type": blob.type, "x-filename": encodeURIComponent(filename), "x-folder": encodeURIComponent(t.driveFolder) },
      body: blob,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  }

  async function run() {
    if (!names.length || busy || tooMany) return;
    setBusy(true); setMsg("");
    const list = names.map((n) => ({ name: n, state: "wait", drive: toDrive ? "wait" : "", note: "" }));
    setRows(list);
    const used = new Map();
    const files = [];
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      try {
        const base = safeFile(row.name);
        const k = (used.get(base) || 0) + 1; used.set(base, k);
        const fname = (k > 1 ? `${base}-${k}` : base) + ".png";
        const blob = await renderBlob(t, row.name);
        files.push({ name: fname, data: new Uint8Array(await blob.arrayBuffer()) });
        row.state = "ok";
        if (toDrive) {
          try {
            let b = blob, fn = fname;
            if (b.size > 4.4 * 1024 * 1024) { b = await renderBlob(t, row.name, "image/jpeg", 0.92); fn = fname.replace(/\.png$/, ".jpg"); row.note = "saved as JPEG (PNG too big)"; }
            if (b.size > 4.4 * 1024 * 1024) { row.drive = "skip"; row.note = `too big for Drive upload (${mb(b.size)}) — still in the download`; }
            else { await saveToDrive(b, fn); row.drive = "ok"; }
          } catch (e) { row.drive = "fail"; row.note = e.message; }
        }
      } catch (e) { row.state = "fail"; row.note = e.message; }
      setRows([...list]);
    }
    // download
    if (files.length === 1) {
      const url = URL.createObjectURL(new Blob([files[0].data], { type: "image/png" }));
      const a = document.createElement("a"); a.href = url; a.download = files[0].name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } else if (files.length > 1) {
      const zip = makeZip(files);
      const url = URL.createObjectURL(zip);
      const a = document.createElement("a"); a.href = url; a.download = `picture-render_${t.id}_${new Date().toISOString().slice(0, 10)}.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    setMsg(`${files.length} of ${list.length} picture(s) rendered${files.length ? " and downloaded" : ""}.`);
    setBusy(false);
  }

  const driveFails = rows.filter((r) => r.drive === "fail" || r.drive === "skip").length;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Picture render — {t.label}</div>
      {!isPublic && typeof window !== "undefined" && (
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 8px" }}>
          Public link (needs the access code): <b>{window.location.origin}/picture</b>{" "}
          <button type="button" onClick={() => { try { navigator.clipboard.writeText(`${window.location.origin}/picture`); setMsg("Public link copied."); } catch (e) { setMsg("Could not copy — select the link and copy it."); } }}
            style={{ marginLeft: 6, padding: "2px 10px", fontSize: 12, fontWeight: 700, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card)", color: "inherit", cursor: "pointer" }}>Copy</button>
        </p>
      )}
      <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 12px" }}>
        Type one name per line (up to {maxNames}). Each name is printed at the fixed spot on the picture. One name downloads as a PNG, several as one zip.
        {toDrive ? " Pictures are also saved to the Drive folder: " : ""}{toDrive ? t.driveFolder : ""}
      </p>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 300px", maxWidth: 420 }}>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} disabled={busy} rows={10} placeholder={"Nguyễn Văn A\nTrần Thị B\n…"}
            style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "inherit", font: "inherit", resize: "vertical" }}
          />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: "10px 0" }}>
            <input type="checkbox" checked={toDrive} onChange={(e) => setToDrive(e.target.checked)} disabled={busy} /> Also save to Google Drive
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={run} disabled={!names.length || busy || tooMany}
              style={{ padding: "9px 18px", fontWeight: 800, borderRadius: 8, border: "none", background: "#ff7a1a", color: "#fff", cursor: busy ? "default" : "pointer", opacity: !names.length || busy || tooMany ? 0.5 : 1 }}>
              {busy ? "Rendering…" : `Render ${names.length || ""} picture${names.length === 1 ? "" : "s"}`}
            </button>
            <span style={{ fontSize: 12, color: tooMany ? "#ff6b6b" : "var(--text-faint)" }}>{tooMany ? `Max ${maxNames} names per batch.` : `${names.length} name${names.length === 1 ? "" : "s"}`}</span>
          </div>
          {msg && <div style={{ marginTop: 10, fontSize: 13 }}>{msg}{driveFails ? ` ${driveFails} could not be saved to Drive (see the list).` : ""}</div>}
        </div>
        <div style={{ flex: "1 1 280px", maxWidth: 420 }}>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 6 }}>Preview (first name)</div>
          <canvas ref={previewRef} style={{ width: "100%", height: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "#111" }} />
        </div>
      </div>
      {rows.length > 0 && (
        <div style={{ marginTop: 14, maxWidth: 760, fontSize: 12.5 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ width: 22 }}>{r.state === "wait" ? "…" : r.state === "ok" ? "✅" : "❌"}</span>
              <span style={{ flex: 1 }}>{r.name}</span>
              <span style={{ color: r.drive === "fail" || r.drive === "skip" ? "#ff9a6b" : "var(--text-faint)" }}>
                {r.drive === "ok" ? "Drive ✓" : r.drive === "wait" ? "Drive …" : r.drive === "fail" || r.drive === "skip" ? "Drive ✗" : ""} {r.note}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
