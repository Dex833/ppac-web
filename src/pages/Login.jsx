// src/pages/Login.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import PageBackground from "../components/PageBackground";

const authBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

export default function Login() {
  const nav = useNavigate();

  const [identifier, setIdentifier] = useState(""); // email OR memberId
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function looksLikeEmail(v) {
    return v.includes("@");
  }

  async function resolveEmailFromMemberId(mid) {
    // Trim and normalize (keep leading zeros)
    const id = String(mid).trim();
    if (!id) throw new Error("Enter your Member ID or Email");

    const snap = await getDoc(doc(db, "memberLookup", id));
    if (!snap.exists()) {
      throw new Error("Member ID not found. Please use your email or contact support.");
    }
    const data = snap.data() || {};
    if (!data.email) {
      throw new Error("No email linked to this Member ID.");
    }
    return data.email;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const id = identifier.trim();

      // Resolve to an email
      const email = looksLikeEmail(id) ? id : await resolveEmailFromMemberId(id);

      // Sign in with email + password
      await signInWithEmailAndPassword(auth, email, password);

      // Go to dashboard
      nav("/dashboard", { replace: true });
    } catch (e) {
      // Map common Firebase errors
      const msg =
        e?.message?.includes("Member ID") ? e.message :
        e?.code === "auth/invalid-credential" ? "Invalid email/member ID or password." :
        e?.code === "auth/user-not-found" ? "Account not found." :
        e?.code === "auth/wrong-password" ? "Incorrect password." :
        e?.code || "Failed to sign in";
      setErr(msg);
      setBusy(false);
    }
  }

  return (
    <PageBackground image={authBg} boxed boxedWidth="max-w-md" overlayClass="bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-md w-full p-6 card">
        <h2 className="text-2xl font-bold mb-4">Sign in</h2>

        {err && (
          <div className="mb-3 rounded border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
            {err}
          </div>
        )}

    <form onSubmit={onSubmit} className="grid gap-3">
          <label className="block">
            <span className="text-sm">Email or Member ID</span>
            <input
      className="input w-full"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              placeholder="you@example.com or 202500001"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm">Password</span>
            <input
      className="input w-full"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="btn btn-primary disabled:opacity-60 mt-2"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="flex items-center justify-between mt-4 text-sm">
          <Link to="/reset" className="underline">Forgot password?</Link>
          <span className="text-ink/70">
            No account? <Link to="/signup" className="underline">Sign up</Link>
          </span>
        </div>
      </div>
    </PageBackground>
  );
}
