import React, { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";

function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const qAcc = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(qAcc, (snap) => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  return accounts;
}

export default function Ledger() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ account: "", date: "" });
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

  // Build ledger lines grouped by account
  const ledger = {};
  entries.forEach(entry => {
    entry.lines.forEach(line => {
      if (!ledger[line.accountId]) ledger[line.accountId] = [];
      ledger[line.accountId].push({
        ...line,
        refNumber: entry.refNumber,
        date: entry.date,
        description: entry.description,
        createdBy: entry.createdBy,
      });
    });
  });

  // Filter accounts
  const filteredAccountIds = Object.keys(ledger).filter(accId => {
    if (!filter.account) return true;
    const acc = accounts.find(a => a.id === accId);
    return acc && (`${acc.code} ${acc.main} ${acc.individual}`.toLowerCase().includes(filter.account.toLowerCase()));
  });

  function getAccountName(accId) {
    const acc = accounts.find(a => a.id === accId);
    if (!acc) return accId;
    return `${acc.code} - ${acc.main}${acc.individual ? ' / ' + acc.individual : ''}`;
  }

  return (
    <div className="overflow-x-auto">
      <h2 className="text-2xl font-bold mb-6">Ledger</h2>
      <div className="mb-4 flex gap-2 flex-wrap">
        <input className="border rounded px-2 py-1" placeholder="Filter by Account" value={filter.account} onChange={e => setFilter(f => ({ ...f, account: e.target.value }))} />
        <input className="border rounded px-2 py-1" type="date" placeholder="Filter by Date" value={filter.date} onChange={e => setFilter(f => ({ ...f, date: e.target.value }))} />
      </div>
      {loading ? (
        <div>Loading…</div>
      ) : (
        filteredAccountIds.length === 0 ? (
          <div className="text-gray-500">No accounts found.</div>
        ) : (
          filteredAccountIds.map(accId => {
            const lines = ledger[accId]
              .filter(l => !filter.date || l.date === filter.date)
              .sort((a, b) => a.date.localeCompare(b.date) || a.refNumber.localeCompare(b.refNumber));
            let runningBalance = 0;
            return (
              <div key={accId} className="mb-10">
                <h3 className="text-lg font-semibold mb-2">{getAccountName(accId)}</h3>
                <table className="min-w-full border rounded text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2 border-b">Date</th>
                      <th className="text-left p-2 border-b">Ref#</th>
                      <th className="text-left p-2 border-b">Description</th>
                      <th className="text-left p-2 border-b">Debit</th>
                      <th className="text-left p-2 border-b">Credit</th>
                      <th className="text-left p-2 border-b">Balance</th>
                      <th className="text-left p-2 border-b">Created By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr><td colSpan={7} className="p-4 text-gray-500 text-center">No transactions.</td></tr>
                    ) : (
                      lines.map((line, idx) => {
                        runningBalance += (parseFloat(line.debit) || 0) - (parseFloat(line.credit) || 0);
                        return (
                          <tr key={idx} className="odd:bg-white even:bg-gray-50">
                            <td className="p-2 border-b">{line.date}</td>
                            <td className="p-2 border-b font-mono">{line.refNumber}</td>
                            <td className="p-2 border-b">{line.description}</td>
                            <td className="p-2 border-b text-right">{line.debit ? Number(line.debit).toFixed(2) : ""}</td>
                            <td className="p-2 border-b text-right">{line.credit ? Number(line.credit).toFixed(2) : ""}</td>
                            <td className="p-2 border-b text-right">{runningBalance.toFixed(2)}</td>
                            <td className="p-2 border-b">{line.createdBy || "-"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            );
          })
        )
      )}
    </div>
  );
}
