import React, { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { auth, db } from "../lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile as fbUpdateProfile } from "firebase/auth";

export default function Dashboard() {
  const { user, signout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // form fields
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [memberId, setMemberId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setLoading(true);
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        // create default profile if missing
        await setDoc(ref, {
          uid: user.uid,
          email: user.email || "",
          displayName: user.displayName || "",
          role: "member",
          phone: "",
          memberId: "",
          createdAt: serverTimestamp(),
        });
        const fresh = await getDoc(ref);
        setProfile(fresh.data());
      } else {
        setProfile(snap.data());
      }
      setLoading(false);
    })();
  }, [user?.uid]);

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

      // also update Firebase Auth displayName
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

  if (loading) return <p>Loading…</p>;

  const emailToShow = profile?.email || user?.email || "";

  return (
    <div>
      <h2>Member Dashboard</h2>

      {!editing ? (
        <>
          <p>Welcome, <b>{profile?.displayName || user?.email}</b></p>
          <p>Email: {emailToShow}</p>
          <p>Role: {profile?.role || "member"}</p>
          <p>Phone: {profile?.phone || "—"}</p>
          <p>Member ID: {profile?.memberId || "—"}</p>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={startEdit}>Edit Profile</button>
            <button onClick={async () => { await signout(); }}>Sign out</button>
          </div>
        </>
      ) : (
        <form onSubmit={saveProfile} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
          <label>
            Full name
            <input value={displayName} onChange={e=>setDisplayName(e.target.value)} />
          </label>
          <label>
            Phone
            <input value={phone} onChange={e=>setPhone(e.target.value)} />
          </label>
          <label>
            Member ID
            <input value={memberId} onChange={e=>setMemberId(e.target.value)} />
          </label>

          {err && <small style={{ color: "crimson" }}>{err}</small>}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
