// src/pages/Signup.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { generateMemberId } from "../lib/memberId";
import PageBackground from "../components/PageBackground";

const authBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

export default function Signup({ openLoginModal }) {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  // Simple password strength estimator
  function getPasswordStrength(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score; // 0..5
  }

  function handlePasswordChange(e) {
    const val = e.target.value;
    setPassword(val);
    setPasswordStrength(getPasswordStrength(val));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);

    if (!firstName.trim() || !middleName.trim() || !lastName.trim()) {
      setErr("First name, middle name, and last name are required.");
      setBusy(false);
      return;
    }
    if (!agreed) {
      setErr("You must agree to the Terms of Service and Privacy Policy.");
      setBusy(false);
      return;
    }
    if (passwordStrength < 3) {
      setErr(
        "Password is too weak. Use at least 8 characters, with upper/lowercase, numbers, and symbols."
      );
      setBusy(false);
      return;
    }

    try {
      // 1) Create Auth user
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);

      // 2) Set display name as "First M. Last"
      const middleInitial = middleName.trim()[0]?.toUpperCase() || "";
      const displayName = `${firstName.trim()}${middleInitial ? " " + middleInitial + "." : ""} ${lastName
        .trim()
        .replace(/ +/g, " ")}`.replace(/ +/g, " ");

      await updateProfile(cred.user, { displayName });

      // 3) Generate next memberId (string to preserve zeros)
      const memberId = await generateMemberId(db);

      // 4) Create users/{uid}
      await setDoc(
        doc(db, "users", cred.user.uid),
        {
          uid: cred.user.uid,
          email: cred.user.email || email.trim(),
          displayName,
          firstName: firstName.trim(),
          middleName: middleName.trim(),
          lastName: lastName.trim(),
          role: "member", // legacy
          roles: ["member"],
          verifiedByAdmin: false,
          suspended: false,
          memberId, // string
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 4b) members/{uid}
      await setDoc(
        doc(db, "members", cred.user.uid),
        {
          firstName: firstName.trim(),
          middleName: middleName.trim(),
          lastName: lastName.trim(),
          email: cred.user.email || email.trim(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 5) Public lookup (non-blocking)
      try {
        await setDoc(doc(db, "memberLookup", memberId), {
          uid: cred.user.uid,
          email: cred.user.email || email.trim(),
        });
      } catch (e) {
        console.warn("[memberLookup] create failed (email login still works):", e);
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

  const strengthLabel =
    passwordStrength >= 4 ? "Strong" : passwordStrength === 3 ? "Medium" : "Weak";

  return (
    <PageBackground
      image={authBg}
      boxed
      boxedWidth="max-w-7xl"
      overlayClass="bg-white/85 backdrop-blur"
    >
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
              <span className="text-sm">First Name</span>
              <input
                className="border rounded px-3 py-2 w-full"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm">Middle Name</span>
              <input
                className="border rounded px-3 py-2 w-full"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                autoComplete="additional-name"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm">Last Name</span>
              <input
                className="border rounded px-3 py-2 w-full"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
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
                onChange={handlePasswordChange}
                autoComplete="new-password"
                required
              />
              <div className="mt-1 text-xs flex items-center gap-2">
                <span>Password strength:</span>
                <span
                  className={
                    passwordStrength >= 4
                      ? "text-green-700"
                      : passwordStrength === 3
                      ? "text-amber-600"
                      : "text-rose-600"
                  }
                >
                  {strengthLabel}
                </span>
              </div>
              {/* tiny visual bar */}
              <div className="mt-1 h-1 bg-gray-200 rounded overflow-hidden">
                <div
                  className={
                    "h-1 transition-all " +
                    (passwordStrength >= 4
                      ? "bg-green-600"
                      : passwordStrength === 3
                      ? "bg-amber-500"
                      : "bg-rose-500")
                  }
                  style={{ width: `${(passwordStrength / 5) * 100}%` }}
                />
              </div>
            </label>

            <label className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                required
              />
              <span className="text-xs">
                I agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">
                  Privacy Policy
                </a>
                .
              </span>
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
    </PageBackground>
  );
}
