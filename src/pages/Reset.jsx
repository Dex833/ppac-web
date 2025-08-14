// src/pages/Reset.jsx
import React, { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../lib/firebase";
import PageBackground from "../components/PageBackground";

const authBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

export default function Reset() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleReset(e) {
    e.preventDefault();
    try {
      setBusy(true); setErr(""); setMsg("");
      await sendPasswordResetEmail(auth, email);
      setMsg("Password reset link sent. Check your inbox.");
    } catch (e) {
      setErr(e.code || "Failed to send reset link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageBackground image={authBg} boxed boxedWidth="max-w-sm" overlayClass="bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-sm w-full">
        <h2 className="text-2xl font-bold mb-4 text-center">Reset password</h2>
        <form onSubmit={handleReset} className="card p-6 space-y-4">
          <input
            className="input w-full"
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            required
          />
          {err && <p className="text-sm text-rose-600">{err}</p>}
          {msg && <p className="text-sm text-emerald-700">{msg}</p>}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      </div>
    </PageBackground>
  );
}
