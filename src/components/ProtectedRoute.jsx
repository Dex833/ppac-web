// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";

/**
 * ProtectedRoute
 * - Blocks if not logged in (redirects to /login)
 * - If requireVerified === true, redirects unverified users to /verify
 * - Does NOT block suspended users here (admin areas are blocked by RequireRole/AdminRoute)
 */
export default function ProtectedRoute({ children, requireVerified = false }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  // Keep layout stable while auth initializes
  if (loading) return null;

  // Not signed in → go to login, remember where they came from
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />;

  // Optionally require email verified
  if (requireVerified && user.emailVerified !== true) {
    return <Navigate to="/verify" replace />;
  }

  return children;
}
