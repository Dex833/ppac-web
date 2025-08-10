import React, { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function Signup() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  if (user) return <p>Already logged in. <a href="/dashboard">Go to dashboard</a></p>;

  async function handleSignup(e) {
    e.preventDefault();
    setErr("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);

      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }

      // Create Firestore profile: users/{uid}
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        email,
        displayName: name || "",
        role: "member",
        createdAt: serverTimestamp(),
      });

      // Send verification email, then go to /verify
      await sendEmailVerification(cred.user);
      nav("/verify");
    } catch (e) {
      setErr(e.code || "Signup failed");
    }
  }

  return (
    <div>
      <h2>Signup</h2>
      <form onSubmit={handleSignup} style={{ display: "grid", gap: 8, maxWidth: 320 }}>
        <input
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          placeholder="Password"
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
        <button type="submit">Create Account</button>
        {err && <small style={{ color: "crimson" }}>{err}</small>}
      </form>
      <p>Have an account? <Link to="/login">Login</Link></p>
    </div>
  );
}
