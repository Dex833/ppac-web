import React, { useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

/* ---------- small utils ---------- */
function ymd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const fmt2 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/* Normalize account type checks */
const isAsset = (t) => String(t || "").toLowerCase() === "asset";
const isLiability = (t) => String(t || "").toLowerCase() === "liability";
const isEquity = (t) => String(t || "").toLowerCase() === "equity";
const isRevenue = (t) => {
  const v = String(t || "").toLowerCase();
  return v === "revenue" || v === "income";
};
const isExpense = (t) => String(t || "").toLowerCase() === "expense";

export default function RebuildBalanceSheetButton({ className = "" }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function handleRebuild() {
    setBusy(true);
    setNote("");

    try {
      /* ---- load data ---- */
      const [accSnap, jeSnap] = await Promise.all([
        getDocs(query(collection(db, "accounts"), orderBy("code"))),
        getDocs(query(collection(db, "journalEntries"), orderBy("createdAt", "asc"))),
      ]);

      const accounts = accSnap.docs
        .filter((d) => !d.data().archived)
        .map((d) => ({ id: d.id, ...d.data() }));

      const entries = jeSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const today = ymd(new Date());

      /* ---- previous saved BS (periodic, not auto) to seed retained ---- */
      const bsSnap = await getDocs(
        query(
          collection(db, "financialReports"),
          where("type", "in", ["balance_sheet", "balanceSheet"])
        )
      );
      const bsRows = bsSnap.docs
        .filter((d) => d.id !== "auto_BS")
        .map((d) => ({ id: d.id, ...d.data() }))
        .map((r) => ({
          ...r,
          _asOf: r.asOf || r.to || r.from || "", // unify
        }))
        .filter((r) => r._asOf && r._asOf < today)
        .sort((a, b) => a._asOf.localeCompare(b._asOf));

      const previousBS = bsRows.length ? bsRows[bsRows.length - 1] : null;
      const prevAsOf = previousBS?._asOf || "";
      const prevRetained =
        previousBS?.report?.retainedIncomeEnding != null
          ? Number(previousBS.report.retainedIncomeEnding) || 0
          : 0;

      /* ---- helpers ---- */

      // Sum JE lines for an account up to & including a date
      function amountAsOf(acc, limitYMD) {
        let debit = 0,
          credit = 0;
        (entries || [])
          .filter((e) => (e.date || "") <= limitYMD)
          .forEach((e) => {
            (e.lines || []).forEach((l) => {
              if (l.accountId === acc.id) {
                debit += Number(l.debit || 0);
                credit += Number(l.credit || 0);
              }
            });
          });

        if (isAsset(acc.type)) return debit - credit;
        if (isLiability(acc.type) || isEquity(acc.type)) return credit - debit;
        return 0;
      }

      // Compute net income between (prevAsOf, today]
      function netIncomeBetween(fromExclusiveYMD, toInclusiveYMD) {
        const acctById = new Map(accounts.map((a) => [a.id, a]));
        let rev = 0,
          exp = 0;

        (entries || []).forEach((e) => {
          const d = e.date || "";
          if (!(d > (fromExclusiveYMD || "") && d <= toInclusiveYMD)) return;
          (e.lines || []).forEach((l) => {
            const acc = acctById.get(l.accountId);
            if (!acc) return;
            const debit = Number(l.debit || 0);
            const credit = Number(l.credit || 0);
            if (isRevenue(acc.type)) rev += credit - debit;
            else if (isExpense(acc.type)) exp += debit - credit;
          });
        });

        return rev - exp;
      }

      /* ---- build rows as of today ---- */
      const assets = accounts
        .filter((a) => isAsset(a.type))
        .map((a) => ({
          id: a.id,
          code: a.code,
          name: a.main + (a.individual ? " / " + a.individual : ""),
          amount: amountAsOf(a, today),
        }));

      const liabilities = accounts
        .filter((a) => isLiability(a.type))
        .map((a) => ({
          id: a.id,
          code: a.code,
          name: a.main + (a.individual ? " / " + a.individual : ""),
          amount: amountAsOf(a, today),
        }));

      const equityBase = accounts
        .filter((a) => isEquity(a.type))
        .map((a) => ({
          id: a.id,
          code: a.code,
          name: a.main + (a.individual ? " / " + a.individual : ""),
          amount: amountAsOf(a, today),
        }));

      // Retained = previous retained + NI since previous BS (or NI YTD if none)
      const netInc = netIncomeBetween(prevAsOf, today);
      const retainedIncomeEnding = prevRetained + netInc;

      const equity = [
        ...equityBase,
        {
          id: "RETAINED",
          code: "RE",
          name: "Retained Income / Loss",
          amount: retainedIncomeEnding,
        },
      ];

      const sum = (rows) =>
        rows.reduce((s, r) => s + Number(r.amount || 0), 0);

      const totals = {
        assets: sum(assets),
        liabilities: sum(liabilities),
        equity: sum(equity),
      };
      totals.liabPlusEquity = totals.liabilities + totals.equity;

      /* ---- save to financialReports/auto_BS ---- */
      await setDoc(
        doc(db, "financialReports", "auto_BS"),
        {
          id: "auto_BS",
          type: "balance_sheet",
          label: "Balance Sheet",
          from: today,
          to: today,
          createdAt: serverTimestamp(),
          payload: {
            sections: { assets, liabilities, equity },
            totals,
            retainedIncomeEnding, // convenience for viewers
            sourcePrevBS: previousBS ? { id: previousBS.id, asOf: prevAsOf } : null,
          },
        },
        { merge: true }
      );

      setNote(
        `Balanced ✓  Assets ${fmt2(totals.assets)}  |  Liab+Eq ${fmt2(
          totals.liabPlusEquity
        )}  |  Retained ${fmt2(retainedIncomeEnding)}`
      );
    } catch (e) {
      console.error(e);
      setNote(`Failed: ${e?.message || e}`);
      alert("Rebuild Balance Sheet failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
  className={["btn btn-primary", "disabled:opacity-50", className].join(" ")}
        onClick={handleRebuild}
        disabled={busy}
      >
        {busy ? "Rebuilding…" : "Rebuild Balance Sheet"}
      </button>
      {!!note && <span className="text-xs text-ink/60">{note}</span>}
    </div>
  );
}
