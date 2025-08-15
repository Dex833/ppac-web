import React, { useState, useRef, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function LoginModal({ open, onClose, onSuccess }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(null);
  const [lastSubmit, setLastSubmit] = useState(0);
  const idRef = useRef();
  const timerRef = useRef();

  // Autofocus on open
  useEffect(() => {
    if (open && idRef.current) {
      setTimeout(() => idRef.current.focus(), 100);
    }
  }, [open]);

  // Auto-dismiss error after 4s
  useEffect(() => {
    if (err) {
      timerRef.current = setTimeout(() => setErr(""), 4000);
      return () => clearTimeout(timerRef.current);
    }
  }, [err]);

  // Lockout timer
  useEffect(() => {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const timeout = setTimeout(() => setLockoutUntil(null), lockoutUntil - Date.now());
      return () => clearTimeout(timeout);
    }
  }, [lockoutUntil]);

  function looksLikeEmail(v) {
    return v.includes("@");
  }

  async function resolveEmailFromMemberId(mid) {
    const id = String(mid).trim();
    if (!id) throw new Error("Enter your Member ID or Email");
    const snap = await getDoc(doc(db, "memberLookup", id));
    if (!snap.exists()) {
      throw new Error("Member ID not found. Please use your email or contact support.");
    }
    const data = snap.data() || {};
    if (!data.email) {
      throw new Error("No email linked to this Member ID.");
    }
    return data.email;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (busy || lockoutUntil && Date.now() < lockoutUntil) return;
    // Debounce: prevent rapid submits
    if (Date.now() - lastSubmit < 1000) return;
    setLastSubmit(Date.now());
    setErr("");
    setBusy(true);
    try {
      const id = identifier.trim();
      const pass = password.trim();
      const email = looksLikeEmail(id) ? id : await resolveEmailFromMemberId(id);
      await signInWithEmailAndPassword(auth, email, pass);
      setBusy(false);
      setIdentifier("");
      setPassword("");
      setFailCount(0);
      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (e) {
      setFailCount(f => f + 1);
      if (failCount + 1 >= 5) {
        setLockoutUntil(Date.now() + 30000); // 30s lockout
        setErr("Too many failed attempts. Please wait 30 seconds.");
      } else {
        setErr("Invalid credentials or password. Please try again.");
      }
      setBusy(false);
    }
  }

  // Keyboard accessibility
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === "Escape") onClose && onClose();
      if (e.key === "Enter" && document.activeElement.tagName !== "BUTTON") {
        onSubmit(e);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, identifier, password, busy, lockoutUntil]);

  if (!open) return null;
  const isLocked = lockoutUntil && Date.now() < lockoutUntil;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative animate-fade-in">
        <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 text-xl" onClick={onClose}>&times;</button>
        <h2 className="text-xl font-bold mb-4">Sign in</h2>
        {err && (
          <div className="mb-3 rounded border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">{err}</div>
        )}
        <form onSubmit={onSubmit} className="grid gap-3" autoComplete="off">
          <label className="block">
            <span className="text-sm">Email or Member ID</span>
            <input
              className="border rounded px-3 py-2 w-full"
              value={identifier}
              onChange={e => setIdentifier(e.target.value.trimStart())}
              autoComplete="username"
              placeholder="you@example.com or 202500001"
              required
              ref={idRef}
              disabled={busy || isLocked}
            />
          </label>
          <label className="block relative">
            <span className="text-sm flex items-center gap-1">Password <span className="ml-1 text-gray-400">🔒</span></span>
            <input
              className="border rounded px-3 py-2 w-full pr-10"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="off"
              required
              disabled={busy || isLocked}
              onPaste={e => e.preventDefault()}
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-2 top-7 text-xs text-gray-500 hover:text-gray-800"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </label>
          <button
            type="submit"
            disabled={busy || isLocked}
            className="btn btn-primary disabled:opacity-60 mt-2 flex items-center justify-center"
          >
            {busy ? <span className="loader mr-2" /> : null}
            {isLocked ? `Locked (${Math.ceil((lockoutUntil - Date.now())/1000)}s)` : busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="flex items-center justify-between mt-4 text-sm">
          <a href="/reset" className="underline">Forgot password?</a>
          <span className="text-ink/70">No account? <a href="/signup" className="underline">Sign up</a></span>
        </div>
      </div>
      <style>{`.loader{border:2px solid #e5e7eb;border-top:2px solid #2563eb;border-radius:50%;width:1em;height:1em;animation:spin .8s linear infinite;display:inline-block;vertical-align:middle;}@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );
}
