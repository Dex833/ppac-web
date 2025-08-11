// src/pages/Signup.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { generateMemberId } from "../lib/memberId";

export default function Signup({ openLoginModal }) {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      // 1) Create Auth user
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      // 2) Optionally set display name in Auth
      if (fullName.trim()) {
        await updateProfile(cred.user, { displayName: fullName.trim() });
      }

      // 3) Generate next memberId (YYYY000XXX) via transaction
      const memberId = await generateMemberId(db); // keep as STRING

      // 4) Create users/{uid} (include memberId as string)
      await setDoc(
        doc(db, "users", cred.user.uid),
        {
          uid: cred.user.uid,
          email: cred.user.email || email.trim(),
          displayName: fullName.trim() || "",
          // roles
          role: "member",          // legacy compatibility
          roles: ["member"],       // authoritative
          // status
          verifiedByAdmin: false,
          suspended: false,
          // identity
          memberId,                // keep as STRING to preserve leading zeros
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 5) Public lookup: memberId -> { uid, email } (for login by memberId)
      // If this fails (rules not deployed yet), don’t block signup.
      try {
        await setDoc(doc(db, "memberLookup", memberId), {
          uid: cred.user.uid,
          email: cred.user.email || email.trim(),
        });
      } catch (e) {
        console.warn(
          "[memberLookup] create failed (email login still works):",
          e
        );
      }

      // 6) Go to dashboard
      nav("/dashboard", { replace: true });
    } catch (e) {
      const msg =
        e?.code === "auth/email-already-in-use"
          ? "That email is already in use."
          : e?.code === "auth/weak-password"
          ? "Password should be at least 6 characters."
          : e?.code || "Failed to create account";
      setErr(msg);
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">Create your account</h2>

        {err && (
          <div className="mb-3 rounded border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
            {err}
          </div>
        )}

        <form onSubmit={onSubmit} className="grid gap-3">
          <label className="block">
            <span className="text-sm">Full name (optional)</span>
            <input
              className="border rounded px-3 py-2 w-full"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </label>

          <label className="block">
            <span className="text-sm">Email</span>
            <input
              className="border rounded px-3 py-2 w-full"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm">Password</span>
            <input
              className="border rounded px-3 py-2 w-full"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="btn btn-primary disabled:opacity-60 mt-2"
          >
            {busy ? "Creating…" : "Sign up"}
          </button>
        </form>

        <p className="text-sm text-ink/70 mt-4">
          Already have an account?{" "}
          <button
            type="button"
            className="underline text-brand-600 hover:text-brand-800"
            onClick={openLoginModal}
          >
            Log in
          </button>
        </p>
      </div>
    </div>
  );
}
