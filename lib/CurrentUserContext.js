"use client";

import { createContext, useContext, useEffect, useState } from "react";

const CurrentUserContext = createContext({
  name: "Guest",
  role: "Admin",
  setName: () => {},
  setRole: () => {},
});

// NOT real authentication — there's no login system yet. This is a
// lightweight, locally-stored stand-in (name + role) so the topbar's
// account menu and the Summary page's "view as" selector have one
// consistent identity to point at, instead of two separate simulations.
// Swap this out entirely once real Supabase Auth exists.
export function CurrentUserProvider({ children }) {
  const [name, setNameState] = useState("Guest");
  const [role, setRoleState] = useState("Admin");

  useEffect(() => {
    const savedName = window.localStorage.getItem("sim_user_name");
    const savedRole = window.localStorage.getItem("sim_user_role");
    if (savedName) setNameState(savedName);
    if (savedRole) setRoleState(savedRole);
  }, []);

  function setName(n) {
    setNameState(n);
    window.localStorage.setItem("sim_user_name", n);
  }
  function setRole(r) {
    setRoleState(r);
    window.localStorage.setItem("sim_user_role", r);
  }

  return (
    <CurrentUserContext.Provider value={{ name, role, setName, setRole }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
