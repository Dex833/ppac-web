
import React, { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { saveIncomeStatementReport, getRecentIncomeStatementReports } from "./isReports";

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


export default function IncomeStatement() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [recentReports, setRecentReports] = useState([]);
  const [showReport, setShowReport] = useState(null); // {from, to, report}
  const [generating, setGenerating] = useState(false);
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

  useEffect(() => {
    getRecentIncomeStatementReports().then(setRecentReports);
  }, [generating]);

  // Group accounts by type
  const revenues = accounts.filter(a => a.type === "Revenue");
  const expenses = accounts.filter(a => a.type === "Expense");

  function getTotal(accountList, filteredEntries) {
    return accountList.reduce((sum, acc) => {
      let credit = 0, debit = 0;
      filteredEntries.forEach(entry => {
        (entry.lines || []).forEach(line => {
          if (line.accountId === acc.id) {
            debit += parseFloat(line.debit) || 0;
            credit += parseFloat(line.credit) || 0;
          }
        });
      });
      return sum + (acc.type === "Revenue" ? (credit - debit) : (debit - credit));
    }, 0);
  }

  function filterEntriesByDate(entries, from, to) {
    if (!from && !to) return entries;
    return entries.filter(e => {
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      return true;
    });
  }

  // For current view (not saved report)
  const filteredEntries = filterEntriesByDate(entries, from, to);
  const totalRevenue = getTotal(revenues, filteredEntries);
  const totalExpense = getTotal(expenses, filteredEntries);
  const netIncome = totalRevenue - totalExpense;

  async function handleGenerate() {
    setGenerating(true);
    const report = {
      revenues: revenues.map(acc => {
        let credit = 0, debit = 0;
        filteredEntries.forEach(entry => {
          (entry.lines || []).forEach(line => {
            if (line.accountId === acc.id) {
              debit += parseFloat(line.debit) || 0;
              credit += parseFloat(line.credit) || 0;
            }
          });
        });
        return {
          code: acc.code,
          name: acc.main + (acc.individual ? ' / ' + acc.individual : ''),
          amount: credit - debit
        };
      }),
      expenses: expenses.map(acc => {
        let credit = 0, debit = 0;
        filteredEntries.forEach(entry => {
          (entry.lines || []).forEach(line => {
            if (line.accountId === acc.id) {
              debit += parseFloat(line.debit) || 0;
              credit += parseFloat(line.credit) || 0;
            }
          });
        });
        return {
          code: acc.code,
          name: acc.main + (acc.individual ? ' / ' + acc.individual : ''),
          amount: debit - credit
        };
      }),
      totalRevenue,
      totalExpense,
      netIncome,
    };
    await saveIncomeStatementReport({ from, to, report });
    setGenerating(false);
    setShowReport({ from, to, report });
    getRecentIncomeStatementReports().then(setRecentReports);
  }

  function handleShowReport(r) {
    setShowReport(r);
  }

  function handleBackToCurrent() {
    setShowReport(null);
  }

  // Render either current or saved report
  const renderReport = (reportObj) => (
    <table className="min-w-full border border-gray-300 rounded text-sm mb-6">
      <thead className="bg-gray-50">
        <tr>
          <th className="text-left p-2 border-b border-r border-gray-200">Account</th>
          <th className="text-right p-2 border-b">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr><td colSpan={2} className="font-bold p-2">Revenues</td></tr>
        {reportObj.report.revenues.map((acc, i) => (
          <tr key={acc.code + i}>
            <td className="p-2 border-b border-r border-gray-200">{acc.code} - {acc.name}</td>
            <td className="p-2 border-b text-right">{acc.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        ))}
        <tr className="font-bold"><td className="p-2 border-t border-r border-gray-200 text-right">Total Revenue</td><td className="p-2 border-t text-right">{reportObj.report.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
        <tr><td colSpan={2} className="font-bold p-2">Expenses</td></tr>
        {reportObj.report.expenses.map((acc, i) => (
          <tr key={acc.code + i}>
            <td className="p-2 border-b border-r border-gray-200">{acc.code} - {acc.name}</td>
            <td className="p-2 border-b text-right">{acc.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        ))}
        <tr className="font-bold"><td className="p-2 border-t border-r border-gray-200 text-right">Total Expenses</td><td className="p-2 border-t text-right">{reportObj.report.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
        <tr className="font-bold bg-gray-100"><td className="p-2 border-t border-r border-gray-200 text-right">Net Income</td><td className="p-2 border-t text-right">{reportObj.report.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
      </tbody>
    </table>
  );

  return (
    <div className="flex gap-8">
      <div className="flex-1">
        <h3 className="text-xl font-semibold mb-4">Income Statement</h3>
        <div className="mb-4 flex gap-2 items-end">
          <div>
            <label className="block text-sm font-medium">From</label>
            <input type="date" className="border rounded px-2 py-1" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">To</label>
            <input type="date" className="border rounded px-2 py-1" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <button className="bg-green-600 text-white px-4 py-2 rounded font-semibold" onClick={handleGenerate} disabled={generating || loading}>
            {generating ? "Generating..." : "Generate Report"}
          </button>
          {showReport && <button className="ml-2 px-3 py-2 rounded bg-gray-200" onClick={handleBackToCurrent}>Back to Current</button>}
        </div>
        {loading ? <div>Loading…</div> : (
          showReport ? renderReport(showReport) : renderReport({ report: { revenues: revenues.map(acc => {
            let credit = 0, debit = 0;
            filteredEntries.forEach(entry => {
              (entry.lines || []).forEach(line => {
                if (line.accountId === acc.id) {
                  debit += parseFloat(line.debit) || 0;
                  credit += parseFloat(line.credit) || 0;
                }
              });
            });
            return {
              code: acc.code,
              name: acc.main + (acc.individual ? ' / ' + acc.individual : ''),
              amount: credit - debit
            };
          }), expenses: expenses.map(acc => {
            let credit = 0, debit = 0;
            filteredEntries.forEach(entry => {
              (entry.lines || []).forEach(line => {
                if (line.accountId === acc.id) {
                  debit += parseFloat(line.debit) || 0;
                  credit += parseFloat(line.credit) || 0;
                }
              });
            });
            return {
              code: acc.code,
              name: acc.main + (acc.individual ? ' / ' + acc.individual : ''),
              amount: debit - credit
            };
          }), totalRevenue, totalExpense, netIncome } })
        )}
      </div>
      <div className="w-80">
        <h4 className="text-lg font-semibold mb-2">Recent Reports</h4>
        <ul className="space-y-2">
          {recentReports.map((r, i) => (
            <li key={r.id}>
              <button className="w-full text-left px-3 py-2 rounded border border-gray-200 hover:bg-gray-100" onClick={() => handleShowReport(r)}>
                {r.from} to {r.to}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
