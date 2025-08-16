import React, { useState } from "react";
import { functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";

export default function BackfillButton() {
  const [status, setStatus] = useState("");

  async function handleBackfill() {
    setStatus("Running backfill...");
    try {
      const backfill = httpsCallable(functions, "backfillJournalDates");
      const res = await backfill();
      if (res.data && res.data.ok) {
        setStatus(`Backfill complete. Updated: ${res.data.updated}`);
      } else {
        setStatus("Backfill failed: " + (res.data?.error || "Unknown error"));
      }
    } catch (e) {
      setStatus("Backfill failed: " + (e.message || e));
    }
    setTimeout(() => setStatus(""), 6000);
  }

  return (
    <div className="mb-4 flex items-center gap-4 bg-yellow-50 border border-yellow-200 rounded p-3">
      <button className="btn btn-sm btn-warning" onClick={handleBackfill}>
        Backfill Journal Dates
      </button>
      {status && <span className="text-sm">{status}</span>}
      <span className="text-xs text-yellow-700">(Admin only, remove after migration)</span>
    </div>
  );
}
