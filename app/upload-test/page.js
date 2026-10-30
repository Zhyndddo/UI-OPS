"use client";

import { useRef, useState } from "react";
import AppShell from "../../lib/AppShell";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabaseClient";

// Round 568 — PROOF OF CONCEPT (owner only, not linked from the menu): upload a big file (up to 100 MB) from the browser to
// Google Drive and check it arrives. Two modes: "direct" (browser -> Google) and "server" (browser -> our API in 4 MB pieces -> Google).
// Tells us which one works with the company Google setup before anything is built into the chat.
const OWNER = "an.thien@vieent.vn";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (n) => (n / 1048576).toFixed(1) + " MB";

export default function UploadTest() {
  const { realProfile } = useAuth();
  const isOwner = (realProfile?.email || "").trim().toLowerCase() === OWNER;
  const [mode, setMode] = useState("direct");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [lines, setLines] = useState([]);
  const [result, setResult] = useState(null);
  const t0 = useRef(0);
  const log = (s) => setLines((l) => [...l, `${((Date.now() - t0.current) / 1000).toFixed(1)}s  ${s}`]);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  }
  async function api(path, body) {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  async function run() {
    if (!file || busy) return;
    setBusy(true); setPct(0); setLines([]); setResult(null); t0.current = Date.now();
    try {
      log(`File ${file.name} (${mb(file.size)}), mode: ${mode}`);
      const init = await api("/api/chat-upload", { action: "init", filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size });
      log("Drive upload address received");
      const CH = mode === "direct" ? 8 * 1024 * 1024 : 4 * 1024 * 1024;   // multiples of 256 KiB
      let start = 0, fileId = null, unreadable = false;
      while (start < file.size) {
        const end = Math.min(start + CH, file.size);
        const blob = file.slice(start, end);
        const range = `bytes ${start}-${end - 1}/${file.size}`;
        for (let attempt = 1; ; attempt++) {
          try {
            if (mode === "direct") {
              const res = await fetch(init.uploadUrl, { method: "PUT", headers: { "Content-Range": range }, body: blob });
              if (res.status === 200 || res.status === 201) { try { fileId = (await res.json()).id; } catch { unreadable = true; } }
              else if (res.status !== 308) throw new Error(`Google answered HTTP ${res.status}`);
            } else {
              const res = await fetch("/api/chat-upload/chunk", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "x-upload-url": init.uploadUrl, "content-range": range }, body: blob });
              const j = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
              if (j.status === 200 || j.status === 201) fileId = j.file?.id || null;
              else if (j.status !== 308) throw new Error(`Google answered HTTP ${j.status}`);
            }
            break;
          } catch (e) {
            if (mode === "direct" && e instanceof TypeError && start === 0 && attempt === 1) {
              throw new Error("Direct upload was blocked by the browser (CORS). Try the \"via our server\" mode.");
            }
            if (attempt >= 3) throw e;
            log(`Piece ${Math.floor(start / CH) + 1} failed (${e.message}), retrying…`);
            await sleep(1000 * attempt);
          }
        }
        start = end;
        setPct(Math.round((start / file.size) * 100));
        log(`Sent ${mb(start)} of ${mb(file.size)}`);
      }
      if (!fileId) log(unreadable ? "Upload finished, but the browser could not read Google's answer — looking the file up by name" : "Upload finished — looking the file up by name");
      const fin = await api("/api/chat-upload", { action: "finalize", name: init.name, size: file.size, fileId });
      log("Verified and shared with the VIEENT domain");
      setResult(fin.file);
    } catch (e) {
      log("FAILED: " + e.message);
    }
    setBusy(false);
  }

  if (!isOwner) return <AppShell><div style={{ padding: 24 }}>Not available.</div></AppShell>;

  return (
    <AppShell>
      <div style={{ padding: 24, maxWidth: 760 }}>
        <h1 style={{ marginTop: 0 }}>Drive upload test</h1>
        <p style={{ opacity: 0.8 }}>Proof of concept (owner only). Pick a file up to 100 MB, choose how it travels, press Upload. It lands in the "chat-uploads / YYYY-MM" folder inside your Drive folder.</p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "12px 0" }}>
          <input type="file" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <label><input type="radio" checked={mode === "direct"} onChange={() => setMode("direct")} disabled={busy} /> direct (browser → Google)</label>
          <label><input type="radio" checked={mode === "server"} onChange={() => setMode("server")} disabled={busy} /> via our server (4 MB pieces)</label>
          <button type="button" onClick={run} disabled={!file || busy} style={{ padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>{busy ? `Uploading… ${pct}%` : "Upload"}</button>
        </div>
        <div style={{ height: 10, background: "rgba(128,128,128,0.25)", borderRadius: 6, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#ff7a1a", transition: "width .2s" }} />
        </div>
        <pre style={{ marginTop: 12, fontSize: 12.5, whiteSpace: "pre-wrap", opacity: 0.9 }}>{lines.join("\n")}</pre>
        {result && (
          <div style={{ marginTop: 12 }}>
            <div><b>Done.</b> {result.name} · {mb(Number(result.size) || 0)} · {result.mimeType}</div>
            <div><a href={result.url} target="_blank" rel="noreferrer">Open in Drive</a></div>
            <iframe title="preview" src={result.previewUrl} style={{ width: "100%", height: 320, border: "1px solid #666", borderRadius: 8, marginTop: 8 }} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
