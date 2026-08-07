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

// ============================================================================
// TEMPORARY — real Supabase Auth (magic link) is bugged, swapped out for a
// pseudo sign-in: pick your identity from the existing roster, no email
// verification at all. Clearly not secure — this is a stand-in until the
// real flow is fixed, not a real access-control mechanism.
//
// To restore real auth later: this file has a sibling backup at
// lib/AuthContext.real.js.bak — copy it back over this file. Nothing else
// needs to change; every page consumes profile/signOut from useAuth() the
// same way regardless of which implementation is behind it.
// ============================================================================
export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const savedId = window.localStorage.getItem("pseudo_profile_id");
    if (!savedId) { setLoading(false); return; }

    supabase
      .from("profiles")
      .select("*")
      .eq("id", savedId)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data || null);
        setLoading(false);
      });
  }, []);

  // Called from the login page after picking someone from the roster.
  async function signInAs(profileRow) {
    window.localStorage.setItem("pseudo_profile_id", profileRow.id);
    setProfile(profileRow);
  }

  function signOut() {
    window.localStorage.removeItem("pseudo_profile_id");
    setProfile(null);
  }

  return (
    <AuthContext.Provider
      value={{
        session: profile ? { user: { email: profile.email } } : null, // shape-compatible stand-in, nothing reads this directly except the truthiness check in AppShell
        profile,
        loading,
        notInRoster: false, // moot in pseudo mode — the login page only ever lets you pick an existing roster row
        signOut,
        signInAs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
