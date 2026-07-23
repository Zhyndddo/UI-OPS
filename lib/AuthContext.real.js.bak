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

// Real Supabase Auth (magic link), replacing the earlier localStorage
// "simulated identity." A logged-in auth.users session only becomes a
// usable identity in this app once it's linked to a profiles row — new
// team members need to be added to the roster (Team page) by an
// admin/dev FIRST, using the same email they'll log in with. If someone
// logs in with an email that isn't on the roster, notInRoster=true and
// nothing else in the app treats them as identified.
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

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSession(newSession) {
    setSession(newSession);
    if (!newSession?.user?.email) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", newSession.user.email)
      .maybeSingle();

    if (!prof) {
      setNotInRoster(true);
      setProfile(null);
      setLoading(false);
      return;
    }

    setNotInRoster(false);
    // Link auth_id the first time this profile's owner actually logs in —
    // the roster row can exist before anyone's ever signed in.
    if (!prof.auth_id) {
      await supabase.from("profiles").update({ auth_id: newSession.user.id }).eq("id", prof.id);
      prof.auth_id = newSession.user.id;
    }
    setProfile(prof);
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, notInRoster, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
