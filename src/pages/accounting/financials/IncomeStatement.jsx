import React, { useEffect, useState, useRef } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  saveIncomeStatementReport,
  getRecentIncomeStatementReports,
} from "./isReports";
import useUserProfile from "../../../hooks/useUserProfile";
import IncomeStatementChart from "./IncomeStatementChart";
import jsPDF from "jspdf";

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
  // --- state
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [recentReports, setRecentReports] = useState([]);
  const [showReport, setShowReport] = useState(null); // {id?, from, to, report}
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // for edit modal
  const [editingEntry, setEditingEntry] = useState(null);
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const accounts = useAccounts();
  const { profile } = useUserProfile();
  const isAdmin = profile?.roles?.includes("admin") || profile?.role === "admin";
  const isTreasurer =
    profile?.roles?.includes("treasurer") || profile?.role === "treasurer";
  const isManager =
    profile?.roles?.includes("manager") || profile?.role === "manager";
  const canEditDelete = isAdmin || isTreasurer || isManager;

  const userName = profile?.displayName || profile?.email || "Unknown";
  const userId = profile?.uid || "";
  const notesRef = useRef();

  // --- load journal entries (used by report + history list)
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "journalEntries"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // --- load recent saved IS reports
  useEffect(() => {
    getRecentIncomeStatementReports().then(setRecentReports);
  }, [generating]);

  // --- account groups
  const revenues = accounts.filter((a) => a.type === "Revenue");
  const expenses = accounts.filter((a) => a.type === "Expense");

  function filterEntriesByDate(list, fromDate, toDate) {
    if (!fromDate && !toDate) return list;
    return list.filter((e) => {
      const d = e.date || ""; // expect "YYYY-MM-DD"
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }

  function getTotal(accountList, filtered) {
    return accountList.reduce((sum, acc) => {
      let credit = 0,
        debit = 0;
      filtered.forEach((entry) => {
        (entry.lines || []).forEach((line) => {
          if (line.accountId === acc.id) {
            debit += parseFloat(line.debit) || 0;
            credit += parseFloat(line.credit) || 0;
          }
        });
      });
      // revenues: credit - debit, expenses: debit - credit
      return sum + (acc.type === "Revenue" ? credit - debit : debit - credit);
    }, 0);
  }

  // compute current (unsaved) report numbers
  const filteredEntries = filterEntriesByDate(entries, from, to);
  const totalRevenue = getTotal(revenues, filteredEntries);
  const totalExpense = getTotal(expenses, filteredEntries);
  const netIncome = totalRevenue - totalExpense;

  // --- actions: generate, delete, download reports
  async function handleGenerate() {
    setGenerating(true);
    const now = new Date();

    const report = {
      revenues: revenues.map((acc) => {
        let credit = 0,
          debit = 0;
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
        let credit = 0,
          debit = 0;
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
    if (!window.confirm("Delete this saved report?")) return;
    await deleteDoc(doc(db, "incomeStatementReports", id));
    getRecentIncomeStatementReports().then(setRecentReports);
    // if you were viewing that report, go back
    setShowReport(null);
  }

  function handleDownloadPDF(reportObj) {
    setDownloading(true);
    const docPDF = new jsPDF();
    docPDF.setFontSize(16);
    docPDF.text("Income Statement", 14, 16);
    docPDF.setFontSize(10);
    docPDF.text(`Period: ${reportObj.from || "-"} to ${reportObj.to || "-"}`, 14, 24);
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
      "IncomeStatement_" + (reportObj.from || "") + "_" + (reportObj.to || "") + ".pdf"
    );
    setDownloading(false);
  }

  function handleDownloadCSV(reportObj) {
    let csv = `Income Statement\nPeriod:,${reportObj.from || "-"},to,${
      reportObj.to || "-"
    }\n`;
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
    a.download = `IncomeStatement_${reportObj.from || ""}_${reportObj.to || ""}.csv`;
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

  // --- Journal History actions (EDIT / DELETE)
  async function handleDeleteEntry(id) {
    if (!canEditDelete) return;
    if (!window.confirm("Delete this journal entry?")) return;
    await deleteDoc(doc(db, "journalEntries", id));
    // onSnapshot will refresh the list automatically
  }

  function handleEditEntry(entry) {
    if (!canEditDelete) return;
    setEditingEntry(entry);
    setEditDate(entry?.date || "");
    setEditDescription(entry?.description || "");
  }

  async function handleSaveEdit() {
    if (!editingEntry?.id) return;
    await updateDoc(doc(db, "journalEntries", editingEntry.id), {
      date: editDate || null,
      description: editDescription || "",
      updatedAt: serverTimestamp(),
    });
    setEditingEntry(null);
    setEditDate("");
    setEditDescription("");
  }

  // --- renderer for report (current or saved)
  const renderReport = (reportObj, showActions = false) => (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-4 mb-2">
        <div className="font-semibold text-base">
          Period:{" "}
          <span className="font-normal">
            {reportObj.from || "-"} to {reportObj.to || "-"}
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
        {showActions && (
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
            {(isAdmin || isTreasurer) && reportObj.id && (
              <button
                className="px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold"
                onClick={() => handleDeleteReport(reportObj.id)}
              >
                Delete
              </button>
            )}
          </div>
        )}
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

  // --- derive journal history (latest first, show last 20)
  const recentEntries = [...entries].sort((a, b) => {
    const aa = a.createdAt?.seconds || 0;
    const bb = b.createdAt?.seconds || 0;
    return bb - aa;
  }).slice(0, 20);

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
          renderReport(showReport, true)
        ) : (
          renderReport(
            {
              from,
              to,
              report: {
                revenues: revenues.map((acc) => {
                  let credit = 0,
                    debit = 0;
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
                  let credit = 0,
                    debit = 0;
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
            },
            true
          )
        )}
      </div>

      <div className="w-80">
        {/* Saved reports */}
        <h4 className="text-lg font-semibold mb-2">Recent Reports</h4>
        <ul className="space-y-2 mb-6">
          {recentReports.map((r) => (
            <li key={r.id}>
              <button
                className="w-full text-left px-3 py-2 rounded border border-gray-200 hover:bg-gray-100"
                onClick={() => handleShowReport(r)}
              >
                {r.from} to {r.to}
              </button>
            </li>
          ))}
        </ul>

        {/* Journal History with Edit/Delete */}
        <h4 className="text-lg font-semibold mb-2">Journal History</h4>
        <ul className="space-y-2">
          {recentEntries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between border rounded p-2 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {entry.refNo || entry.reference || entry.id}
                </div>
                <div className="text-xs text-gray-500">
                  {entry.date || "-"} • {(entry.description || "").slice(0, 60)}
                </div>
              </div>

              {canEditDelete && (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded bg-blue-100 hover:bg-blue-200"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditEntry(entry);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded bg-red-100 hover:bg-red-200"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteEntry(entry.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
          {recentEntries.length === 0 && (
            <li className="text-sm text-gray-500">No journal entries yet.</li>
          )}
        </ul>
      </div>

      {/* Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg w-[420px] p-4">
            <div className="text-lg font-semibold mb-3">Edit Journal Entry</div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium">Date</label>
                <input
                  type="date"
                  className="border rounded px-2 py-1 w-full"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Description</label>
                <input
                  type="text"
                  className="border rounded px-2 py-1 w-full"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Short description"
                  maxLength={120}
                />
              </div>
              <div className="text-xs text-gray-500">
                Ref: {editingEntry.refNo || editingEntry.reference || editingEntry.id}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-1 rounded bg-gray-200"
                onClick={() => setEditingEntry(null)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded bg-green-600 text-white"
                onClick={handleSaveEdit}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}