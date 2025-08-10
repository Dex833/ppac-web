import React from "react";
import { Link } from "react-router-dom";
// optional: if you want to show current user
import { useAuth } from "../AuthContext";

export default function Home() {
  const { user } = useAuth?.() || {};

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">PPAC Web</h1>
      <p className="text-slate-600 mb-4">
        Welcome! This is the homepage.
      </p>

      {user ? (
        <div className="rounded-xl border bg-white p-4 mb-4">
          <p className="mb-2">Signed in as <b>{user.email}</b></p>
          <Link className="text-blue-600 underline" to="/dashboard">Go to Dashboard</Link>
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-4 mb-4">
          <p className="mb-2">Get started by creating an account or signing in.</p>
          <div className="flex gap-3">
            <Link className="text-white bg-blue-600 px-3 py-2 rounded-lg" to="/signup">Signup</Link>
            <Link className="text-blue-600 underline" to="/login">Login</Link>
          </div>
        </div>
      )}

      <p className="text-sm text-slate-500">
        Need help? Visit <Link className="underline" to="/verify">Verify</Link> or <Link className="underline" to="/reset">Reset Password</Link>.
      </p>
    </div>
  );
}
