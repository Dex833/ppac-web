import React, { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";

// Live accounts list for the dropdown / labels
function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const qAcc = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(qAcc, (snap) => {
      const rows = snap.docs
        .filter((d) => !d.data().archived)
        .map((d) => ({ id: d.id, ...d.data() }));
      setAccounts(rows);
    });
    return () => unsub();
  }, []);
  return accounts;
}

// date helper: "YYYY-MM-DD" strings compare lexicographically in order
function inRange(ymd, from, to) {
  if (!ymd) return false;
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

export default function Ledger() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ account: "", from: "", to: "" });
  const accounts = useAccounts();

  // Load journal entries in date order (oldest first)
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "journalEntries"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Build ledger lines grouped by account
  const ledger = {};
  entries.forEach((entry) => {
    (entry.lines || []).forEach((line) => {
      if (!ledger[line.accountId]) ledger[line.accountId] = [];
      ledger[line.accountId].push({
        ...line,
        refNumber: entry.refNumber,
        date: entry.date, // "YYYY-MM-DD"
        description: entry.description,
        createdBy: entry.createdBy,
      });
    });
  });

  // Filter accounts by text
  const filteredAccountIds = Object.keys(ledger).filter((accId) => {
    if (!filter.account) return true;
    const acc = accounts.find((a) => a.id === accId);
    const label = `${acc?.code ?? ""} ${acc?.main ?? ""} ${acc?.individual ?? ""}`.toLowerCase();
    return label.includes(filter.account.toLowerCase());
  });

  function getAccountName(accId) {
    const acc = accounts.find((a) => a.id === accId);
    if (!acc) return accId;
    return `${acc.code} - ${acc.main}${acc.individual ? " / " + acc.individual : ""}`;
    }

  return (
    <div className="overflow-x-auto">
      <h2 className="text-2xl font-bold mb-6">Ledger</h2>

      <div className="mb-4 flex gap-2 flex-wrap">
        <input
          className="border rounded px-2 py-1"
          placeholder="Filter by Account"
          value={filter.account}
          onChange={(e) => setFilter((f) => ({ ...f, account: e.target.value }))}
        />
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-gray-600">From</label>
            <input
              className="border rounded px-2 py-1"
              type="date"
              value={filter.from}
              onChange={(e) => setFilter((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600">To</label>
            <input
              className="border rounded px-2 py-1"
              type="date"
              value={filter.to}
              onChange={(e) => setFilter((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
          {(filter.from || filter.to || filter.account) && (
            <button
              type="button"
              className="px-2 py-1 border rounded text-sm"
              onClick={() => setFilter({ account: "", from: "", to: "" })}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : filteredAccountIds.length === 0 ? (
        <div className="text-gray-500">No accounts found.</div>
      ) : (
        filteredAccountIds.map((accId) => {
          const lines = ledger[accId]
            .filter((l) => inRange(l.date, filter.from, filter.to))
            .sort(
              (a, b) =>
                a.date.localeCompare(b.date) ||
                String(a.refNumber).localeCompare(String(b.refNumber))
            );

          let runningBalance = 0;

          // Balance for the filtered period
          const finalBalance = lines.reduce(
            (bal, line) =>
              bal + (parseFloat(line.debit) || 0) - (parseFloat(line.credit) || 0),
            0
          );

          return (
            <div key={accId} className="mb-10">
              <h3 className="text-lg font-semibold mb-2">
                {getAccountName(accId)}{" "}
                <span className="text-gray-600 font-normal text-base">
                  Remaining Balance —{" "}
                  {finalBalance.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </h3>

              <table className="min-w-full border border-gray-300 rounded text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 border-b border-r border-gray-200">Date</th>
                    <th className="text-left p-2 border-b border-r border-gray-200">Ref#</th>
                    <th className="text-left p-2 border-b border-r border-gray-200">Description</th>
                    <th className="text-left p-2 border-b border-r border-gray-200">Debit</th>
                    <th className="text-left p-2 border-b border-r border-gray-200">Credit</th>
                    <th className="text-left p-2 border-b border-r border-gray-200">Balance</th>
                    <th className="text-left p-2 border-b">Created By</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-gray-500 text-center">
                        No transactions.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line, idx) => {
                      runningBalance +=
                        (parseFloat(line.debit) || 0) -
                        (parseFloat(line.credit) || 0);
                      return (
                        <tr key={idx} className="odd:bg-white even:bg-gray-50">
                          <td className="p-2 border-b border-r border-gray-200">
                            {line.date}
                          </td>
                          <td className="p-2 border-b border-r border-gray-200 font-mono">
                            {line.refNumber}
                          </td>
                          <td className="p-2 border-b border-r border-gray-200">
                            {line.description}
                          </td>
                          <td className="p-2 border-b border-r border-gray-200 text-right">
                            {line.debit
                              ? Number(line.debit).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })
                              : ""}
                          </td>
                          <td className="p-2 border-b border-r border-gray-200 text-right">
                            {line.credit
                              ? Number(line.credit).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })
                              : ""}
                          </td>
                          <td className="p-2 border-b border-r border-gray-200 text-right">
                            {runningBalance.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
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
      )}
    </div>
  );
}