// src/components/RebuildTrialBalanceButton.jsx
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
import {
  endOfDayIso,
  normalizeToDate,
  buildTrialBalanceRows,
} from "../lib/bookkeeping";
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

      // 1) Read daily TB period (strings "YYYY-MM-DD")
      const tbRef = doc(db, "financialReports", "auto_TB");
      const tbSnap = await getDoc(tbRef);
      if (!tbSnap.exists()) throw new Error("auto_TB not found.");
      const tb = tbSnap.data();
      const periodStart = tb.periodStart || tb.from; // may be undefined (open-begin)
      const periodEnd = tb.periodEnd || tb.to;
      if (!periodEnd) throw new Error("auto_TB missing periodEnd/to.");

      const SOD = periodStart ? normalizeToDate(periodStart) : null;
      const EOD = new Date(endOfDayIso(periodEnd));

      // 2) Accounts lookup (for code/name)
      const accSnap = await getDocs(query(collection(db, "accounts"), orderBy("code")));
      const accountsById = new Map(
        accSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])
      );

      // 3) Fetch journalEntries by string date
      const col = collection(db, "journalEntries");
      let jSnap;
      try {
        // Works lexicographically for "YYYY-MM-DD"
        jSnap = await getDocs(
          query(
            col,
            where("date", ">=", periodStart || "0000-01-01"),
            where("date", "<=", periodEnd)
          )
        );
      } catch {
        jSnap = null;
      }

      let journals = jSnap ? jSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];

      if (journals.length === 0) {
        // Range query may need an index — fall back to order + filter locally
        let all = [];
        try {
          const snap = await getDocs(query(col, orderBy("date", "asc")));
          all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch {
          // Final fallback (small datasets)
          const snap = await getDocs(col);
          all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        journals = all.filter((j) => {
          const d = j?.date || ""; // "YYYY-MM-DD"
          if (periodStart && d < periodStart) return false;
          if (periodEnd && d > periodEnd) return false;
          return true;
        });
      }

      // 4) Aggregate → TB
      const { rows, totals } = buildTrialBalanceRows(journals, accountsById);

      // 5) Save to auto_TB.payload
      await setDoc(
        tbRef,
        { type: "trial_balance", payload: { rows, totals } },
        { merge: true }
      );

      setMsg(
        `Trial Balance rebuilt. ${rows.length} account(s), totals D=${fmt(
          totals.debit
        )} C=${fmt(totals.credit)}`
      );
    } catch (err) {
      console.error(err);
      setMsg(`Rebuild failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  function fmt(n) {
    const v = Number(n || 0);
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
        title="Compute Trial Balance from journalEntries and save into auto_TB.payload"
      >
        {busy ? "Rebuilding TB…" : "Rebuild Trial Balance"}
      </button>
      {msg && <span className="text-xs text-ink/60">{msg}</span>}
    </div>
  );
}