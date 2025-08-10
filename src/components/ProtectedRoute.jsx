// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  // Keep layout stable while auth initializes
  if (loading) return null;

  // If not signed in, send to login and remember where they came from
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />;

  // Suspended users are allowed past ProtectedRoute (block only on admin pages)
  return children;
}
