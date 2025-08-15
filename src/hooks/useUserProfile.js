// src/hooks/useUserProfile.jsx
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../AuthContext";

export default function useUserProfile() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsub;

    // While auth is loading, keep loading true
    if (authLoading) {
      setLoading(true);
      return;
    }

    // If signed out, clear profile
    if (!user?.uid) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const ref = doc(db, "users", user.uid);
    unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : {};

        // Normalize roles to array (supports old single 'role')
        const roles = Array.isArray(data?.roles)
          ? data.roles
          : data?.role
          ? [data.role]
          : [];

        setProfile({
          uid: user.uid,
          email: user.email ?? data.email ?? null,
          displayName: data.displayName ?? user.displayName ?? null,
          photoURL: data.photoURL ?? user.photoURL ?? null,
          roles,
          role: data.role ?? null, // legacy support
          suspended: data.suspended === true,
          ...data,
        });
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub && unsub();
  }, [user?.uid, authLoading]);

  return { loading: authLoading || loading, profile, error };
}
