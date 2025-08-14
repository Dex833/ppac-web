import React, { useState } from "react";
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

function ymd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfYearYMD(d = new Date()) {
  return `${d.getFullYear()}-01-01`;
}
const fmt2 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function RebuildCashFlowButton({ className = "" }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function handleRebuild() {
    setBusy(true);
    setNote("");
    try {
      // Load accounts & journal entries
      const accSnap = await getDocs(query(collection(db, "accounts"), orderBy("code")));
      const accounts = accSnap.docs
        .filter((d) => !d.data().archived)
        .map((d) => ({ id: d.id, ...d.data() }));

      const jeSnap = await getDocs(query(collection(db, "journalEntries"), orderBy("createdAt", "asc")));
      const entries = jeSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const to = ymd(new Date());
      const from = startOfYearYMD(new Date());

      // Build BS-like balances as of a date
      const asOfBalances = (limitYMD) => {
        const list = entries.filter((e) => (e.date || "") <= limitYMD);
        const amtFor = (acc) => {
          let debit = 0, credit = 0;
          (list || []).forEach((e) => {
            (e.lines || []).forEach((l) => {
              if (l.accountId === acc.id) {
                debit += Number(l.debit || 0);
                credit += Number(l.credit || 0);
              }
            });
          });
          const t = (acc.type || "").toLowerCase();
          if (t === "asset") return debit - credit;
          if (t === "liability" || t === "equity") return credit - debit;
          return 0;
        };
        const assets = accounts
          .filter((a) => (a.type || "").toLowerCase() === "asset")
          .map((a) => ({
            code: a.code,
            name: a.main + (a.individual ? " / " + a.individual : ""),
            amount: amtFor(a),
          }));
        const equity = accounts
          .filter((a) => (a.type || "").toLowerCase() === "equity")
          .map((a) => ({
            code: a.code,
            name: a.main + (a.individual ? " / " + a.individual : ""),
            amount: amtFor(a),
          }));
        return { assets, equity };
      };

      const begin = asOfBalances(from);      // balances up to Jan 1 (inclusive)
      const end = asOfBalances(to);          // balances up to today (inclusive)

      // Helper: sum rows by fuzzy name match
      const sumBy = (rows, keys) => {
        const ks = keys.map((s) => s.toLowerCase());
        return rows.reduce((sum, r) => {
          const nm = String(r.name || "").toLowerCase();
          return sum + (ks.some((k) => nm.includes(k)) ? Number(r.amount || 0) : 0);
        }, 0);
      };

      const b = {
        cash: sumBy(begin.assets, ["cash"]),
        loanRecv: sumBy(begin.assets, ["loan receivable"]),
        inventory: sumBy(begin.assets, ["inventory"]),
        shareCap: sumBy(begin.equity, ["share capital"]),
      };
      const e = {
        cash: sumBy(end.assets, ["cash"]),
        loanRecv: sumBy(end.assets, ["loan receivable"]),
        inventory: sumBy(end.assets, ["inventory"]),
        shareCap: sumBy(end.equity, ["share capital"]),
      };

      // Net income for the period (from < d <= to)
      const acctMap = new Map(accounts.map((a) => [a.id, a]));
      let revenue = 0, expense = 0;
      (entries || []).forEach((je) => {
        const d = je.date || "";
        if (!(d > from && d <= to)) return;
        (je.lines || []).forEach((l) => {
          const acc = acctMap.get(l.accountId);
          if (!acc) return;
          const type = String(acc.type || "").toLowerCase();
          const debit = Number(l.debit || 0);
          const credit = Number(l.credit || 0);
          if (type === "revenue" || type === "income") {
            revenue += credit - debit;
          } else if (type === "expense") {
            expense += debit - credit;
          }
        });
      });
      const netIncome = revenue - expense;

      // Deltas & sections
      const dLoan = e.loanRecv - b.loanRecv;
      const dInv = e.inventory - b.inventory;
      const dWC = dLoan + dInv;
      const dSC = e.shareCap - b.shareCap;

      const sections = {
        operating: { netIncome, net: netIncome - dWC },
        investing: { net: 0 },
        financing: { net: dSC },
      };
      const summary = {
        startCash: b.cash,
        endCash: e.cash,
        netChangeCash: e.cash - b.cash,
      };

      // Save snapshot to financialReports/auto_CF
      await setDoc(
        doc(db, "financialReports", "auto_CF"),
        {
          id: "auto_CF",
          type: "cash_flow",
          label: "Cash Flow",
          from,
          to,
          createdAt: serverTimestamp(),
          payload: {
            method: "vbaStyle",
            deltas: {
              loanReceivable: dLoan,
              inventory: dInv,
              workingCapital: dWC,
              shareCapital: dSC,
            },
            sections,
            summary,
          },
        },
        { merge: true }
      );

      setNote(
        `Cash Flow rebuilt — CFO ${fmt2(sections.operating.net)}, CFF ${fmt2(
          sections.financing.net
        )}, ΔCash ${fmt2(summary.netChangeCash)}`
      );
    } catch (e) {
      console.error(e);
      setNote(`Failed: ${e?.message || e}`);
      alert("Rebuild Cash Flow failed: " + (e?.message || e));
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
        {busy ? "Rebuilding…" : "Rebuild Cash Flow"}
      </button>
      {!!note && <span className="text-xs text-ink/60">{note}</span>}
    </div>
  );
}
