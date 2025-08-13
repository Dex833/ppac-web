// src/pages/reports/ReportView.jsx
import React, { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useParams, Link } from "react-router-dom";

const TYPE_LABELS = {
  trial_balance: "Trial Balance",
  income_statement: "Income Statement",
  balance_sheet: "Balance Sheet",
  cash_flow: "Cash Flow",
};

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  return new Date(value);
}

export default function ReportView() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "financialReports", id));
        if (!mounted) return;
        setReport(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) return <div className="p-6">Loading…</div>;

  if (!report) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link to="/reports" className="text-sm text-blue-700 hover:underline">← Back to Reports</Link>
        <div className="mt-4 p-6 border rounded-lg bg-white">Report not found.</div>
      </div>
    );
  }

  const created = toDate(report.createdAt);
  const start = toDate(report.periodStart);
  const end = toDate(report.periodEnd);

  const title = report.label || `${TYPE_LABELS[report.type] || report.type}`;
  const period = start && end ? `${start.toLocaleDateString()} – ${end.toLocaleDateString()}` : "—";

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <Link to="/reports" className="text-sm text-blue-700 hover:underline">← Back to Reports</Link>
      </div>

      <div className="mt-3">
        <div className="text-xs uppercase tracking-wide text-ink/60">{TYPE_LABELS[report.type] || report.type}</div>
        <h1 className="text-2xl sm:text-3xl font-semibold mt-1">{title}</h1>
        <div className="text-sm text-ink/60 mt-1">Period: {period}</div>
        <div className="text-xs text-ink/60">
          Saved: {created ? created.toLocaleString() : "—"} {report.createdByName ? `• by ${report.createdByName}` : ""}
        </div>
      </div>

      <div className="mt-6 p-4 sm:p-6 border rounded-xl bg-white overflow-auto">
        {/* Prefer saved HTML, else show JSON payload fallback */}
        {report.payload?.html ? (
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: report.payload.html }}
          />
        ) : (
          <pre className="text-xs overflow-auto">{JSON.stringify(report.payload ?? report, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}