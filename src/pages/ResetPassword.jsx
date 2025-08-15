import React, { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Link } from "react-router-dom";
import PageBackground from "../components/PageBackground";

const authBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

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
    <PageBackground image={authBg} boxed boxedWidth="max-w-sm" overlayClass="bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-sm w-full p-6 card">
        <h2 className="text-2xl font-bold mb-4">Reset Password</h2>
        <form onSubmit={handleSend} className="space-y-3">
          <input
            className="input w-full"
            placeholder="your@email.com"
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={sending} className="btn btn-primary w-full">
            {sending ? "Sending…" : "Send reset link"}
          </button>
          {msg && <div className="text-sm text-emerald-700">{msg}</div>}
          {err && <div className="text-sm text-rose-600">{err}</div>}
        </form>
        <p className="mt-4 text-sm"><Link className="underline" to="/login">Back to Login</Link></p>
      </div>
    </PageBackground>
  );
}
