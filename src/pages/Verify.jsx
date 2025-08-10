// src/pages/Verify.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { sendEmailVerification } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useNavigate, Navigate } from "react-router-dom";

export default function Verify() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();

  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (user?.emailVerified) {
      nav("/dashboard", { replace: true });
    }
  }, [user?.emailVerified, nav]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  async function resend() {
    try {
      setErr("");
      setInfo("");
      setBusy(true);
      await sendEmailVerification(auth.currentUser);
      setSent(true);
      setInfo("Verification email sent. Please check your inbox.");
    } catch (e) {
      setErr(e.code || "Failed to send email");
    } finally {
      setBusy(false);
    }
  }

  // Poll a few times to let verification propagate
  async function IVerified() {
    setErr("");
    setInfo("Checking verification status…");
    setChecking(true);

    try {
      for (let i = 0; i < 5; i++) {
        // Prefer reloading the same user instance you got from the hook
        if (user?.reload) {
          await user.reload();
        } else if (auth.currentUser?.reload) {
          await auth.currentUser.reload();
        }

        const verifiedNow =
          (auth.currentUser && auth.currentUser.emailVerified) ||
          (user && user.emailVerified);

        if (verifiedNow) {
          setInfo("Verified! Redirecting…");
          nav("/dashboard", { replace: true });
          return;
        }

        // wait a bit before retry
        await new Promise((r) => setTimeout(r, 1000));
      }

      setInfo("");
      setErr("Not verified yet. Please click the link in your email, then try again.");
    } catch (e) {
      setErr(e.code || "Failed to refresh verification status");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card p-6 space-y-4">
        <h2 className="text-xl font-bold">Verify your email</h2>
        <p>
          We sent a verification link to <b>{user?.email}</b>. Click the link in your email,
          then press “I verified it”.
        </p>

        {err && <p className="text-sm text-rose-600">{err}</p>}
        {info && <p className="text-sm text-emerald-700">{info}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={resend}
            disabled={busy || checking}
            className="btn btn-primary"
          >
            {busy ? "Sending…" : sent ? "Resend again" : "Resend email"}
          </button>

          <button
            onClick={IVerified}
            disabled={checking}
            className="btn btn-outline"
          >
            {checking ? "Checking…" : "I verified it"}
          </button>
        </div>
      </div>
    </div>
  );
}
