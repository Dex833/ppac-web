import React, { useState } from "react";
import { db } from "../lib/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { ymdManila, asOfIsoManila, TZ } from "../lib/manilaTime";
import useUserProfile from "../hooks/useUserProfile";

/**
 * Small admin-only button that overwrites:
 * financialReports/auto_TB, auto_IS, auto_BS, auto_CF
 * with today's Asia/Manila date, meta, and placeholders.
 */
export default function DailyReportsUpdateButton() {
  const { profile, loading } = useUserProfile();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const isAdmin =
    !loading &&
    profile &&
    Array.isArray(profile.roles) &&
    profile.roles.includes("admin") &&
    !profile.suspended;

  async function handleUpdate() {
    try {
      setBusy(true);
      setMsg("");
      const now = new Date();
      const ymd = ymdManila(now);
      const meta = { asOfIso: asOfIsoManila(now), timeZone: TZ };

      const base = {
        status: "generated",
        label: "Daily auto report",
        periodStart: ymd,
        periodEnd: ymd,
        createdAt: serverTimestamp(),
        createdByUid: "system",
        createdByName: "Auto Generator",
        meta,
      };

      const batch = writeBatch(db);

      // Trial Balance
      batch.set(doc(db, "financialReports", "auto_TB"), {
        ...base,
        type: "trial_balance",
        payload: { rows: [], totals: {} },
      });

      // Income Statement
      batch.set(doc(db, "financialReports", "auto_IS"), {
        ...base,
        type: "income_statement",
        payload: { sections: [], totals: {} },
      });

      // Balance Sheet
      batch.set(doc(db, "financialReports", "auto_BS"), {
        ...base,
        type: "balance_sheet",
        payload: { sections: [], totals: {} },
      });

      // Cash Flow (daily rule: startCash = 0; endCash = netChangeCash)
      const netChangeCash = 0;
      batch.set(doc(db, "financialReports", "auto_CF"), {
        ...base,
        type: "cash_flow",
        payload: {
          sections: [],
          summary: {
            startCash: 0,
            netChangeCash,
            endCash: netChangeCash,
          },
        },
      });

      await batch.commit();
      setMsg(`Daily reports updated for ${ymd}.`);
    } catch (err) {
      console.error(err);
      setMsg(`Update failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  if (!isAdmin) return null;

  return (
    <div className="flex items-center gap-3 my-2">
      <button
        onClick={handleUpdate}
        disabled={busy}
        className={[
          "px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition",
          busy ? "bg-gray-300 text-gray-600" : "bg-brand-600 text-white hover:bg-brand-700",
        ].join(" ")}
        title="Overwrite the four daily docs with today's date"
      >
        {busy ? "Updating…" : "Update Daily Reports Now"}
      </button>
      {msg ? <span className="text-sm text-ink/70">{msg}</span> : null}
    </div>
  );
}