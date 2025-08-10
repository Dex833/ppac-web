// src/components/GuestRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function GuestRoute({ children }) {
  const { user, loading } = useAuth();

  // Keep layout stable while auth is loading
  if (loading) return null;

  // If already signed in, send to dashboard
  if (user) return <Navigate to="/dashboard" replace />;

  return children;
}
