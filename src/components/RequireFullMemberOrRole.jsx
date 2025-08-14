// src/components/RequireFullMemberOrRole.jsx
import React from "react";
import { Link, Navigate } from "react-router-dom";
import useUserProfile from "../hooks/useUserProfile";

/**
 * Gate access to children unless the user is:
 * - membershipStatus === 'full', or
 * - has any role in rolesAllowed (default: ['admin', 'treasurer'])
 * Suspended users are denied.
 */
export default function RequireFullMemberOrRole({ rolesAllowed = ["admin", "treasurer"], children }) {
  const { loading, profile } = useUserProfile();

  if (loading) return null;

  if (profile?.suspended === true) {
    return (
      <div className="page-gutter">
        <div className="max-w-xl mx-auto card p-6 text-center">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-ink/70">Your account is currently suspended.</p>
        </div>
      </div>
    );
  }

  const roles = Array.isArray(profile?.roles)
    ? profile.roles
    : profile?.role
    ? [profile.role]
    : [];

  const isRoleAllowed = rolesAllowed.some((r) => roles.includes(r));
  const isFull = String(profile?.membershipStatus || "").toLowerCase() === "full";

  if (isFull || isRoleAllowed) return children;

  // Deny in-place with CTA instead of redirect
  return (
    <div className="page-gutter">
      <div className="max-w-xl mx-auto card p-6 text-center">
        <h2 className="text-xl font-semibold mb-3">You’re almost there</h2>
        <p className="text-ink/80 mb-4">Finish your membership requirements to unlock Reports.</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Link className="btn btn-primary" to="/profile">Complete Requirements</Link>
        </div>
      </div>
    </div>
  );
}
