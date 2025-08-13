// src/pages/reports/ReportView.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

/* ------------- helpers ------------- */
function tsToDate(ts) {
  if (!ts) return null;
  if (typeof ts?.toDate === "function") return ts.toDate();
  try { return new Date(ts); } catch { return null; }
}
const fmtDateTime = (ts) => {
  const d = tsToDate(ts);
  return d ? d.toLocaleString() : "—";
};
const safeFile = (s) => String(s || "report").replace(/[^\w\-]+/g, "_");

export default function ReportView() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const collectionName = search.get("src") || "financialReports"; // default store

  const [state, setState] = useState({ loading: true, exists: false, data: null });
  const iframeRef = useRef(null);

  useEffect(() => {
    const ref = doc(db, collectionName, id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setState({ loading: false, exists: false, data: null });
        } else {
          setState({ loading: false, exists: true, data: { id: snap.id, ...snap.data() } });
        }
      },
      (err) => {
        console.error("ReportView error:", err);
        setState({ loading: false, exists: false, data: null });
        alert("Failed to load report: " + err.message);
      }
    );
    return () => unsub();
  }, [collectionName, id]);

  const html = useMemo(() => state.data?.payload?.html || "", [state.data]);
  const label = state.data?.label || "Report";
  const period =
    (state.data?.periodStart || "—") + " – " + (state.data?.periodEnd || "—");
  const metaLine = useMemo(() => {
    const who = state.data?.createdByName || "Unknown";
    const when = fmtDateTime(state.data?.createdAt);
    const type = state.data?.type || "—";
    return `Type: ${type} • Created: ${when} • By: ${who}`;
  }, [state.data]);

  function handlePrint() {
    const frame = iframeRef.current;
    if (!frame) return;
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.print();
    }
  }

  function handleDownloadHtml() {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFile(label)}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 300);
  }

  if (state.loading) {
    return <div className="p-4">Loading…</div>;
  }
  if (!state.exists) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-2">Report not found</h2>
        <div className="text-ink/70 mb-4">ID: {id} (from {collectionName})</div>
        <Link className="text-blue-700 underline" to="/accounting">Back to Accounting</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{label}</h2>
          <div className="text-sm text-ink/70">Period: {period}</div>
          <div className="text-xs text-ink/60 mt-1">{metaLine}</div>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 border rounded text-sm" onClick={handleDownloadHtml} disabled={!html}>
            Download HTML
          </button>
          <button className="px-3 py-2 border rounded text-sm" onClick={handlePrint} disabled={!html}>
            Print
          </button>
        </div>
      </div>

      {!html ? (
        <div className="p-4 border rounded bg-amber-50 text-amber-900">
          This report has no HTML payload to display.
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          title="Report"
          srcDoc={html}
          className="w-full border rounded"
          style={{ height: "80vh", background: "white" }}
        />
      )}
    </div>
  );
}