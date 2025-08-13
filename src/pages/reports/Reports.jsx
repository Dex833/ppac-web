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
  // Try the new unified shape first
  const t0 = raw?.type;
  const type =
    t0 ||
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
    // keep originals in case viewer needs them
    _source: source,
    _raw: raw,
  };
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
  const [error, setError] = useState("");

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
        (err) => {
          console.error(`Failed to read ${colName}:`, err);
          // Note: legacy collections are admin/treasurer read-only in your rules.
          // If the user isn't allowed, we'll just skip them silently.
          setLoading(false);
          // Only show a message if *none* of the collections load anything.
          setError((e) => e || "Some report collections could not be read due to permissions.");
        }
      )
    );

    return () => unsubs.forEach((u) => u && u());
  }, []);

  const merged = useMemo(() => {
    const all = [
      ...data.financialReports,
      ...data.incomeStatementReports,
      ...data.balanceSheetReports,
      ...data.balanceSheets,
      ...data.cashFlowStatementReports,
    ];
    // Dedupe by id+source (avoid accidental collisions)
    const key = (r) => `${r._source}:${r.id}`;
    const map = new Map(all.map((r) => [key(r), r]));
    const arr = Array.from(map.values());
    // Sort by createdAt desc; undefined go last
    arr.sort((a, b) => {
      const at = a.createdAt ? a.createdAt.getTime() : -1;
      const bt = b.createdAt ? b.createdAt.getTime() : -1;
      return bt - at;
    });
    return arr;
  }, [data]);

  const filtered = useMemo(() => {
    if (filter === "all") return merged;
    return merged.filter((r) => r.type === filter);
  }, [merged, filter]);

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

      {!loading && filtered.length === 0 && (
        <div className="p-8 text-center text-ink/60 border rounded-lg bg-white">
          No reports found that you have permission to view.
          {!!error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.slice(0, 10).map((r) => (
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
                Saved: {r.createdAt ? r.createdAt.toLocaleString() : "—"}{" "}
                {r.createdByName ? `• by ${r.createdByName}` : ""}
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
          ))}
        </ul>
      )}
    </div>
  );
}