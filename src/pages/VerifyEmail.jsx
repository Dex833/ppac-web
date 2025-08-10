import React, { useState } from "react";
import { auth } from "../lib/firebase";
import { sendEmailVerification, reload } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

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
    <div>
      <h2>Verify your email</h2>
      <p>We sent a verification link to <b>{user?.email || "your email"}</b>.</p>
      <div style={{display:"flex", gap:8, marginTop:12}}>
        <button onClick={handleSend} disabled={busy}>Resend email</button>
        <button onClick={handleIAlreadyVerified} disabled={busy}>I verified, refresh</button>
      </div>
      {msg && <p style={{color:"green"}}>{msg}</p>}
      {err && <p style={{color:"crimson"}}>{err}</p>}
      <p style={{marginTop:12}}><Link to="/dashboard">Back to Dashboard</Link></p>
    </div>
  );
}
