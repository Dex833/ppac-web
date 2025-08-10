// src/components/RequireRole.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import useUserProfile from "../hooks/useUserProfile";

export default function RequireRole({ allowed = [], children }) {
  const { loading, profile } = useUserProfile();

  // While loading, render nothing (keeps layout stable)
  if (loading) return null;

  // Normalize roles to an array; backward-compatible with single 'role'
  const roles = Array.isArray(profile?.roles)
    ? profile.roles
    : profile?.role
    ? [profile.role]
    : [];

  // Optional: if user is suspended, treat as not allowed
  if (profile?.suspended === true) {
    return <Navigate to="/" replace />;
  }

  // If no specific roles required, allow; otherwise require overlap
  const ok = allowed.length === 0 || roles.some((r) => allowed.includes(r));
  return ok ? children : <Navigate to="/" replace />;
}
