// src/pages/accounting/financials/CashFlowStatement.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import useUserProfile from "../../../hooks/useUserProfile";
import { saveFinancialSnapshot } from "../../reports/saveSnapshot";
import jsPDF from "jspdf";

/* ======================= small utils ======================= */
const fmt = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const S = (v) => String(v ?? "");

function longDate(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function periodLabelSafe(obj) {
  const left = obj?.from ? obj.from : obj?.fromLabel || "—";
  const right = obj?.to ? obj.to : obj?.toLabel || "—";
  return `${left} → ${right}`;
}

function getAsOfFromBSDoc(r) {
  // Our unified BS snapshot uses { from, to }; both are the same "as-of"
  return r?.to || r?.from || r?.asOf || r?.report?.asOf || "";
}

/* ======================= data hooks ======================= */
function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const qAcc = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(qAcc, (snap) =>
      setAccounts(
        snap.docs
          .filter((d) => !d.data().archived)
          .map((d) => ({ id: d.id, ...d.data() }))
      )
    );
    return () => unsub();
  }, []);
  return accounts;
}

function useJournalEntries() {
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    const qJE = query(collection(db, "journalEntries"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(qJE, (snap) =>
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);
  return entries;
}

// Unified: read Balance Sheets from financialReports
function useBalanceSheetSnapshots() {
  const [bs, setBS] = useState([]);
  useEffect(() => {
    const qBS = query(
      collection(db, "financialReports"),
      where("type", "==", "balanceSheet"),
      orderBy("to", "asc")
    );
    const unsub = onSnapshot(qBS, (snap) =>
      setBS(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);
  return bs;
}

// Unified: read Income Statements from financialReports
function useIncomeStatementSnapshots() {
  const [isList, setIS] = useState([]);
  useEffect(() => {
    const qIS = query(
      collection(db, "financialReports"),
      where("type", "==", "incomeStatement"),
      orderBy("to", "asc")
    );
    const unsub = onSnapshot(qIS, (snap) =>
      setIS(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);
  return isList;
}

// Unified: recent Cash Flow (for sidebar)
function useRecentCashFlowSnapshots(limit = 25) {
  const [list, setList] = useState([]);
  useEffect(() => {
    const qCFS = query(
      collection(db, "financialReports"),
      where("type", "==", "cashFlow"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(qCFS, (snap) =>
      setList(snap.docs.slice(0, limit).map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [limit]);
  return list;
}

/* ======================= calc helpers ======================= */
function sumByName(rows = [], needles = []) {
  const ns = needles.map((x) => x.toLowerCase());
  return rows.reduce((sum, r) => {
    const nm = S(r.name).toLowerCase();
    return sum + (ns.some((n) => nm.includes(n)) ? Number(r.amount || 0) : 0);
  }, 0);
}

function balancesFromBSReport(report) {
  // report from unified BS snapshot: { assets: [{name, amount}], equity: [...] }
  if (!report) return { cash: 0, loanRecv: 0, inventory: 0, shareCap: 0 };
  const assets = report.assets || [];
  const equity = report.equity || [];
  return {
    cash: sumByName(assets, ["cash"]),
    loanRecv: sumByName(assets, ["loan receivable"]),
    inventory: sumByName(assets, ["rice inventory", "inventory"]),
    shareCap: sumByName(equity, ["share capital"]),
  };
}

function computeVBAStyle(beginReport, endReport, netIncome) {
  const b = balancesFromBSReport(beginReport);
  const e = balancesFromBSReport(endReport);
  const ni = Number(netIncome || 0);

  const dLoan = e.loanRecv - b.loanRecv;
  const dInv = e.inventory - b.inventory;
  const dWC = dLoan + dInv;
  const dSC = e.shareCap - b.shareCap;

  const CFO = ni - dWC;
  const CFI = 0;
  const CFF = dSC;

  return {
    inputs: { begin: b, end: e, netIncome: ni },
    deltas: {
      loanReceivable: dLoan,
      inventory: dInv,
      workingCapital: dWC,
      shareCapital: dSC,
    },
    sections: {
      operating: { netIncome: ni, net: CFO },
      investing: { net: CFI },
      financing: { net: CFF },
    },
    summary: {
      startCash: b.cash,
      endCash: e.cash,
      netChangeCash: e.cash - b.cash,
    },
  };
}

/* =========== fallback NI if we don't find an IS for the end date =========== */
function isRevenueType(t) {
  const v = (t || "").toLowerCase();
  return v === "revenue" || v === "income";
}
function isExpenseType(t) {
  return (t || "").toLowerCase() === "expense";
}
function computeNetIncomeFromEntries(entries, accounts, from, to) {
  const inRange = (d) => (!from || d > from) && (!to || d <= to);

  const acctMap = new Map(accounts.map((a) => [a.id, a]));
  let revenue = 0;
  let expense = 0;

  (entries || []).forEach((e) => {
    const d = S(e.date);
    if (!inRange(d)) return;
    (e.lines || []).forEach((l) => {
      const acc = acctMap.get(l.accountId);
      if (!acc) return;
      const debit = Number(l.debit || 0);
      const credit = Number(l.credit || 0);

      if (isRevenueType(acc.type)) {
        revenue += credit - debit;
      } else if (isExpenseType(acc.type)) {
        expense += debit - credit;
      }
    });
  });

  return revenue - expense;
}

/* ======================= component ======================= */
export default function CashFlowStatement() {
  const { profile } = useUserProfile();
  const isAdmin =
    profile?.role === "admin" || (profile?.roles || []).includes("admin");
  const isTreasurer =
    profile?.role === "treasurer" ||
    (profile?.roles || []).includes("treasurer");

  const accounts = useAccounts();
  const entries = useJournalEntries();
  const bsReports = useBalanceSheetSnapshots();
  const isReports = useIncomeStatementSnapshots();
  const recentCFS = useRecentCashFlowSnapshots();

  const [startId, setStartId] = useState("first");
  const [endId, setEndId] = useState("");
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showReport, setShowReport] = useState(null);
  const [drill, setDrill] = useState(null);

  // Sort BS by as-of
  const sortedBS = useMemo(() => {
    const list = [...bsReports];
    list.sort((a, b) => S(getAsOfFromBSDoc(a)).localeCompare(S(getAsOfFromBSDoc(b))));
    return list;
  }, [bsReports]);

  const startReportDoc = startId === "first" ? null : sortedBS.find((r) => r.id === startId);

  const endOptions = useMemo(() => {
    if (startId === "first") return sortedBS;
    const idx = sortedBS.findIndex((r) => r.id === startId);
    return idx >= 0 ? sortedBS.slice(idx + 1) : sortedBS;
  }, [sortedBS, startId]);

  const endReportDoc = sortedBS.find((r) => r.id === endId);

  // Find the best-matching Income Statement for the end as-of
  const netIncomeAtEnd = useMemo(() => {
    if (!endReportDoc) return 0;
    const endAsOf = getAsOfFromBSDoc(endReportDoc);

    // 1) exact match IS.to === endAsOf
    let isDoc =
      isReports.find((r) => S(r.to) === S(endAsOf)) ||
      // 2) latest IS with to <= endAsOf
      [...isReports]
        .filter((r) => r.to && r.to <= endAsOf)
        .sort((a, b) => S(a.to).localeCompare(S(b.to)))
        .pop();

    if (isDoc?.report?.netIncome != null) {
      return Number(isDoc.report.netIncome || 0);
    }

    // 3) fallback: compute NI from journal entries for (from>startAsOf, to<=endAsOf)
    const startAsOf = startReportDoc ? getAsOfFromBSDoc(startReportDoc) : "";
    return computeNetIncomeFromEntries(entries, accounts, startAsOf, endAsOf);
  }, [endReportDoc, startReportDoc, isReports, entries, accounts]);

  const currentCalc = useMemo(() => {
    if (!endReportDoc) return null;
    const beginReport = startReportDoc?.report || null;
    const endReport = endReportDoc?.report || null;
    return computeVBAStyle(beginReport, endReport, netIncomeAtEnd);
  }, [startReportDoc, endReportDoc, netIncomeAtEnd]);

  /* ---------- drilldown ---------- */
  const idsFor = (key) => {
    const lower = (s) => S(s).toLowerCase();
    switch (key) {
      case "LOAN":
        return accounts
          .filter((a) => lower(a.main).includes("loan receivable"))
          .map((a) => a.id);
      case "INV":
        return accounts
          .filter((a) => lower(a.main).includes("inventory"))
          .map((a) => a.id);
      default:
        return [];
    }
  };

  function openDrill(key, label) {
    const fromAsOf = startReportDoc ? getAsOfFromBSDoc(startReportDoc) : "";
    const toAsOf = endReportDoc ? getAsOfFromBSDoc(endReportDoc) : "";
    setDrill({ key, label, from: S(fromAsOf), to: S(toAsOf) });
  }

  function renderDrilldown() {
    if (!drill) return null;
    const ids = idsFor(drill.key);
    const list = entries.filter((e) => {
      const d = S(e.date);
      const afterStart = !drill.from || d > drill.from;
      const beforeEqEnd = !drill.to || d <= drill.to;
      return afterStart && beforeEqEnd;
    });
    const rows = [];
    list.forEach((e) => {
      (e.lines || []).forEach((l) => {
        if (ids.includes(l.accountId)) {
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
      (a, b) => S(a.date).localeCompare(S(b.date)) || S(a.ref).localeCompare(S(b.ref))
    );

    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-3">
        <div className="bg-white rounded-xl w-[min(720px,94vw)] maxHeight-[84vh] overflow-auto shadow-lg p-4">
          <div className="flex items-center justify-between mb-3 sticky top-0 bg-white">
            <h4 className="font-semibold">{drill.label}</h4>
            <button className="px-3 py-1 rounded bg-gray-200" onClick={() => setDrill(null)}>
              Close
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-10 z-10">
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
                      No entries for this group in the selected period.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className="odd:bg-white even:bg-gray-50">
                      <td className="p-2">{r.date}</td>
                      <td className="p-2 font-mono">{r.ref}</td>
                      <td className="p-2">{r.desc}</td>
                      <td className="p-2 text-right">{fmt(r.debit)}</td>
                      <td className="p-2 text-right">{fmt(r.credit)}</td>
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

  /* ---------- save / delete / open ---------- */
  async function handleGenerateAndSave() {
    if (!endReportDoc || !(isAdmin || isTreasurer)) return;
    setSaving(true);
    try {
      const beginReport = startReportDoc?.report || null;
      const endReport = endReportDoc?.report || null;
      const calc = computeVBAStyle(beginReport, endReport, netIncomeAtEnd);

      const fromAsOf = startReportDoc ? getAsOfFromBSDoc(startReportDoc) : "";
      const toAsOf = endReportDoc ? getAsOfFromBSDoc(endReportDoc) : "";

      await saveFinancialSnapshot({
        type: "cashFlow",
        label: "Cash Flow",
        from: fromAsOf,
        to: toAsOf,
        report: {
          method: "vbaStyle",
          inputs: calc.inputs,
          deltas: calc.deltas,
          sections: calc.sections,
          summary: calc.summary,
        },
        createdBy: profile?.displayName || profile?.email || "Unknown",
        createdById: profile?.uid || "",
      });

      setStartId("first");
      setEndId("");
      setShowReport(null);
      alert("Cash Flow saved to Reports.");
    } catch (e) {
      console.error(e);
      alert("Failed to save Cash Flow Statement: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCFS(id) {
    if (!id || !(isAdmin || isTreasurer)) return;
    if (!window.confirm("Delete this saved Cash Flow Statement?")) return;
    await deleteDoc(doc(db, "financialReports", id));
  }

  function handleShowSavedCFS(r) {
    setShowReport(r);
    setStartId("first");
    setEndId("");
  }

  /* ---------- export ---------- */
  function exportCSV(obj) {
    const period = periodLabelSafe(obj);
    const o = obj.report.sections.operating;
    const d = obj.report.deltas;
    const f = obj.report.sections.financing;
    const s = obj.report.summary;

    let csv = `Cash Flow Statement\nPeriod:,${period}\n\n`;
    csv += `Cash Flow From Operating Activities:\n`;
    csv += `Net Profit/Loss,,${o.netIncome}\n`;
    csv += `Changes In Working Capital:\n`;
    csv += `Changes in Loan Receivable,Loan Receivable,${d.loanReceivable}\n`;
    csv += `Changes in Rice Inventory,Rice Inventory,${d.inventory}\n`;
    csv += `Net Changes on Working Capital,,${d.workingCapital}\n`;
    csv += `Net Cash Flow From Operating Activities,,${o.net}\n\n`;
    csv += `Cash Flow from Investing Activities:\n`;
    csv += `None,,0\n`;
    csv += `Net Cash Flow From Investing Activities,,0\n\n`;
    csv += `Cash Flow From Financing Activities:\n`;
    csv += `Share Capital,Share Capital,${d.shareCapital}\n`;
    csv += `Net Cash Flow From Financing Activities,,${f.net}\n\n`;
    csv += `Net Increase In Cash:, ,${s.netChangeCash}\n`;
    csv += `Beginning Cash Balance:, ,${s.startCash}\n`;
    csv += `Ending Balance Of Cash As Of ${longDate(obj.to)}, ,${s.endCash}\n`;

    const name = `${obj.from || "first"}_to_${obj.to || "unknown"}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CashFlow_${name}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportPDF(obj) {
    setDownloading(true);
    const d = new jsPDF();

    d.setFontSize(14);
    d.text(`Cash Flow Statement (${periodLabelSafe(obj)})`, 14, 16);

    const col1 = 16;
    const col2 = 92;
    const colAmt = 200;
    let y = 28;

    const o = obj.report.sections.operating;
    const del = obj.report.deltas;
    const f = obj.report.sections.financing;
    const s = obj.report.summary;

    // Operating
    d.setFontSize(12);
    d.text("Cash Flow From Operating Activities:", 14, y); y += 8;
    d.setFontSize(10);
    d.text("Net Profit/Loss", col1, y);
    d.text(fmt(o.netIncome), colAmt, y, { align: "right" }); y += 8;

    d.text("Changes In Working Capital:", col1, y); y += 6;
    d.text("Changes in Loan Receivable", col1 + 8, y);
    d.text("Loan Receivable", col2, y);
    d.text(fmt(del.loanReceivable), colAmt, y, { align: "right" }); y += 6;

    d.text("Changes in Rice Inventory", col1 + 8, y);
    d.text("Rice Inventory", col2, y);
    d.text(fmt(del.inventory), colAmt, y, { align: "right" }); y += 6;

    d.setFont(undefined, "italic");
    d.text("Net Changes on Working Capital", col1 + 8, y);
    d.setFont(undefined, "normal");
    d.text(fmt(del.workingCapital), colAmt, y, { align: "right" }); y += 10;

    d.setFont(undefined, "bold");
    d.text("Net Cash Flow From Operating Activities", col1, y);
    d.text(fmt(o.net), colAmt, y, { align: "right" });
    d.setFont(undefined, "normal"); y += 12;

    // Investing
    d.setFontSize(12);
    d.text("Cash Flow from Investing Activities:", 14, y); y += 8;
    d.setFontSize(10);
    d.text("None", col1, y);
    d.text(fmt(0), colAmt, y, { align: "right" }); y += 8;
    d.setFont(undefined, "bold");
    d.text("Net Cash Flow From Investing Activities", col1, y);
    d.text(fmt(0), colAmt, y, { align: "right" });
    d.setFont(undefined, "normal"); y += 12;

    // Financing
    d.setFontSize(12);
    d.text("Cash Flow From Financing Activities:", 14, y); y += 8;
    d.setFontSize(10);
    d.text("Share Capital", col1, y);
    d.text("Share Capital", col2, y);
    d.text(fmt(del.shareCapital), colAmt, y, { align: "right" }); y += 8;
    d.setFont(undefined, "bold");
    d.text("Net Cash Flow From Financing Activities", col1, y);
    d.text(fmt(f.net), colAmt, y, { align: "right" });
    d.setFont(undefined, "normal"); y += 12;

    // Summary
    d.setFont(undefined, "bold");
    d.text("Net Increase In Cash:", col1, y);
    d.text(fmt(s.netChangeCash), colAmt, y, { align: "right" }); y += 8;
    d.setFont(undefined, "normal");
    d.text("Beginning Cash Balance:", col1, y);
    d.text(fmt(s.startCash), colAmt, y, { align: "right" }); y += 8;
    d.text(`Ending Balance Of Cash As Of ${longDate(obj.to)}`, col1, y);
    d.text(fmt(s.endCash), colAmt, y, { align: "right" });

    const name = `${obj.from || "first"}_to_${obj.to || "unknown"}`;
    d.save(`CashFlow_${name}.pdf`);
    setDownloading(false);
  }

  function handlePrint() {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
  }

  /* ---------- active view (works for saved or live) ---------- */
  const active = showReport
    ? showReport
    : endReportDoc
    ? {
        from: startReportDoc ? getAsOfFromBSDoc(startReportDoc) : "",
        to: endReportDoc ? getAsOfFromBSDoc(endReportDoc) : "",
        report:
          currentCalc || {
            inputs: { begin: {}, end: {}, netIncome: 0 },
            deltas: { loanReceivable: 0, inventory: 0, workingCapital: 0, shareCapital: 0 },
            sections: {
              operating: { net: 0, netIncome: 0 },
              investing: { net: 0 },
              financing: { net: 0 },
            },
            summary: { startCash: 0, endCash: 0, netChangeCash: 0 },
          },
      }
    : null;

  /* ======================= render ======================= */
  return (
    <div className={`flex flex-col lg:flex-row gap-6 lg:gap-8${printing ? " print:block" : ""}`}>
      {renderDrilldown()}

      {/* Main column */}
      <div className="flex-1 min-w-0">
        <h3 className="text-xl font-semibold mb-4">Cash Flow Statement</h3>

        {/* Period selectors */}
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr,1fr,auto] gap-3 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Beginning Balance</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={startId}
              onChange={(e) => {
                setStartId(e.target.value);
                setEndId("");
              }}
            >
              <option value="first">First period (all accounts 0)</option>
              {sortedBS.map((r) => {
                const asOf = getAsOfFromBSDoc(r);
                return (
                  <option key={r.id} value={r.id}>
                    as of {asOf}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Ending Balance</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={endId}
              onChange={(e) => setEndId(e.target.value)}
              disabled={!startId}
            >
              <option value="">— Select ending period —</option>
              {endOptions.map((r) => {
                const asOf = getAsOfFromBSDoc(r);
                return (
                  <option key={r.id} value={r.id}>
                    as of {asOf}
                  </option>
                );
              })}
            </select>
          </div>
          {(isAdmin || isTreasurer) && (
            <button
              className="btn btn-primary h-10"
              onClick={handleGenerateAndSave}
              disabled={saving || !endId}
            >
              {saving ? "Saving…" : "Generate & Save"}
            </button>
          )}
        </div>

        {!active ? (
          <div className="text-gray-500 text-sm">Select both periods to view cash flow.</div>
        ) : (
          <>
            {/* Export / Period bar */}
            <div className="mb-3 flex flex-wrap gap-2 items-center">
              <button
                className="btn btn-primary"
                onClick={() => exportCSV(active)}
                disabled={downloading}
              >
                Export CSV
              </button>
              <button
                className="btn btn-primary"
                onClick={() => exportPDF(active)}
                disabled={downloading}
              >
                Export PDF
              </button>
              <button className="btn btn-outline" onClick={handlePrint}>
                Print
              </button>
              <div className="ml-auto w-full sm:w-auto text-sm text-gray-700">
                Period:&nbsp;<strong>{periodLabelSafe(active)}</strong>
              </div>
            </div>

            {/* ===== Statement (responsive grid) ===== */}
            <div className="text-sm leading-7 space-y-6">
              {/* Operating */}
              <div>
                <div className="font-semibold underline">Cash Flow From Operating Activities:</div>

                <div className="grid grid-cols-[1fr,12rem] sm:grid-cols-[1fr,1fr,12rem] gap-x-2 sm:pl-8 pl-4 mt-2">
                  {/* Net income */}
                  <div className="col-span-1 sm:col-span-2">Net Profit/Loss</div>
                  <div className="text-right">{fmt(active.report.sections.operating.netIncome)}</div>

                  {/* Working capital header */}
                  <div className="col-span-2 sm:col-span-3 font-semibold mt-3">
                    Changes In Working Capital:
                  </div>

                  {/* Loan receivable */}
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => openDrill("LOAN", "Loan Receivable")}
                  >
                    Changes in Loan Receivable
                  </button>
                  <div className="hidden sm:block">Loan Receivable</div>
                  <div className="text-right">{fmt(active.report.deltas.loanReceivable)}</div>

                  {/* Inventory */}
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => openDrill("INV", "Rice Inventory")}
                  >
                    Changes in Rice Inventory
                  </button>
                  <div className="hidden sm:block">Rice Inventory</div>
                  <div className="text-right">{fmt(active.report.deltas.inventory)}</div>

                  {/* Net change WC */}
                  <div className="italic">Net Changes on Working Capital</div>
                  <div className="hidden sm:block"></div>
                  <div className="text-right italic">{fmt(active.report.deltas.workingCapital)}</div>

                  {/* Net CFO */}
                  <div className="col-span-1 sm:col-span-2 font-semibold mt-3">
                    Net Cash Flow From Operating Activities
                  </div>
                  <div className="text-right font-semibold">
                    {fmt(active.report.sections.operating.net)}
                  </div>
                </div>
              </div>

              {/* Investing */}
              <div>
                <div className="font-semibold underline">Cash Flow from Investing Activities:</div>
                <div className="grid grid-cols-[1fr,12rem] sm:grid-cols-[1fr,1fr,12rem] gap-x-2 sm:pl-8 pl-4 mt-2">
                  <div>None</div>
                  <div className="hidden sm:block"></div>
                  <div className="text-right">{fmt(0)}</div>

                  <div className="col-span-1 sm:col-span-2 font-semibold mt-3">
                    Net Cash Flow From Investing Activities
                  </div>
                  <div className="text-right font-semibold">{fmt(0)}</div>
                </div>
              </div>

              {/* Financing */}
              <div>
                <div className="font-semibold underline">Cash Flow From Financing Activities:</div>
                <div className="grid grid-cols-[1fr,12rem] sm:grid-cols-[1fr,1fr,12rem] gap-x-2 sm:pl-8 pl-4 mt-2">
                  <div>Share Capital</div>
                  <div className="hidden sm:block">Share Capital</div>
                  <div className="text-right">{fmt(active.report.deltas.shareCapital)}</div>

                  <div className="col-span-1 sm:col-span-2 font-semibold mt-3">
                    Net Cash Flow From Financing Activities
                  </div>
                  <div className="text-right font-semibold">
                    {fmt(active.report.sections.financing.net)}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-[1fr,12rem] gap-x-2 sm:pl-8 pl-4">
                <div className="font-semibold">Net Increase In Cash:</div>
                <div className="text-right font-semibold">
                  {fmt(active.report.summary.netChangeCash)}
                </div>

                <div>Beginning Cash Balance:</div>
                <div className="text-right">{fmt(active.report.summary.startCash)}</div>

                <div>Ending Balance Of Cash As Of {longDate(active.to)}</div>
                <div className="text-right">{fmt(active.report.summary.endCash)}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sidebar (Recent) */}
      <aside className="w-full lg:w-80 shrink-0">
        <h4 className="text-lg font-semibold mb-2">Recent Reports</h4>
        <ul className="space-y-2">
          {recentCFS.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between border border-gray-200 rounded px-3 py-2"
            >
              <button
                className="text-left truncate"
                onClick={() => handleShowSavedCFS(r)}
                title={`${periodLabelSafe(r)}`}
              >
                {periodLabelSafe(r)}
              </button>
              {(isAdmin || isTreasurer) && (
                <button
                  className="ml-2 px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCFS(r.id);
                  }}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
          {recentCFS.length === 0 && (
            <li className="text-sm text-gray-500">No saved cash flow statements yet.</li>
          )}
        </ul>
      </aside>
    </div>
  );
}