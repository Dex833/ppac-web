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

/* -------------------- date helpers -------------------- */
function parseYMD(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function formatDateSimple(ymd) {
  const dt = parseYMD(ymd);
  if (!dt) return "-";
  const months = [
    "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"
  ];
  return `${months[dt.getMonth()]} ${dt.getDate()} ${dt.getFullYear()}`;
}
function formatRange(from, to) {
  const L = formatDateSimple(from);
  const R = formatDateSimple(to);
  if (L === "-" && R === "-") return "-";
  if (L === "-") return R;
  if (R === "-") return L;
  return `${L} - ${R}`;
}

/* -------------------- type helpers -------------------- */
const isRevenueType = (t) => {
  const v = (t || "").toLowerCase();
  return v === "revenue" || v === "income";
};
const isExpenseType = (t) => (t || "").toLowerCase() === "expense";

/* COGS detection: strictly by MAIN name === "COGS" */
function isCOGSAccount(acc) {
  return ((acc.main || "").trim().toLowerCase() === "cogs");
}

/* Extract MAIN from "Main / Individual" */
function mainFromRenderedName(name = "") {
  return name.split(" / ")[0].trim().toLowerCase();
}

/* -------------------- accounts hook -------------------- */
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

/* Sum helper for a single account over filtered entries */
function sumForAccount(acc, filteredEntries) {
  let debit = 0, credit = 0;
  filteredEntries.forEach((entry) => {
    (entry.lines || []).forEach((line) => {
      if (line.accountId === acc.id) {
        debit += parseFloat(line.debit) || 0;
        credit += parseFloat(line.credit) || 0;
      }
    });
  });
  // revenues: credit - debit; expenses/COGS: debit - credit
  const isRevenue = isRevenueType(acc.type);
  const amount = isRevenue ? (credit - debit) : (debit - credit);
  return { amount };
}

export default function IncomeStatement() {
  const accounts = useAccounts();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [recentReports, setRecentReports] = useState([]);
  const [showReport, setShowReport] = useState(null); // {id?, from, to, report}
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const { profile } = useUserProfile();
  const isAdmin = profile?.roles?.includes("admin") || profile?.role === "admin";
  const isTreasurer =
    profile?.roles?.includes("treasurer") || profile?.role === "treasurer";
  const canDeleteReports = isAdmin || isTreasurer;

  const userName = profile?.displayName || profile?.email || "Unknown";
  const userId = profile?.uid || "";
  const notesRef = useRef();

  /* ---- load journal entries ---- */
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "journalEntries"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  /* ---- load saved IS reports ---- */
  useEffect(() => {
    getRecentIncomeStatementReports().then(setRecentReports);
  }, [generating]);

  /* ---- group accounts ---- */
  const revenueAccounts = accounts.filter((a) => isRevenueType(a.type));
  const expenseAccounts = accounts.filter((a) => isExpenseType(a.type));

  // Split expenses into COGS vs Operating (by MAIN === "COGS")
  const cogsAccountsRaw = expenseAccounts.filter(isCOGSAccount);
  const opExAccountsRaw = expenseAccounts.filter((a) => !isCOGSAccount(a));

  function filterEntriesByDate(list, fromDate, toDate) {
    if (!fromDate && !toDate) return list;
    return list.filter((e) => {
      const d = e.date || ""; // "YYYY-MM-DD"
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }

  /* ---- compute current (unsaved) report numbers ---- */
  const filteredEntries = filterEntriesByDate(entries, from, to);

  const revenues = revenueAccounts.map((acc) => {
    const { amount } = sumForAccount(acc, filteredEntries);
    return {
      code: acc.code,
      name: acc.main + (acc.individual ? " / " + acc.individual : ""),
      amount,
    };
  });

  const cogs = cogsAccountsRaw.map((acc) => {
    const { amount } = sumForAccount(acc, filteredEntries);
    return {
      code: acc.code,
      name: acc.main + (acc.individual ? " / " + acc.individual : ""),
      amount,
    };
  });

  const expenses = opExAccountsRaw.map((acc) => {
    const { amount } = sumForAccount(acc, filteredEntries);
    return {
      code: acc.code,
      name: acc.main + (acc.individual ? " / " + acc.individual : ""),
      amount,
    };
  });

  const totalRevenue = revenues.reduce((s, a) => s + a.amount, 0);
  const totalCOGS = cogs.reduce((s, a) => s + a.amount, 0);
  const grossProfit = totalRevenue - totalCOGS;
  const totalExpense = expenses.reduce((s, a) => s + a.amount, 0);
  const netIncome = grossProfit - totalExpense;

  /* -------------------- actions -------------------- */
  async function handleGenerate() {
    setGenerating(true);
    const now = new Date();

    const report = {
      revenues,
      cogs,                 // saved separately
      expenses,
      totalRevenue,
      totalCOGS,
      grossProfit,
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

  function handlePrint() {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
  }

  /* -------------------- exports -------------------- */
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

    // Revenues
    docPDF.text("Revenues", 14, y); y += 6;
    (reportObj.report.revenues || []).forEach((acc) => {
      docPDF.text(acc.code + " - " + acc.name, 16, y);
      docPDF.text(
        Number(acc.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        190 - 70, y, { align: "right" }
      );
      y += 6;
    });
    docPDF.text(
      "Total Revenue: " +
        Number(reportObj.report.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      16, y
    ); y += 8;

    // COGS
    const cogsList = reportObj.report.cogs || [];
    if (cogsList.length) {
      docPDF.text("Less: Cost of Goods Sold (COGS)", 14, y); y += 6;
      cogsList.forEach((acc) => {
        docPDF.text(acc.code + " - " + acc.name, 16, y);
        docPDF.text(
          Number(acc.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          190 - 70, y, { align: "right" }
        );
        y += 6;
      });
      docPDF.text(
        "Total COGS: " +
          Number(reportObj.report.totalCOGS ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        16, y
      ); y += 8;
    }

    // Gross Profit
    docPDF.setFont(undefined, "bold");
    docPDF.text(
      "Gross Profit: " +
        Number(reportObj.report.grossProfit ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      16, y
    );
    docPDF.setFont(undefined, "normal");
    y += 8;

    // Expenses
    docPDF.text("Expenses", 14, y); y += 6;
    (reportObj.report.expenses || []).forEach((acc) => {
      docPDF.text(acc.code + " - " + acc.name, 16, y);
      docPDF.text(
        Number(acc.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        190 - 70, y, { align: "right" }
      );
      y += 6;
    });
    docPDF.text(
      "Total Expenses: " +
        Number(reportObj.report.totalExpense ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      16, y
    ); y += 8;

    // Net Income
    docPDF.setFont(undefined, "bold");
    docPDF.text(
      "Net Income: " +
        Number(reportObj.report.netIncome ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      16, y
    );
    docPDF.setFont(undefined, "normal");
    y += 8;

    if (reportObj.report.notes) {
      docPDF.text("Notes:", 14, y); y += 6;
      docPDF.text(String(reportObj.report.notes), 16, y);
    }

    const fileName = `IncomeStatement_${formatRange(reportObj.from, reportObj.to).replaceAll(" ", "")}.pdf`;
    docPDF.save(fileName);
    setDownloading(false);
  }

  function handleDownloadCSV(reportObj) {
    const period = formatRange(reportObj.from, reportObj.to);
    let csv = `Income Statement\nPeriod:,${period}\n`;
    csv += `Generated by:,${reportObj.report.generatedBy || "-"}\nGenerated at:,` +
      `${
        reportObj.report.generatedAt
          ? new Date(reportObj.report.generatedAt).toLocaleString()
          : "-"
      }\n`;

    csv += `\nRevenues\nAccount,Amount\n`;
    (reportObj.report.revenues || []).forEach((acc) => {
      csv += `"${acc.code} - ${acc.name}",${acc.amount}\n`;
    });
    csv += `Total Revenue,${reportObj.report.totalRevenue ?? 0}\n`;

    const cogsList = reportObj.report.cogs || [];
    if (cogsList.length) {
      csv += `\nLess: Cost of Goods Sold (COGS)\nAccount,Amount\n`;
      cogsList.forEach((acc) => {
        csv += `"${acc.code} - ${acc.name}",${acc.amount}\n`;
      });
      csv += `Total COGS,${reportObj.report.totalCOGS ?? 0}\n`;
      csv += `Gross Profit,${reportObj.report.grossProfit ?? 0}\n`;
    }

    csv += `\nExpenses\nAccount,Amount\n`;
    (reportObj.report.expenses || []).forEach((acc) => {
      csv += `"${acc.code} - ${acc.name}",${acc.amount}\n`;
    });
    csv += `Total Expenses,${reportObj.report.totalExpense ?? 0}\n\nNet Income,${reportObj.report.netIncome ?? 0}\n`;

    if (reportObj.report.notes) {
      csv += `\nNotes:,"${String(reportObj.report.notes).replace(/"/g, '""')}"\n`;
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

  /* -------------------- saved report open (compat) -------------------- */
  function handleShowReport(r) {
    // Back-compat: if old report lacks cogs/grossProfit, split by MAIN === "COGS"
    if (!r.report.cogs) {
      const expenses = r.report.expenses || [];
      const guessedCogs = expenses.filter(
        (e) => mainFromRenderedName(e.name) === "cogs"
      );
      const rest = expenses.filter(
        (e) => mainFromRenderedName(e.name) !== "cogs"
      );

      const totalCOGS = guessedCogs.reduce((s, a) => s + (a.amount || 0), 0);
      const totalRevenue = r.report.totalRevenue ?? (r.report.revenues || []).reduce((s, a) => s + (a.amount || 0), 0);
      const grossProfit = totalRevenue - totalCOGS;
      const totalExpense = rest.reduce((s, a) => s + (a.amount || 0), 0);
      const netIncome = grossProfit - totalExpense;

      r = {
        ...r,
        report: {
          ...r.report,
          cogs: guessedCogs,
          expenses: rest,
          totalCOGS,
          grossProfit,
          totalExpense,
          netIncome,
        },
      };
    }
    setShowReport(r);
  }
  function handleBackToCurrent() {
    setShowReport(null);
  }

  /* -------------------- drilldown modal (by account) -------------------- */
  const [drill, setDrill] = useState(null); // { code, name, from, to }

  function openDrilldown(row, range) {
    setDrill({
      code: row.code,
      name: row.name,
      from: range.from || "",
      to: range.to || "",
    });
  }

  function renderDrilldown() {
    if (!drill) return null;

    // resolve Firestore account id from code
    const acct =
      accounts.find((a) => a.code === drill.code) ||
      accounts.find((a) => a.id === drill.id);

    // filter entries within period
    const list = filterEntriesByDate(entries, drill.from, drill.to);

    const rows = [];
    (list || []).forEach((e) => {
      (e.lines || []).forEach((l) => {
        if (acct && l.accountId === acct.id) {
          rows.push({
            date: e.date,
            ref: e.refNumber,
            desc: e.description,
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
          });
        }
      });
    });

    rows.sort(
      (a, b) =>
        (a.date || "").localeCompare(b.date || "") ||
        String(a.ref || "").localeCompare(String(b.ref || ""))
    );

    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
        <div className="bg-white rounded-xl w-[720px] max-h-[80vh] overflow-auto shadow-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">
              {drill.code} - {drill.name}
            </h4>
            <button
              className="px-3 py-1 rounded bg-gray-200"
              onClick={() => setDrill(null)}
            >
              Close
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">Ref#</th>
                <th className="p-2 text-left">Desc</th>
                <th className="p-2 text-right">Debit</th>
                <th className="p-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="p-3 text-gray-500 text-center" colSpan={5}>
                    No entries for this account in the selected period.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2">{r.date}</td>
                    <td className="p-2 font-mono">{r.ref}</td>
                    <td className="p-2">{r.desc}</td>
                    <td className="p-2 text-right">
                      {r.debit.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="p-2 text-right">
                      {r.credit.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* -------------------- report renderer -------------------- */
  const renderReport = (reportObj) => {
    const revs = reportObj.report.revenues || [];
    const cogs = reportObj.report.cogs || [];
    const exps = reportObj.report.expenses || [];

    const totalRevenue = reportObj.report.totalRevenue ?? revs.reduce((s,a)=>s+a.amount,0);
    const totalCOGS = reportObj.report.totalCOGS ?? cogs.reduce((s,a)=>s+a.amount,0);
    const grossProfit = reportObj.report.grossProfit ?? (totalRevenue - totalCOGS);
    const totalExpense = reportObj.report.totalExpense ?? exps.reduce((s,a)=>s+a.amount,0);
    const netIncome = reportObj.report.netIncome ?? (grossProfit - totalExpense);

    return (
      <>
        <div className="mb-3 flex flex-wrap gap-2 items-center">
          <button
            className="bg-blue-600 text-white px-3 py-2 rounded font-semibold"
            onClick={() => handleDownloadCSV(reportObj)}
            disabled={downloading}
          >
            Export CSV
          </button>
          <button
            className="bg-blue-600 text-white px-3 py-2 rounded font-semibold"
            onClick={() => handleDownloadPDF(reportObj)}
            disabled={downloading}
          >
            Export PDF
          </button>
          <button
            className="bg-gray-600 text-white px-3 py-2 rounded font-semibold"
            onClick={handlePrint}
          >
            Print
          </button>
        </div>

        <table className="min-w-full border border-gray-300 rounded text-sm mb-6">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b border-r border-gray-200">Account</th>
              <th className="text-right p-2 border-b">Amount</th>
            </tr>
          </thead>
          <tbody>
            {/* Revenues */}
            <tr><td colSpan={2} className="font-bold p-2">Revenues</td></tr>
            {revs.map((acc, i) => (
              <tr key={acc.code + i}
                  className="hover:bg-blue-50 cursor-pointer"
                  onClick={() => openDrilldown(acc, { from: reportObj.from, to: reportObj.to })}
              >
                <td className="p-2 border-b border-r border-gray-200">{acc.code} - {acc.name}</td>
                <td className="p-2 border-b text-right">
                  {Number(acc.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="p-2 border-t border-r border-gray-200 text-right">Total Revenue</td>
              <td className="p-2 border-t text-right">
                {Number(totalRevenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>

            {/* COGS */}
            {cogs.length > 0 && <tr><td colSpan={2} className="font-bold p-2">Less: Cost of Goods Sold (COGS)</td></tr>}
            {cogs.map((acc, i) => (
              <tr key={acc.code + i}
                  className="hover:bg-blue-50 cursor-pointer"
                  onClick={() => openDrilldown(acc, { from: reportObj.from, to: reportObj.to })}
              >
                <td className="p-2 border-b border-r border-gray-200">{acc.code} - {acc.name}</td>
                <td className="p-2 border-b text-right">
                  {Number(acc.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
            {cogs.length > 0 && (
              <tr className="font-semibold">
                <td className="p-2 border-t border-r border-gray-200 text-right">Total COGS</td>
                <td className="p-2 border-t text-right">
                  {Number(totalCOGS).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}

            {/* Gross Profit */}
            <tr className="font-bold bg-gray-50">
              <td className="p-2 border-t border-r border-gray-200 text-right">Gross Profit</td>
              <td className="p-2 border-t text-right">
                {Number(grossProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>

            {/* Expenses */}
            <tr><td colSpan={2} className="font-bold p-2">Expenses</td></tr>
            {exps.map((acc, i) => (
              <tr key={acc.code + i}
                  className="hover:bg-blue-50 cursor-pointer"
                  onClick={() => openDrilldown(acc, { from: reportObj.from, to: reportObj.to })}
              >
                <td className="p-2 border-b border-r border-gray-200">{acc.code} - {acc.name}</td>
                <td className="p-2 border-b text-right">
                  {Number(acc.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="p-2 border-t border-r border-gray-200 text-right">Total Expenses</td>
              <td className="p-2 border-t text-right">
                {Number(totalExpense).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>

            {/* Net Income */}
            <tr className="font-bold bg-gray-100">
              <td className="p-2 border-t border-r border-gray-200 text-right">Net Income</td>
              <td className="p-2 border-t text-right">
                {Number(netIncome).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

        <IncomeStatementChart revenues={revs} expenses={exps} />
      </>
    );
  };

  /* -------------------- render -------------------- */
  const activeReportObj = showReport
    ? showReport
    : {
        from,
        to,
        report: {
          revenues,
          cogs,
          expenses,
          totalRevenue,
          totalCOGS,
          grossProfit,
          totalExpense,
          netIncome,
          notes,
          generatedBy: userName,
          generatedById: userId,
          generatedAt: new Date().toISOString(),
        },
      };

  return (
    <div className={`flex gap-8${printing ? " print:block" : ""}`}>
      {renderDrilldown()}
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

        {loading ? <div>Loading…</div> : renderReport(activeReportObj)}
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
                title={formatRange(r.from, r.to)}
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
          ))}
          {recentReports.length === 0 && (
            <li className="text-sm text-gray-500">No saved reports yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
