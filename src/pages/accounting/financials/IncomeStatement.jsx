// src/pages/accounting/financials/IncomeStatement.jsx
import React, { useEffect, useState, useRef } from "react";
import { formatD } from "@/utils/dates";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import useUserProfile from "../../../hooks/useUserProfile";
// defer heavy PDF lib until export is requested
import { useNavigate } from "react-router-dom";

/* -------------------- Error Boundary (prevents blank screens) -------------------- */
class ISBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("IncomeStatement crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="page-gutter">
          <h1 className="text-2xl font-bold mb-2">Income Statement</h1>
          <div className="card p-4 text-sm">
            <div className="font-semibold mb-1">Something went wrong on this page.</div>
            <div className="text-rose-700">{String(this.state.error?.message || this.state.error)}</div>
            <div className="mt-2 text-ink/60">
              Try refreshing. If it keeps happening, send this message to the devs.
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* -------------------- tiny helpers -------------------- */
const A = (v) => (Array.isArray(v) ? v : []); // force Array
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
const isRevenueType = (t) => {
  const v = (t || "").toLowerCase();
  return v === "revenue" || v === "income";
};
const isExpenseType = (t) => (t || "").toLowerCase() === "expense";
const isCOGSAccount = (acc) => ((acc?.main || "").trim().toLowerCase() === "cogs");
const mainFromRenderedName = (name = "") => name.split(" / ")[0].trim().toLowerCase();

/* -------------------- accounts hook -------------------- */
function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const qAcc = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(qAcc, (snap) => {
      setAccounts(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((a) => !a.archived)
      );
    });
    return () => unsub();
  }, []);
  return accounts;
}

/* -------------------- sums -------------------- */
function sumForAccount(acc, filteredEntries) {
  let debit = 0, credit = 0;
  A(filteredEntries).forEach((entry) => {
    A(entry?.lines).forEach((line) => {
      if (line?.accountId === acc.id) {
        debit += parseFloat(line.debit) || 0;
        credit += parseFloat(line.credit) || 0;
      }
    });
  });
  const isRev = isRevenueType(acc?.type);
  const amount = isRev ? (credit - debit) : (debit - credit);
  return { amount };
}

/* -------------------- page -------------------- */
function IncomeStatementInner() {
  const accounts = useAccounts();
  const nav = useNavigate();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);

  const { profile } = useUserProfile();
  const userName = profile?.displayName || profile?.email || "Unknown";
  const userId = profile?.uid || "";
  const viewRef = useRef(null); // content snapshot

  /* entries */
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "journalEntries"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  /* filters */
  function filterEntriesByDate(list, fromDate, toDate) {
    if (!fromDate && !toDate) return list;
    return A(list).filter((e) => {
      const d = e?.date || ""; // "YYYY-MM-DD"
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }

  const filteredEntries = filterEntriesByDate(entries, from, to);

  const revenueAccounts = A(accounts).filter((a) => isRevenueType(a.type));
  const expenseAccounts = A(accounts).filter((a) => isExpenseType(a.type));
  const cogsAccountsRaw = expenseAccounts.filter(isCOGSAccount);
  const opExAccountsRaw = expenseAccounts.filter((a) => !isCOGSAccount(a));

  const revenues = revenueAccounts.map((acc) => {
    const { amount } = sumForAccount(acc, filteredEntries);
    return { code: acc.code, name: acc.main + (acc.individual ? " / " + acc.individual : ""), amount };
  });

  const cogs = cogsAccountsRaw.map((acc) => {
    const { amount } = sumForAccount(acc, filteredEntries);
    return { code: acc.code, name: acc.main + (acc.individual ? " / " + acc.individual : ""), amount };
  });

  const expenses = opExAccountsRaw.map((acc) => {
    const { amount } = sumForAccount(acc, filteredEntries);
    return { code: acc.code, name: acc.main + (acc.individual ? " / " + acc.individual : ""), amount };
  });

  const totalRevenue = revenues.reduce((s, a) => s + (a.amount || 0), 0);
  const totalCOGS = cogs.reduce((s, a) => s + (a.amount || 0), 0);
  const grossProfit = totalRevenue - totalCOGS;
  const totalExpense = expenses.reduce((s, a) => s + (a.amount || 0), 0);
  const netIncome = grossProfit - totalExpense;

  const currentReportObj = {
    from,
    to,
    report: {
      revenues, cogs, expenses,
      totalRevenue, totalCOGS, grossProfit, totalExpense, netIncome,
      notes,
      generatedBy: userName,
      generatedById: userId,
      generatedAt: new Date().toISOString(),
    },
  };

  /* -------------- Save to periodic Reports (payload.html only) -------------- */
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
        type: "incomeStatement",
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
        payload: { html }, // periodic reports viewer uses this
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

  /* -------------- exports -------------- */
  function handlePrint() {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
  }
  async function handleDownloadPDF(reportObj) {
    setDownloading(true);
    try {
    const { default: jsPDF } = await import("jspdf");
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

    const revs = A(reportObj.report.revenues);
    const cogsList = A(reportObj.report.cogs);
    const exps = A(reportObj.report.expenses);

    docPDF.text("Revenues", 14, y); y += 6;
    revs.forEach((acc) => {
      docPDF.text(`${acc.code} - ${acc.name}`, 16, y);
      docPDF.text(
        Number(acc.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        120, y, { align: "right" }
      );
      y += 6;
    });
    docPDF.text(`Total Revenue: ${Number(reportObj.report.totalRevenue ?? 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`, 16, y); y += 8;

    if (cogsList.length) {
      docPDF.text("Less: Cost of Goods Sold (COGS)", 14, y); y += 6;
      cogsList.forEach((acc) => {
        docPDF.text(`${acc.code} - ${acc.name}`, 16, y);
        docPDF.text(
          Number(acc.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          120, y, { align: "right" }
        );
        y += 6;
      });
      docPDF.text(`Total COGS: ${Number(reportObj.report.totalCOGS ?? 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`, 16, y); y += 8;
      docPDF.setFont(undefined, "bold");
      docPDF.text(`Gross Profit: ${Number(reportObj.report.grossProfit ?? 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`, 16, y);
      docPDF.setFont(undefined, "normal");
      y += 8;
    }

    docPDF.text("Expenses", 14, y); y += 6;
    exps.forEach((acc) => {
      docPDF.text(`${acc.code} - ${acc.name}`, 16, y);
      docPDF.text(
        Number(acc.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        120, y, { align: "right" }
      );
      y += 6;
    });
    docPDF.text(`Total Expenses: ${Number(reportObj.report.totalExpense ?? 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`, 16, y); y += 8;

    docPDF.setFont(undefined, "bold");
    docPDF.text(`Net Income: ${Number(reportObj.report.netIncome ?? 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`, 16, y);
    docPDF.setFont(undefined, "normal");

    if (reportObj.report.notes) {
      y += 8;
      docPDF.text("Notes:", 14, y); y += 6;
      docPDF.text(String(reportObj.report.notes), 16, y);
    }

    const fileName = `IncomeStatement_${formatRange(reportObj.from, reportObj.to).replace(/\s+/g, "")}.pdf`;
    docPDF.save(fileName);
    } finally {
      setDownloading(false);
    }
  }
  function handleDownloadCSV(reportObj) {
    const revs = A(reportObj.report.revenues);
    const cogsList = A(reportObj.report.cogs);
    const exps = A(reportObj.report.expenses);
    const period = formatRange(reportObj.from, reportObj.to);
    let csv = `Income Statement\nPeriod:,${period}\n`;
    csv += `Generated by:,${reportObj.report.generatedBy || "-"}\nGenerated at:,${
      reportObj.report.generatedAt ? new Date(reportObj.report.generatedAt).toLocaleString() : "-"
    }\n`;

    csv += `\nRevenues\nAccount,Amount\n`;
    revs.forEach((acc) => {
      csv += `"${acc.code} - ${acc.name}",${acc.amount || 0}\n`;
    });
    csv += `Total Revenue,${reportObj.report.totalRevenue ?? 0}\n`;

    if (cogsList.length) {
      csv += `\nLess: Cost of Goods Sold (COGS)\nAccount,Amount\n`;
      cogsList.forEach((acc) => {
        csv += `"${acc.code} - ${acc.name}",${acc.amount || 0}\n`;
      });
      csv += `Total COGS,${reportObj.report.totalCOGS ?? 0}\n`;
      csv += `Gross Profit,${reportObj.report.grossProfit ?? 0}\n`;
    }

    csv += `\nExpenses\nAccount,Amount\n`;
    exps.forEach((acc) => {
      csv += `"${acc.code} - ${acc.name}",${acc.amount || 0}\n`;
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

  /* drilldown modal */
  const [drill, setDrill] = useState(null);
  function openDrilldown(row, range) {
    setDrill({ code: row.code, name: row.name, from: range.from || "", to: range.to || "" });
  }
  function renderDrilldown() {
    if (!drill) return null;
    const acct =
      A(accounts).find((a) => a.code === drill.code) ||
      A(accounts).find((a) => a.id === drill.id);

    const list = filterEntriesByDate(entries, drill.from, drill.to);
    const rows = [];
    A(list).forEach((e) => {
      A(e?.lines).forEach((l) => {
        if (acct && l?.accountId === acct.id) {
          rows.push({
            date: e?.date,
            ref: e?.refNumber,
            desc: e?.description,
            debit: Number(l?.debit || 0),
            credit: Number(l?.credit || 0),
          });
        }
      });
    });
    rows.sort(
      (a, b) =>
        String(a.date || "").localeCompare(String(b.date || "")) ||
        String(a.ref || "").localeCompare(String(b.ref || ""))
    );
    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-3">
        <div className="bg-white rounded-xl w-[min(720px,94vw)] max-h-[84vh] overflow-auto shadow-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">{drill.code} - {drill.name}</h4>
            <button className="px-3 py-1 rounded bg-gray-200" onClick={() => setDrill(null)}>Close</button>
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
                  <tr><td className="p-3 text-gray-500 text-center" colSpan={5}>No entries for this account in the selected period.</td></tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className="odd:bg-white even:bg-gray-50">
                      <td className="p-2">{formatD(r.date)}</td>
                      <td className="p-2 font-mono">{r.ref}</td>
                      <td className="p-2">{r.desc}</td>
                      <td className="p-2 text-right">
                        {r.debit.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </td>
                      <td className="p-2 text-right">
                        {r.credit.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
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

  /* renderer for current (unsaved) report */
  const renderReport = (reportObj) => {
    const revs = A(reportObj?.report?.revenues);
    const cogsList = A(reportObj?.report?.cogs);
    const exps = A(reportObj?.report?.expenses);

    const totalRevenueR = reportObj?.report?.totalRevenue ?? revs.reduce((s,a)=>s+(a?.amount||0),0);
    const totalCOGSR = reportObj?.report?.totalCOGS ?? cogsList.reduce((s,a)=>s+(a?.amount||0),0);
    const grossProfitR = reportObj?.report?.grossProfit ?? (totalRevenueR - totalCOGSR);
    const totalExpenseR = reportObj?.report?.totalExpense ?? exps.reduce((s,a)=>s+(a?.amount||0),0);
    const netIncomeR = reportObj?.report?.netIncome ?? (grossProfitR - totalExpenseR);

    const SectionMobile = ({ title, items }) => (
      <>
        <div className="mt-2 mb-1 font-semibold">{title}</div>
        <div className="space-y-2">
          {A(items).map((acc, i) => (
            <button
              key={String(acc?.code) + i}
              onClick={() => openDrilldown(acc, { from: reportObj.from, to: reportObj.to })}
              className="w-full text-left card px-3 py-2 active:opacity-80"
            >
              <div className="text-sm">{acc?.code} - {acc?.name}</div>
              <div className="font-mono text-right">
                {Number(acc?.amount || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
              </div>
            </button>
          ))}
        </div>
      </>
    );

    return (
      <>
        <div className="mb-4 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => handleDownloadCSV(reportObj)} disabled={downloading}>Export CSV</button>
          <button className="btn btn-primary" onClick={() => handleDownloadPDF(reportObj)} disabled={downloading}>Export PDF</button>
          {downloading && <span className="text-sm text-ink/60">Preparing PDF…</span>}
          <button className="btn btn-outline" onClick={handlePrint}>Print</button>
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
                <tr><td colSpan={2} className="font-bold p-2">Revenues</td></tr>
                {revs.map((acc, i) => (
                  <tr key={String(acc?.code) + i} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b border-r border-gray-200">{acc?.code} - {acc?.name}</td>
                    <td className="p-2 border-b text-right">
                      {Number(acc?.amount || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100">
                  <td className="p-2 border-t border-r border-gray-200 text-right">Total Revenue</td>
                  <td className="p-2 border-t text-right">
                    {Number(totalRevenueR).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </td>
                </tr>

                {cogsList.length > 0 && (
                  <>
                    <tr><td colSpan={2} className="font-bold p-2">Less: Cost of Goods Sold (COGS)</td></tr>
                    {cogsList.map((acc, i) => (
                      <tr key={String(acc?.code) + i} className="odd:bg-white even:bg-gray-50">
                        <td className="p-2 border-b border-r border-gray-200">{acc?.code} - {acc?.name}</td>
                        <td className="p-2 border-b text-right">
                          {Number(acc?.amount || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-gray-100">
                      <td className="p-2 border-t border-r border-gray-200 text-right">Total COGS</td>
                      <td className="p-2 border-t text-right">
                        {Number(totalCOGSR).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </td>
                    </tr>
                    <tr className="font-bold bg-gray-100">
                      <td className="p-2 border-t border-r border-gray-200 text-right">Gross Profit</td>
                      <td className="p-2 border-t text-right">
                        {Number(grossProfitR).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </td>
                    </tr>
                  </>
                )}

                <tr><td colSpan={2} className="font-bold p-2">Expenses</td></tr>
                {exps.map((acc, i) => (
                  <tr key={String(acc?.code) + i} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b border-r border-gray-200">{acc?.code} - {acc?.name}</td>
                    <td className="p-2 border-b text-right">
                      {Number(acc?.amount || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100">
                  <td className="p-2 border-t border-r border-gray-200 text-right">Total Expenses</td>
                  <td className="p-2 border-t text-right">
                    {Number(totalExpenseR).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </td>
                </tr>

                <tr className="font-bold bg-gray-100">
                  <td className="p-2 border-t border-r border-gray-200 text-right">Net Income</td>
                  <td className="p-2 border-t text-right">
                    {Number(netIncomeR).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
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
        </div>
        {/* === /CONTENT TO SNAPSHOT === */}
      </>
    );
  };

  return (
    <div className="page-gutter">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Income Statement</h1>
        <div className="text-sm text-ink/60">{loading ? "Loading…" : `${A(entries).length} entry(ies)`}</div>
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
            <input className="border rounded px-2 py-1" placeholder="Optional note…" value={notes} onChange={(e)=>setNotes(e.target.value)} />
          </label>
        </div>
      </div>

      {/* Current (unsaved) report preview + actions */}
      {renderReport(currentReportObj)}

      {renderDrilldown()}
    </div>
  );
}

export default function IncomeStatement() {
  return (
    <ISBoundary>
      <IncomeStatementInner />
    </ISBoundary>
  );
}