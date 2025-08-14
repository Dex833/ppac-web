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
import useUserProfile from "../hooks/useUserProfile";

/* ---------- Config ---------- */
const BEGIN_DATE = "2025-01-01"; // compute IS from this date up to auto_IS.periodEnd

/* ---------- Helpers ---------- */
const S = (v) => String(v ?? "");
const isRevenueType = (t) => {
  const v = S(t).toLowerCase();
  return v === "revenue" || v === "income";
};
const isExpenseType = (t) => S(t).toLowerCase() === "expense";
const isCOGS = (acc) => S(acc?.main).trim().toLowerCase() === "cogs";

/** Sum (strict period) for one account: from < d <= to */
function sumForAccount(journals, accId, fromYMD, toYMD) {
  let debit = 0,
    credit = 0;
  for (const j of journals) {
    const d = S(j?.date);
    if (fromYMD && !(d > fromYMD)) continue; // strictly after start
    if (toYMD && !(d <= toYMD)) continue; // up to and including end
    for (const l of j?.lines || []) {
      if (l?.accountId === accId) {
        debit += parseFloat(l.debit) || 0;
        credit += parseFloat(l.credit) || 0;
      }
    }
  }
  return { debit, credit };
}

function amtForIS(acc, journals, fromYMD, toYMD) {
  const { debit, credit } = sumForAccount(journals, acc.id, fromYMD, toYMD);
  // revenues: credit - debit ; expenses/COGS: debit - credit
  if (isRevenueType(acc.type)) return credit - debit;
  // treat *all* expenses (including COGS) as debit - credit
  if (isExpenseType(acc.type)) return debit - credit;
  return 0;
}

function fmt(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* ---------- Component ---------- */
export default function RebuildIncomeStatementButton({ className = "" }) {
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

      // 1) Load auto_IS doc for the date window
      const isRef = doc(db, "financialReports", "auto_IS");
      const isSnap = await getDoc(isRef);
      if (!isSnap.exists()) throw new Error("auto_IS not found.");
      const isDoc = isSnap.data();

      // We always compute from BEGIN_DATE → periodEnd (daily roll-up rule)
      const periodEnd = isDoc.periodEnd || isDoc.to;
      if (!periodEnd) throw new Error("auto_IS missing periodEnd/to.");
      const fromYMD = BEGIN_DATE;
      const toYMD = periodEnd;

      // 2) Accounts (for code/name/type/COGS grouping)
      const accSnap = await getDocs(query(collection(db, "accounts"), orderBy("code")));
      const accounts = accSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const revAccs = accounts.filter((a) => isRevenueType(a.type));
      const expAccs = accounts.filter((a) => isExpenseType(a.type));
      const cogsAccs = expAccs.filter(isCOGS);
      const opExAccs = expAccs.filter((a) => !isCOGS(a));

      // 3) Journal entries for the range (index if available; fallback local)
      const col = collection(db, "journalEntries");
      let jSnap;
      try {
        jSnap = await getDocs(
          query(
            col,
            where("date", ">=", fromYMD),
            where("date", "<=", toYMD)
          )
        );
      } catch {
        // range query might require an index — fallback to order + local filter
        try {
          const snap = await getDocs(query(col, orderBy("date", "asc")));
          jSnap = { docs: snap.docs.filter((d) => {
            const dd = S(d.data()?.date);
            return (!fromYMD || dd >= fromYMD) && (!toYMD || dd <= toYMD);
          }) };
        } catch {
          const snap = await getDocs(col);
          jSnap = { docs: snap.docs.filter((d) => {
            const dd = S(d.data()?.date);
            return (!fromYMD || dd >= fromYMD) && (!toYMD || dd <= toYMD);
          }) };
        }
      }
      const journals = jSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 4) Build sections
      const mapRow = (acc) => ({
        code: acc.code,
        name: acc.main + (acc.individual ? " / " + acc.individual : ""),
        amount: amtForIS(acc, journals, fromYMD, toYMD),
      });

      const revenues = revAccs.map(mapRow).filter((r) => r.amount !== 0);
      const cogs = cogsAccs.map(mapRow).filter((r) => r.amount !== 0);
      const expenses = opExAccs.map(mapRow).filter((r) => r.amount !== 0);

      // 5) Totals
      const totalRevenue = revenues.reduce((s, r) => s + (r.amount || 0), 0);
      const totalCOGS = cogs.reduce((s, r) => s + (r.amount || 0), 0);
      const grossProfit = totalRevenue - totalCOGS;
      const totalExpense = expenses.reduce((s, r) => s + (r.amount || 0), 0);
      const netIncome = grossProfit - totalExpense;

      // 6) Save back to auto_IS.payload
      await setDoc(
        isRef,
        {
          type: isDoc.type || "income_statement", // keep existing type
          payload: {
            sections: { revenues, cogs, expenses },
            totals: { totalRevenue, totalCOGS, grossProfit, totalExpense, netIncome },
          },
        },
        { merge: true }
      );

      setMsg(
        `Income Statement rebuilt — Rev ${fmt(totalRevenue)}, COGS ${fmt(
          totalCOGS
        )}, OpEx ${fmt(totalExpense)}, Net ${fmt(netIncome)}`
      );
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
  className={["btn btn-primary", "disabled:opacity-50", className].join(" ")}
        onClick={handleRebuild}
        disabled={busy}
        title="Compute Income Statement (2025-01-01 → auto_IS.periodEnd) and save into auto_IS.payload"
      >
        {busy ? "Rebuilding IS…" : "Rebuild Income Statement"}
      </button>
      {msg && <span className="text-xs text-ink/60">{msg}</span>}
    </div>
  );
}