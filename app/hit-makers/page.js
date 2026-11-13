"use client";

import { useCallback } from "react";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import HitMakersGame from "../../lib/HitMakersGame";

// Round 620 — Hit Makers (staff). Same login as the rest of the app; guests use /hit-makers/guest with a code instead.
export default function HitMakersPage() {
  const call = useCallback(async (body) => {
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/hit-makers", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `Lỗi ${r.status}`); e.status = r.status; throw e; }
    return j;
  }, []);
  return (
    <AppShell>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}><HitMakersGame call={call} mode="staff" /></div>
    </AppShell>
  );
}
