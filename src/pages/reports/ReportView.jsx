// src/pages/reports/ReportView.jsx
import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db } from "../../lib/firebase";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import useUserProfile from "../../hooks/useUserProfile";

/** Pretty period label with robust fallbacks */
function periodLabel(r) {
  const p = r || {};
  // prefer top-level
  if (p.periodStart || p.periodEnd) {
    const L = p.periodStart || "—";
    const R = p.periodEnd || "—";
    return `${L} – ${R}`;
  }
  // fallbacks inside payload/report
  const pay = p.payload || {};
  const rep = pay.report || p.report || {};
  if (rep.from && rep.to) return `${rep.from} – ${rep.to}`;
  if (rep.from && !rep.to) return `${rep.from} – —`;
  if (!rep.from && rep.to) return `— – ${rep.to}`;
  if (rep.asOf) return `as of ${rep.asOf}`;
  if (p.asOf) return `as of ${p.asOf}`;
  return "—";
}

/** Safely render an HTML snapshot */
function HtmlSnapshot({ html }) {
  if (!html) return <div className="text-sm text-gray-500">No snapshot HTML.</div>;
  return (
    <div
      className="border rounded bg-white overflow-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function ReportView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { profile } = useUserProfile();
  const canDelete =
    profile?.role === "admin" ||
    profile?.role === "treasurer" ||
    (profile?.roles || []).some((r) => r === "admin" || r === "treasurer");

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null); // the document from /financialReports

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "financialReports", id));
        if (alive) setReport(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch (e) {
        console.error(e);
        if (alive) setReport(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const type = report?.type || "";
  const label = report?.label || "Report";
  const period = useMemo(() => periodLabel(report), [report]);

  async function handleDelete() {
    if (!canDelete) return;
    if (!window.confirm("Delete this report?")) return;
    await deleteDoc(doc(db, "financialReports", id));
    nav("/reports");
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (!report) {
    return (
      <div className="p-4">
        <Link to="/reports" className="text-blue-700 underline">Back</Link>
        <h2 className="text-xl font-semibold my-3">Report not found</h2>
      </div>
    );
  }

  // --- RENDERERS ---
  const payload = report.payload || {};
  const html = payload.html || "";

  let body = null;

  switch (type) {
    case "trial_balance":
    case "ledger":
      // Saved as HTML snapshot
      body = <HtmlSnapshot html={html} />;
      break;

    case "incomeStatement":
    case "balanceSheet":
    case "cashFlow":
      // If these are saved as structured JSON later, you can add pretty renderers.
      // For now, render HTML snapshot if present; otherwise show JSON.
      if (html) {
        body = <HtmlSnapshot html={html} />;
      } else {
        body = (
          <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto">
            {JSON.stringify(report, null, 2)}
          </pre>
        );
      }
      break;

    default:
      // Fallback: render any snapshot HTML; otherwise show JSON
      body = html ? (
        <HtmlSnapshot html={html} />
      ) : (
        <>
          <div className="mb-2 text-sm text-gray-600">
            Unknown report type. Raw JSON:
          </div>
          <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto">
            {JSON.stringify(report, null, 2)}
          </pre>
        </>
      );
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/reports" className="text-blue-700 underline">← Back</Link>
          <h2 className="text-2xl font-semibold">{label}</h2>
        </div>
        {canDelete && (
          <button
            onClick={handleDelete}
            className="px-3 py-1 rounded bg-red-600 text-white"
          >
            Delete
          </button>
        )}
      </div>

      <div className="text-sm text-gray-700 mb-4">
        <span className="mr-4">
          <span className="text-gray-500">Type:</span> <strong>{type || "—"}</strong>
        </span>
        <span>
          <span className="text-gray-500">Period:</span> <strong>{period}</strong>
        </span>
      </div>

      {body}
    </div>
  );
}