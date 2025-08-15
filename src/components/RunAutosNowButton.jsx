import React, { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import useUserProfile from "../hooks/useUserProfile";

/** Admin-only button that calls the callable Cloud Function to rebuild all autos now. */
export default function RunAutosNowButton({ className = "" }) {
  const { profile, loading } = useUserProfile();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const isAdmin =
    !loading &&
    ((Array.isArray(profile?.roles) && profile.roles.includes("admin")) ||
      profile?.role === "admin") &&
    profile?.suspended !== true;

  if (loading || !isAdmin) return null;

  async function handleClick() {
    try {
      setBusy(true);
      setMsg("");
      const fn = httpsCallable(functions, "rebuildAutosNow");
      const res = await fn();
      if (res?.data?.ok) setMsg("Triggered");
      else setMsg("Done");
    } catch (e) {
      console.error(e);
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={[
        "btn btn-primary btn-sm",
        "rounded-lg",
        busy ? "opacity-70 cursor-not-allowed" : "",
        className,
      ].join(" ")}
      title="Trigger the Cloud Function to rebuild Daily auto reports now"
    >
      {busy ? "Rebuilding…" : "Rebuild Daily Autos Now"}
      {msg ? <span className="ml-2 text-xs text-ink/70">{msg}</span> : null}
    </button>
  );
}
