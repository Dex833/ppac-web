import React, { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../lib/firebase";
import { Link } from "react-router-dom";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend(e) {
    e.preventDefault();
    setMsg(""); setErr("");
    if (!email) return setErr("Enter your email");
    try {
      setSending(true);
      await sendPasswordResetEmail(auth, email);
      setMsg("Check your inbox for the reset link.");
    } catch (e) {
      setErr(e.code || "Failed to send reset email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h2>Reset Password</h2>
      <form onSubmit={handleSend} style={{ display: "grid", gap: 8, maxWidth: 320 }}>
        <input
          placeholder="Your email"
          type="email"
          value={email}
          onChange={e=>setEmail(e.target.value)}
        />
        <button type="submit" disabled={sending}>
          {sending ? "Sending…" : "Send reset link"}
        </button>
        {msg && <small style={{color:"green"}}>{msg}</small>}
        {err && <small style={{color:"crimson"}}>{err}</small>}
      </form>
      <p><Link to="/login">Back to Login</Link></p>
    </div>
  );
}
