"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useTheme } from "./ThemeContext";

const AuthContext = createContext({
  session: null,
  profile: null,
  realProfile: null,
  viewAs: null,
  setViewAs: () => {},
  loading: true,
  notInRoster: false,
  signOut: () => {},
  canUseZhynTheme: false,
});

// "View As" — lets a real dev preview the app as another role/team
// WITHOUT actually switching accounts. Purely a client-side UI overlay on
// top of the real profile (RLS is off app-wide per schema.sql, so this
// changes nothing about what's actually reachable — it only changes what
// role/segment-gated UI renders as). Only ever settable when the real,
// underlying profile is role='dev'; persisted per-tab in sessionStorage so
// a refresh doesn't silently drop back to "viewing as me" mid-check, but a
// new tab always starts as the real identity.
const VIEW_AS_KEY = "vieent_view_as";

// Round 186 — "Zhyn's Special" is a real third theme (see ThemeContext.js),
// but only this one account is allowed to pick it. Case-insensitive since
// email casing isn't meaningful elsewhere in this app (see the .ilike
// lookup below).
const ZHYN_THEME_EMAIL = "an.thien@vieent.vn";

// Real Supabase Auth (email + password). A logged-in auth.users session
// only becomes a usable identity in this app once it's linked to a
// profiles row — new team members are added to the roster (Config ->
// Team) by an admin/dev FIRST, which sends them a real invite email to
// set their own password. If someone somehow logs in with an account
// that isn't linked to any profile, notInRoster=true and nothing else in
// the app treats them as identified.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notInRoster, setNotInRoster] = useState(false);
  const [viewAs, setViewAsState] = useState(null); // { role, segment } | null — only meaningful when profile.role === "dev"
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.sessionStorage.getItem(VIEW_AS_KEY);
      if (saved) setViewAsState(JSON.parse(saved));
    } catch {}
  }, []);

  const canUseZhynTheme = (profile?.email || "").trim().toLowerCase() === ZHYN_THEME_EMAIL;

  // Round 186 — safety clamp: if the saved/selected theme is "zhyn" but
  // the signed-in account isn't the one allowed to use it (a new sign-in
  // on a shared machine, someone else's browser with old localStorage,
  // etc.), fall back to "dark" instead of leaking the purple theme to an
  // account that was never offered it as an option in TopBar.js. Gated on
  // `!loading` — profile resolves async, and `canUseZhynTheme` reads false
  // during that window even for the allowed account, so clamping before
  // it settles would wipe a legitimately saved "zhyn" preference on every
  // load right before profile catches up.
  //
  // Round 216 fix — that `!loading` gate wasn't enough by itself: loading
  // also finishes as `false` for the logged-OUT state (nobody signed in
  // yet, `profile` is null) — e.g. sitting on /login, or the brief window
  // right after a session expires before the redirect lands. In that
  // state `canUseZhynTheme` is false too (there's no profile to check the
  // email against), so the old condition fired and reset a legitimately
  // saved "cosmic" preference to "dark" BEFORE the allowed account had
  // even finished logging in — which is exactly the reported bug ("every
  // time i log in, i have to change from dark theme to it"). Added an
  // explicit `profile` check: only clamp once we actually know who's
  // signed in and that they're not the allowed account, never while
  // logged out / still resolving.
  useEffect(() => {
    if (!loading && profile && theme === "zhyn" && !canUseZhynTheme) setTheme("dark");
  }, [loading, profile, theme, canUseZhynTheme, setTheme]);

  function setViewAs(next) {
    setViewAsState(next);
    if (typeof window === "undefined") return;
    try {
      if (next) window.sessionStorage.setItem(VIEW_AS_KEY, JSON.stringify(next));
      else window.sessionStorage.removeItem(VIEW_AS_KEY);
    } catch {}
  }

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getSession().then(({ data }) => {
      handleSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      handleSession(newSession);
    });

    // Kicking someone (ban) doesn't push a signal to their open tab —
    // Supabase just refuses their next token refresh. This periodic
    // check calls getUser(), which re-validates against the server, so a
    // kick takes effect here within a minute rather than only whenever
    // the token would have naturally refreshed anyway.
    //
    // Round 267 — this used to sign out on ANY error from getUser(), not
    // just a real "your session is no longer valid" rejection. getUser()
    // can also fail on a plain network blip, Supabase being briefly slow,
    // a tab that was backgrounded and had its request throttled/timed
    // out, etc. — none of those mean the session is actually bad, but
    // every one of them was forcing a full logout once a minute. That's
    // almost certainly the "keeps logging out for no reason" bug: on a
    // less-than-perfect connection, this fired constantly. Now it only
    // signs out on a genuine 401 (the server actively rejecting the
    // token — revoked, banned, expired past refresh); anything else
    // (a thrown network error, a non-auth error status) is treated as
    // "couldn't check right now," not "you're banned," and just tries
    // again next interval instead of kicking the user.
    const interval = setInterval(async () => {
      if (!supabase) return;
      try {
        const { error } = await supabase.auth.getUser();
        if (error && error.status === 401) {
          await supabase.auth.signOut();
          handleSession(null);
        }
      } catch {
        // Network-level failure reaching Supabase at all — not proof of
        // anything about the session's validity, so no action here.
      }
    }, 60000);

    return () => {
      listener.subscription.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  async function handleSession(newSession) {
    setSession(newSession);
    if (!newSession?.user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let { data: prof, error: primaryErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("auth_id", newSession.user.id)
      .maybeSingle();

    if (primaryErr) {
      console.error("Profile lookup by auth_id failed:", primaryErr);
    }

    // Fallback for the moment right after accepting an invite, or if
    // auth_id somehow wasn't backfilled — match by email (case-
    // insensitive, since email casing isn't meaningful) and self-heal.
    if (!prof && newSession.user.email) {
      const { data: byEmail, error: emailErr } = await supabase
        .from("profiles")
        .select("*")
        .ilike("email", newSession.user.email)
        .maybeSingle();
      if (emailErr) {
        console.error("Profile lookup by email failed:", emailErr);
      }
      if (byEmail) {
        prof = byEmail;
        await supabase.from("profiles").update({ auth_id: newSession.user.id }).eq("id", byEmail.id);
      }
    }

    if (!prof) {
      setNotInRoster(true);
      setProfile(null);
      setLoading(false);
      return;
    }

    setNotInRoster(false);
    setProfile(prof);
    setLoading(false);
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  // Re-runs the profiles lookup against the CURRENT session — for cases
  // like "an admin just added my row, but I'm already stuck on the not-
  // in-roster screen from before that existed." Cheaper than a full
  // sign-out/sign-in cycle.
  async function recheckRoster() {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    await handleSession(data.session);
  }

  // Only a real dev's viewAs is ever honored — if their real role somehow
  // changes out from under them mid-session, the override just stops
  // applying rather than leaking elevated UI to a non-dev.
  const effectiveProfile =
    profile?.role === "dev" && viewAs
      ? { ...profile, role: viewAs.role, segment: viewAs.segment ?? null }
      : profile;

  return (
    <AuthContext.Provider
      value={{
        session,
        profile: effectiveProfile,
        realProfile: profile,
        viewAs: profile?.role === "dev" ? viewAs : null,
        setViewAs,
        loading,
        notInRoster,
        signOut,
        recheckRoster,
        canUseZhynTheme,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
