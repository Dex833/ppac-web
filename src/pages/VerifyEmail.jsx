import React, { useState } from "react";
import { auth } from "../lib/firebase";
import { sendEmailVerification, reload } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import PageBackground from "../components/PageBackground";

const authBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

export default function VerifyEmail() {
  const { user } = useAuth();        // for showing email
  const nav = useNavigate();
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSend() {
    setMsg(""); setErr("");
    const u = auth.currentUser;      // <-- read fresh
    if (!u) return setErr("No active user");
    try {
      setBusy(true);
      await sendEmailVerification(u);
      setMsg("Verification email sent. Check your inbox/spam.");
    } catch (e) {
      setErr(e.code || "Failed to send verification email");
    } finally {
      setBusy(false);
    }
  }

  async function handleIAlreadyVerified() {
    setMsg(""); setErr("");
    const u = auth.currentUser;      // <-- read fresh
    if (!u) return setErr("No active user");
    try {
      setBusy(true);
      await reload(u);
      if (auth.currentUser?.emailVerified) {
        setMsg("Email verified! Redirecting…");
        setTimeout(() => nav("/dashboard"), 500);
      } else {
        setErr("Not verified yet. Please click the link in your email.");
      }
    } catch (e) {
      setErr(e.code || "Failed to refresh status");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageBackground image={authBg} boxed boxedWidth="max-w-md" overlayClass="bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-md w-full p-6 card space-y-3">
        <h2 className="text-2xl font-bold">Verify your email</h2>
        <p>We sent a verification link to <b>{user?.email || "your email"}</b>.</p>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={handleSend} disabled={busy}>Resend email</button>
          <button className="btn btn-primary" onClick={handleIAlreadyVerified} disabled={busy}>I verified, refresh</button>
        </div>
        {msg && <div className="text-sm text-emerald-700">{msg}</div>}
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <p className="text-sm"><Link className="underline" to="/dashboard">Back to Dashboard</Link></p>
      </div>
    </PageBackground>
  );
}
