// src/pages/reports/ReportView.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { db } from "../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

const fmt = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const safeStr = (v) => String(v ?? "—");

function PeriodBadge({ from, to, asOf }) {
  if (asOf) return <span className="text-sm text-ink/70">as of <strong>{asOf}</strong></span>;
  if (!from && !to) return <span className="text-sm text-ink/70">—</span>;
  return (
    <span className="text-sm text-ink/70">
      <strong>{from || "—"}</strong> → <strong>{to || "—"}</strong>
    </span>
  );
}

function useReportDoc(id) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      const snap = await getDoc(doc(db, "reports", id));
      if (!cancelled) {
        setItem(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [id]);
  return { item, loading };
}

// ---------- BALANCE SHEET RENDERER (fixed) ----------
function BalanceSheetView({ item }) {
  const rep = item?.report || {};
  // Rows may have .amount or .value; normalize
  const normalizeRows = (rows = []) =>
    rows.map((r) => ({
      code: r.code ?? "",
      name: r.name ?? "",
      amount: Number(r.amount ?? r.value ?? 0),
    }));

  const assets = normalizeRows(rep.assets || []);
  const liabilities = normalizeRows(rep.liabilities || []);
  const equityCore = normalizeRows(rep.equity || []);

  // New docs may store this; legacy docs might not.
  const retained = Number(
    rep.retainedIncomeEnding ??
      rep.retainedEarnings ??
      rep.retained ??
      0
  );

  // Compute totals if missing; ALWAYS include retained in equity totals.
  const totals = useMemo(() => {
    const tA =
      rep.totals?.assets ??
      assets.reduce((s, r) => s + Number(r.amount || 0), 0);

    const tL =
      rep.totals?.liabilities ??
      liabilities.reduce((s, r) => s + Number(r.amount || 0), 0);

    const tEqExRet =
      rep.totals?.equityExRetained ??
      equityCore.reduce((s, r) => s + Number(r.amount || 0), 0);

    const tEq =
      rep.totals?.equity ?? tEqExRet + retained;

    const tLE =
      rep.totals?.liabPlusEquity ?? tL + tEq;

    return {
      assets: Number(tA),
      liabilities: Number(tL),
      equityExRetained: Number(tEqExRet),
      equity: Number(tEq),
      liabPlusEquity: Number(tLE),
    };
  }, [rep.totals, assets, liabilities, equityCore, retained]);

  const outOfBalance = Math.abs(totals.assets - totals.liabPlusEquity) > 0.005;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm">
          <strong>Period:</strong>{" "}
          <PeriodBadge from={item.from} to={item.to} asOf={item.asOf || rep.asOf} />
        </div>
        {outOfBalance && (
          <span className="ml-auto text-rose-700 font-semibold">
            ⚠️ Out of balance: {fmt(totals.assets)} vs {fmt(totals.liabPlusEquity)}
          </span>
        )}
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
                {assets.map((row, i) => (
                  <tr key={row.code + i} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b border-r border-gray-200">
                      {row.code} - {row.name}
                    </td>
                    <td className="p-2 border-b text-right">{fmt(row.amount)}</td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100">
                  <td className="p-2 border-t text-right">Total Assets</td>
                  <td className="p-2 border-t text-right">{fmt(totals.assets)}</td>
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
                {liabilities.map((row, i) => (
                  <tr key={row.code + i} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b border-r border-gray-200">
                      {row.code} - {row.name}
                    </td>
                    <td className="p-2 border-b text-right">{fmt(row.amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="p-2 border-t border-r border-gray-200 text-right">
                    Total Liabilities
                  </td>
                  <td className="p-2 border-t text-right">{fmt(totals.liabilities)}</td>
                </tr>

                {/* Equity */}
                <tr>
                  <td colSpan={2} className="font-bold p-2">
                    Equity
                  </td>
                </tr>
                {equityCore.map((row, i) => (
                  <tr key={row.code + i} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b border-r border-gray-200">
                      {row.code} - {row.name}
                    </td>
                    <td className="p-2 border-b text-right">{fmt(row.amount)}</td>
                  </tr>
                ))}

                {/* Retained row (this was missing before) */}
                <tr className="bg-gray-50">
                  <td className="p-2 border-b border-r border-gray-200">
                    Retained Income/Loss
                  </td>
                  <td className="p-2 border-b text-right">{fmt(retained)}</td>
                </tr>

                <tr className="font-semibold">
                  <td className="p-2 border-t border-r border-gray-200 text-right">
                    Total Equity
                  </td>
                  <td className="p-2 border-t text-right">{fmt(totals.equity)}</td>
                </tr>

                <tr className="font-bold bg-gray-100">
                  <td className="p-2 border-t border-r border-gray-200 text-right">
                    Total Liabilities &amp; Equity
                  </td>
                  <td className="p-2 border-t text-right">{fmt(totals.liabPlusEquity)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mobile (≤ sm) */}
      <div className="sm:hidden space-y-6">
        <div>
          <div className="font-semibold mb-1">Assets</div>
          <div className="space-y-2">
            {assets.map((row, i) => (
              <div key={row.code + i} className="card px-3 py-2">
                <div className="text-sm">
                  {row.code} - {row.name}
                </div>
                <div className="font-mono text-right">{fmt(row.amount)}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between font-semibold">
            <span>Total Assets</span>
            <span className="font-mono">{fmt(totals.assets)}</span>
          </div>
        </div>

        <div>
          <div className="font-semibold mb-1">Liabilities</div>
          <div className="space-y-2">
            {liabilities.map((row, i) => (
              <div key={row.code + i} className="card px-3 py-2">
                <div className="text-sm">
                  {row.code} - {row.name}
                </div>
                <div className="font-mono text-right">{fmt(row.amount)}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between font-semibold">
            <span>Total Liabilities</span>
            <span className="font-mono">{fmt(totals.liabilities)}</span>
          </div>
        </div>

        <div>
          <div className="font-semibold mb-1">Equity</div>
          <div className="space-y-2">
            {equityCore.map((row, i) => (
              <div key={row.code + i} className="card px-3 py-2">
                <div className="text-sm">
                  {row.code} - {row.name}
                </div>
                <div className="font-mono text-right">{fmt(row.amount)}</div>
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="card px-3 py-2">
              <div className="text-xs text-ink/70">Retained Income/Loss</div>
              <div className="font-mono">{fmt(retained)}</div>
            </div>
            <div className="card px-3 py-2">
              <div className="text-xs text-ink/70">Total Equity</div>
              <div className="font-mono">{fmt(totals.equity)}</div>
            </div>
          </div>

          <div className="mt-3 py-2 px-3 bg-gray-100 rounded font-bold flex justify-between">
            <span>Total Liabilities &amp; Equity</span>
            <span className="font-mono">{fmt(totals.liabPlusEquity)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- STUB RENDERERS FOR OTHER TYPES (unchanged) ----------
function TrialBalanceView({ item }) {
  const rep = item?.report || {};
  const rows = (rep.rows || []).map((r) => ({
    code: r.code ?? "",
    name: r.name ?? "",
    debit: Number(r.debit ?? 0),
    credit: Number(r.credit ?? 0),
  }));
  const totals = rows.reduce(
    (t, r) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit }),
    { debit: 0, credit: 0 }
  );
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border border-gray-300 rounded text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left border-b">Account</th>
            <th className="p-2 text-right border-b">Debit</th>
            <th className="p-2 text-right border-b">Credit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.code + i} className="odd:bg-white even:bg-gray-50">
              <td className="p-2 border-b">{r.code} - {r.name}</td>
              <td className="p-2 border-b text-right">{fmt(r.debit)}</td>
              <td className="p-2 border-b text-right">{fmt(r.credit)}</td>
            </tr>
          ))}
          <tr className="font-bold bg-gray-100">
            <td className="p-2 border-t text-right">Total</td>
            <td className="p-2 border-t text-right">{fmt(totals.debit)}</td>
            <td className="p-2 border-t text-right">{fmt(totals.credit)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function IncomeStatementView({ item }) {
  const rep = item?.report || {};
  const rows = (arr = []) =>
    (arr || []).map((r) => ({
      code: r.code ?? "",
      name: r.name ?? "",
      amount: Number(r.amount ?? 0),
    }));

  const revenues = rows(rep.revenues);
  const cogs = rows(rep.cogs);
  const expenses = rows(rep.expenses);

  const totalRevenue = rep.totalRevenue ?? revenues.reduce((s, r) => s + r.amount, 0);
  const totalCOGS = rep.totalCOGS ?? cogs.reduce((s, r) => s + r.amount, 0);
  const grossProfit = rep.grossProfit ?? (totalRevenue - totalCOGS);
  const totalExpense = rep.totalExpense ?? expenses.reduce((s, r) => s + r.amount, 0);
  const netIncome = rep.netIncome ?? (grossProfit - totalExpense);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <strong>Period:</strong>{" "}
        <PeriodBadge from={item.from} to={item.to} />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-300 rounded text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left border-b">Account</th>
              <th className="p-2 text-right border-b">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={2} className="font-bold p-2">Revenues</td></tr>
            {revenues.map((r, i) => (
              <tr key={r.code + i} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b">{r.code} - {r.name}</td>
                <td className="p-2 border-b text-right">{fmt(r.amount)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="p-2 border-t text-right">Total Revenue</td>
              <td className="p-2 border-t text-right">{fmt(totalRevenue)}</td>
            </tr>

            {cogs.length > 0 && <tr><td colSpan={2} className="font-bold p-2">Less: COGS</td></tr>}
            {cogs.map((r, i) => (
              <tr key={r.code + i} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b">{r.code} - {r.name}</td>
                <td className="p-2 border-b text-right">{fmt(r.amount)}</td>
              </tr>
            ))}
            {cogs.length > 0 && (
              <tr className="font-semibold">
                <td className="p-2 border-t text-right">Total COGS</td>
                <td className="p-2 border-t text-right">{fmt(totalCOGS)}</td>
              </tr>
            )}

            <tr className="font-bold bg-gray-50">
              <td className="p-2 border-t text-right">Gross Profit</td>
              <td className="p-2 border-t text-right">{fmt(grossProfit)}</td>
            </tr>

            <tr><td colSpan={2} className="font-bold p-2">Expenses</td></tr>
            {expenses.map((r, i) => (
              <tr key={r.code + i} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b">{r.code} - {r.name}</td>
                <td className="p-2 border-b text-right">{fmt(r.amount)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="p-2 border-t text-right">Total Expenses</td>
              <td className="p-2 border-t text-right">{fmt(totalExpense)}</td>
            </tr>

            <tr className="font-bold bg-gray-100">
              <td className="p-2 border-t text-right">Net Income</td>
              <td className="p-2 border-t text-right">{fmt(netIncome)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashFlowView({ item }) {
  const rep = item?.report || {};
  const o = rep.sections?.operating || {};
  const f = rep.sections?.financing || {};
  const s = rep.summary || {};
  const d = rep.deltas || {};

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <strong>Period:</strong>{" "}
        <PeriodBadge from={item.from} to={item.to} asOf={item.toAsOf} />
      </div>

      <div className="text-sm leading-7 space-y-6">
        <div>
          <div className="font-semibold underline">Cash Flow From Operating Activities:</div>
          <div className="grid grid-cols-[1fr,12rem] sm:grid-cols-[1fr,1fr,12rem] gap-x-2 sm:pl-8 pl-4 mt-2">
            <div className="col-span-1 sm:col-span-2">Net Profit/Loss</div>
            <div className="text-right">{fmt(o.netIncome)}</div>

            <div className="col-span-2 sm:col-span-3 font-semibold mt-3">Changes In Working Capital:</div>
            <div>Changes in Loan Receivable</div>
            <div className="hidden sm:block">Loan Receivable</div>
            <div className="text-right">{fmt(d.loanReceivable)}</div>

            <div>Changes in Rice Inventory</div>
            <div className="hidden sm:block">Rice Inventory</div>
            <div className="text-right">{fmt(d.inventory)}</div>

            <div className="italic">Net Changes on Working Capital</div>
            <div className="hidden sm:block"></div>
            <div className="text-right italic">{fmt(d.workingCapital)}</div>

            <div className="col-span-1 sm:col-span-2 font-semibold mt-3">
              Net Cash Flow From Operating Activities
            </div>
            <div className="text-right font-semibold">{fmt(o.net)}</div>
          </div>
        </div>

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

        <div>
          <div className="font-semibold underline">Cash Flow From Financing Activities:</div>
          <div className="grid grid-cols-[1fr,12rem] sm:grid-cols-[1fr,1fr,12rem] gap-x-2 sm:pl-8 pl-4 mt-2">
            <div>Share Capital</div>
            <div className="hidden sm:block">Share Capital</div>
            <div className="text-right">{fmt(d.shareCapital)}</div>

            <div className="col-span-1 sm:col-span-2 font-semibold mt-3">
              Net Cash Flow From Financing Activities
            </div>
            <div className="text-right font-semibold">{fmt(f.net)}</div>
          </div>
        </div>

        <div className="grid grid-cols-[1fr,12rem] gap-x-2 sm:pl-8 pl-4">
          <div className="font-semibold">Net Increase In Cash:</div>
          <div className="text-right font-semibold">{fmt(s.netChangeCash)}</div>

          <div>Beginning Cash Balance:</div>
          <div className="text-right">{fmt(s.startCash)}</div>

          <div>Ending Balance Of Cash</div>
          <div className="text-right">{fmt(s.endCash)}</div>
        </div>
      </div>
    </div>
  );
}

// ---------- MAIN ----------
export default function ReportView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { item, loading } = useReportDoc(id);

  if (loading) return <div className="p-6">Loading…</div>;
  if (!item) {
    return (
      <div className="p-6">
        <div className="mb-3">
          <Link to="/reports" className="text-blue-700 hover:underline">← Back to Reports</Link>
        </div>
        <div className="text-gray-600">Report not found.</div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">{safeStr(item.label) || "Report"}</h2>
          <div className="text-xs text-ink/60">
            Type: <span className="px-2 py-0.5 rounded bg-gray-100 border text-ink/70">{safeStr(item.type)}</span>
            {item.createdAt && (
              <span className="ml-2">• Created {new Date(item.createdAt).toLocaleString()}</span>
            )}
            {item.createdBy && <span className="ml-2">• By {safeStr(item.createdBy)}</span>}
          </div>
        </div>
        <button className="btn btn-outline" onClick={() => nav("/reports")}>Back</button>
      </div>

      {item.type === "balanceSheet" && <BalanceSheetView item={item} />}
      {item.type === "trial_balance" && <TrialBalanceView item={item} />}
      {item.type === "incomeStatement" && <IncomeStatementView item={item} />}
      {item.type === "cashFlow" && <CashFlowView item={item} />}

      {!["balanceSheet","trial_balance","incomeStatement","cashFlow"].includes(item.type) && (
        <div className="text-gray-600">This report type is not supported yet.</div>
      )}
    </div>
  );
}