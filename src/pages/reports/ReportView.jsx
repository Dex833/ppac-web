// src/pages/reports/ReportView.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { db } from "../../lib/firebase";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import useUserProfile from "../../hooks/useUserProfile";

/* ---------------- constants / helpers ---------------- */
const KNOWN_SOURCES = [
  "financialReports",           // unified snapshots (trial_balance, ledger, etc.)
  "incomeStatementReports",     // legacy Income Statement
  "balanceSheetReports",        // legacy Balance Sheet
  "balanceSheets",              // older/alternate collection name for Balance Sheet
  "cashFlowStatementReports",   // legacy Cash Flow
];

function toDate(v) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmtDateTime(v) {
  const d = toDate(v);
  return d ? d.toLocaleString() : "—";
}
function n2(v) {
  const n = Number(v) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function asArray(v) {
  return Array.isArray(v) ? v : [];
}
function getPeriod(data) {
  const from = data?.from ?? data?.periodStart ?? data?.startDate ?? data?.period?.from ?? "";
  const to   = data?.to   ?? data?.periodEnd   ?? data?.endDate   ?? data?.period?.to   ?? "";
  return { from, to };
}
function getMeta(data) {
  const createdAt = data?.createdAt ?? data?.generatedAt ?? data?.savedAt ?? data?.created ?? null;
  const createdBy = data?.createdByName ?? data?.generatedBy ?? data?.createdBy ?? data?.user ?? "";
  const label =
    data?.label ||
    data?.title ||
    (data?.type === "trial_balance" ? "Trial Balance" :
     data?.type === "ledger"        ? "Ledger" :
     "Report");
  return { createdAt, createdBy, label };
}
function roleFlags(profile) {
  const list = Array.isArray(profile?.roles) ? profile.roles : (profile?.role ? [profile.role] : []);
  return {
    isAdmin: list.includes("admin"),
    isTreasurer: list.includes("treasurer"),
    isManager: list.includes("manager"),
    suspended: profile?.suspended === true,
  };
}

/* ---------------- fetcher ---------------- */
async function fetchFromKnownSources(id, prefer) {
  // If source hint provided, try that first, then fall back.
  const order = prefer && KNOWN_SOURCES.includes(prefer) ? [prefer, ...KNOWN_SOURCES.filter(s => s !== prefer)] : KNOWN_SOURCES;
  for (const src of order) {
    try {
      const snap = await getDoc(doc(db, src, id));
      if (snap.exists()) return { source: src, id: snap.id, data: snap.data() };
    } catch (e) {
      // ignore errors for non-existent collections
      // console.warn(`Read failed for ${src}/${id}:`, e?.message || e);
    }
  }
  return null;
}

/* ---------------- CSV helpers ---------------- */
const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function downloadCSV(name, rows) {
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 300);
}

/* ===================================================== */
/*                      Component                         */
/* ===================================================== */
export default function ReportView() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { profile } = useUserProfile();
  const { isAdmin, isTreasurer, suspended } = roleFlags(profile);

  const hintSrc = sp.get("src") || undefined;

  const [state, setState] = useState({ loading: true, found: null, error: "" });

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    fetchFromKnownSources(id, hintSrc).then((res) => {
      if (!alive) return;
      if (!res) {
        setState({ loading: false, found: null, error: "Report not found." });
      } else {
        setState({ loading: false, found: res, error: "" });
      }
    });
    return () => { alive = false; };
  }, [id, hintSrc]);

  const source = state.found?.source;
  const data = state.found?.data || {};

  const type =
    data?.type ||
    (source === "incomeStatementReports" ? "incomeStatement" :
     source === "balanceSheetReports" || source === "balanceSheets" ? "balanceSheet" :
     source === "cashFlowStatementReports" ? "cashFlow" : "report");

  const period = getPeriod(data);
  const meta = getMeta(data);

  const canDelete =
    !suspended &&
    (
      source === "financialReports" ? isAdmin :
      ["incomeStatementReports", "balanceSheetReports", "balanceSheets", "cashFlowStatementReports"].includes(source)
        ? (isAdmin || isTreasurer)
        : false
    );

  async function handleDelete() {
    if (!canDelete) return;
    if (!window.confirm(`Delete "${meta.label}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, source, id));
      nav("/reports", { replace: true });
    } catch (e) {
      alert("Delete failed: " + (e?.message || e));
    }
  }

  function exportCurrentCSV() {
    // Minimal CSV exports for known types.
    if (type === "trial_balance") {
      const rows = data?.rows || data?.report?.rows || [];
      const body = rows.map(r => [r.code, r.name, r.debit ?? 0, r.credit ?? 0]);
      downloadCSV(`TrialBalance_${period.from || "start"}_${period.to || "end"}`, [
        ["Trial Balance"],
        ["From", period.from || "—", "To", period.to || "—"],
        [],
        ["Code", "Account", "Debit", "Credit"],
        ...body,
        [],
        ["Totals", "", Number(data?.totals?.debit ?? rows.reduce((s, r) => s + (+r.debit || 0), 0)),
                     Number(data?.totals?.credit ?? rows.reduce((s, r) => s + (+r.credit || 0), 0))],
      ]);
      return;
    }
    if (type === "incomeStatement") {
      const r = data?.report || data;
      const rows = [
        ["Income Statement"],
        ["Period", `${period.from || "—"} — ${period.to || "—"}`],
        [],
        ["Revenues"],
        ...asArray(r?.revenues).map(a => [`${a.code} - ${a.name}`, a.amount ?? 0]),
        ["Total Revenue", r?.totalRevenue ?? asArray(r?.revenues).reduce((s,a)=>s+(+a.amount||0),0)],
        [],
        ["COGS"],
        ...asArray(r?.cogs).map(a => [`${a.code} - ${a.name}`, a.amount ?? 0]),
        ["Total COGS", r?.totalCOGS ?? asArray(r?.cogs).reduce((s,a)=>s+(+a.amount||0),0)],
        ["Gross Profit", r?.grossProfit ?? 0],
        [],
        ["Expenses"],
        ...asArray(r?.expenses).map(a => [`${a.code} - ${a.name}`, a.amount ?? 0]),
        ["Total Expenses", r?.totalExpense ?? asArray(r?.expenses).reduce((s,a)=>s+(+a.amount||0),0)],
        [],
        ["Net Income", r?.netIncome ?? 0],
      ];
      downloadCSV(`IncomeStatement_${period.from || ""}_${period.to || ""}`, rows);
      return;
    }
    // Fallback: dump JSON
    downloadCSV("report_raw", [["json"], [JSON.stringify(data)]]);
  }

  /* ---------------- Render helpers ---------------- */
  const header = (
    <div className="flex items-center justify-between gap-2 mb-4">
      <div>
        <div className="text-xs text-ink/60">{source || "—"}</div>
        <h2 className="text-2xl font-bold">{meta.label || "Report"}</h2>
        <div className="text-sm text-ink/70">
          <span className="inline-block mr-3"><strong>Type:</strong> {type}</span>
          <span className="inline-block mr-3">
            <strong>Period:</strong> {(period.from || "—")} — {(period.to || "—")}
          </span>
          <span className="inline-block mr-3"><strong>Created:</strong> {fmtDateTime(meta.createdAt)}</span>
          <span className="inline-block"><strong>By:</strong> {meta.createdBy || "—"}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className="px-3 py-2 border rounded text-sm" to="/reports">Back</Link>
        <button className="px-3 py-2 border rounded text-sm" onClick={() => window.print()}>Print / PDF</button>
        <button className="px-3 py-2 border rounded text-sm" onClick={exportCurrentCSV}>Export CSV</button>
        {canDelete && (
          <button className="px-3 py-2 border rounded text-sm text-rose-700" onClick={handleDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  );

  function Section({ title, children }) {
    return (
      <div className="mb-6">
        <h3 className="font-semibold mb-2">{title}</h3>
        {children}
      </div>
    );
  }

  function Table({ rows, headers = [] }) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-300 rounded text-sm">
          {headers.length > 0 && (
            <thead className="bg-gray-50">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className={"p-2 border-b " + (i < headers.length - 1 ? "border-r" : "") + (i === headers.length - 1 ? " text-right" : " text-left")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.length === 0 ? (
              <tr><td className="p-3 text-ink/60 text-center" colSpan={headers.length || 1}>No data.</td></tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={idx} className="odd:bg-white even:bg-gray-50">
                  {r.map((c, i) => (
                    <td key={i} className={"p-2 border-b " + (i < r.length - 1 ? "border-r" : "") + (i === r.length - 1 ? " text-right" : "")}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  /* ---------------- Type-specific renderers ---------------- */
  function renderIncomeStatement() {
    const r = data?.report || data;
    const revRows = asArray(r?.revenues).map(a => [`${a.code} - ${a.name}`, n2(a.amount)]);
    const cogsRows = asArray(r?.cogs).map(a => [`${a.code} - ${a.name}`, n2(a.amount)]);
    const expRows = asArray(r?.expenses).map(a => [`${a.code} - ${a.name}`, n2(a.amount)]);

    return (
      <>
        <Section title="Revenues">
          <Table headers={["Account", "Amount"]} rows={revRows} />
          <div className="mt-2 text-right font-semibold">Total Revenue: {n2(r?.totalRevenue ?? asArray(r?.revenues).reduce((s,a)=>s+(+a.amount||0),0))}</div>
        </Section>

        {cogsRows.length > 0 && (
          <>
            <Section title="Less: Cost of Goods Sold (COGS)">
              <Table headers={["Account", "Amount"]} rows={cogsRows} />
              <div className="mt-2 text-right font-semibold">Total COGS: {n2(r?.totalCOGS ?? asArray(r?.cogs).reduce((s,a)=>s+(+a.amount||0),0))}</div>
            </Section>
            <div className="mb-6 text-right font-bold">Gross Profit: {n2(r?.grossProfit ?? 0)}</div>
          </>
        )}

        <Section title="Expenses">
          <Table headers={["Account", "Amount"]} rows={expRows} />
          <div className="mt-2 text-right font-semibold">Total Expenses: {n2(r?.totalExpense ?? asArray(r?.expenses).reduce((s,a)=>s+(+a.amount||0),0))}</div>
        </Section>

        <div className="text-right text-lg font-bold">Net Income: {n2(r?.netIncome ?? 0)}</div>

        {r?.notes && <div className="mt-6 text-sm"><span className="font-semibold">Notes:</span> {String(r.notes)}</div>}
      </>
    );
  }

  function renderTrialBalance() {
    const rows = data?.rows || data?.report?.rows || [];
    const totals = data?.totals || {
      debit: rows.reduce((s, r) => s + (+r.debit || 0), 0),
      credit: rows.reduce((s, r) => s + (+r.credit || 0), 0),
    };

    const tableRows = rows.map(r => [r.code, r.name, r.debit ? n2(r.debit) : "", r.credit ? n2(r.credit) : ""]);
    return (
      <>
        <Table headers={["Code", "Account", "Debit", "Credit"]} rows={tableRows} />
        <div className="mt-2 grid grid-cols-2 gap-2 justify-items-end text-sm font-semibold">
          <div>Totals: {n2(totals.debit)}</div>
          <div>Totals: {n2(totals.credit)}</div>
        </div>
        {Math.abs((totals.debit || 0) - (totals.credit || 0)) > 0.004 && (
          <div className="mt-2 text-rose-700 font-semibold">⚠️ Out of balance: {n2((totals.debit || 0) - (totals.credit || 0))}</div>
        )}
      </>
    );
  }

  function renderBalanceSheet() {
    // Best-effort renderer; supports shapes:
    //   data.report = { assets:[], liabilities:[], equity:[], totals? }
    const r = data?.report || data;
    const assets = asArray(r?.assets);
    const liab   = asArray(r?.liabilities);
    const equity = asArray(r?.equity);

    function rowsFrom(list) { return list.map(a => [`${a.code ? a.code + " - " : ""}${a.name ?? a.title ?? ""}`, n2(a.amount ?? a.value ?? 0)]); }

    const A = rowsFrom(assets);
    const L = rowsFrom(liab);
    const E = rowsFrom(equity);

    const totA = r?.totalAssets ?? assets.reduce((s,a)=>s+(+a.amount||+a.value||0),0);
    const totL = r?.totalLiabilities ?? liab.reduce((s,a)=>s+(+a.amount||+a.value||0),0);
    const totE = r?.totalEquity ?? equity.reduce((s,a)=>s+(+a.amount||+a.value||0),0);

    return (
      <>
        <Section title="Assets">
          <Table headers={["Account", "Amount"]} rows={A} />
          <div className="mt-2 text-right font-semibold">Total Assets: {n2(totA)}</div>
        </Section>
        <Section title="Liabilities">
          <Table headers={["Account", "Amount"]} rows={L} />
          <div className="mt-2 text-right font-semibold">Total Liabilities: {n2(totL)}</div>
        </Section>
        <Section title="Equity">
          <Table headers={["Account", "Amount"]} rows={E} />
          <div className="mt-2 text-right font-semibold">Total Equity: {n2(totE)}</div>
        </Section>

        <div className="text-right text-lg font-bold">
          Liabilities + Equity: {n2(totL + totE)} &nbsp; {totA === (totL + totE) ? "✅" : "⚠️"}
        </div>
      </>
    );
  }

  function renderCashFlow() {
    const r = data?.report || data;
    function sec(name, list) {
      const rows = asArray(list).map(a => [a.name ?? a.title ?? "", n2(a.amount ?? a.value ?? 0)]);
      return (
        <Section title={name}>
          <Table headers={["Item", "Amount"]} rows={rows} />
        </Section>
      );
    }
    return (
      <>
        {sec("Operating Activities", r?.operating)}
        {sec("Investing Activities", r?.investing)}
        {sec("Financing Activities", r?.financing)}
        <div className="text-right text-lg font-bold mt-4">
          Net Change in Cash: {n2(r?.netChange ?? 0)}
        </div>
      </>
    );
  }

  function renderUnknown() {
    return (
      <div className="rounded border p-3 bg-gray-50 overflow-x-auto">
        <pre className="text-xs whitespace-pre-wrap">
{JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  }

  const body = useMemo(() => {
    switch (type) {
      case "incomeStatement": return renderIncomeStatement();
      case "trial_balance":   return renderTrialBalance();
      case "balanceSheet":    return renderBalanceSheet();
      case "cashFlow":        return renderCashFlow();
      default:                return renderUnknown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data), type]);

  /* ---------------- render ---------------- */
  if (state.loading) {
    return (
      <div>
        <div className="mb-3"><Link className="px-3 py-2 border rounded text-sm" to="/reports">Back</Link></div>
        <div>Loading…</div>
      </div>
    );
  }
  if (state.error || !state.found) {
    return (
      <div>
        <div className="mb-3"><Link className="px-3 py-2 border rounded text-sm" to="/reports">Back</Link></div>
        <div className="text-rose-700">{state.error || "Not found."}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      <div className="print:mt-6">{body}</div>
    </div>
  );
}