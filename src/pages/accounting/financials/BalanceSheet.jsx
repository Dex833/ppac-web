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

export default function BalanceSheet() {
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

  // Group accounts by type
  const assets = accounts.filter(a => a.type === "Asset");
  const liabilities = accounts.filter(a => a.type === "Liability");
  const equity = accounts.filter(a => a.type === "Equity");

  function getBalance(acc) {
    let debit = 0, credit = 0;
    entries.forEach(entry => {
      (entry.lines || []).forEach(line => {
        if (line.accountId === acc.id) {
          debit += parseFloat(line.debit) || 0;
          credit += parseFloat(line.credit) || 0;
        }
      });
    });
    // Asset: debit - credit, Liability/Equity: credit - debit
    if (acc.type === "Asset") return debit - credit;
    return credit - debit;
  }

  const totalAssets = assets.reduce((sum, acc) => sum + getBalance(acc), 0);
  const totalLiabilities = liabilities.reduce((sum, acc) => sum + getBalance(acc), 0);
  const totalEquity = equity.reduce((sum, acc) => sum + getBalance(acc), 0);
  const totalLiabEquity = totalLiabilities + totalEquity;

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Balance Sheet</h3>
      {loading ? <div>Loading…</div> : (
        <div className="flex flex-wrap gap-8">
          <div className="flex-1 min-w-[300px]">
            <table className="min-w-full border border-gray-300 rounded text-sm mb-6">
              <thead className="bg-gray-50">
                <tr><th className="text-left p-2 border-b">Assets</th><th className="text-right p-2 border-b">Amount</th></tr>
              </thead>
              <tbody>
                {assets.map(acc => (
                  <tr key={acc.id}>
                    <td className="p-2 border-b border-r border-gray-200">{acc.code} - {acc.main}{acc.individual ? ' / ' + acc.individual : ''}</td>
                    <td className="p-2 border-b text-right">{getBalance(acc).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100"><td className="p-2 border-t text-right">Total Assets</td><td className="p-2 border-t text-right">{totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="flex-1 min-w-[300px]">
            <table className="min-w-full border border-gray-300 rounded text-sm mb-6">
              <thead className="bg-gray-50">
                <tr><th className="text-left p-2 border-b">Liabilities & Equity</th><th className="text-right p-2 border-b">Amount</th></tr>
              </thead>
              <tbody>
                <tr><td colSpan={2} className="font-bold p-2">Liabilities</td></tr>
                {liabilities.map(acc => (
                  <tr key={acc.id}>
                    <td className="p-2 border-b border-r border-gray-200">{acc.code} - {acc.main}{acc.individual ? ' / ' + acc.individual : ''}</td>
                    <td className="p-2 border-b text-right">{getBalance(acc).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="font-bold"><td className="p-2 border-t border-r border-gray-200 text-right">Total Liabilities</td><td className="p-2 border-t text-right">{totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                <tr><td colSpan={2} className="font-bold p-2">Equity</td></tr>
                {equity.map(acc => (
                  <tr key={acc.id}>
                    <td className="p-2 border-b border-r border-gray-200">{acc.code} - {acc.main}{acc.individual ? ' / ' + acc.individual : ''}</td>
                    <td className="p-2 border-b text-right">{getBalance(acc).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="font-bold"><td className="p-2 border-t border-r border-gray-200 text-right">Total Equity</td><td className="p-2 border-t text-right">{totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                <tr className="font-bold bg-gray-100"><td className="p-2 border-t border-r border-gray-200 text-right">Total Liabilities & Equity</td><td className="p-2 border-t text-right">{totalLiabEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
