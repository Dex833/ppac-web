// src/pages/accounting/financials/BalanceSheet.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  limit,
  deleteDoc,
  doc,
} from "firebase/firestore";
import useUserProfile from "../../../hooks/useUserProfile";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  XAxis,
  YAxis,
  Bar,
} from "recharts";
import jsPDF from "jspdf";
import { saveFinancialSnapshot } from "../../reports/saveSnapshot";

/* --------------------------- helpers --------------------------- */
const CHART_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f97316",
];

function formatRange(from, to) {
  if (!from && !to) return "—";
  if (from && to) return `${from} → ${to}`;
  return from ? `${from} → —` : `— → ${to}`;
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

function sumLinesForAccountAsOf(acc, entriesUpTo) {
  let debit = 0,
    credit = 0;
  entriesUpTo.forEach((e) => {
    (e.lines || []).forEach((l) => {
      if (l.accountId === acc.id) {
        debit += Number(l.debit || 0);
        credit += Number(l.credit || 0);
      }
    });
  });
  if (acc.type === "Asset") return debit - credit;
  if (acc.type === "Liability" || acc.type === "Equity") return credit - debit;
  return 0;
}

/* --------------------------- component --------------------------- */
export default function BalanceSheet() {
  const { profile } = useUserProfile();
  const isAdmin =
    profile?.role === "admin" || (profile?.roles || []).includes("admin");
  const isTreasurer =
    profile?.role === "treasurer" ||
    (profile?.roles || []).includes("treasurer");
  const createdBy = profile?.displayName || profile?.email || "Unknown";
  const createdById = profile?.uid || "";

  const accounts = useAccounts();

  // journal entries (oldest first)
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const qJE = query(collection(db, "journalEntries"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(qJE, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // income statements (legacy) used to pick the "as of" date
  const [isReports, setIsReports] = useState([]);
  const [selectedISId, setSelectedISId] = useState("");
  useEffect(() => {
    const qIS = query(collection(db, "incomeStatementReports"), orderBy("from", "desc"));
    const unsub = onSnapshot(qIS, (snap) =>
      setIsReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);
  const selectedIS = useMemo(
    () => isReports.find((r) => r.id === selectedISId),
    [isReports, selectedISId]
  );
  const asOf = selectedIS?.to || "";

  // recent (UNIFIED) balance sheets
  const [recentBS, setRecentBS] = useState([]);
  useEffect(() => {
    const q = query(
      collection(db, "financialReports"),
      where("type", "==", "balanceSheet"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) =>
      setRecentBS(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  // entries up to asOf
  const entriesUpTo = useMemo(() => {
    if (!asOf) return [];
    return entries.filter((e) => e.date && e.date <= asOf);
  }, [entries, asOf]);

  // slices
  const assets = useMemo(
    () => accounts.filter((a) => a.type === "Asset"),
    [accounts]
  );
  const liabilities = useMemo(
    () => accounts.filter((a) => a.type === "Liability"),
    [accounts]
  );
  const equityAccounts = useMemo(
    () => accounts.filter((a) => a.type === "Equity"),
    [accounts]
  );

  // rows
  const assetRows = useMemo(
    () =>
      assets.map((acc) => ({
        acc,
        amount: selectedIS ? sumLinesForAccountAsOf(acc, entriesUpTo) : 0,
      })),
    [assets, entriesUpTo, selectedIS]
  );
  const liabilityRows = useMemo(
    () =>
      liabilities.map((acc) => ({
        acc,
        amount: selectedIS ? sumLinesForAccountAsOf(acc, entriesUpTo) : 0,
      })),
    [liabilities, entriesUpTo, selectedIS]
  );
  const equityRows = useMemo(
    () =>
      equityAccounts.map((acc) => ({
        acc,
        amount: selectedIS ? sumLinesForAccountAsOf(acc, entriesUpTo) : 0,
      })),
    [equityAccounts, entriesUpTo, selectedIS]
  );

  // totals
  const totalAssets = useMemo(
    () => assetRows.reduce((s, r) => s + r.amount, 0),
    [assetRows]
  );
  const totalLiabilities = useMemo(
    () => liabilityRows.reduce((s, r) => s + r.amount, 0),
    [liabilityRows]
  );
  const totalEquityExRetained = useMemo(
    () => equityRows.reduce((s, r) => s + r.amount, 0),
    [equityRows]
  );

  // retained = (prior retained from most recent saved BS before asOf) + current IS net income
  const [previousBS, setPreviousBS] = useState(null);
  useEffect(() => {
    // find most recent unified BS strictly before the selected asOf
    if (!asOf) {
      setPreviousBS(null);
      return;
    }
    const q = query(
      collection(db, "financialReports"),
      where("type", "==", "balanceSheet"),
      orderBy("toAsOf", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const prior = all.filter((r) => r.toAsOf && r.toAsOf < asOf).pop() || null;
      setPreviousBS(prior);
    });
    return () => unsub();
  }, [asOf]);

  const prevRetained =
    previousBS?.report?.retainedIncomeEnding != null
      ? Number(previousBS.report.retainedIncomeEnding) || 0
      : 0;
  const isNetIncome = selectedIS?.report?.netIncome ?? 0;
  const retainedIncomeEnding = prevRetained + isNetIncome;

  const totalEquity = totalEquityExRetained + (selectedIS ? retainedIncomeEnding : 0);
  const totalLiabEquity = totalLiabilities + totalEquity;

  const isBalanced =
    Math.abs(Number(totalAssets) - Number(totalLiabEquity)) < 0.005;

  // charts / notes / print / saving
  const [notes, setNotes] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);

  const barChartData = useMemo(
    () => [
      { name: "Liabilities", value: Math.max(0, totalLiabilities) },
      { name: "Equity", value: Math.max(0, totalEquity) },
    ],
    [totalLiabilities, totalEquity]
  );
  const assetChartData = useMemo(
    () =>
      assetRows
        .filter((r) => r.amount !== 0)
        .map(({ acc, amount }) => ({
          name: `${acc.code} - ${acc.main}${acc.individual ? " / " + acc.individual : ""}`,
          value: Math.abs(amount),
        })),
    [assetRows]
  );

  function handlePrint() {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
  }

  function viewRowMap(rows) {
    return rows.map(({ acc, amount }) => ({
      id: acc.id,
      code: acc.code,
      name: acc.main + (acc.individual ? " / " + acc.individual : ""),
      amount,
    }));
  }

  // save (UNIFIED)
  async function handleGenerateAndSave() {
    if (!selectedIS || !(isAdmin || isTreasurer)) return;
    setSaving(true);
    try {
      const report = {
        notes,
        prevRetained,
        retainedIncomeEnding,
        totals: {
          assets: totalAssets,
          liabilities: totalLiabilities,
          equityExRetained: totalEquityExRetained,
          equity: totalEquity,
          liabPlusEquity: totalLiabEquity,
        },
        assets: viewRowMap(assetRows),
        liabilities: viewRowMap(liabilityRows),
        equity: viewRowMap(equityRows),
        sourceIS: {
          id: selectedIS.id,
          from: selectedIS.from || "",
          to: selectedIS.to || "",
          netIncome: isNetIncome,
        },
      };

      // Save to unified collection; we also store asOf on the doc
      await saveFinancialSnapshot({
        type: "balanceSheet",
        label: "Balance Sheet",
        from: asOf,                 // to keep ReportView period label happy
        to: asOf,
        fromAsOf: asOf,
        toAsOf: asOf,               // explicit "as of" for both ends
        asOf,                       // convenience field for this page
        report,
        createdBy,
        createdById,
      });

      alert("Balance Sheet saved to Reports.");
      setNotes("");
    } catch (e) {
      console.error(e);
      alert("Failed to save Balance Sheet: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  // delete & view (UNIFIED)
  async function handleDeleteBS(id) {
    if (!id || !(isAdmin || isTreasurer)) return;
    if (!window.confirm("Delete this saved Balance Sheet?")) return;
    await deleteDoc(doc(db, "financialReports", id));
  }
  const [showReport, setShowReport] = useState(null);
  const showSaved = Boolean(showReport?.report);
  const view = showSaved ? showReport.report : null;
  const viewAsOf = showSaved ? (showReport.asOf || showReport.toAsOf || "") : null;
  function handleShowSavedBS(r) {
    setShowReport(r);
    setSelectedISId("");
  }

  // view model (current vs saved)
  const viewTotals = showSaved
    ? view.totals
    : {
        assets: totalAssets,
        liabilities: totalLiabilities,
        equityExRetained: totalEquityExRetained,
        equity: totalEquity,
        liabPlusEquity: totalLiabEquity,
      };
  const viewRetained = showSaved ? view.retainedIncomeEnding : retainedIncomeEnding;
  const viewAssets = showSaved ? view.assets : viewRowMap(assetRows);
  const viewLiabs = showSaved ? view.liabilities : viewRowMap(liabilityRows);
  const viewEquity = showSaved ? view.equity : viewRowMap(equityRows);

  /* ---------------- drilldown (responsive modal) ---------------- */
  const [drill, setDrill] = useState(null);

  function openDrilldown(row) {
    setDrill({
      code: row.code,
      name: row.name,
    });
  }

  function renderDrilldown() {
    if (!drill) return null;

    // resolve the real accountId from accounts by code
    const target =
      accounts.find((a) => a.code === drill.code) ||
      accounts.find((a) => a.id === drill.id);

    const limitDate = showSaved ? viewAsOf || asOf : asOf;
    const list = limitDate
      ? entries.filter((e) => e.date && e.date <= limitDate)
      : entries;

    // build rows for that accountId
    const rows = [];
    (list || []).forEach((e) => {
      (e.lines || []).forEach((l) => {
        if (target && l.accountId === target.id) {
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
            <button
              className="px-3 py-1 rounded bg-gray-200"
              onClick={() => setDrill(null)}
            >
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
      </div>
    );
  }

  /* ---------------- exports ---------------- */
  function handleExportCSV() {
    setDownloading(true);
    const header = `Balance Sheet\nAs of,${showSaved ? viewAsOf : asOf}\n\n`;
    let csv = header + "Assets\nAccount,Amount\n";
    viewAssets.forEach((r) => {
      csv += `"${r.code} - ${r.name}",${r.amount}\n`;
    });
    csv += `Total Assets,${viewTotals.assets}\n\nLiabilities\nAccount,Amount\n`;
    viewLiabs.forEach((r) => {
      csv += `"${r.code} - ${r.name}",${r.amount}\n`;
    });
    csv += `Total Liabilities,${viewTotals.liabilities}\n\nEquity\nAccount,Amount\n`;
    viewEquity.forEach((r) => {
      csv += `"${r.code} - ${r.name}",${r.amount}\n`;
    });
    csv += `Retained Income/Loss,${viewRetained}\nTotal Equity,${viewTotals.equity}\n\nTotal Liabilities & Equity,${viewTotals.liabPlusEquity}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BalanceSheet_${showSaved ? viewAsOf : asOf}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloading(false);
  }

  function handleExportPDF() {
    setDownloading(true);
    const d = new jsPDF();
    const title = `Balance Sheet (As of ${showSaved ? viewAsOf : asOf})`;
    d.setFontSize(14);
    d.text(title, 14, 16);
    let y = 26;

    function section(name, rows, total) {
      d.setFontSize(11);
      d.text(name, 14, y);
      y += 6;
      d.setFontSize(10);
      rows.forEach((r) => {
        d.text(`${r.code} - ${r.name}`, 16, y);
        d.text(
          Number(r.amount).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          190 - 14,
          y,
          { align: "right" }
        );
        y += 6;
      });
      d.setFont(undefined, "bold");
      d.text(`Total ${name}`, 16, y);
      d.text(
        Number(total).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        190 - 14,
        y,
        { align: "right" }
      );
      d.setFont(undefined, "normal");
      y += 8;
    }

    section("Assets", viewAssets, viewTotals.assets);
    section("Liabilities", viewLiabs, viewTotals.liabilities);
    section("Equity", viewEquity, viewTotals.equity);

    d.setFont(undefined, "bold");
    d.text("Total Liabilities & Equity", 16, y);
    d.text(
      Number(viewTotals.liabPlusEquity).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      190 - 14,
      y,
      { align: "right" }
    );

    d.save(`BalanceSheet_${showSaved ? viewAsOf : asOf}.pdf`);
    setDownloading(false);
  }

  // small notice
  const prevNotice = useMemo(() => {
    if (!selectedIS) return "";
    if (!previousBS)
      return "No prior Balance Sheet (unified). Beginning balances are 0. Ending balances are as of the selected IS end date.";
    if (previousBS?.toAsOf && previousBS.toAsOf === asOf) return "";
    return `Prior saved Balance Sheet is as of ${previousBS?.toAsOf || "—"}.`;
  }, [selectedIS, previousBS, asOf]);

  const showAsOf = showSaved ? viewAsOf : asOf;

  /* --------------------------- render --------------------------- */
  return (
    <div className={`flex flex-col lg:flex-row gap-6 lg:gap-8${printing ? " print:block" : ""}`}>
      {renderDrilldown()}

      {/* Main column */}
      <div className="flex-1 min-w-0">
        <h3 className="text-xl font-semibold mb-3">Balance Sheet</h3>

        {(selectedIS || showSaved) && (
          <div className="mb-3 flex flex-wrap gap-2 items-start sm:items-center">
            <button className="btn btn-primary" onClick={handleExportCSV} disabled={downloading}>
              Export CSV
            </button>
            <button className="btn btn-primary" onClick={handleExportPDF} disabled={downloading}>
              Export PDF
            </button>
            <button className="btn btn-outline" onClick={handlePrint}>
              Print
            </button>
            <textarea
              className="border rounded px-3 py-2 min-w-[200px] flex-1"
              placeholder="Add notes (saved with report)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
            {!isBalanced && <span className="text-red-600 font-semibold">⚠️ Out of balance!</span>}
          </div>
        )}

        {/* Selector panel */}
        <div className="mb-4 p-3 border rounded bg-gray-50">
          <label className="block text-sm font-medium mb-1">
            Select Income Statement (sets Balance Sheet period)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 items-center">
            <select
              className="border rounded px-3 py-2"
              value={selectedISId}
              onChange={(e) => setSelectedISId(e.target.value)}
            >
              <option value="">— Choose an Income Statement report —</option>
              {isReports.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatRange(r.from, r.to)} • Net Income:{" "}
                  {(r.report?.netIncome ?? 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </option>
              ))}
            </select>

            {selectedIS && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">
                  As of: <strong>{asOf}</strong>
                </span>
                {(isAdmin || isTreasurer) && (
                  <button
                    onClick={handleGenerateAndSave}
                    disabled={saving || loading}
                    className="btn btn-primary"
                  >
                    {saving ? "Saving…" : "Generate & Save"}
                  </button>
                )}
              </div>
            )}

            {showSaved && (
              <span className="text-sm text-gray-700">
                Viewing saved BS • as of <strong>{showAsOf}</strong>
              </span>
            )}
          </div>

          {!selectedIS && !showSaved && (
            <p className="mt-2 text-xs text-gray-600">
              Pick an Income Statement to generate a Balance Sheet as of that end
              date, then click <em>Generate &amp; Save</em>.
            </p>
          )}
        </div>

        {!selectedIS && !showSaved ? (
          <div className="text-gray-500 text-sm">No report selected.</div>
        ) : loading ? (
          <div>Loading…</div>
        ) : (
          <>
            {!showSaved && prevNotice && (
              <div className="mb-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-sm text-yellow-900">
                {prevNotice}
              </div>
            )}

            <div className="mb-3 text-sm text-gray-700">
              <div>
                <span className="font-semibold">Retained Income/Loss:</span>{" "}
                {Number(viewRetained).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                {!showSaved && (
                  <span className="text-gray-500">
                    {" "}
                    (Prior retained{" "}
                    {Number(previousBS?.report?.retainedIncomeEnding || 0).toLocaleString(
                      undefined,
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                    )}
                    {" + "}Net income{" "}
                    {Number(isNetIncome || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    )
                  </span>
                )}
              </div>
            </div>

            {/* charts */}
            <div className="w-full flex flex-wrap gap-8 mb-4">
              <div className="min-w-[240px] flex-1">
                <h4 className="font-semibold mb-1">Asset Allocation</h4>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={assetChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={60}
                      label
                    >
                      {assetChartData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) =>
                        Number(v).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      }
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="min-w-[240px] flex-1">
                <h4 className="font-semibold mb-1">Liabilities vs Equity</h4>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={barChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip
                      formatter={(v) =>
                        Number(v).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      }
                    />
                    <Legend />
                    <Bar dataKey="value" fill="#60a5fa" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Desktop tables */}
            <div className="hidden sm:flex flex-wrap gap-8">
              {/* Assets */}
              <div className="flex-1 min-w-[300px]">
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-300 rounded text-sm mb-6">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2 border-b">Assets</th>
                        <th className="text-right p-2 border-b">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewAssets.map((row, i) => (
                        <tr
                          key={row.code + i}
                          className="hover:bg-blue-50 cursor-pointer"
                          onClick={() => openDrilldown(row)}
                        >
                          <td className="p-2 border-b border-r border-gray-200">
                            {row.code} - {row.name}
                          </td>
                          <td className="p-2 border-b text-right">
                            {Number(row.amount || 0).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-bold bg-gray-100">
                        <td className="p-2 border-t text-right">Total Assets</td>
                        <td className="p-2 border-t text-right">
                          {Number(viewTotals.assets || 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Liabilities & Equity */}
              <div className="flex-1 min-w-[300px]">
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-300 rounded text-sm mb-6">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2 border-b">Liabilities &amp; Equity</th>
                        <th className="text-right p-2 border-b">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Liabilities */}
                      <tr>
                        <td colSpan={2} className="font-bold p-2">
                          Liabilities
                        </td>
                      </tr>
                      {viewLiabs.map((row, i) => (
                        <tr
                          key={row.code + i}
                          className="hover:bg-blue-50 cursor-pointer"
                          onClick={() => openDrilldown(row)}
                        >
                          <td className="p-2 border-b border-r border-gray-200">
                            {row.code} - {row.name}
                          </td>
                          <td className="p-2 border-b text-right">
                            {Number(row.amount || 0).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="p-2 border-t border-r border-gray-200 text-right">
                          Total Liabilities
                        </td>
                        <td className="p-2 border-t text-right">
                          {Number(viewTotals.liabilities || 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>

                      {/* Equity */}
                      <tr>
                        <td colSpan={2} className="font-bold p-2">
                          Equity
                        </td>
                      </tr>
                      {viewEquity.map((row, i) => (
                        <tr
                          key={row.code + i}
                          className="hover:bg-blue-50 cursor-pointer"
                          onClick={() => openDrilldown(row)}
                        >
                          <td className="p-2 border-b border-r border-gray-200">
                            {row.code} - {row.name}
                          </td>
                          <td className="p-2 border-b text-right">
                            {Number(row.amount || 0).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      ))}

                      <tr className="bg-gray-50">
                        <td className="p-2 border-b border-r border-gray-200">
                          Retained Income/Loss
                        </td>
                        <td className="p-2 border-b text-right">
                          {Number(viewRetained || 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>

                      <tr className="font-bold">
                        <td className="p-2 border-t border-r border-gray-200 text-right">
                          Total Equity
                        </td>
                        <td className="p-2 border-t text-right">
                          {Number(viewTotals.equity || 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>

                      <tr className="font-bold bg-gray-100">
                        <td className="p-2 border-t border-r border-gray-200 text-right">
                          Total Liabilities &amp; Equity
                        </td>
                        <td className="p-2 border-t text-right">
                          {Number(viewTotals.liabPlusEquity || 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Mobile cards (<= sm) */}
            <div className="sm:hidden space-y-6">
              {/* Assets */}
              <div>
                <div className="font-semibold mb-1">Assets</div>
                <div className="space-y-2">
                  {viewAssets.map((row, i) => (
                    <button
                      key={row.code + i}
                      onClick={() => openDrilldown(row)}
                      className="w-full text-left card px-3 py-2 active:opacity-80"
                    >
                      <div className="text-sm">
                        {row.code} - {row.name}
                      </div>
                      <div className="font-mono text-right">
                        {Number(row.amount || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex justify-between font-semibold">
                  <span>Total Assets</span>
                  <span className="font-mono">
                    {Number(viewTotals.assets || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              {/* Liabilities */}
              <div>
                <div className="font-semibold mb-1">Liabilities</div>
                <div className="space-y-2">
                  {viewLiabs.map((row, i) => (
                    <button
                      key={row.code + i}
                      onClick={() => openDrilldown(row)}
                      className="w-full text-left card px-3 py-2 active:opacity-80"
                    >
                      <div className="text-sm">
                        {row.code} - {row.name}
                      </div>
                      <div className="font-mono text-right">
                        {Number(row.amount || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex justify-between font-semibold">
                  <span>Total Liabilities</span>
                  <span className="font-mono">
                    {Number(viewTotals.liabilities || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              {/* Equity */}
              <div>
                <div className="font-semibold mb-1">Equity</div>
                <div className="space-y-2">
                  {viewEquity.map((row, i) => (
                    <button
                      key={row.code + i}
                      onClick={() => openDrilldown(row)}
                      className="w-full text-left card px-3 py-2 active:opacity-80"
                    >
                      <div className="text-sm">
                        {row.code} - {row.name}
                      </div>
                      <div className="font-mono text-right">
                        {Number(row.amount || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="card px-3 py-2">
                    <div className="text-xs text-ink/70">Retained Income/Loss</div>
                    <div className="font-mono">
                      {Number(viewRetained || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="card px-3 py-2">
                    <div className="text-xs text-ink/70">Total Equity</div>
                    <div className="font-mono">
                      {Number(viewTotals.equity || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-3 py-2 px-3 bg-gray-100 rounded font-bold flex justify-between">
                  <span>Total Liabilities & Equity</span>
                  <span className="font-mono">
                    {Number(viewTotals.liabPlusEquity || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right sidebar (Recent Reports - UNIFIED) */}
      <aside className="w-full lg:w-80 shrink-0">
        <h4 className="text-lg font-semibold mb-2">Recent Reports</h4>
        <ul className="space-y-2">
          {recentBS.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between border border-gray-200 rounded px-3 py-2"
            >
              <button
                className="text-left truncate"
                onClick={() => handleShowSavedBS(r)}
                title={`as of ${r.asOf || r.toAsOf || "—"}`}
              >
                as of {r.asOf || r.toAsOf || "—"}
              </button>
              {(isAdmin || isTreasurer) && (
                <button
                  className="ml-2 px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteBS(r.id);
                  }}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
          {recentBS.length === 0 && (
            <li className="text-sm text-gray-500">No saved balance sheets yet.</li>
          )}
        </ul>
      </aside>
    </div>
  );
}