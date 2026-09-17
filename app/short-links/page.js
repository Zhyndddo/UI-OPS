"use client";

// Round 360 — "can we make a custom minter for the url we generate...
// make a table somewhere that do something like an auto re-direct... no
// where else can the app generate same /vsounder any more". This is the
// minter itself — mint a slug, see every slug ever minted, revoke one.
// The actual redirect lives server-side at app/[slug]/route.js (public,
// no login needed to USE a link — only to mint/revoke one here). See
// lib/shortLinks.js for the shared validation and sql/pending/add-
// round360-short-links.sql for the table.
import { useEffect, useState } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";
import { validateSlugFormat, normalizeSlug, canRewriteToDestination } from "../../lib/shortLinks";
import styles from "../shared.module.css";

const SITE_URL = "https://internal.vieent.com";

export default function ShortLinksPage() {
  const { profile } = useAuth();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [slug, setSlug] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [label, setLabel] = useState("");
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  async function authHeader() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/short-links", { headers: await authHeader() });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load short links.");
      setLinks(body.links || []);
    } catch (err) {
      setLoadError(err.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!supabase) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Round 360 — client-side format check for instant feedback (no round
  // trip needed to tell someone "vsounder!" isn't a valid slug); the real
  // uniqueness guarantee is still server-side (app/api/short-links/
  // route.js + the table's own unique constraint) since this client
  // can't know what's already taken without asking.
  const liveFormatError = slug ? validateSlugFormat(normalizeSlug(slug)) : null;

  async function mint(e) {
    e.preventDefault();
    setFormError(null);
    const normalized = normalizeSlug(slug);
    const formatErr = validateSlugFormat(normalized);
    if (formatErr) {
      setFormError(formatErr);
      return;
    }
    if (!destinationUrl.trim()) {
      setFormError("Destination URL can't be blank.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/short-links", {
        method: "POST",
        headers: await authHeader(),
        body: JSON.stringify({ slug: normalized, destinationUrl: destinationUrl.trim(), label: label.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to mint link.");
      setSlug("");
      setDestinationUrl("");
      setLabel("");
      await load();
    } catch (err) {
      setFormError(err.message);
    }
    setSaving(false);
  }

  async function revoke(id) {
    setRevokingId(id);
    try {
      const res = await fetch("/api/short-links", {
        method: "PATCH",
        headers: await authHeader(),
        body: JSON.stringify({ id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to revoke link.");
      await load();
    } catch (err) {
      setLoadError(err.message);
    }
    setRevokingId(null);
  }

  function copy(id, fullUrl) {
    try {
      navigator.clipboard.writeText(fullUrl);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      // clipboard unavailable — the URL is still shown as plain text
    }
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Short Links</div>
          <h1 className={styles.title}>Custom URL Minter</h1>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 20, maxWidth: 640 }}>
            Mint a short, memorable path under {SITE_URL} that redirects to any URL — a magic link, an external
            page, anything. Each slug can only ever point to one destination at a time; the app itself refuses to
            mint a slug that's already taken.
          </div>

          <form onSubmit={mint} className={styles.statCard} style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 10, maxWidth: 560 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Slug</label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-faint)", whiteSpace: "nowrap" }}>{SITE_URL}/</span>
                <input
                  className={styles.input}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="vsounder"
                  style={{ flex: 1 }}
                />
              </div>
              {liveFormatError && <div style={{ fontSize: 11, color: "var(--danger, #ff6b6b)", marginTop: 4 }}>{liveFormatError}</div>}
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Destination URL</label>
              <input
                className={styles.input}
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                placeholder="https://ui-ops.vercel.app/channels/c6a0d897f0d90e09"
                style={{ width: "100%" }}
              />
              {/* Round 361 — "will the address bar show /vsounder or the
              real URL?": lets whoever's minting the link see, before
              they save it, whether this destination will keep the
              address bar on /<slug> (an internal page, no #fragment) or
              bounce the visitor to the real URL (external site, or a
              link that needs to auto-scroll to a #fragment — that only
              works with a real redirect, see lib/shortLinks.js). */}
              {destinationUrl.trim() && (
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
                  {canRewriteToDestination(destinationUrl.trim())
                    ? `Address bar will stay on /${slug || "..."} — this points at a page inside this app.`
                    : "Address bar will change to the destination URL once opened (external site, or a link with a #section)."}
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Label (optional, for your own reference)</label>
              <input className={styles.input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="VSounder channel reference" style={{ width: "100%" }} />
            </div>
            {formError && <div style={{ fontSize: 12, color: "var(--danger, #ff6b6b)" }}>{formError}</div>}
            <button type="submit" disabled={saving} className={styles.btnPrimary} style={{ alignSelf: "flex-start" }}>
              {saving ? "Minting…" : "Mint short link"}
            </button>
          </form>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : loadError ? (
            <div className={styles.emptyState}>{loadError}</div>
          ) : links.length === 0 ? (
            <div className={styles.emptyState}>No short links minted yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {links.map((l) => {
                const fullUrl = `${SITE_URL}/${l.slug}`;
                return (
                  <div
                    key={l.id}
                    className={styles.statCard}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      opacity: l.revoked_at ? 0.5 : 1,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                        /{l.slug} {l.revoked_at && <span style={{ fontWeight: 600, fontSize: 11, color: "var(--text-faint)" }}>(revoked)</span>}
                      </div>
                      {l.label && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{l.label}</div>}
                      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.destination_url}>
                        → {l.destination_url}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
                        {l.click_count || 0} click{l.click_count === 1 ? "" : "s"}
                        {l.last_used_at && ` · last used ${new Date(l.last_used_at).toLocaleDateString("vi-VN")}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {!l.revoked_at && (
                        <button type="button" onClick={() => copy(l.id, fullUrl)} className={styles.btnSecondary}>
                          {copiedId === l.id ? "Copied!" : "Copy"}
                        </button>
                      )}
                      {!l.revoked_at && (
                        <button type="button" onClick={() => revoke(l.id)} disabled={revokingId === l.id} className={styles.btnSecondary}>
                          {revokingId === l.id ? "Revoking…" : "Revoke"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
