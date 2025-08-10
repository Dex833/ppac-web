// src/components/GuestRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function GuestRoute({ children }) {
  const { user, loading } = useAuth?.() ?? {};
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}
