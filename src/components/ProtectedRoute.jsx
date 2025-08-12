// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import useUserProfile from "../hooks/useUserProfile"; // ← add this

export default function ProtectedRoute({ children, requireVerified = false }) {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile(); // ← read admin override
  const loc = useLocation();

  if (loading || profileLoading) return null;

  if (!user) return <Navigate to="/" replace state={{ from: loc }} />;

  if (requireVerified) {
    const ok = user.emailVerified === true || profile?.verifiedByAdmin === true;
    if (!ok) return <Navigate to="/verify" replace />;
  }

  return children;
}
