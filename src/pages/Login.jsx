import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function Login() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <p>Already logged in. <a href="/dashboard">Go to dashboard</a></p>;

  async function handleLogin(e) {
    e.preventDefault();
    setErr("");
    try {
      setBusy(true);
      const cred = await signInWithEmailAndPassword(auth, email, pass);

      // If email is not verified, send them to /verify
      if (!cred.user.emailVerified) {
        nav("/verify");
      } else {
        nav("/dashboard");
      }
    } catch (e) {
      setErr(e.code || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Login</h2>
      <form onSubmit={handleLogin} style={{ display: "grid", gap: 8, maxWidth: 320 }}>
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={e=>setEmail(e.target.value)}
        />
        <input
          placeholder="Password"
          type="password"
          value={pass}
          onChange={e=>setPass(e.target.value)}
        />
        <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign In"}</button>
        {err && <small style={{color:'crimson'}}>{err}</small>}
      </form>
      <p>No account? <Link to="/signup">Create one</Link></p>
      <p style={{marginTop:8}}>
        <Link to="/reset">Forgot your password?</Link>
      </p>
    </div>
  );
}
