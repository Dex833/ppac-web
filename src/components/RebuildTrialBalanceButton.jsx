import React, { useState } from "react";
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { endOfDayIso, normalizeToDate, buildTrialBalanceRows } from "../lib/bookkeeping";
import useUserProfile from "../hooks/useUserProfile";

export default function RebuildTrialBalanceButton() {
  const { profile, loading } = useUserProfile();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const isAdmin =
    !loading &&
    ((Array.isArray(profile?.roles) && profile.roles.includes("admin")) ||
      profile?.role === "admin") &&
    profile?.suspended !== true;

  if (!isAdmin) return null;

  async function handleRebuild() {
    try {
      setBusy(true);
      setMsg("");

      // 1) Read period from financialReports/auto_TB
      const tbRef = doc(db, "financialReports", "auto_TB");
      const tbSnap = await getDoc(tbRef);
      if (!tbSnap.exists()) {
        throw new Error("auto_TB not found. Create it first in Firestore.");
      }
      const tb = tbSnap.data();
      const periodStart = tb.periodStart || tb.from;
      const periodEnd = tb.periodEnd || tb.to;
      if (!periodEnd) throw new Error("auto_TB missing periodEnd/to.");

      // 2) Build accounts lookup (optional, for names/codes)
      const accSnap = await getDocs(query(collection(db, "accounts"), orderBy("code")));
      const accountsById = new Map(
        accSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])
      );

      // 3) Query journals up to end-of-day (supports string or Timestamp date fields)
      // Try both strategies so we’re safe:

      // Strategy A: if your journals.date is a string "YYYY-MM-DD"
      const qStr = query(
        collection(db, "journals"),
        where("date", "<=", periodEnd) // string compare works for YYYY-MM-DD
      );

      // Strategy B: if your journals.date is a Timestamp -> use a separate query fallback
      // we'll pull all and filter in memory by normalized date, to avoid composite index surprises
      const jSnap = await getDocs(qStr);
      let journals = jSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // If too few journals (maybe date is Timestamp), fetch all (bounded order) and filter locally
      if (journals.length === 0) {
        const allSnap = await getDocs(query(collection(db, "journals"), orderBy("date", "asc")));
        const EOD = new Date(endOfDayIso(periodEnd));
        journals = allSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((j) => {
            const jd = normalizeToDate(j.date);
            return jd && jd.getTime() <= EOD.getTime();
          });
      }

      // 4) Aggregate into TB rows/totals
      const { rows, totals } = buildTrialBalanceRows(journals, accountsById);

      // 5) Save back to auto_TB.payload
      await setDoc(
        tbRef,
        {
          type: "trial_balance",
          // keep existing meta/period fields as-is, just overwrite payload
          payload: {
            rows,
            totals,
          },
        },
        { merge: true }
      );

      setMsg(`Trial Balance rebuilt. ${rows.length} account(s), totals D=${totals.debit.toFixed(2)} C=${totals.credit.toFixed(2)}`);
    } catch (err) {
      console.error(err);
      setMsg(`Rebuild failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        className={[
          "px-3 py-2 rounded-lg text-sm font-medium shadow-sm transition",
          busy ? "bg-gray-300 text-gray-600" : "bg-brand-700 text-white hover:bg-brand-800",
        ].join(" ")}
        onClick={handleRebuild}
        disabled={busy}
        title="Compute Trial Balance from journals and save into auto_TB.payload"
      >
        {busy ? "Rebuilding TB…" : "Rebuild Trial Balance"}
      </button>
      {msg && <span className="text-xs text-ink/60">{msg}</span>}
    </div>
  );
}