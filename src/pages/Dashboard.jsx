import React, { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function Dashboard() {
  const { user, signout } = useAuth();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) setProfile(snap.data());
    })();
  }, [user?.uid]);

  return (
    <div>
      <h2>Member Dashboard</h2>
      <p>Welcome, <b>{profile?.displayName || user?.email}</b></p>
      <p>Email: {profile?.email}</p>
      <p>Role: {profile?.role || "member"}</p>
      <button onClick={signout}>Sign out</button>
    </div>
  );
}
