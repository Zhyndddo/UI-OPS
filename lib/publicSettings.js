// Round 542 — read-only stand-in for the Supabase client, for the PUBLIC
// magic-link pages. lib/magicLinkThemeLock.js, lib/channelReferenceIntro.js and
// lib/channelReferenceSheetSnapshot.js all read one global_settings row with
//   client.from("global_settings").select("value").eq("key", K).maybeSingle()
// This object answers exactly that call through /api/magic?kind=setting (a
// server route that serves only a whitelist of keys), so the logged-out role
// needs no access to global_settings at all. Pass it wherever those readers
// were given the browser `supabase` client on a public page.
export const publicSettingsClient = {
  from(table) {
    let key = null;
    const q = {
      select() { return q; },
      eq(col, val) { if (col === "key") key = val; return q; },
      async maybeSingle() {
        if (table !== "global_settings" || !key) return { data: null, error: null };
        try {
          const r = await fetch(`/api/magic?kind=setting&key=${encodeURIComponent(key)}`);
          if (!r.ok) return { data: null, error: null };
          const b = await r.json();
          return { data: b?.value != null ? { value: b.value } : null, error: null };
        } catch (e) {
          return { data: null, error: null };
        }
      },
    };
    return q;
  },
};
