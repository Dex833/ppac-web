// src/pages/Dashboard.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { auth, db } from "../lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";

// decide if members/{uid} has enough info
function isMemberProfileComplete(m) {
  if (!m) return false;
  const required = [
    "firstName",
    "lastName",
    "birthdate",
    "birthplace",
    "sex",           // "female" | "male"
    "civilStatus",   // "single" | "married" | "widow" | "separated"
    "address",       // current address
    "profilePhotoURL",
    "idPhotoURL",
  ];
  return required.every((k) => {
    const v = m[k];
    return typeof v === "string" ? v.trim().length > 0 : !!v;
  });
}

export default function Dashboard() {
  const { user, signout } = useAuth();
  const nav = useNavigate();

  // users/{uid}
  const [profile, setProfile] = useState(null);
  const [loadingUserDoc, setLoadingUserDoc] = useState(true);

  // members/{uid}
  const [member, setMember] = useState(null);
  const [loadingMemberDoc, setLoadingMemberDoc] = useState(true);

  const [memberIdField, setMemberIdField] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  // Not signed in → friendly message
  if (!user) {
    return (
      <div className="min-h-screen bg-surface text-ink">
        <main className="max-w-3xl mx-auto p-6">
          <div className="card p-8 text-center">
            <h2 className="text-2xl font-bold">You’re not signed in</h2>
            <p className="mt-2 text-ink/70">Please sign in to view your dashboard.</p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link to="/signup" className="btn btn-outline">Create account</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Realtime users/{uid} (bootstrap if missing; never touch memberId/admin fields here)
  useEffect(() => {
    if (!user?.uid) {
      setProfile(null);
      setMemberIdField("");
      setLoadingUserDoc(false);
      return;
    }

    setLoadingUserDoc(true);
    const ref = doc(db, "users", user.uid);

    // create if missing (safe fields only)
    (async () => {
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(
            ref,
            {
              uid: user.uid,
              email: user.email || "",
              displayName: user.displayName || "",
              phone: "",
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch (e) {
        console.warn("[dashboard] init users doc:", e);
      }
    })();

    // live listener (updates memberId instantly when signup sets it)
    const unsub = onSnapshot(
      ref,
      (s) => {
        const data = s.exists() ? s.data() : null;
        setProfile(data);
        setMemberIdField(
          typeof data?.memberId === "string" ? data.memberId : (data?.memberId ?? "")
        );
        setLoadingUserDoc(false);
      },
      (e) => {
        console.warn("[dashboard] users onSnapshot:", e);
        setLoadingUserDoc(false);
      }
    );

    return () => unsub();
  }, [user?.uid, user?.email, user?.displayName]);

  // Load members/{uid} (detailed profile)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.uid) {
        if (alive) {
          setMember(null);
          setLoadingMemberDoc(false);
        }
        return;
      }
      setLoadingMemberDoc(true);
      try {
        const ref = doc(db, "members", user.uid);
        const snap = await getDoc(ref);
        if (alive) setMember(snap.exists() ? snap.data() : null);
      } catch (e) {
        console.warn("[dashboard] members doc read failed:", e);
        if (alive) setMember(null);
      } finally {
        if (alive) setLoadingMemberDoc(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.uid]);

  // Spinners while fetching both docs
  if (loadingUserDoc || loadingMemberDoc) {
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
  const memberComplete = isMemberProfileComplete(member);

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

          {/* Prompt to complete member profile IF incomplete */}
          {!memberComplete && (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Help us know you better. Please complete your member profile.{" "}
              <Link to="/profile" className="underline decoration-blue-600 hover:text-blue-700">
                Go to Profile
              </Link>
            </div>
          )}

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
              <dd className="text-sm">{memberIdField || "—"}</dd>
            </div>
          </dl>

          {/* Optional: member profile highlights */}
          {member && (
            <div className="mt-6">
              <h3 className="font-semibold mb-2">Member Profile</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink/50">Name</dt>
                  <dd className="text-sm">
                    {[member.firstName, member.middleName, member.lastName].filter(Boolean).join(" ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink/50">Birth</dt>
                  <dd className="text-sm">
                    {member.birthdate || "—"}
                    {member.birthplace ? ` • ${member.birthplace}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink/50">Sex / Status</dt>
                  <dd className="text-sm">
                    {member.sex || "—"}
                    {member.civilStatus ? ` • ${member.civilStatus}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink/50">Current Address</dt>
                  <dd className="text-sm">{member.address || "—"}</dd>
                </div>
              </dl>
            </div>
          )}

          {/* Actions: only ONE profile button, no Sign out */}
          <div className="mt-8 flex items-center gap-3">
            {memberComplete ? (
              <Link to="/profile" className="btn btn-primary">Edit Profile</Link>
            ) : (
              <Link to="/profile" className="btn btn-primary">Complete Member Profile</Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
