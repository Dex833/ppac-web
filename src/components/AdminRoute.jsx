// src/components/AdminRoute.jsx
import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function AdminRoute({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!user?.uid) {
        if (alive) setChecking(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? snap.data() : {};

        // Normalize roles to an array; backward-compatible with single 'role'
        const roles = Array.isArray(data?.roles)
          ? data.roles
          : data?.role
          ? [data.role]
          : [];

        const isAdmin = roles.includes("admin");
        const notSuspended = data?.suspended !== true;

        if (alive) setAllowed(isAdmin && notSuspended);
      } finally {
        if (alive) setChecking(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [user?.uid]);

  if (!user) {
  return <Navigate to="/" replace state={{ from: loc }} />;
  }

  if (checking) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="card p-6">
          <p className="text-ink/70">Checking permissions…</p>
        </div>
      </div>
    );
  }

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return children;
}
