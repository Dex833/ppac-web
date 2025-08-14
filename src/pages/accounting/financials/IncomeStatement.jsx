// src/pages/accounting/financials/IncomeStatement.jsx
import React, { useEffect, useState, useRef } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  deleteDoc,
  doc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import useUserProfile from "../../../hooks/useUserProfile";
import { saveFinancialSnapshot } from "../../reports/saveSnapshot";
import IncomeStatementChart from "./IncomeStatementChart";
import jsPDF from "jspdf";
import { useNavigate } from "react-router-dom";

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
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
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

/* Extract MAIN from "Main / Individual" (for legacy saved docs) */
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
  const nav = useNavigate();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [recentReports, setRecentReports] = useState([]); // unified (financialReports)
  const [showReport, setShowReport] = useState(null); // {id?, from, to, report}
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false); // Save to Reports (HTML snapshot)

  const { profile } = useUserProfile();
  const isAdmin = profile?.roles?.includes("admin") || profile?.role === "admin";
  const isTreasurer = profile?.roles?.includes("treasurer") || profile?.role === "treasurer";
  const canDeleteReports = isAdmin || isTreasurer;

  const userName = profile?.displayName || profile?.email || "Unknown";
  const userId = profile?.uid || "";
  const notesRef = useRef();
  const viewRef = useRef(null); // content we snapshot into payload.html

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

  /* ---- load recent unified IS reports ---- */
  useEffect(() => {
    const q = query(
      collection(db, "financialReports"),
      where("type", "==", "incomeStatement"),
      orderBy("createdAt", "desc"),
      limit(25)
    );
    const unsub = onSnapshot(q, (snap) => {
      setRecentReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

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

  /* -------------------- actions (UNIFIED) -------------------- */
  async function handleGenerate() {
    setGenerating(true);
    const now = new Date();

    const report = {
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
      generatedAt: now.toISOString(),
    };

    try {
      await saveFinancialSnapshot({
        type: "incomeStatement",
        label: "Income Statement",
        from,
        to,
        report,
        createdBy: userName,
        createdById: userId,
      });
      setShowReport({ from, to, report });
      setNotes("");
    } catch (e) {
      alert("Failed to save report: " + (e?.message || e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteReport(id) {
    if (!id) return;
    if (!canDeleteReports) return;
    if (!window.confirm("Delete this saved report?")) return;
    await deleteDoc(doc(db, "financialReports", id));
    setShowReport(null);
  }

  function handlePrint() {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
  }

  /* -------------------- snapshot -> financialReports (payload.html) -------------------- */
  function buildSnapshotHTML(title, reportObj) {
    return `<!doctype html><meta charset="utf-8" />
    <style>
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #e5e7eb;padding:6px 8px;font-size:12px}
      th{background:#f9fafb;text-align:left}
      .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    </style>
    <h1>${title}</h1>
    <div>Period: ${formatRange(reportObj.from, reportObj.to)}</div>
    <div style="margin-top:10px">${viewRef.current ? viewRef.current.innerHTML : ""}</div>`;
  }

  async function handleSaveToReports(reportObj) {
    if (!viewRef.current) return;
    setSaving(true);
    try {
      const html = buildSnapshotHTML("Income Statement", reportObj);
      const ref = await addDoc(collection(db, "financialReports"), {
        type: "incomeStatement", // periodic type
        status: "generated",
        label:
          reportObj.from || reportObj.to
            ? `Income Statement (${reportObj.from || "—"} – ${reportObj.to || "—"})`
            : "Income Statement",
        periodStart: reportObj.from || null,
        periodEnd: reportObj.to || null,
        createdAt: serverTimestamp(),
        createdByName: userName,
        createdById: userId,
        payload: { html }, // viewer reads this
      });
      alert("Saved to Reports ✅");
      nav(`/reports/${ref.id}`);
    } catch (e) {
      console.error(e);
      alert("Failed to save: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
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
        120, y, { align: "right" }
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
          120, y, { align: "right" }
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
        120, y, { align: "right" }
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

    if (reportObj.report.notes) {
      y += 8;
      docPDF.text("Notes:", 14, y); y += 6;
      docPDF.text(String(reportObj.report.notes), 16, y);
    }

    const fileName = `IncomeStatement_${formatRange(reportObj.from, reportObj.to).replace(/\s+/g, "")}.pdf`;
    docPDF.save(fileName);
    setDownloading(false);
  }

  function handleDownloadCSV(reportObj) {
    const period = formatRange(reportObj.from, reportObj.to);
    let csv = `Income Statement\nPeriod:,${period}\n`;
    csv += `Generated by:,${reportObj.report.generatedBy || "-"}\nGenerated at:,${
      reportObj.report.generatedAt ? new Date(reportObj.report.generatedAt).toLocaleString() : "-"
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
    a.download = `IncomeStatement_${period.replace(/\s+/g, "_")}.csv`;
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
      const guessedCogs = expenses.filter((e) => mainFromRenderedName(e.name) === "cogs");
      const rest = expenses.filter((e) => mainFromRenderedName(e.name) !== "cogs");

      const totalCOGS = guessedCogs.reduce((s, a) => s + (a.amount || 0), 0);
      const totalRevenue = r.report.totalRevenue ?? (r.report.revenues || []).reduce((s, a) => s + (a.amount || 0), 0);
      const grossProfit = totalRevenue - totalCOGS;
      const totalExpense = rest.reduce((s, a) => s + (a.amount || 0), 0);
      const netIncome = grossProfit - totalExpense;

      r = {
        ...r,
        report: { ...r.report, cogs: guessedCogs, expenses: rest, totalCOGS, grossProfit, totalExpense, netIncome },
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
      <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-3">
        <div className="bg-white rounded-xl w-[min(720px,94vw)] max-h-[84vh] overflow-auto shadow-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">
              {drill.code} - {drill.name}
            </h4>
            <button className="px-3 py-1 rounded bg-gray-200" onClick={() => setDrill(null)}>
              Close
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
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
                        {r.debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-right">
                        {r.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- report renderer -------------------- */
  const renderReport = (reportObj) => {
    const revs = reportObj.report.revenues || [];
    const cogsList = reportObj.report.cogs || [];
    const exps = reportObj.report.expenses || [];

    const totalRevenueR = reportObj.report.totalRevenue ?? revs.reduce((s,a)=>s+a.amount,0);
    const totalCOGSR = reportObj.report.totalCOGS ?? cogsList.reduce((s,a)=>s+a.amount,0);
    const grossProfitR = reportObj.report.grossProfit ?? (totalRevenueR - totalCOGSR);
    const totalExpenseR = reportObj.report.totalExpense ?? exps.reduce((s,a)=>s+a.amount,0);
    const netIncomeR = reportObj.report.netIncome ?? (grossProfitR - totalExpenseR);

    // mobile section renderer
    const SectionMobile = ({ title, items }) => (
      <>
        <div className="mt-2 mb-1 font-semibold">{title}</div>
        <div className="space-y-2">
          {items.map((acc, i) => (
            <button
              key={acc.code + i}
              onClick={() => openDrilldown(acc, { from: reportObj.from, to: reportObj.to })}
              className="w-full text-left card px-3 py-2 active:opacity-80"
            >
              <div className="text-sm">{acc.code} - {acc.name}</div>
              <div className="font-mono text-right">
                {Number(acc.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </button>
          ))}
        </div>
      </>
    );

    return (
      <>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            onClick={() => handleDownloadCSV(reportObj)}
            disabled={downloading}
          >
            Export CSV
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleDownloadPDF(reportObj)}
            disabled={downloading}
          >
            Export PDF
          </button>
          <button className="btn btn-outline" onClick={handlePrint}>
            Print
          </button>
          <button
            className="btn btn-primary disabled:opacity-60"
            onClick={() => handleSaveToReports(reportObj)}
            disabled={saving}
            title="Save a read-only snapshot to Reports"
          >
            {saving ? "Saving…" : "Save to Reports"}
          </button>
        </div>

        {/* === CONTENT TO SNAPSHOT === */}
        <div ref={viewRef}>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
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
                  <tr key={acc.code + i} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b border-r border-gray-200">
                      {acc.code} - {acc.name}
                    </td>
                    <td className="p-2 border-b text-right">
                      {Number(acc.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100">
                  <td className="p-2 border-t border-r border-gray-200 text-right">Total Revenue</td>
                  <td className="p-2 border-t text-right">
                    {Number(totalRevenueR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                {/* COGS */}
                {cogsList.length > 0 && (
                  <>
                    <tr><td colSpan={2} className="font-bold p-2">Less: Cost of Goods Sold (COGS)</td></tr>
                    {cogsList.map((acc, i) => (
                      <tr key={acc.code + i} className="odd:bg-white even:bg-gray-50">
                        <td className="p-2 border-b border-r border-gray-200">
                          {acc.code} - {acc.name}
                        </td>
                        <td className="p-2 border-b text-right">
                          {Number(acc.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-gray-100">
                      <td className="p-2 border-t border-r border-gray-200 text-right">Total COGS</td>
                      <td className="p-2 border-t text-right">
                        {Number(totalCOGSR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr className="font-bold bg-gray-100">
                      <td className="p-2 border-t border-r border-gray-200 text-right">Gross Profit</td>
                      <td className="p-2 border-t text-right">
                        {Number(grossProfitR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </>
                )}

                {/* Expenses */}
                <tr><td colSpan={2} className="font-bold p-2">Expenses</td></tr>
                {exps.map((acc, i) => (
                  <tr key={acc.code + i} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b border-r border-gray-200">
                      {acc.code} - {acc.name}
                    </td>
                    <td className="p-2 border-b text-right">
                      {Number(acc.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100">
                  <td className="p-2 border-t border-r border-gray-200 text-right">Total Expenses</td>
                  <td className="p-2 border-t text-right">
                    {Number(totalExpenseR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                {/* Net Income */}
                <tr className="font-bold bg-gray-100">
                  <td className="p-2 border-t border-r border-gray-200 text-right">Net Income</td>
                  <td className="p-2 border-t text-right">
                    {Number(netIncomeR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile sections/cards */}
          <div className="sm:hidden">
            <SectionMobile title="Revenues" items={revs} />
            {cogsList.length > 0 && <SectionMobile title="COGS" items={cogsList} />}
            <SectionMobile title="Expenses" items={exps} />

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="card p-2 flex items-center justify-between">
                <span>Total Revenue</span>
                <span className="font-mono">{totalRevenueR.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
              </div>
              {cogsList.length > 0 && (
                <>
                  <div className="card p-2 flex items-center justify-between">
                    <span>Total COGS</span>
                    <span className="font-mono">{totalCOGSR.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                  </div>
                  <div className="card p-2 flex items-center justify-between">
                    <span>Gross Profit</span>
                    <span className="font-mono">{grossProfitR.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                  </div>
                </>
              )}
              <div className="card p-2 flex items-center justify-between">
                <span>Total Expenses</span>
                <span className="font-mono">{totalExpenseR.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
              </div>
              <div className="card p-2 flex items-center justify-between font-semibold">
                <span>Net Income</span>
                <span className="font-mono">{netIncomeR.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
              </div>
            </div>
          </div>

          {/* Optional chart (include inside snapshot if desired) */}
          <div className="mt-4">
            <IncomeStatementChart
              totalRevenue={totalRevenueR}
              totalCOGS={totalCOGSR}
              totalExpense={totalExpenseR}
              netIncome={netIncomeR}
            />
          </div>
        </div>
        {/* === /CONTENT TO SNAPSHOT === */}
      </>
    );
  };

  /* -------------------- page layout -------------------- */
  const currentReportObj = {
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
    <div className="page-gutter">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Income Statement</h1>
        <div className="text-sm text-ink/60">{loading ? "Loading…" : `${entries.length} entry(ies)`}</div>
      </div>

      {/* Controls */}
      <div className="card p-3 mb-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className="text-xs text-ink/60 flex flex-col">
            From
            <input type="date" className="border rounded px-2 py-1" value={from} onChange={(e)=>setFrom(e.target.value)} />
          </label>
          <label className="text-xs text-ink/60 flex flex-col">
            To
            <input type="date" className="border rounded px-2 py-1" value={to} onChange={(e)=>setTo(e.target.value)} />
          </label>
          <label className="text-xs text-ink/60 flex-1 flex flex-col">
            Notes
            <input ref={notesRef} className="border rounded px-2 py-1" placeholder="Optional note…" value={notes} onChange={(e)=>setNotes(e.target.value)} />
          </label>
          <button className="btn btn-primary disabled:opacity-60" onClick={handleGenerate} disabled={generating}>
            {generating ? "Saving…" : "Save (structured)"}
          </button>
        </div>
      </div>

      {/* Current or Saved report */}
      {showReport ? (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-ink/60">
              Viewing saved report • Period: {formatRange(showReport.from, showReport.to)}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-outline" onClick={handleBackToCurrent}>Back to current</button>
              {canDeleteReports && (
                <button className="btn btn-danger" onClick={() => handleDeleteReport(showReport.id)}>
                  Delete
                </button>
              )}
            </div>
          </div>
          {renderReport(showReport)}
        </div>
      ) : (
        <div className="mb-4">{renderReport(currentReportObj)}</div>
      )}

      {/* Recent saved reports list (structured) */}
      <div className="card p-3">
        <div className="font-semibold mb-2">Recent saved (structured) reports</div>
        {recentReports.length === 0 ? (
          <div className="text-sm text-ink/60">No saved reports yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2 border-b border-r">Label</th>
                  <th className="text-left p-2 border-b border-r">Period</th>
                  <th className="text-left p-2 border-b">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.map((r) => (
                  <tr key={r.id} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b border-r">{r.label || "Income Statement"}</td>
                    <td className="p-2 border-b border-r">
                      {formatRange(r.periodStart || r.from, r.periodEnd || r.to)}
                    </td>
                    <td className="p-2 border-b">{r.createdAt?.seconds ? new Date(r.createdAt.seconds*1000).toLocaleString() : "—"}</td>
                    <td className="p-2 border-b">
                      <button className="btn btn-outline" onClick={() => handleShowReport({
                        id: r.id,
                        from: r.periodStart || r.from || "",
                        to: r.periodEnd || r.to || "",
                        report: r.report || {} })}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {renderDrilldown()}
    </div>
  );
}