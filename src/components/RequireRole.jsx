import React from "react";
import { Navigate } from "react-router-dom";
import useUserProfile from "../hooks/useUserProfile";

export default function RequireRole({ allowed = ["member"], children }) {
  const { role, loading } = useUserProfile();

  if (loading) {
    return (
      <div className="mx-auto max-w-md card p-6 text-sm text-slate-600">
        Checking permissions…
      </div>
    );
  }

  if (!role || !allowed.includes(role)) {
    // Not allowed — send them somewhere safe
    return <Navigate to="/dashboard" replace state={{ denied: true }} />;
  }

  return children;
}
