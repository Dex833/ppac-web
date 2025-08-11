import React, { useEffect, useState, useRef } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import {
  saveIncomeStatementReport,
  getRecentIncomeStatementReports,
} from "./isReports";
import useUserProfile from "../../../hooks/useUserProfile";
import IncomeStatementChart from "./IncomeStatementChart";
import jsPDF from "jspdf";

/* -------------------- helpers -------------------- */
function parseYMD(ymd) {
  if (!ymd) return null;
  const parts = ymd.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function formatDateSimple(ymd) {
  const dt = parseYMD(ymd);
  if (!dt) return "-";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[dt.getMonth()]} ${dt.getDate()} ${dt.getFullYear()}`;
}
function formatRange(from, to) {
  const left = formatDateSimple(from);
  const right = formatDateSimple(to);
  if (left === "-" && right === "-") return "-";
  if (left === "-") return right;
  if (right === "-") return left;
  return `${left} - ${right}`;
}

function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const qAcc = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(qAcc, (snap) => {
      setAccounts(
        snap.docs
          .filter((d) => !d.data().archived)
          .map((d) => ({ id: d.id, ...d.data() }))
      );
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
  const [notes, setNotes] = useState("");
  const [recentReports, setRecentReports] = useState([]);
  const [showReport, setShowReport] = useState(null); // {id?, from, to, report}
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const accounts = useAccounts();
  const { profile } = useUserProfile();
  const isAdmin = profile?.roles?.includes("admin") || profile?.role === "admin";
  const isTreasurer =
    profile?.roles?.includes("treasurer") || profile?.role === "treasurer";
  // Only admins/treasurers can delete saved reports
  const canDeleteReports = isAdmin || isTreasurer;

  const userName = profile?.displayName || profile?.email || "Unknown";
  const userId = profile?.uid || "";
  const notesRef = useRef();

  // load journal entries (for computing IS)
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "journalEntries"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // load saved IS reports
  useEffect(() => {
    getRecentIncomeStatementReports().then(setRecentReports);
  }, [generating]);

  // group accounts
  const revenues = accounts.filter((a) => a.type === "Revenue");
  const expenses = accounts.filter((a) => a.type === "Expense");

  function filterEntriesByDate(list, fromDate, toDate) {
    if (!fromDate && !toDate) return list;
    return list.filter((e) => {
      const d = e.date || ""; // "YYYY-MM-DD"
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }

  function getTotal(accountList, filtered) {
    return accountList.reduce((sum, acc) => {
      let credit = 0, debit = 0;
      filtered.forEach((entry) => {
        (entry.lines || []).forEach((line) => {
          if (line.accountId === acc.id) {
            debit += parseFloat(line.debit) || 0;
            credit += parseFloat(line.credit) || 0;
          }
        });
      });
      return sum + (acc.type === "Revenue" ? credit - debit : debit - credit);
    }, 0);
  }

  // compute current (unsaved) report numbers
  const filteredEntries = filterEntriesByDate(entries, from, to);
  const totalRevenue = getTotal(revenues, filteredEntries);
  const totalExpense = getTotal(expenses, filteredEntries);
  const netIncome = totalRevenue - totalExpense;

  // actions: generate/delete/download reports
  async function handleGenerate() {
    setGenerating(true);
    const now = new Date();

    const report = {
      revenues: revenues.map((acc) => {
        let credit = 0, debit = 0;
        filteredEntries.forEach((entry) => {
          (entry.lines || []).forEach((line) => {
            if (line.accountId === acc.id) {
              debit += parseFloat(line.debit) || 0;
              credit += parseFloat(line.credit) || 0;
            }
          });
        });
        return {
          code: acc.code,
          name: acc.main + (acc.individual ? " / " + acc.individual : ""),
          amount: credit - debit,
        };
      }),
      expenses: expenses.map((acc) => {
        let credit = 0, debit = 0;
        filteredEntries.forEach((entry) => {
          (entry.lines || []).forEach((line) => {
            if (line.accountId === acc.id) {
              debit += parseFloat(line.debit) || 0;
              credit += parseFloat(line.credit) || 0;
            }
          });
        });
        return {
          code: acc.code,
          name: acc.main + (acc.individual ? " / " + acc.individual : ""),
          amount: debit - credit,
        };
      }),
      totalRevenue,
      totalExpense,
      netIncome,
      notes,
      generatedBy: userName,
      generatedById: userId,
      generatedAt: now.toISOString(),
    };

    await saveIncomeStatementReport({ from, to, report });
    setGenerating(false);
    setShowReport({ from, to, report });
    setNotes("");
    getRecentIncomeStatementReports().then(setRecentReports);
  }

  async function handleDeleteReport(id) {
    if (!id) return;
    if (!canDeleteReports) return;
    if (!window.confirm("Delete this saved report?")) return;
    await deleteDoc(doc(db, "incomeStatementReports", id));
    getRecentIncomeStatementReports().then(setRecentReports);
    setShowReport(null);
  }

  function handleDownloadPDF(reportObj) {
    setDownloading(true);
    const docPDF = new jsPDF();
    docPDF.setFontSize(16);
    docPDF.text("Income Statement", 14, 16);
    docPDF.setFontSize(10);
    docPDF.text(`Period: ${formatRange(reportObj.from, reportObj.to)}`, 14, 24);
    docPDF.text(`Generated by: ${reportObj.report.generatedBy || "-"}`, 14, 30);
    docPDF.text(
      `Generated at: ${
        reportObj.report.generatedAt
          ? new Date(reportObj.report.generatedAt).toLocaleString()
          : "-"
      }`,
      14,
      36
    );
    let y = 44;

    docPDF.text("Revenues", 14, y);
    y += 6;
    reportObj.report.revenues.forEach((acc) => {
      docPDF.text(acc.code + " - " + acc.name, 16, y);
      docPDF.text(
        acc.amount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        120,
        y,
        { align: "right" }
      );
      y += 6;
    });
    docPDF.text(
      "Total Revenue: " +
        reportObj.report.totalRevenue.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      16,
      y
    );
    y += 8;

    docPDF.text("Expenses", 14, y);
    y += 6;
    reportObj.report.expenses.forEach((acc) => {
      docPDF.text(acc.code + " - " + acc.name, 16, y);
      docPDF.text(
        acc.amount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        120,
        y,
        { align: "right" }
      );
      y += 6;
    });
    docPDF.text(
      "Total Expenses: " +
        reportObj.report.totalExpense.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      16,
      y
    );
    y += 8;

    docPDF.text(
      "Net Income: " +
        reportObj.report.netIncome.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      16,
      y
    );

    y += 8;
    if (reportObj.report.notes) {
      docPDF.text("Notes:", 14, y);
      y += 6;
      docPDF.text(reportObj.report.notes, 16, y);
    }

    docPDF.save(
      "IncomeStatement_" +
        (formatRange(reportObj.from, reportObj.to).replaceAll(" ", "")) +
        ".pdf"
    );
    setDownloading(false);
  }

  function handleDownloadCSV(reportObj) {
    const period = formatRange(reportObj.from, reportObj.to);
    let csv = `Income Statement\nPeriod:,${period}\n`;
    csv += `Generated by:,${reportObj.report.generatedBy || "-"}\nGenerated at:${
      reportObj.report.generatedAt
        ? new Date(reportObj.report.generatedAt).toLocaleString()
        : "-"
    }\n`;
    csv += `\nRevenues\nAccount,Amount\n`;
    reportObj.report.revenues.forEach((acc) => {
      csv += `"${acc.code} - ${acc.name}",${acc.amount}\n`;
    });
    csv += `Total Revenue,${reportObj.report.totalRevenue}\n\nExpenses\nAccount,Amount\n`;
    reportObj.report.expenses.forEach((acc) => {
      csv += `"${acc.code} - ${acc.name}",${acc.amount}\n`;
    });
    csv += `Total Expenses,${reportObj.report.totalExpense}\n\nNet Income,${reportObj.report.netIncome}\n`;
    if (reportObj.report.notes) {
      csv += `\nNotes:,"${reportObj.report.notes.replace(/"/g, '""')}"\n`;
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IncomeStatement_${period.replaceAll(" ", "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleShowReport(r) {
    setShowReport(r);
  }
  function handleBackToCurrent() {
    setShowReport(null);
  }

  // renderer for report (current or saved)
  const renderReport = (reportObj) => (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-4 mb-2">
        <div className="font-semibold text-base">
          Period:{" "}
          <span className="font-normal">
            {formatRange(reportObj.from, reportObj.to)}
          </span>
        </div>
        <div className="font-semibold text-base">
          Net Income:{" "}
          <span
            className={
              "font-bold " +
              (reportObj.report.netIncome >= 0 ? "text-green-700" : "text-red-600")
            }
          >
            {reportObj.report.netIncome.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        {reportObj.report.generatedBy && (
          <div className="text-xs text-gray-500">
            Generated by: {reportObj.report.generatedBy}
          </div>
        )}
        {reportObj.report.generatedAt && (
          <div className="text-xs text-gray-500">
            Generated at: {new Date(reportObj.report.generatedAt).toLocaleString()}
          </div>
        )}
        <div className="flex gap-2 ml-auto">
          <button
            className="px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs font-semibold"
            onClick={() => handleDownloadPDF(reportObj)}
            disabled={downloading}
          >
            PDF
          </button>
          <button
            className="px-2 py-1 rounded bg-green-100 hover:bg-green-200 text-green-800 text-xs font-semibold"
            onClick={() => handleDownloadCSV(reportObj)}
          >
            CSV
          </button>
        </div>
      </div>

      <IncomeStatementChart
        revenues={reportObj.report.revenues}
        expenses={reportObj.report.expenses}
      />

      <table className="min-w-full border border-gray-300 rounded text-sm mb-4">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-2 border-b border-r border-gray-200">Account</th>
            <th className="text-right p-2 border-b">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={2} className="font-bold p-2">
              Revenues
            </td>
          </tr>
          {reportObj.report.revenues.map((acc, i) => (
            <tr key={acc.code + i}>
              <td className="p-2 border-b border-r border-gray-200">
                {acc.code} - {acc.name}
              </td>
              <td className="p-2 border-b text-right">
                {acc.amount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className="p-2 border-t border-r border-gray-200 text-right">
              Total Revenue
            </td>
            <td className="p-2 border-t text-right">
              {reportObj.report.totalRevenue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </td>
          </tr>
          <tr>
            <td colSpan={2} className="font-bold p-2">
              Expenses
            </td>
          </tr>
          {reportObj.report.expenses.map((acc, i) => (
            <tr key={acc.code + i}>
              <td className="p-2 border-b border-r border-gray-200">
                {acc.code} - {acc.name}
              </td>
              <td className="p-2 border-b text-right">
                {acc.amount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className="p-2 border-t border-r border-gray-200 text-right">
              Total Expenses
            </td>
            <td className="p-2 border-t text-right">
              {reportObj.report.totalExpense.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </td>
          </tr>
          <tr className="font-bold bg-gray-100">
            <td className="p-2 border-t border-r border-gray-200 text-right">
              Net Income
            </td>
            <td className="p-2 border-t text-right">
              {reportObj.report.netIncome.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </td>
          </tr>
        </tbody>
      </table>

      {reportObj.report.notes && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-2 text-sm text-yellow-900">
          <div className="font-semibold mb-1">Notes:</div>
          <div>{reportObj.report.notes}</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex gap-8">
      <div className="flex-1">
        <h3 className="text-xl font-semibold mb-4">Income Statement</h3>

        <div className="mb-4 flex gap-2 items-end">
          <div>
            <label className="block text-sm font-medium">From</label>
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">To</label>
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <button
            className="bg-green-600 text-white px-4 py-2 rounded font-semibold"
            onClick={handleGenerate}
            disabled={generating || loading}
          >
            {generating ? "Generating..." : "Generate Report"}
          </button>
          {showReport && (
            <button
              className="ml-2 px-3 py-2 rounded bg-gray-200"
              onClick={handleBackToCurrent}
            >
              Back to Current
            </button>
          )}
        </div>

        {!showReport && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Notes (optional)</label>
            <textarea
              ref={notesRef}
              className="border rounded px-2 py-1 w-full min-h-[40px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes for this report (e.g. explanations, context, etc.)"
              maxLength={500}
            />
          </div>
        )}

        {loading ? (
          <div>Loading…</div>
        ) : showReport ? (
          renderReport(showReport)
        ) : (
          renderReport(
            {
              from,
              to,
              report: {
                revenues: revenues.map((acc) => {
                  let credit = 0, debit = 0;
                  filteredEntries.forEach((entry) => {
                    (entry.lines || []).forEach((line) => {
                      if (line.accountId === acc.id) {
                        debit += parseFloat(line.debit) || 0;
                        credit += parseFloat(line.credit) || 0;
                      }
                    });
                  });
                  return {
                    code: acc.code,
                    name: acc.main + (acc.individual ? " / " + acc.individual : ""),
                    amount: credit - debit,
                  };
                }),
                expenses: expenses.map((acc) => {
                  let credit = 0, debit = 0;
                  filteredEntries.forEach((entry) => {
                    (entry.lines || []).forEach((line) => {
                      if (line.accountId === acc.id) {
                        debit += parseFloat(line.debit) || 0;
                        credit += parseFloat(line.credit) || 0;
                      }
                    });
                  });
                  return {
                    code: acc.code,
                    name: acc.main + (acc.individual ? " / " + acc.individual : ""),
                    amount: debit - credit,
                  };
                }),
                totalRevenue,
                totalExpense,
                netIncome,
                notes,
                generatedBy: userName,
                generatedById: userId,
                generatedAt: new Date().toISOString(),
              },
            }
          )
        )}
      </div>

      {/* Right sidebar: Recent Reports ONLY */}
      <div className="w-80">
        <h4 className="text-lg font-semibold mb-2">Recent Reports</h4>
        <ul className="space-y-2">
          {recentReports.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between border border-gray-200 rounded px-3 py-2"
            >
              <button
                className="text-left truncate"
                onClick={() => handleShowReport(r)}
                title={`${formatRange(r.from, r.to)}`}
              >
                {formatRange(r.from, r.to)}
              </button>

              {canDeleteReports && (
                <button
                  className="ml-2 px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteReport(r.id);
                  }}
                >
                  Delete
                </button>
              )}
            </li>
          )