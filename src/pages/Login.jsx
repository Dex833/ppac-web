import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function Login() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <p>Already logged in. <a href="/dashboard">Go to dashboard</a></p>;

  async function handleLogin(e) {
    e.preventDefault();
    setErr("");
    try {
      setBusy(true);
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      if (!cred.user.emailVerified) {
        nav("/verify");
      } else {
        nav("/dashboard");
      }
    } catch (e) {
      setErr(e.code || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h2 className="text-2xl font-bold mb-6">Login</h2>

      <form onSubmit={handleLogin} className="card p-6 space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Email</label>
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-400/30 outline-none"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Password</label>
          <input
            type="password"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-400/30 outline-none"
            placeholder="••••••••"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {err && (
          <div className="rounded-md bg-red-50 text-red-700 px-3 py-2 text-sm border border-red-200">
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary w-full h-10 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign In"}
        </button>

        <div className="flex items-center justify-between text-sm pt-1">
          <span className="text-slate-600">
            No account?{" "}
            <Link to="/signup" className="text-brand-700 hover:text-brand-800 underline-offset-2 hover:underline">
              Create one
            </Link>
          </span>
          <Link to="/reset" className="text-brand-700 hover:text-brand-800 underline-offset-2 hover:underline">
            Forgot password?
          </Link>
        </div>
      </form>
    </div>
  );
}
