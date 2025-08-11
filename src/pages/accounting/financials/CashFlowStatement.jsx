import React, { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";

function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const qAcc = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(qAcc, (snap) => {
      setAccounts(snap.docs.filter(d => !d.data().archived).map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  return accounts;
}

export default function CashFlowStatement() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const accounts = useAccounts();

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "journalEntries"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Classify accounts
  const cashAccounts = accounts.filter(a => a.type === "Asset" && /cash|bank/i.test(a.main));
  const operating = accounts.filter(a => a.cashFlowCategory === "Operating");
  const investing = accounts.filter(a => a.cashFlowCategory === "Investing");
  const financing = accounts.filter(a => a.cashFlowCategory === "Financing");

  function getNetChange(accountList) {
    return accountList.reduce((sum, acc) => {
      let debit = 0, credit = 0;
      entries.forEach(entry => {
        (entry.lines || []).forEach(line => {
          if (line.accountId === acc.id) {
            debit += parseFloat(line.debit) || 0;
            credit += parseFloat(line.credit) || 0;
          }
        });
      });
      // For cash flow: Asset (cash/bank) = debit - credit
      return sum + (debit - credit);
    }, 0);
  }

  const netOperating = getNetChange(operating);
  const netInvesting = getNetChange(investing);
  const netFinancing = getNetChange(financing);
  const netCash = getNetChange(cashAccounts);

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Cash Flow Statement</h3>
      {loading ? <div>Loading…</div> : (
        <table className="min-w-full border border-gray-300 rounded text-sm mb-6">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">Activity</th>
              <th className="text-right p-2 border-b">Net Cash Flow</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="font-bold p-2">Operating Activities</td><td className="p-2 text-right">{netOperating.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
            <tr><td className="font-bold p-2">Investing Activities</td><td className="p-2 text-right">{netInvesting.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
            <tr><td className="font-bold p-2">Financing Activities</td><td className="p-2 text-right">{netFinancing.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
            <tr className="font-bold bg-gray-100"><td className="p-2 border-t text-right">Net Increase (Decrease) in Cash</td><td className="p-2 border-t text-right">{netCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
