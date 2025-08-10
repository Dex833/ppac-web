// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth?.() ?? {};
  const loc = useLocation();

  if (loading) return null;                  // or a small spinner
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />;
  return children;
}
