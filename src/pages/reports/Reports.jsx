// src/pages/reports/Reports.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { Link } from "react-router-dom";

const TYPE_LABELS = {
  trial_balance: "Trial Balance",
  income_statement: "Income Statement",
  balance_sheet: "Balance Sheet",
  cash_flow: "Cash Flow",
};

function toDate(v) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();      // Timestamp
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;                        // ISO/string/Date
}
function fmtDate(d) {
  return d ? d.toLocaleDateString() : "—";
}
function formatRange(start, end) {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

/** Normalize any report doc (new or legacy) to one shape for listing */
function normalizeDoc(source, id, raw) {
  const type =
    raw?.type ||
    (source === "incomeStatementReports" && "income_statement") ||
    ((source === "balanceSheetReports" || source === "balanceSheets") && "balance_sheet") ||
    (source === "cashFlowStatementReports" && "cash_flow") ||
    "unknown";

  const createdAt =
    toDate(raw?.createdAt) ||
    toDate(raw?.created_at) ||
    toDate(raw?.report?.generatedAt) ||
    toDate(raw?.generatedAt) ||
    null;

  const periodStart = toDate(raw?.periodStart) || toDate(raw?.from);
  const periodEnd   = toDate(raw?.periodEnd)   || toDate(raw?.to);

  const label =
    raw?.label ||
    raw?.title ||
    (type !== "unknown" ? `${TYPE_LABELS[type]} (${formatRange(periodStart, periodEnd)})` : `(No label)`);

  return {
    id,
    type,
    label,
    periodStart,
    periodEnd,
    createdAt,
    createdByName: raw?.createdByName || raw?.generatedBy || raw?.report?.generatedBy || "",
    _source: source,
    _raw: raw,
  };
}

function ReportCard({ r }) {
  return (
    <li key={`${r._source}:${r.id}`} className="border rounded-xl p-4 hover:shadow-sm transition bg-white">
      <div className="text-xs uppercase tracking-wide text-ink/60">
        {TYPE_LABELS[r.type] || r.type}
        <span className="ml-2 text-ink/50">• {r._source}</span>
      </div>
      <div className="text-lg font-semibold mt-1">{r.label || "(No label)"}</div>
      <div className="text-sm text-ink/60 mt-1">
        Period: {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}
      </div>
      <div className="text-xs text-ink/60 mt-1">
        Saved: {r.createdAt ? r.createdAt.toLocaleString() : "—"} {r.createdByName ? `• by ${r.createdByName}` : ""}
      </div>

      <div className="mt-3">
        <Link
          to={`/reports/${encodeURIComponent(r.id)}?src=${encodeURIComponent(r._source)}`}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-brand-600 text-white hover:bg-brand-700"
        >
          Open
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M7 17l9-9M8 8h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </Link>
      </div>
    </li>
  );
}

export default function Reports() {
  const [data, setData] = useState({
    financialReports: [],
    incomeStatementReports: [],
    balanceSheetReports: [],
    balanceSheets: [],
    cashFlowStatementReports: [],
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | trial_balance | income_statement | balance_sheet | cash_flow

  useEffect(() => {
    const sources = [
      "financialReports",
      "incomeStatementReports",
      "balanceSheetReports",
      "balanceSheets",
      "cashFlowStatementReports",
    ];

    const unsubs = sources.map((colName) =>
      onSnapshot(
        collection(db, colName),
        (snap) => {
          const rows = snap.docs.map((d) => normalizeDoc(colName, d.id, d.data()));
          setData((prev) => ({ ...prev, [colName]: rows }));
          setLoading(false);
        },
        () => setLoading(false) // ignore permission errors silently
      )
    );

    return () => unsubs.forEach((u) => u && u());
  }, []);

  // Merge, dedupe, sort by createdAt desc
  const mergedSorted = useMemo(() => {
    const all = [
      ...data.financialReports,
      ...data.incomeStatementReports,
      ...data.balanceSheetReports,
      ...data.balanceSheets,
      ...data.cashFlowStatementReports,
    ];
    const m = new Map(all.map((r) => [`${r._source}:${r.id}`, r]));
    const arr = Array.from(m.values());
    arr.sort((a, b) => {
      const at = a.createdAt ? a.createdAt.getTime() : -1;
      const bt = b.createdAt ? b.createdAt.getTime() : -1;
      return bt - at;
    });
    return arr;
  }, [data]);

  // Group by type
  const byType = useMemo(() => {
    const groups = {
      trial_balance: [],
      income_statement: [],
      balance_sheet: [],
      cash_flow: [],
      unknown: [],
    };
    mergedSorted.forEach((r) => {
      const key = r.type in groups ? r.type : "unknown";
      groups[key].push(r);
    });
    return groups;
  }, [mergedSorted]);

  // For filtered view, show just that group; for "all", show headings with up to 10 per type
  const sections = useMemo(() => {
    if (filter !== "all") {
      const list = byType[filter] || [];
      return [{ heading: TYPE_LABELS[filter] || filter, items: list.slice(0, 10) }];
    }
    return [
      { key: "trial_balance", heading: "Trial Balance", items: byType.trial_balance.slice(0, 10) },
      { key: "income_statement", heading: "Income Statement", items: byType.income_statement.slice(0, 10) },
      { key: "balance_sheet", heading: "Balance Sheet", items: byType.balance_sheet.slice(0, 10) },
      { key: "cash_flow", heading: "Cash Flow", items: byType.cash_flow.slice(0, 10) },
    ].filter((s) => s.items.length > 0);
  }, [byType, filter]);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-semibold mb-2">Reports</h1>
      <p className="text-ink/70 mb-6">
        Read-only saved financial statements. Click a report to view the exact saved version.
      </p>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { key: "all", label: "All" },
          { key: "trial_balance", label: "Trial Balance" },
          { key: "income_statement", label: "Income Statement" },
          { key: "balance_sheet", label: "Balance Sheet" },
          { key: "cash_flow", label: "Cash Flow" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={[
              "px-3 py-1.5 rounded-lg text-sm border transition",
              filter === t.key
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-ink/80 border-border hover:bg-brand-50",
            ].join(" ")}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="p-6">Loading…</div>}

      {!loading && sections.length === 0 && (
        <div className="p-8 text-center text-ink/60 border rounded-lg bg-white">
          No reports found that you have permission to view.
        </div>
      )}

      {!loading && sections.length > 0 && (
        <div className="space-y-8">
          {sections.map((sec) => (
            <section key={sec.heading}>
              <h2 className="text-lg font-semibold mb-3">{sec.heading}</h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sec.items.map((r) => <ReportCard key={`${r._source}:${r.id}`} r={r} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}