// src/pages/accounting/financials/BalanceSheet.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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

/* ---------------- Error Boundary (prevents blank screen) ---------------- */
class BSBoundary extends React.Component {
  constructor(props){ super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(err, info){ console.error("BalanceSheet crashed:", err, info); }
  render(){
    if (this.state.error){
      return (
        <div className="page-gutter">
          <h1 className="text-2xl font-bold mb-2">Balance Sheet</h1>
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
const fmt2 = (n) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BEGIN_DATE = "2025-01-01"; // coop life start for retained income calc (IS-compatible)

function formatDateSimple(ymd) {
  if (!ymd) return "-";
  const [y,m,d] = ymd.split("-").map((n)=>parseInt(n,10));
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m-1, d);
  const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getMonth()];
  return `${mo} ${dt.getDate()} ${dt.getFullYear()}`;
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

const isRevenueType = (t) => {
  const v = (t || "").toLowerCase();
  return v === "revenue" || v === "income";
};
const isExpenseType = (t) => (t || "").toLowerCase() === "expense";
const isCOGS = (acc) => (acc?.main || "").trim().toLowerCase() === "cogs";

/** Sum lines for an account within filters (inclusive) */
function sumForAccountIn(entries, acc, fromYMD, toYMD) {
  let debit = 0, credit = 0;
  A(entries).forEach((e) => {
    const d = e?.date || "";
    if (fromYMD && d < fromYMD) return;
    if (toYMD && d > toYMD) return;
    A(e?.lines).forEach((l) => {
      if (l?.accountId === acc.id) {
        debit += parseFloat(l.debit) || 0;
        credit += parseFloat(l.credit) || 0;
      }
    });
  });
  return { debit, credit };
}

/** Balance for BS: Asset => debit-credit ; Liability/Equity => credit-debit */
function balanceForAccountAsOf(entries, acc, toYMD) {
  const { debit, credit } = sumForAccountIn(entries, acc, "", toYMD);
  const t = (acc?.type || "").toLowerCase();
  if (t === "asset") return debit - credit;
  if (t === "liability" || t === "equity") return credit - debit;
  return 0;
}

/** Net income from BEGIN_DATE..asOf (Revenue/Cogs/Expense logic matches IS) */
function netIncomeUpTo(entries, accounts, asOfYMD) {
  const revAccs = A(accounts).filter((a) => isRevenueType(a.type));
  const expAccs = A(accounts).filter((a) => isExpenseType(a.type));

  const cogsAccs = expAccs.filter(isCOGS);
  const opExAccs = expAccs.filter((a) => !isCOGS(a));

  const total = (accs) => accs.reduce((s, acc) => {
    const { debit, credit } = sumForAccountIn(entries, acc, BEGIN_DATE, asOfYMD);
    // revenue/income: credit - debit ; expense/COGS: debit - credit
    const isRev = isRevenueType(acc.type);
    const amt = isRev ? (credit - debit) : (debit - credit);
    return s + amt;
  }, 0);

  const totalRevenue = total(revAccs);
  const totalCOGS = total(cogsAccs);
  const grossProfit = totalRevenue - totalCOGS;
  const totalExpense = total(opExAccs);

  return {
    totalRevenue, totalCOGS, grossProfit, totalExpense,
    netIncome: grossProfit - totalExpense,
  };
}

/* ---------------- Page ---------------- */
function BalanceSheetInner() {
  const accounts = useAccounts();
  const { profile } = useUserProfile();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState("");       // YYYY-MM-DD
  const [notes, setNotes] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);

  const userName = profile?.displayName || profile?.email || "Unknown";
  const userId = profile?.uid || "";

  const viewRef = useRef(null); // snapshot target

  // journal entries
  useEffect(() => {
    setLoading(true);
    const qJE = query(collection(db, "journalEntries"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      qJE,
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  // splits
  const assets = useMemo(() => A(accounts).filter((a) => (a?.type || "").toLowerCase() === "asset"), [accounts]);
  const liabilities = useMemo(() => A(accounts).filter((a) => (a?.type || "").toLowerCase() === "liability"), [accounts]);
  const equity = useMemo(() => A(accounts).filter((a) => (a?.type || "").toLowerCase() === "equity"), [accounts]);

  // rows as of date
  const assetRows = useMemo(() => A(assets).map((acc) => ({
    id: acc.id,
    code: acc.code,
    name: acc.main + (acc.individual ? " / " + acc.individual : ""),
    amount: asOf ? balanceForAccountAsOf(entries, acc, asOf) : 0,
  })), [assets, entries, asOf]);

  const liabRows = useMemo(() => A(liabilities).map((acc) => ({
    id: acc.id,
    code: acc.code,
    name: acc.main + (acc.individual ? " / " + acc.individual : ""),
    amount: asOf ? balanceForAccountAsOf(entries, acc, asOf) : 0,
  })), [liabilities, entries, asOf]);

  const equityRowsRaw = useMemo(() => A(equity).map((acc) => ({
    id: acc.id,
    code: acc.code,
    name: acc.main + (acc.individual ? " / " + acc.individual : ""),
    amount: asOf ? balanceForAccountAsOf(entries, acc, asOf) : 0,
  })), [equity, entries, asOf]);

  // compute retained income = cumulative net income (BEGIN_DATE..asOf)
  const ni = useMemo(() => (asOf ? netIncomeUpTo(entries, accounts, asOf) : null), [entries, accounts, asOf]);
  const retainedIncomeEnding = ni ? ni.netIncome : 0;

  // if you want to exclude any existing "Retained Earnings" account lines to avoid double counting:
  const equityRows = useMemo(() => {
    const rows = A(equityRowsRaw).filter(
      (r) => !(r.name || "").toLowerCase().includes("retained")
    );
    return rows;
  }, [equityRowsRaw]);

  const totals = useMemo(() => {
    const tAssets = A(assetRows).reduce((s, r) => s + (r.amount || 0), 0);
    const tLiabs  = A(liabRows).reduce((s, r) => s + (r.amount || 0), 0);
    const tEqEx   = A(equityRows).reduce((s, r) => s + (r.amount || 0), 0);
    const tEquity = tEqEx + (asOf ? retainedIncomeEnding : 0);
    const tLE     = tLiabs + tEquity;
    return { assets: tAssets, liabilities: tLiabs, equityExRetained: tEqEx, equity: tEquity, liabPlusEquity: tLE };
  }, [assetRows, liabRows, equityRows, retainedIncomeEnding, asOf]);

  const isBalanced = Math.abs(Number(totals.assets) - Number(totals.liabPlusEquity)) < 0.005;

  /* ---------------- Drilldown modal ---------------- */
  const [drill, setDrill] = useState(null); // { code, name }
  function openDrilldown(row) { setDrill({ code: row.code, name: row.name }); }
  function renderDrilldown() {
    if (!drill) return null;
    const target =
      A(accounts).find((a) => a.code === drill.code) ||
      A(accounts).find((a) => a.id === drill.id);

    const list = asOf ? A(entries).filter((e) => (e?.date || "") <= asOf) : entries;

    const rows = [];
    A(list).forEach((e) => {
      A(e?.lines).forEach((l) => {
        if (target && l?.accountId === target.id) {
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
                  <tr><td className="p-3 text-gray-500 text-center" colSpan={5}>No entries for this account up to the selected date.</td></tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className="odd:bg-white even:bg-gray-50">
                      <td className="p-2">{r.date}</td>
                      <td className="p-2 font-mono">{r.ref}</td>
                      <td className="p-2">{r.desc}</td>
                      <td className="p-2 text-right">{fmt2(r.debit)}</td>
                      <td className="p-2 text-right">{fmt2(r.credit)}</td>
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

  /* ---------------- Save to Reports (payload.html only) ---------------- */
  function buildSnapshotHTML(asOfYMD) {
    return `<!doctype html><meta charset="utf-8" />
    <style>
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #e5e7eb;padding:6px 8px;font-size:12px}
      th{background:#f9fafb;text-align:left}
      .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    </style>
    <h1>Balance Sheet</h1>
    <div>As of: ${formatDateSimple(asOfYMD)}</div>
    <div style="margin-top:10px">${viewRef.current ? viewRef.current.innerHTML : ""}</div>`;
  }
  async function handleSaveToReports() {
    if (!asOf || !viewRef.current) return;
    setSaving(true);
    try {
      const html = buildSnapshotHTML(asOf);
      await addDoc(collection(db, "financialReports"), {
        type: "balanceSheet",
        status: "generated",
        label: "Balance Sheet",
        periodStart: asOf,
        periodEnd: asOf,
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
  function handlePrint(){ setPrinting(true); setTimeout(()=>{ window.print(); setPrinting(false); }, 50); }

  function handleExportCSV(){
    if (!asOf) return;
    setDownloading(true);
    let csv = `Balance Sheet\nAs of,${asOf}\n`;
    if (notes) csv += `Notes,"${String(notes).replace(/"/g,'""')}"\n`;
    csv += `\nAssets\nAccount,Amount\n`;
    A(assetRows).forEach(r => { csv += `"${r.code} - ${r.name}",${r.amount}\n`; });
    csv += `Total Assets,${totals.assets}\n\nLiabilities\nAccount,Amount\n`;
    A(liabRows).forEach(r => { csv += `"${r.code} - ${r.name}",${r.amount}\n`; });
    csv += `Total Liabilities,${totals.liabilities}\n\nEquity\nAccount,Amount\n`;
    A(equityRows).forEach(r => { csv += `"${r.code} - ${r.name}",${r.amount}\n`; });
    csv += `Retained Income/Loss,${retainedIncomeEnding}\nTotal Equity,${totals.equity}\n\nTotal Liabilities & Equity,${totals.liabPlusEquity}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `BalanceSheet_${asOf}.csv`; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url); setDownloading(false);
  }

  function handleExportPDF(){
    if (!asOf) return;
    setDownloading(true);
    const d = new jsPDF();
    d.setFontSize(14); d.text(`Balance Sheet — As of ${formatDateSimple(asOf)}`, 14, 16);
    let y = 26;
    function section(name, rows, total){
      d.setFontSize(11); d.text(name, 14, y); y += 6;
      d.setFontSize(10);
      A(rows).forEach(r => { d.text(`${r.code} - ${r.name}`, 16, y); d.text(fmt2(r.amount), 190-14, y, {align:"right"}); y += 6; });
      d.setFont(undefined,"bold"); d.text(`Total ${name}`, 16, y); d.text(fmt2(total), 190-14, y, {align:"right"}); d.setFont(undefined,"normal"); y += 8;
    }
    section("Assets", assetRows, totals.assets);
    section("Liabilities", liabRows, totals.liabilities);
    section("Equity", equityRows, totals.equity);
    d.setFont(undefined,"bold"); d.text("Total Liabilities & Equity", 16, y); d.text(fmt2(totals.liabPlusEquity), 190-14, y, {align:"right"});
    d.save(`BalanceSheet_${asOf}.pdf`); setDownloading(false);
  }

  /* ---------------- Render ---------------- */
  return (
    <div className={`page-gutter${printing ? " print:block" : ""}`}>
      {renderDrilldown()}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Balance Sheet</h1>
        <div className="text-sm text-ink/60">{loading ? "Loading…" : `${A(entries).length} entry(ies)`}</div>
      </div>

      {/* Controls */}
      <div className="card p-3 mb-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className="text-xs text-ink/60 flex flex-col">
            As of
            <input type="date" className="border rounded px-2 py-1" value={asOf} onChange={(e)=>setAsOf(e.target.value)} />
          </label>
          <label className="text-xs text-ink/60 flex-1 flex flex-col">
            Notes
            <input className="border rounded px-2 py-1" placeholder="Optional note…" value={notes} onChange={(e)=>setNotes(e.target.value)} />
          </label>

          <div className="flex gap-2 ml-auto">
            <button className="btn btn-primary" onClick={handleExportCSV} disabled={!asOf || downloading}>Export CSV</button>
            <button className="btn btn-primary" onClick={handleExportPDF} disabled={!asOf || downloading}>Export PDF</button>
            <button className="btn btn-outline" onClick={handlePrint}>Print</button>
            <button className="btn btn-primary disabled:opacity-60" onClick={handleSaveToReports} disabled={!asOf || saving}>
              {saving ? "Saving…" : "Save to Reports"}
            </button>
          </div>
        </div>

        <div className="text-xs text-ink/60 mt-2">
          Retained income is computed from <span className="font-mono">{BEGIN_DATE}</span> to <span className="font-mono">{asOf || "—"}</span>.
        </div>
      </div>

      {/* === CONTENT TO SNAPSHOT === */}
      <div ref={viewRef}>
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full border border-gray-300 rounded text-sm mb-6">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2 border-b border-r border-gray-200">Section</th>
                <th className="text-left p-2 border-b border-r border-gray-200">Account</th>
                <th className="text-right p-2 border-b">Amount</th>
              </tr>
            </thead>
            <tbody>
              {/* Assets */}
              <tr><td className="p-2 font-bold" colSpan={3}>Assets</td></tr>
              {A(assetRows).map((r, i) => (
                <tr key={`a-${i}`} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border-b border-r border-gray-200">Assets</td>
                  <td className="p-2 border-b border-r border-gray-200">
                    <button className="underline" onClick={()=>openDrilldown(r)}>{r.code} - {r.name}</button>
                  </td>
                  <td className="p-2 border-b text-right">{r.amount ? fmt2(r.amount) : ""}</td>
                </tr>
              ))}
              <tr className="font-bold bg-gray-100">
                <td className="p-2 border-t border-r border-gray-200" colSpan={2}>Total Assets</td>
                <td className="p-2 border-t text-right">{fmt2(totals.assets)}</td>
              </tr>

              {/* Liabilities */}
              <tr><td className="p-2 font-bold" colSpan={3}>Liabilities</td></tr>
              {A(liabRows).map((r, i) => (
                <tr key={`l-${i}`} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border-b border-r border-gray-200">Liabilities</td>
                  <td className="p-2 border-b border-r border-gray-200">
                    <button className="underline" onClick={()=>openDrilldown(r)}>{r.code} - {r.name}</button>
                  </td>
                  <td className="p-2 border-b text-right">{r.amount ? fmt2(r.amount) : ""}</td>
                </tr>
              ))}
              <tr className="font-bold bg-gray-100">
                <td className="p-2 border-t border-r border-gray-200" colSpan={2}>Total Liabilities</td>
                <td className="p-2 border-t text-right">{fmt2(totals.liabilities)}</td>
              </tr>

              {/* Equity */}
              <tr><td className="p-2 font-bold" colSpan={3}>Equity</td></tr>
              {A(equityRows).map((r, i) => (
                <tr key={`e-${i}`} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border-b border-r border-gray-200">Equity</td>
                  <td className="p-2 border-b border-r border-gray-200">
                    <button className="underline" onClick={()=>openDrilldown(r)}>{r.code} - {r.name}</button>
                  </td>
                  <td className="p-2 border-b text-right">{r.amount ? fmt2(r.amount) : ""}</td>
                </tr>
              ))}
              <tr className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b border-r border-gray-200">Equity</td>
                <td className="p-2 border-b border-r border-gray-200 italic">Retained Income/Loss (from {BEGIN_DATE})</td>
                <td className="p-2 border-b text-right">{retainedIncomeEnding ? fmt2(retainedIncomeEnding) : "0.00"}</td>
              </tr>
              <tr className="font-bold bg-gray-100">
                <td className="p-2 border-t border-r border-gray-200" colSpan={2}>Total Equity</td>
                <td className="p-2 border-t text-right">{fmt2(totals.equity)}</td>
              </tr>

              {/* Totals */}
              <tr className="font-bold bg-gray-100">
                <td className="p-2 border-t border-r border-gray-200" colSpan={2}>Total Liabilities & Equity</td>
                <td className="p-2 border-t text-right">{fmt2(totals.liabPlusEquity)}</td>
              </tr>
              {!isBalanced && (
                <tr className="bg-red-100 text-red-700 font-semibold">
                  <td className="p-2 border-t border-r border-gray-200" colSpan={2}>Difference</td>
                  <td className="p-2 border-t text-right">{fmt2(totals.liabPlusEquity - totals.assets)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-4">
          <div>
            <div className="font-semibold">Assets</div>
            {A(assetRows).map((r,i)=>(
              <div key={`ma-${i}`} className="card p-2 flex items-center justify-between">
                <button className="text-left underline" onClick={()=>openDrilldown(r)}>{r.code} - {r.name}</button>
                <span className="font-mono">{r.amount ? fmt2(r.amount) : ""}</span>
              </div>
            ))}
            <div className="card p-2 flex items-center justify-between font-semibold">
              <span>Total Assets</span>
              <span className="font-mono">{fmt2(totals.assets)}</span>
            </div>
          </div>

          <div>
            <div className="font-semibold">Liabilities</div>
            {A(liabRows).map((r,i)=>(
              <div key={`ml-${i}`} className="card p-2 flex items-center justify-between">
                <button className="text-left underline" onClick={()=>openDrilldown(r)}>{r.code} - {r.name}</button>
                <span className="font-mono">{r.amount ? fmt2(r.amount) : ""}</span>
              </div>
            ))}
            <div className="card p-2 flex items-center justify-between font-semibold">
              <span>Total Liabilities</span>
              <span className="font-mono">{fmt2(totals.liabilities)}</span>
            </div>
          </div>

          <div>
            <div className="font-semibold">Equity</div>
            {A(equityRows).map((r,i)=>(
              <div key={`me-${i}`} className="card p-2 flex items-center justify-between">
                <button className="text-left underline" onClick={()=>openDrilldown(r)}>{r.code} - {r.name}</button>
                <span className="font-mono">{r.amount ? fmt2(r.amount) : ""}</span>
              </div>
            ))}
            <div className="card p-2 flex items-center justify-between">
              <span className="italic">Retained Income/Loss (from {BEGIN_DATE})</span>
              <span className="font-mono">{fmt2(retainedIncomeEnding)}</span>
            </div>
            <div className="card p-2 flex items-center justify-between font-semibold">
              <span>Total Equity</span>
              <span className="font-mono">{fmt2(totals.equity)}</span>
            </div>
          </div>

          <div className="card p-2 flex items-center justify-between font-semibold">
            <span>Total Liabilities & Equity</span>
            <span className="font-mono">{fmt2(totals.liabPlusEquity)}</span>
          </div>
          {!isBalanced && (
            <div className="card p-2 text-rose-700 font-semibold">
              Out of balance by {fmt2(totals.liabPlusEquity - totals.assets)}
            </div>
          )}
        </div>
      </div>
      {/* === /CONTENT TO SNAPSHOT === */}
    </div>
  );
}

export default function BalanceSheet(){
  return (
    <BSBoundary>
      <BalanceSheetInner />
    </BSBoundary>
  );
}