// src/pages/Verify.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { sendEmailVerification, reload } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useNavigate } from "react-router-dom";

export default function Verify() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (user?.emailVerified) nav("/dashboard", { replace: true });
  }, [user?.emailVerified, nav]);

  async function resend() {
    try {
      setErr(""); setBusy(true);
      await sendEmailVerification(auth.currentUser);
      setSent(true);
    } catch (e) {
      setErr(e.code || "Failed to send email");
    } finally {
      setBusy(false);
    }
  }

  async function IVerified() {
    await reload(auth.currentUser);
    if (auth.currentUser?.emailVerified) nav("/dashboard", { replace: true });
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card p-6 space-y-4">
        <h2 className="text-xl font-bold">Verify your email</h2>
        <p>We sent a verification link to <b>{user?.email}</b>.</p>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex items-center gap-3">
          <button onClick={resend} disabled={busy} className="btn btn-primary">
            {busy ? "Sending…" : sent ? "Resend again" : "Resend email"}
          </button>
          <button onClick={IVerified} className="btn btn-outline">I verified it</button>
        </div>
      </div>
    </div>
  );
}
