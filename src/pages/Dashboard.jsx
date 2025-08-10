// src/pages/Dashboard.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { auth, db } from "../lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile as fbUpdateProfile } from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";

export default function Dashboard() {
  const { user, signout } = useAuth();
  const nav = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // form fields
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [memberId, setMemberId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user?.uid) {
      setProfile(null);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          uid: user.uid,
          email: user.email || "",
          displayName: user.displayName || "",
          role: "member",              // legacy single role (kept for compat)
          roles: ["member"],           // modern roles array
          phone: "",
          memberId: "",
          verifiedByAdmin: false,      // <-- ensure field exists
          createdAt: serverTimestamp(),
        });
      }
      const fresh = await getDoc(ref);
      setProfile(fresh.data());
      setLoading(false);
    })();
  }, [user?.uid, db]);

  function startEdit() {
    setErr("");
    setDisplayName(profile?.displayName || user?.displayName || "");
    setPhone(profile?.phone || "");
    setMemberId(profile?.memberId || "");
    setEditing(true);
  }

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const ref = doc(db, "users", user.uid);
      await updateDoc(ref, {
        displayName: displayName || "",
        phone: phone || "",
        memberId: memberId || "",
        updatedAt: serverTimestamp(),
      });

      if ((user?.displayName || "") !== (displayName || "")) {
        await fbUpdateProfile(auth.currentUser, { displayName: displayName || "" });
      }

      const fresh = await getDoc(ref);
      setProfile(fresh.data());
      setEditing(false);
    } catch (e) {
      setErr(e.code || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    try {
      setSigningOut(true);
      await signout();
    } finally {
      nav("/", { replace: true });
    }
  }

  // 1) Show a friendly message if not signed in
  if (!user) {
    return (
      <div className="min-h-screen bg-surface text-ink">
        <main className="max-w-3xl mx-auto p-6">
          <div className="card p-8 text-center">
            <h2 className="text-2xl font-bold">You’re not signed in</h2>
            <p className="mt-2 text-ink/70">Please sign in to view your dashboard.</p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link to="/login" className="btn btn-primary">Go to Login</Link>
              <Link to="/signup" className="btn btn-outline">Create account</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 2) While fetching profile for a signed-in user
  if (loading) {
    return (
      <div className="min-h-screen bg-surface text-ink">
        <main className="max-w-3xl mx-auto p-6">
          <div className="card p-8">
            <p className="text-ink/70">Loading…</p>
          </div>
        </main>
      </div>
    );
  }

  const emailToShow = profile?.email || user?.email || "";
  const adminVerified = profile?.verifiedByAdmin === true;
  const emailVerified = user?.emailVerified === true;
  const isVerified = emailVerified || adminVerified;

  return (
    <div className="min-h-screen bg-surface text-ink">
      <main className="max-w-3xl mx-auto p-6">
        <div className="card p-8">
          <header className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight">Member Dashboard</h2>
          </header>

          {/* Show ONLY if neither email-verified nor admin-verified */}
          {!isVerified && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Your account is not verified yet. Please verify your email or wait for admin verification.{" "}
              <Link to="/verify" className="underline decoration-amber-600 hover:text-amber-700">
                Go to verification
              </Link>
            </div>
          )}

          {!editing ? (
            <>
              <p className="text-ink/70 mb-6">
                Welcome, <b>{profile?.displayName || user?.email}</b>
              </p>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink/50">Email</dt>
                  <dd className="text-sm">{emailToShow}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink/50">Role</dt>
                  <dd className="text-sm">{profile?.role || "member"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink/50">Phone</dt>
                  <dd className="text-sm">{profile?.phone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink/50">Member ID</dt>
                  <dd className="text-sm">{profile?.memberId || "—"}</dd>
                </div>
              </dl>

              <div className="mt-8 flex items-center gap-3">
                <button onClick={startEdit} className="btn btn-primary">Edit Profile</button>
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="btn btn-outline disabled:opacity-60"
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={saveProfile} className="grid gap-4 max-w-xl">
              <label className="block">
                <span className="text-sm">Full name</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-400/30"
                />
              </label>

              <label className="block">
                <span className="text-sm">Phone</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-400/30"
                />
              </label>

              <label className="block">
                <span className="text-sm">Member ID</span>
                <input
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-400/30"
                />
              </label>

              {err && <p className="text-sm text-rose-600">{err}</p>}

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={saving} className="btn btn-primary disabled:opacity-60">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="btn btn-outline disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
