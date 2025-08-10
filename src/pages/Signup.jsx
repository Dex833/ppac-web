import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
} from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function Signup() {
  const nav = useNavigate();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <p>Already logged in. <a href="/dashboard">Go to dashboard</a></p>;

  async function handleSignup(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);

      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }

      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        email,
        displayName: name || "",
        role: "member",
        createdAt: serverTimestamp(),
      });

      await sendEmailVerification(cred.user);
      nav("/verify");
    } catch (e) {
      setErr(e.code || "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h2 className="text-2xl font-bold mb-6">Create your account</h2>

      <form onSubmit={handleSignup} className="card p-6 space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Full name</label>
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-400/30 outline-none"
            placeholder="Ruth Acantilado"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </div>

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
            placeholder="Minimum 6 characters"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="new-password"
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
          {busy ? "Creating…" : "Create Account"}
        </button>

        <p className="text-sm text-slate-600 pt-1">
          Have an account?{" "}
          <Link
            to="/login"
            className="text-brand-700 hover:text-brand-800 underline-offset-2 hover:underline"
          >
            Login
          </Link>
        </p>
      </form>
    </div>
  );
}
