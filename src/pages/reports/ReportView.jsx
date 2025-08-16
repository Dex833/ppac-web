// src/pages/reports/ReportView.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  deleteDoc,
} from "firebase/firestore";
import PageBackground from "../../components/PageBackground";
import useUserProfile from "../../hooks/useUserProfile";
import { formatDT } from "@/utils/dates";

/* ---------------- utils ---------------- */
const fmt2 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// use shared formatDT for timestamps
function normalizeType(t) {
  switch (t) {
    case "incomeStatement": return "income_statement";
    case "balanceSheet": return "balance_sheet";
    case "cashFlow": return "cash_flow";
    case "trialBalance": return "trial_balance";
    default: return t || "";
  }
}
function periodParts(r) {
  // prefer explicit new keys
  const L = r?.periodStart || r?.from || "";
  const R = r?.periodEnd || r?.to || "";
  return { L, R };
}
function periodLabel(r) {
  const { L, R } = periodParts(r);
  const t = normalizeType(r?.type);
  const pretty = (s) => {
    if (!s) return "—";
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const mo = d.toLocaleString("en-US", { month: "short" });
    const dy = String(d.getDate()).padStart(2, "0");
    const yr = d.getFullYear();
    return `${mo}/${dy}/${yr}`;
  };
  if (t === "balance_sheet") {
    const asof = R || L || "";
    return `as of ${pretty(asof)}`;
  }
  if (L && R && L === R) return `as of ${pretty(R)}`;
  if (!L && !R) return "—";
  return `${pretty(L || "—")} → ${pretty(R || "—")}`;
}

const reportsBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

/* ------------- robust safe getters for daily payloads ------------- */
function safeIS(payload = {}) {
  // Accept either payload.sections.{revenues,cogs,expenses} and payload.totals,
  // or a flat shape from older buttons.
  const sections = payload.sections || {};
  const revenues = sections.revenues || payload.revenues || [];
  const cogs = sections.cogs || payload.cogs || [];
  const expenses = sections.expenses || payload.expenses || [];

  const totals = payload.totals || {};
  const totalRevenue =
    totals.totalRevenue ??
    revenues.reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalCOGS =
    totals.totalCOGS ?? cogs.reduce((s, x) => s + Number(x.amount || 0), 0);
  const grossProfit =
    totals.grossProfit ?? (Number(totalRevenue) - Number(totalCOGS));
  const totalExpense =
    totals.totalExpense ??
    expenses.reduce((s, x) => s + Number(x.amount || 0), 0);
  const netIncome =
    totals.netIncome ?? (Number(grossProfit) - Number(totalExpense));

  return { revenues, cogs, expenses, totals: { totalRevenue, totalCOGS, grossProfit, totalExpense, netIncome } };
}

function safeBS(payload = {}) {
  const sections = payload.sections || {};
  const assets = sections.assets || payload.assets || [];
  const liabilities = sections.liabilities || payload.liabilities || [];
  const equity = sections.equity || payload.equity || [];
  const totals = payload.totals || {};
  const sum = (rows) => rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const tAssets = totals.assets ?? sum(assets);
  const tLiab = totals.liabilities ?? sum(liabilities);
  const tEq = totals.equity ?? sum(equity);
  const tLE = totals.liabPlusEquity ?? (tLiab + tEq);
  return {
    assets, liabilities, equity,
    totals: { assets: tAssets, liabilities: tLiab, equity: tEq, liabPlusEquity: tLE }
  };
}

function safeCF(payload = {}) {
  const sections = payload.sections || {};
  const summary = payload.summary || {};
  // Keep shape simple; we’ll render exactly what exists.
  return {
    sections: {
      operating: sections.operating || { netIncome: 0, net: 0 },
      investing: sections.investing || { net: 0 },
      financing: sections.financing || { net: 0 },
    },
    deltas: payload.deltas || { loanReceivable: 0, inventory: 0, workingCapital: 0, shareCapital: 0 },
    summary: {
      startCash: Number(summary.startCash || 0),
      endCash: Number(summary.endCash || 0),
      netChangeCash: Number(summary.netChangeCash || 0),
    },
  };
}

function safeTB(payload = {}) {
  const rows = payload.rows || [];
  const totals = payload.totals || { debit: 0, credit: 0 };
  return { rows, totals: { debit: Number(totals.debit || 0), credit: Number(totals.credit || 0) } };
}

/* ---------------- component ---------------- */
export default function ReportView() {
  const { id } = useParams(); // /reports/:id
  const nav = useNavigate();
  const { profile, loading: profileLoading } = useUserProfile();
  const isAdmin =
    !profileLoading &&
    ((Array.isArray(profile?.roles) && profile.roles.includes("admin")) ||
      profile?.role === "admin") &&
    profile?.suspended !== true;

  const [docData, setDocData] = useState(null);
  const [loading, setLoading] = useState(true);

  const isDaily = id?.startsWith("auto_");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "financialReports", id));
        if (mounted) setDocData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch (e) {
        console.error("ReportView load error:", e);
        if (mounted) setDocData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const tNorm = normalizeType(docData?.type);
  const perLabel = periodLabel(docData);

  async function handleDelete() {
    if (!isAdmin || !docData?.id) return;
    if (!window.confirm("Delete this report?")) return;
    await deleteDoc(doc(db, "financialReports", docData.id));
    nav("/reports");
  }

  /* --------------- RENDERERS for daily structured payloads --------------- */
  function renderDaily() {
    const payload = docData?.payload || {};
    if (!payload || Object.keys(payload).length === 0) {
      return (
        <div className="card p-4">
          This daily auto report has no structured payload yet. Rebuild it from the Reports page.
        </div>
      );
    }

    if (tNorm === "income_statement") {
      const { revenues, cogs, expenses, totals } = safeIS(payload);
      return (
        <div className="space-y-6">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2 border-b border-r">Account</th>
                  <th className="text-right p-2 border-b">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="p-2 font-bold" colSpan={2}>Revenues</td></tr>
                {revenues.map((a, i) => (
                  <tr key={`rev-${i}`} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b border-r">{a.code ? `${a.code} - ${a.name}` : a.name}</td>
                    <td className="p-2 border-b text-right">{fmt2(a.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="p-2 border-t font-semibold">Total Revenue</td>
                  <td className="p-2 border-t text-right font-semibold">{fmt2(totals.totalRevenue)}</td>
                </tr>

                {cogs.length > 0 && (
                  <>
                    <tr><td className="p-2 font-bold" colSpan={2}>Less: Cost of Goods Sold (COGS)</td></tr>
                    {cogs.map((a, i) => (
                      <tr key={`cogs-${i}`} className="odd:bg-white even:bg-gray-50">
                        <td className="p-2 border-b border-r">{a.code ? `${a.code} - ${a.name}` : a.name}</td>
                        <td className="p-2 border-b text-right">{fmt2(a.amount)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="p-2 border-t font-semibold">Total COGS</td>
                      <td className="p-2 border-t text-right font-semibold">{fmt2(totals.totalCOGS)}</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-semibold">Gross Profit</td>
                      <td className="p-2 text-right font-semibold">{fmt2(totals.grossProfit)}</td>
                    </tr>
                  </>
                )}

                <tr><td className="p-2 font-bold" colSpan={2}>Expenses</td></tr>
                {expenses.map((a, i) => (
                  <tr key={`exp-${i}`} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b border-r">{a.code ? `${a.code} - ${a.name}` : a.name}</td>
                    <td className="p-2 border-b text-right">{fmt2(a.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="p-2 border-t font-semibold">Total Expenses</td>
                  <td className="p-2 border-t text-right font-semibold">{fmt2(totals.totalExpense)}</td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold">Net Income</td>
                  <td className="p-2 text-right font-semibold">{fmt2(totals.netIncome)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="sm:hidden text-sm space-y-6">
            <div>
              <div className="font-semibold underline">Revenues</div>
              <div className="mt-1 space-y-1">
                {revenues.map((a, i) => (
                  <div key={`mrev-${i}`} className="flex justify-between">
                    <div>{a.code ? `${a.code} - ${a.name}` : a.name}</div>
                    <div className="font-mono">{fmt2(a.amount)}</div>
                  </div>
                ))}
                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                  <div>Total Revenue</div><div className="font-mono">{fmt2(totals.totalRevenue)}</div>
                </div>
              </div>
            </div>

            {cogs.length > 0 && (
              <div>
                <div className="font-semibold underline">Less: COGS</div>
                <div className="mt-1 space-y-1">
                  {cogs.map((a, i) => (
                    <div key={`mcogs-${i}`} className="flex justify-between">
                      <div>{a.code ? `${a.code} - ${a.name}` : a.name}</div>
                      <div className="font-mono">{fmt2(a.amount)}</div>
                    </div>
                  ))}
                  <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                    <div>Total COGS</div><div className="font-mono">{fmt2(totals.totalCOGS)}</div>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <div>Gross Profit</div><div className="font-mono">{fmt2(totals.grossProfit)}</div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <div className="font-semibold underline">Expenses</div>
              <div className="mt-1 space-y-1">
                {expenses.map((a, i) => (
                  <div key={`mexp-${i}`} className="flex justify-between">
                    <div>{a.code ? `${a.code} - ${a.name}` : a.name}</div>
                    <div className="font-mono">{fmt2(a.amount)}</div>
                  </div>
                ))}
                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                  <div>Total Expenses</div><div className="font-mono">{fmt2(totals.totalExpense)}</div>
                </div>
                <div className="flex justify-between font-semibold">
                  <div>Net Income</div><div className="font-mono">{fmt2(totals.netIncome)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (tNorm === "balance_sheet") {
      const { assets, liabilities, equity, totals } = safeBS(payload);
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded">
              <thead className="bg-gray-50"><tr><th className="p-2 text-left">Assets</th><th className="p-2 text-right">Amount</th></tr></thead>
              <tbody>
                {assets.map((r, i) => (
                  <tr key={`a-${i}`} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b">{r.code ? `${r.code} - ${r.name}` : r.name}</td>
                    <td className="p-2 border-b text-right">{fmt2(r.amount)}</td>
                  </tr>
                ))}
                <tr><td className="p-2 font-semibold border-t">Total Assets</td><td className="p-2 text-right font-semibold border-t">{fmt2(totals.assets)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded">
              <thead className="bg-gray-50"><tr><th className="p-2 text-left">Liabilities & Equity</th><th className="p-2 text-right">Amount</th></tr></thead>
              <tbody>
                {liabilities.map((r, i) => (
                  <tr key={`l-${i}`} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b">{r.code ? `${r.code} - ${r.name}` : r.name}</td>
                    <td className="p-2 border-b text-right">{fmt2(r.amount)}</td>
                  </tr>
                ))}
                {equity.map((r, i) => (
                  <tr key={`e-${i}`} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b">{r.code ? `${r.code} - ${r.name}` : r.name}</td>
                    <td className="p-2 border-b text-right">{fmt2(r.amount)}</td>
                  </tr>
                ))}
                <tr><td className="p-2 font-semibold border-t">Total Liabilities & Equity</td><td className="p-2 text-right font-semibold border-t">{fmt2(totals.liabPlusEquity)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (tNorm === "cash_flow") {
      const { sections, deltas, summary } = safeCF(payload);
      return (
        <div className="text-sm space-y-6">
          <div>
            <div className="font-semibold underline">Cash Flow From Operating Activities:</div>
            <div className="grid grid-cols-[1fr,12rem] sm:grid-cols-[1fr,1fr,12rem] gap-x-2 sm:pl-8 pl-4 mt-2">
              <div className="col-span-1 sm:col-span-2">Net Profit/Loss</div>
              <div className="text-right">{fmt2(sections.operating.netIncome)}</div>

              <div className="col-span-2 sm:col-span-3 font-semibold mt-3">
                Changes In Working Capital:
              </div>
              <div>Changes in Loan Receivable</div><div className="hidden sm:block">Loan Receivable</div>
              <div className="text-right">{fmt2(deltas.loanReceivable)}</div>

              <div>Changes in Rice Inventory</div><div className="hidden sm:block">Rice Inventory</div>
              <div className="text-right">{fmt2(deltas.inventory)}</div>

              <div className="italic">Net Changes on Working Capital</div><div className="hidden sm:block"></div>
              <div className="text-right italic">{fmt2(deltas.workingCapital)}</div>

              <div className="col-span-1 sm:col-span-2 font-semibold mt-3">Net Cash Flow From Operating Activities</div>
              <div className="text-right font-semibold">{fmt2(sections.operating.net)}</div>
            </div>
          </div>

          <div>
            <div className="font-semibold underline">Cash Flow from Investing Activities:</div>
            <div className="grid grid-cols-[1fr,12rem] sm:grid-cols-[1fr,1fr,12rem] gap-x-2 sm:pl-8 pl-4 mt-2">
              <div>None</div><div className="hidden sm:block"></div>
              <div className="text-right">{fmt2(0)}</div>

              <div className="col-span-1 sm:col-span-2 font-semibold mt-3">Net Cash Flow From Investing Activities</div>
              <div className="text-right font-semibold">{fmt2(sections.investing.net)}</div>
            </div>
          </div>

          <div>
            <div className="font-semibold underline">Cash Flow From Financing Activities:</div>
            <div className="grid grid-cols-[1fr,12rem] sm:grid-cols-[1fr,1fr,12rem] gap-x-2 sm:pl-8 pl-4 mt-2">
              <div>Share Capital</div><div className="hidden sm:block">Share Capital</div>
              <div className="text-right">{fmt2(deltas.shareCapital)}</div>

              <div className="col-span-1 sm:col-span-2 font-semibold mt-3">Net Cash Flow From Financing Activities</div>
              <div className="text-right font-semibold">{fmt2(sections.financing.net)}</div>
            </div>
          </div>

          <div className="grid grid-cols-[1fr,12rem] gap-x-2 sm:pl-8 pl-4">
            <div className="font-semibold">Net Increase In Cash:</div><div className="text-right font-semibold">{fmt2(summary.netChangeCash)}</div>
            <div>Beginning Cash Balance:</div><div className="text-right">{fmt2(summary.startCash)}</div>
            <div>Ending Balance Of Cash</div><div className="text-right">{fmt2(summary.endCash)}</div>
          </div>
        </div>
      );
    }

    if (tNorm === "trial_balance") {
      const { rows, totals } = safeTB(payload);
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-300 rounded text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left border-b border-r">Code</th>
                <th className="p-2 text-left border-b border-r">Account</th>
                <th className="p-2 text-right border-b border-r">Debit</th>
                <th className="p-2 text-right border-b">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border-b border-r">{r.code || ""}</td>
                  <td className="p-2 border-b border-r">{r.name || ""}</td>
                  <td className="p-2 border-b border-r text-right">{fmt2(r.debit)}</td>
                  <td className="p-2 border-b text-right">{fmt2(r.credit)}</td>
                </tr>
              ))}
              <tr>
                <td className="p-2 border-t font-semibold" colSpan={2}>Totals</td>
                <td className="p-2 border-t text-right font-semibold">{fmt2(totals.debit)}</td>
                <td className="p-2 border-t text-right font-semibold">{fmt2(totals.credit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="card p-4">
        Unknown daily report type. ({String(docData?.type || "")})
      </div>
    );
  }

  /* ---------------- main render ---------------- */
  return (
    <PageBackground
      image={reportsBg}
      boxed
      boxedWidth="max-w-4xl"
      overlayClass="bg-white/85 backdrop-blur"
      className="page-gutter"
    >
      <div className="mb-3">
        <Link to="/reports" className="inline-flex items-center gap-2 text-sm hover:underline">
          ← Back
        </Link>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">{docData?.label || "Daily auto report"}</h2>
        <div className="text-sm text-ink/60">
          Period: <span className="font-mono">{perLabel}</span> — Created:{" "}
          <span className="font-mono">{formatDT(docData?.createdAt)}</span>
          {isAdmin && !id.startsWith("auto_") && (
            <>
              {" "}
              —{" "}
              <button className="text-red-600 hover:underline" onClick={handleDelete}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card p-4">Loading…</div>
      ) : !docData ? (
        <div className="card p-4">Report not found.</div>
      ) : isDaily ? (
        renderDaily()
      ) : (
        // Periodic snapshots (render saved HTML if present)
        <>
          {docData?.payload?.html ? (
            <div
              className="card p-4"
              dangerouslySetInnerHTML={{ __html: docData.payload.html }}
            />
          ) : (
            <div className="card p-4">
              This periodic report has no snapshot content (<code>payload.html</code> is empty). Use your “Save to Reports” action to generate it.
            </div>
          )}
        </>
      )}
    </PageBackground>
  );
}