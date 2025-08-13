// src/pages/reports/ReportView.jsx
import React, { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useParams, Link, useLocation } from "react-router-dom";

const TYPE_LABELS = {
  trial_balance: "Trial Balance",
  income_statement: "Income Statement",
  balance_sheet: "Balance Sheet",
  cash_flow: "Cash Flow",
};

function toDate(v) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

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

  const title =
    raw?.label ||
    raw?.title ||
    `${TYPE_LABELS[type] || type}`;

  // Prefer saved HTML “payload.html” if present (new collection)
  const payload = raw?.payload
    ? raw.payload
    : { report: raw?.report || raw }; // legacy: put whole doc/report as fallback

  return {
    id,
    source,
    type,
    title,
    periodStart,
    periodEnd,
    createdAt,
    createdByName: raw?.createdByName || raw?.generatedBy || raw?.report?.generatedBy || "",
    payload,
    _raw: raw,
  };
}

async function getFromAnyCollection(id, hintedSource) {
  const candidates = hintedSource
    ? [hintedSource]
    : ["financialReports", "incomeStatementReports", "balanceSheetReports", "balanceSheets", "cashFlowStatementReports"];

  for (const col of candidates) {
    try {
      const snap = await getDoc(doc(db, col, id));
      if (snap.exists()) return normalizeDoc(col, snap.id, snap.data());
    } catch (e) {
      // ignore and try next (may be permission-restricted)
    }
  }
  return null;
}

export default function ReportView() {
  const { id } = useParams();
  const { search } = useLocation();
  const hintedSource = new URLSearchParams(search).get("src") || undefined;

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const r = await getFromAnyCollection(id, hintedSource);
      if (mounted) {
        setReport(r);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id, hintedSource]);

  if (loading) return <div className="p-6">Loading…</div>;

  if (!report) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link to="/reports" className="text-sm text-blue-700 hover:underline">← Back to Reports</Link>
        <div className="mt-4 p-6 border rounded-lg bg-white">Report not found or you lack permission to view it.</div>
      </div>
    );
  }

  const start = report.periodStart;
  const end = report.periodEnd;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <Link to="/reports" className="text-sm text-blue-700 hover:underline">← Back to Reports</Link>
        <div className="text-xs text-ink/60">{report.source}</div>
      </div>

      <div className="mt-3">
        <div className="text-xs uppercase tracking-wide text-ink/60">{TYPE_LABELS[report.type] || report.type}</div>
        <h1 className="text-2xl sm:text-3xl font-semibold mt-1">{report.title}</h1>
        <div className="text-sm text-ink/60 mt-1">
          Period: {start ? start.toLocaleDateString() : "—"} – {end ? end.toLocaleDateString() : "—"}
        </div>
        <div className="text-xs text-ink/60">
          Saved: {report.createdAt ? report.createdAt.toLocaleString() : "—"}{" "}
          {report.createdByName ? `• by ${report.createdByName}` : ""}
        </div>
      </div>

      <div className="mt-6 p-4 sm:p-6 border rounded-xl bg-white overflow-auto">
        {report.payload?.html ? (
          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: report.payload.html }} />
        ) : (
          <pre className="text-xs overflow-auto">
            {JSON.stringify(report.payload ?? report._raw, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}