// src/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { auth } from "./lib/firebase";
import {
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        // Persist across tabs, reloads, and browser restarts
        await setPersistence(auth, browserLocalPersistence);
      } catch {
        // Private windows or blocked storage → keep session alive for the tab
        await setPersistence(auth, browserSessionPersistence);
      }
      unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      });
    })();
    return () => unsub();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signout: () => signOut(auth),
    }),
    [user, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
