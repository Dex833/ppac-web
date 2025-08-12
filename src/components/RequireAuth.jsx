import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function RequireAuth({ children, emailVerifiedOnly = false }) {
  const { user } = useAuth();
  const loc = useLocation();

  if (!user) return <Navigate to="/" replace state={{ from: loc }} />;
  if (emailVerifiedOnly && !user.emailVerified) {
    return <Navigate to="/verify" replace />;
  }
  return children;
}
