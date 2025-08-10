// src/pages/Reset.jsx
import React, { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../lib/firebase";

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
    <div className="mx-auto max-w-md">
      <h2 className="text-2xl font-bold mb-4">Reset password</h2>
      <form onSubmit={handleReset} className="card p-6 space-y-4">
        <input
          className="w-full rounded-lg border border-border bg-white px-3 py-2"
          placeholder="you@example.com"
          value={email} onChange={e=>setEmail(e.target.value)}
        />
        {err && <p className="text-sm text-rose-600">{err}</p>}
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </div>
  );
}
