// src/pages/accounting/financials/CashFlowStatement.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import jsPDF from "jspdf";

/* ---------------- Error Boundary (avoid blank page) ---------------- */
class CFBoundary extends React.Component {
  constructor(p){ super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(err, info){ console.error("CashFlow crashed:", err, info); }
  render(){
    if (this.state.error){
      return (
        <div className="page-gutter">
          <h1 className="text-2xl font-bold mb-2">Cash Flow Statement</h1>
          <div className="card p-4 text-sm">
            <div className="font-semibold mb-1">Something went wrong on this page.</div>
            <div className="text-rose-700">{String(this.state.error?.message || this.state.error)}</div>
            <div className="mt-2 text-ink/60">Try refreshing. If it keeps happening, send this message to the devs.</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- Helpers ---------------- */
const A = (v) => (Array.isArray(v) ? v : []);
const S = (v) => String(v ?? "");
const fmt = (n) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function periodLabel(from, to){
  const L = from || "—";
  const R = to || "—";
  return `${L} → ${R}`;
}
function longDate(ymd) {
  if (!ymd) return "—";
  const [y,m,d] = ymd.split("-").map((x)=>parseInt(x,10));
  if (!y || !m || !d) return ymd;
  return new Date(y, m-1, d).toLocaleDateString(undefined, { month:"long", day:"numeric", year:"numeric" });
}

function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const qAcc = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(qAcc, (snap) => {
      setAccounts(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => !a.archived)
      );
    });
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

const isRevenueType = (t) => {
  const v = (t || "").toLowerCase();
  return v === "revenue" || v === "income";
};
const isExpenseType = (t) => (t || "").toLowerCase() === "expense";

/** Sum lines for an account in date window (from<d<=to if from given) */
function sumLinesForAccount(entries, acc, fromYMD, toYMD) {
  let debit = 0, credit = 0;
  A(entries).forEach((e) => {
    const d = e?.date || "";
    if (fromYMD && !(d > fromYMD)) return; // strictly after start
    if (toYMD && !(d <= toYMD)) return;    // up to and including end
    A(e?.lines).forEach((l) => {
      if (l?.accountId === acc.id) {
        debit += parseFloat(l.debit) || 0;
        credit += parseFloat(l.credit) || 0;
      }
    });
  });
  return { debit, credit };
}

/** Balance as of a date (<= asOf): Asset = D-C; Liability/Equity = C-D */
function balanceAsOf(entries, acc, asOf) {
  let debit = 0, credit = 0;
  A(entries).forEach((e) => {
    const d = e?.date || "";
    if (asOf && d > asOf) return;
    A(e?.lines).forEach((l) => {
      if (l?.accountId === acc.id) {
        debit += parseFloat(l.debit) || 0;
        credit += parseFloat(l.credit) || 0;
      }
    });
  });
  const t = (acc?.type || "").toLowerCase();
  if (t === "asset") return debit - credit;
  if (t === "liability" || t === "equity") return credit - debit;
  return 0;
}

/** Compute Net Income for the period from..to (COGS included as Expense) */
function computeNetIncome(entries, accounts, from, to) {
  const acctMap = new Map(A(accounts).map((a) => [a.id, a]));
  let revenue = 0, expense = 0;
  A(entries).forEach((e) => {
    const d = e?.date || "";
    if (from && !(d > from)) return;
    if (to && !(d <= to)) return;
    A(e?.lines).forEach((l) => {
      const acc = acctMap.get(l?.accountId);
      if (!acc) return;
      const debit = Number(l?.debit || 0);
      const credit = Number(l?.credit || 0);
      if (isRevenueType(acc.type)) revenue += credit - debit;
      else if (isExpenseType(acc.type)) expense += debit - credit;
    });
  });
  return revenue - expense;
}

/* ---------------- Page ---------------- */
function CashFlowInner() {
  const accounts = useAccounts();
  const entries = useJournalEntries();
  const { profile } = useUserProfile();

  const [from, setFrom] = useState(""); // YYYY-MM-DD
  const [to, setTo] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drill, setDrill] = useState(null); // { key, label }

  const userName = profile?.displayName || profile?.email || "Unknown";
  const userId = profile?.uid || "";

  const viewRef = useRef(null);

  // Account groups (by MAIN name)
  const lower = (s) => S(s).toLowerCase();
  const cashAccs = useMemo(
    () => A(accounts).filter((a) => lower(a.main).includes("cash")),
    [accounts]
  );
  const loanAccs = useMemo(
    () => A(accounts).filter((a) => lower(a.main).includes("loan receivable")),
    [accounts]
  );
  const invAccs = useMemo(
    () => A(accounts).filter((a) => lower(a.main).includes("inventory")),
    [accounts]
  );
  const shareCapAccs = useMemo(
    () => A(accounts).filter((a) => lower(a.main).includes("share capital")),
    [accounts]
  );

  // Balances for start/end
  const beginCash = useMemo(() => A(cashAccs).reduce((s, a) => s + balanceAsOf(entries, a, from), 0), [cashAccs, entries, from]);
  const endCash   = useMemo(() => A(cashAccs).reduce((s, a) => s + balanceAsOf(entries, a, to), 0), [cashAccs, entries, to]);

  const beginLoan = useMemo(() => A(loanAccs).reduce((s, a) => s + balanceAsOf(entries, a, from), 0), [loanAccs, entries, from]);
  const endLoan   = useMemo(() => A(loanAccs).reduce((s, a) => s + balanceAsOf(entries, a, to), 0), [loanAccs, entries, to]);

  const beginInv  = useMemo(() => A(invAccs).reduce((s, a) => s + balanceAsOf(entries, a, from), 0), [invAccs, entries, from]);
  const endInv    = useMemo(() => A(invAccs).reduce((s, a) => s + balanceAsOf(entries, a, to), 0), [invAccs, entries, to]);

  const beginSC   = useMemo(() => A(shareCapAccs).reduce((s, a) => s + balanceAsOf(entries, a, from), 0), [shareCapAccs, entries, from]);
  const endSC     = useMemo(() => A(shareCapAccs).reduce((s, a) => s + balanceAsOf(entries, a, to), 0), [shareCapAccs, entries, to]);

  // Period net income
  const netIncome = useMemo(() => computeNetIncome(entries, accounts, from, to), [entries, accounts, from, to]);

  // Deltas & sections
  const dLoan = endLoan - beginLoan;
  const dInv  = endInv  - beginInv;
  const dWC   = dLoan + dInv;

  const dSC   = endSC - beginSC;

  const CFO = netIncome - dWC;
  const CFI = 0;
  const CFF = dSC;

  const summary = {
    startCash: beginCash,
    endCash: endCash,
    netChangeCash: endCash - beginCash,
  };

  /* ---------------- Drilldown (Loan / Inventory) ---------------- */
  function openDrill(key, label){
    setDrill({ key, label });
  }
  function renderDrilldown(){
    if (!drill) return null;
    const ids = (drill.key === "LOAN" ? loanAccs : invAccs).map((a)=>a.id);
    const list = A(entries).filter((e)=> {
      const d = e?.date || "";
      return (!from || d > from) && (!to || d <= to);
    });
    const rows = [];
    A(list).forEach((e)=>{
      A(e?.lines).forEach((l)=>{
        if (ids.includes(l?.accountId)) {
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
    rows.sort((a,b)=> S(a.date).localeCompare(S(b.date)) || S(a.ref).localeCompare(S(b.ref)));

    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-3">
        <div className="bg-white rounded-xl w-[min(720px,94vw)] max-h-[84vh] overflow-auto shadow-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">{drill.label}</h4>
            <button className="px-3 py-1 rounded bg-gray-200" onClick={()=>setDrill(null)}>Close</button>
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
                  <tr><td className="p-3 text-gray-500 text-center" colSpan={5}>No matching entries in the selected period.</td></tr>
                ) : rows.map((r,i)=>(
                  <tr key={i} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2">{formatD(r.date)}</td>
                    <td className="p-2 font-mono">{r.ref}</td>
                    <td className="p-2">{r.desc}</td>
                    <td className="p-2 text-right">{fmt(r.debit)}</td>
                    <td className="p-2 text-right">{fmt(r.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- Save to Reports (payload.html only) ---------------- */
  function buildSnapshotHTML() {
    return `<!doctype html><meta charset="utf-8" />
    <style>
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #e5e7eb;padding:6px 8px;font-size:12px}
      th{background:#f9fafb;text-align:left}
      .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    </style>
    <h1>Cash Flow Statement</h1>
    <div>Period: ${periodLabel(from, to)}</div>
    <div style="margin-top:10px">${viewRef.current ? viewRef.current.innerHTML : ""}</div>`;
  }
  async function handleSaveToReports() {
    if (!to || !viewRef.current) return; // need at least an end date
    setSaving(true);
    try {
      const html = buildSnapshotHTML();
      await addDoc(collection(db, "financialReports"), {
        type: "cashFlow",
        status: "generated",
        label: "Cash Flow",
        periodStart: from || null,
        periodEnd: to || null,
        createdAt: serverTimestamp(),
        createdByName: userName,
        createdById: userId,
        payload: { html }, // periodic viewer uses this
      });
      alert("Saved to Reports ✅");
    } catch (e) {
      console.error(e);
      alert("Failed to save: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- Exports ---------------- */
  function exportCSV(){
    const name = `${from || "start"}_to_${to || "end"}`;
    let csv = `Cash Flow Statement\nPeriod:,${periodLabel(from,to)}\n\n`;
    csv += `Cash Flow From Operating Activities:\n`;
    csv += `Net Profit/Loss,,${netIncome}\n`;
    csv += `Changes In Working Capital:\n`;
    csv += `Changes in Loan Receivable,Loan Receivable,${dLoan}\n`;
    csv += `Changes in Rice Inventory,Rice Inventory,${dInv}\n`;
    csv += `Net Changes on Working Capital,,${dWC}\n`;
    csv += `Net Cash Flow From Operating Activities,,${CFO}\n\n`;
    csv += `Cash Flow from Investing Activities:\n`;
    csv += `None,,0\n`;
    csv += `Net Cash Flow From Investing Activities,,0\n\n`;
    csv += `Cash Flow From Financing Activities:\n`;
    csv += `Share Capital,Share Capital,${dSC}\n`;
    csv += `Net Cash Flow From Financing Activities,,${CFF}\n\n`;
    csv += `Net Increase In Cash:, ,${summary.netChangeCash}\n`;
    csv += `Beginning Cash Balance:, ,${summary.startCash}\n`;
    csv += `Ending Balance Of Cash As Of ${longDate(to)}, ,${summary.endCash}\n`;
    const blob = new Blob([csv], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `CashFlow_${name}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function exportPDF(){
    if (!to) return;
    setDownloading(true);
    const d = new jsPDF();
    d.setFontSize(14); d.text(`Cash Flow Statement (${periodLabel(from,to)})`, 14, 16);
    const col1 = 16, col2 = 92, colAmt = 200; let y = 28;

    d.setFontSize(12); d.text("Cash Flow From Operating Activities:", 14, y); y += 8;
    d.setFontSize(10);
    d.text("Net Profit/Loss", col1, y); d.text(fmt(netIncome), colAmt, y, {align:"right"}); y += 8;
    d.text("Changes In Working Capital:", col1, y); y += 6;
    d.text("Changes in Loan Receivable", col1+8, y); d.text("Loan Receivable", col2, y); d.text(fmt(dLoan), colAmt, y, {align:"right"}); y += 6;
    d.text("Changes in Rice Inventory", col1+8, y); d.text("Rice Inventory", col2, y); d.text(fmt(dInv), colAmt, y, {align:"right"}); y += 6;
    d.setFont(undefined,"italic"); d.text("Net Changes on Working Capital", col1+8, y);
    d.setFont(undefined,"normal"); d.text(fmt(dWC), colAmt, y, {align:"right"}); y += 10;
    d.setFont(undefined,"bold"); d.text("Net Cash Flow From Operating Activities", col1, y);
    d.text(fmt(CFO), colAmt, y, {align:"right"}); d.setFont(undefined,"normal"); y += 12;

    d.setFontSize(12); d.text("Cash Flow from Investing Activities:", 14, y); y += 8;
    d.setFontSize(10); d.text("None", col1, y); d.text(fmt(0), colAmt, y, {align:"right"}); y += 8;
    d.setFont(undefined,"bold"); d.text("Net Cash Flow From Investing Activities", col1, y);
    d.text(fmt(0), colAmt, y, {align:"right"}); d.setFont(undefined,"normal"); y += 12;

    d.setFontSize(12); d.text("Cash Flow From Financing Activities:", 14, y); y += 8;
    d.setFontSize(10); d.text("Share Capital", col1, y); d.text("Share Capital", col2, y);
    d.text(fmt(dSC), colAmt, y, {align:"right"}); y += 8;
    d.setFont(undefined,"bold"); d.text("Net Cash Flow From Financing Activities", col1, y);
    d.text(fmt(CFF), colAmt, y, {align:"right"}); d.setFont(undefined,"normal"); y += 12;

    d.setFont(undefined,"bold"); d.text("Net Increase In Cash:", col1, y);
    d.text(fmt(summary.netChangeCash), colAmt, y, {align:"right"}); y += 8;
    d.setFont(undefined,"normal");
    d.text("Beginning Cash Balance:", col1, y); d.text(fmt(summary.startCash), colAmt, y, {align:"right"}); y += 8;
    d.text(`Ending Balance Of Cash As Of ${longDate(to)}`, col1, y);
    d.text(fmt(summary.endCash), colAmt, y, {align:"right"});
    d.save(`CashFlow_${from || "start"}_to_${to}.pdf`);
    setDownloading(false);
  }

  function handlePrint(){ setPrinting(true); setTimeout(()=>{ window.print(); setPrinting(false); }, 50); }

  /* ---------------- Render ---------------- */
  return (
    <div className={`page-gutter${printing ? " print:block" : ""}`}>
      {renderDrilldown()}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Cash Flow Statement</h1>
        <div className="text-sm text-ink/60">{entries.length} entry(ies)</div>
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

          <div className="flex gap-2 ml-auto">
            <button className="btn btn-primary" onClick={exportCSV} disabled={!to || downloading}>Export CSV</button>
            <button className="btn btn-primary" onClick={exportPDF} disabled={!to || downloading}>Export PDF</button>
            <button className="btn btn-outline" onClick={handlePrint}>Print</button>
            <button className="btn btn-primary disabled:opacity-60" onClick={handleSaveToReports} disabled={!to || saving}>
              {saving ? "Saving…" : "Save to Reports"}
            </button>
          </div>
        </div>

        <div className="text-xs text-ink/60 mt-2">
          Net income is computed from journal entries for the selected period (Revenue credit−debit, Expenses debit−credit).
        </div>
      </div>

      {/* === CONTENT TO SNAPSHOT === */}
      <div ref={viewRef}>
        {/* Desktop layout */}
        <div className="hidden sm:block text-sm leading-7">
          {/* Operating */}
          <div className="mb-6">
            <div className="font-semibold underline">Cash Flow From Operating Activities:</div>
            <table className="min-w-full border border-gray-300 rounded text-sm mt-2">
              <tbody>
                <tr>
                  <td className="p-2 border-b border-r">Net Profit/Loss</td>
                  <td className="p-2 border-b text-right">{fmt(netIncome)}</td>
                </tr>
                <tr><td className="p-2 font-semibold" colSpan={2}>Changes In Working Capital:</td></tr>
                <tr>
                  <td className="p-2 border-b border-r">
                    <button className="underline" onClick={()=>openDrill("LOAN","Loan Receivable")}>
                      Changes in Loan Receivable
                    </button>
                  </td>
                  <td className="p-2 border-b text-right">{fmt(dLoan)}</td>
                </tr>
                <tr>
                  <td className="p-2 border-b border-r">
                    <button className="underline" onClick={()=>openDrill("INV","Rice Inventory")}>
                      Changes in Rice Inventory
                    </button>
                  </td>
                  <td className="p-2 border-b text-right">{fmt(dInv)}</td>
                </tr>
                <tr>
                  <td className="p-2 italic border-b border-r">Net Changes on Working Capital</td>
                  <td className="p-2 border-b text-right italic">{fmt(dWC)}</td>
                </tr>
                <tr className="font-semibold bg-gray-100">
                  <td className="p-2 border-t border-r">Net Cash Flow From Operating Activities</td>
                  <td className="p-2 border-t text-right">{fmt(CFO)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Investing */}
          <div className="mb-6">
            <div className="font-semibold underline">Cash Flow from Investing Activities:</div>
            <table className="min-w-full border border-gray-300 rounded text-sm mt-2">
              <tbody>
                <tr>
                  <td className="p-2 border-b border-r">None</td>
                  <td className="p-2 border-b text-right">{fmt(0)}</td>
                </tr>
                <tr className="font-semibold bg-gray-100">
                  <td className="p-2 border-t border-r">Net Cash Flow From Investing Activities</td>
                  <td className="p-2 border-t text-right">{fmt(0)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Financing */}
          <div className="mb-6">
            <div className="font-semibold underline">Cash Flow From Financing Activities:</div>
            <table className="min-w-full border border-gray-300 rounded text-sm mt-2">
              <tbody>
                <tr>
                  <td className="p-2 border-b border-r">Share Capital</td>
                  <td className="p-2 border-b text-right">{fmt(dSC)}</td>
                </tr>
                <tr className="font-semibold bg-gray-100">
                  <td className="p-2 border-t border-r">Net Cash Flow From Financing Activities</td>
                  <td className="p-2 border-t text-right">{fmt(CFF)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div>
            <table className="min-w-full border border-gray-300 rounded text-sm">
              <tbody>
                <tr>
                  <td className="p-2 border-b border-r font-semibold">Net Increase In Cash:</td>
                  <td className="p-2 border-b text-right font-semibold">{fmt(summary.netChangeCash)}</td>
                </tr>
                <tr>
                  <td className="p-2 border-b border-r">Beginning Cash Balance:</td>
                  <td className="p-2 border-b text-right">{fmt(summary.startCash)}</td>
                </tr>
                <tr>
                  <td className="p-2 border-b border-r">Ending Balance Of Cash As Of {longDate(to)}</td>
                  <td className="p-2 border-b text-right">{fmt(summary.endCash)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-4 text-sm">
          <div className="font-semibold underline">Cash Flow From Operating Activities:</div>
          <div className="card p-2 flex items-center justify-between">
            <span>Net Profit/Loss</span><span className="font-mono">{fmt(netIncome)}</span>
          </div>
          <div className="font-semibold mt-1">Changes In Working Capital:</div>
          <button className="card p-2 flex items-center justify-between" onClick={()=>openDrill("LOAN","Loan Receivable")}>
            <span>Changes in Loan Receivable</span><span className="font-mono">{fmt(dLoan)}</span>
          </button>
          <button className="card p-2 flex items-center justify-between" onClick={()=>openDrill("INV","Rice Inventory")}>
            <span>Changes in Rice Inventory</span><span className="font-mono">{fmt(dInv)}</span>
          </button>
          <div className="card p-2 flex items-center justify-between italic">
            <span>Net Changes on Working Capital</span><span className="font-mono">{fmt(dWC)}</span>
          </div>
          <div className="card p-2 flex items-center justify-between font-semibold">
            <span>Net Cash Flow From Operating</span><span className="font-mono">{fmt(CFO)}</span>
          </div>

          <div className="font-semibold underline">Cash Flow from Investing Activities:</div>
          <div className="card p-2 flex items-center justify-between">
            <span>None</span><span className="font-mono">0.00</span>
          </div>
          <div className="card p-2 flex items-center justify-between font-semibold">
            <span>Net Cash Flow From Investing</span><span className="font-mono">0.00</span>
          </div>

          <div className="font-semibold underline">Cash Flow From Financing Activities:</div>
          <div className="card p-2 flex items-center justify-between">
            <span>Share Capital</span><span className="font-mono">{fmt(dSC)}</span>
          </div>
          <div className="card p-2 flex items-center justify-between font-semibold">
            <span>Net Cash Flow From Financing</span><span className="font-mono">{fmt(CFF)}</span>
          </div>

          <div className="card p-2 flex items-center justify-between font-semibold">
            <span>Net Increase In Cash</span><span className="font-mono">{fmt(summary.netChangeCash)}</span>
          </div>
          <div className="card p-2 flex items-center justify-between">
            <span>Beginning Cash Balance</span><span className="font-mono">{fmt(summary.startCash)}</span>
          </div>
          <div className="card p-2 flex items-center justify-between">
            <span>Ending Cash (as of {to || "—"})</span><span className="font-mono">{fmt(summary.endCash)}</span>
          </div>
        </div>
      </div>
      {/* === /CONTENT TO SNAPSHOT === */}
    </div>
  );
}

export default function CashFlowStatement(){
  return (
    <CFBoundary>
      <CashFlowInner />
    </CFBoundary>
  );
}