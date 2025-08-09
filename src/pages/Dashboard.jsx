import React from "react";
import { useAuth } from "../AuthContext";

export default function Dashboard() {
  const { user, signout } = useAuth();
  return (
    <div>
      <h2>Member Dashboard</h2>
      <p>Welcome, <b>{user?.displayName || user?.email}</b></p>
      <button onClick={signout}>Sign out</button>
    </div>
  );
}
