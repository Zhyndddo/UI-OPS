"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext({
  session: null,
  profile: null,
  loading: true,
  notInRoster: false,
  signOut: () => {},
});

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
    const interval = setInterval(async () => {
      if (!supabase) return;
      const { error } = await supabase.auth.getUser();
      if (error) {
        await supabase.auth.signOut();
        handleSession(null);
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

    let { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("auth_id", newSession.user.id)
      .maybeSingle();

    // Fallback for the moment right after accepting an invite, or if
    // auth_id somehow wasn't backfilled — match by email (case-
    // insensitive, since email casing isn't meaningful) and self-heal.
    if (!prof && newSession.user.email) {
      const { data: byEmail } = await supabase
        .from("profiles")
        .select("*")
        .ilike("email", newSession.user.email)
        .maybeSingle();
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

  return (
    <AuthContext.Provider value={{ session, profile, loading, notInRoster, signOut, recheckRoster }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
