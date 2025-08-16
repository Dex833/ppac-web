// src/hooks/useUserProfile.jsx
import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "../AuthContext";

export default function useUserProfile() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const unsubRef = useRef(null);
  const startedRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    // Clean up previous listener if user changes or during hot reloads
    if (unsubRef.current) {
      try { unsubRef.current(); } catch (_) {}
      unsubRef.current = null;
    }
    startedRef.current = null;

    // While auth is determining state, keep loading
    if (authLoading) {
      setLoading(true);
      return () => { mounted = false; };
    }

    // No user? Finish early.
    if (!user || !user.uid) {
      if (mounted) {
        setProfile(null);
        setLoading(false);
        setError(null);
      }
      return () => { mounted = false; };
    }

    const ref = doc(db, "users", user.uid);

    // Avoid duplicate start for same uid (helps with dev hot reload)
    if (startedRef.current === user.uid) {
      return () => { mounted = false; };
    }
    startedRef.current = user.uid;

    try {
      setLoading(true);
      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (!mounted) return;
          if (snap.exists()) {
            const data = snap.data();
            // normalize roles
            const roles = Array.isArray(data.roles)
              ? data.roles
              : data.role
              ? [data.role]
              : [];
            setProfile({ id: snap.id, ...data, roles });
          } else {
            setProfile(null);
          }
          setLoading(false);
        },
        (err) => {
          if (!mounted) return;
          setError(err);
          setLoading(false);

          // Helpful dev hints
          if (err.code === "permission-denied") {
            console.warn(
              "[useUserProfile] Permission denied reading /users/{uid}. " +
                "Check Firestore rules and that the signed-in user is allowed."
            );
          } else {
            console.warn("[useUserProfile] Snapshot error:", err);
          }
        }
      );

      unsubRef.current = unsub;
    } catch (e) {
      if (mounted) {
        setError(e);
        setLoading(false);
      }
      console.warn("[useUserProfile] onSnapshot setup error:", e);
    }

    return () => {
      mounted = false;
      if (unsubRef.current) {
        try { unsubRef.current(); } catch (_) {}
        unsubRef.current = null;
      }
  startedRef.current = null;
    };
  }, [user?.uid, authLoading]); // re-run when uid state changes

  return { loading, profile, error };
}
