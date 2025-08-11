
import React, { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";

// Helper to get accounts
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


export default function TrialBalance() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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

  // Calculate balances for each account
  const accountBalances = accounts.map(acc => {
    let debit = 0, credit = 0;
    entries.forEach(entry => {
      (entry.lines || []).forEach(line => {
        if (line.accountId === acc.id) {
          debit += parseFloat(line.debit) || 0;
          credit += parseFloat(line.credit) || 0;
        }
      });
    });
    return {
      ...acc,
      debit,
      credit,
      balance: debit - credit
    };
  });

  const filteredBalances = accountBalances.filter(acc => {
    const label = `${acc.code} ${acc.main} ${acc.individual ?? ""}`.toLowerCase();
    return label.includes(search.toLowerCase());
  });

  const totalDebit = filteredBalances.reduce((sum, acc) => sum + acc.debit, 0);
  const totalCredit = filteredBalances.reduce((sum, acc) => sum + acc.credit, 0);
  const diff = totalDebit - totalCredit;

  return (
    <div className="overflow-x-auto">
      <h2 className="text-2xl font-bold mb-6">Trial Balance</h2>
      <div className="mb-4">
        <input
          className="border rounded px-2 py-1 w-64"
          placeholder="Search account..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      {loading ? (
        <div>Loading…</div>
      ) : (
        <table className="min-w-full border border-gray-300 rounded text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b border-r border-gray-200">Code</th>
              <th className="text-left p-2 border-b border-r border-gray-200">Account</th>
              <th className="text-right p-2 border-b border-r border-gray-200">Debit</th>
              <th className="text-right p-2 border-b">Credit</th>
            </tr>
          </thead>
          <tbody>
            {filteredBalances.map(acc => (
              <tr key={acc.id} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b border-r border-gray-200">{acc.code}</td>
                <td className="p-2 border-b border-r border-gray-200">{acc.main}{acc.individual ? ' / ' + acc.individual : ''}</td>
                <td className="p-2 border-b border-r border-gray-200 text-right">{acc.debit ? acc.debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
                <td className="p-2 border-b text-right">{acc.credit ? acc.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-100">
              <td colSpan={2} className="p-2 border-t text-right">Totals:</td>
              <td className="p-2 border-t border-r border-gray-200 text-right">{totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="p-2 border-t text-right">{totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            {diff !== 0 && (
              <tr className="bg-red-100 text-red-700 font-semibold">
                <td colSpan={2} className="p-2 border-t text-right">Difference:</td>
                <td colSpan={2} className="p-2 border-t text-right">{diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
