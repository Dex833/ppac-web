// src/pages/reports/Reports.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import useUserProfile from "../../hooks/useUserProfile";

/* ------------ helpers ------------ */
function tsToDate(ts) {
  if (!ts) return null;
  if (typeof ts?.toDate === "function") return ts.toDate();
  try { return new Date(ts); } catch { return null; }
}
const fmtDateTime = (ts) => {
  const d = tsToDate(ts);
  return d ? d.toLocaleString() : "—";
};
const safeText = (v) => String(v ?? "");
const badgeColor = (t) => {
  switch ((t || "").toLowerCase()) {
    case "trialbalance": return "bg-indigo-50 text-indigo-700 border border-indigo-200";
    case "ledger": return "bg-amber-50 text-amber-800 border border-amber-200";
    case "incomestatement": return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "balancesheet": return "bg-blue-50 text-blue-700 border border-blue-200";
    case "cashflow": return "bg-teal-50 text-teal-700 border border-teal-200";
    default: return "bg-gray-50 text-gray-700 border border-gray-200";
  }
};

export default function Reports() {
  const { profile } = useUserProfile();
  const isAdmin = profile?.roles?.includes("admin") || profile?.role === "admin";
  const notSuspended = profile?.suspended !== true;

  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);

  // simple client-side filters
  const [qtext, setQtext] = useState("");
  const [type, setType] = useState(""); // "", "trialBalance", "ledger", "incomeStatement", "balanceSheet", "cashFlow"

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "financialReports"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setReports(rows);
        setLoading(false);
      },
      (err) => {
        console.error("financialReports/onSnapshot:", err);
        alert("Failed to load reports: " + err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const t = (type || "").toLowerCase();
    const s = qtext.trim().toLowerCase();
    return reports.filter((r) => {
      if (t && (String(r.type || "").toLowerCase() !== t)) return false;
      if (!s) return true;
      const hay = [
        r.label,
        r.type,
        r.periodStart,
        r.periodEnd,
        r.createdByName,
        r.source,
        r.notes,
      ].map(safeText).join(" ").toLowerCase();
      return hay.includes(s);
    });
  }, [reports, qtext, type]);

  async function handleDelete(id) {
    if (!isAdmin) return;
    if (!window.confirm("Delete this saved report?")) return;
    try {
      await deleteDoc(doc(db, "financialReports", id));
    } catch (e) {
      console.error("delete report error:", e);
      alert("Delete failed: " + (e?.message || e));
    }
  }

  function copyLink(id) {
    const url = `${location.origin}/reports/${id}?src=financialReports`;
    navigator.clipboard.writeText(url).then(
      () => alert("Link copied to clipboard."),
      () => alert("Copy failed. You can manually copy: " + url)
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Reports</h2>
          <div className="text-sm text-ink/60">Saved snapshots from Ledger, Trial Balance, and Financial Statements.</div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink/60 flex flex-col">
            Search
            <input
              className="border rounded px-2 py-1 w-56"
              placeholder="label, user, notes, period…"
              value={qtext}
              onChange={(e) => setQtext(e.target.value)}
            />
          </label>
          <label className="text-xs text-ink/60 flex flex-col">
            Type
            <select
              className="border rounded px-2 py-1"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">All</option>
              <option value="trialBalance">Trial Balance</option>
              <option value="ledger">Ledger</option>
              <option value="incomeStatement">Income Statement</option>
              <option value="balanceSheet">Balance Sheet</option>
              <option value="cashFlow">Cash Flow</option>
            </select>
          </label>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {loading && <div>Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-ink/60">No reports found.</div>
        )}
        {filtered.map((r) => (
          <div key={r.id} className="border rounded p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{r.label || "Untitled report"}</div>
                <div className="text-xs text-ink/60 mt-0.5">Period: {(r.periodStart || "—")} – {(r.periodEnd || "—")}</div>
                <div className="text-xs text-ink/60">Created: {fmtDateTime(r.createdAt)} by {r.createdByName || "—"}</div>
                {r.notes && <div className="text-xs text-ink/70 mt-1">Notes: {r.notes}</div>}
              </div>
              <span className={`px-2 py-1 rounded text-xs whitespace-nowrap ${badgeColor(r.type)}`}>
                {r.type || "unknown"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 justify-end">
              <Link className="btn btn-sm btn-outline" to={`/reports/${r.id}?src=financialReports`}>Open</Link>
              <button className="btn btn-sm btn-outline" onClick={() => copyLink(r.id)}>Copy link</button>
              {isAdmin && notSuspended && (
                <button className="btn btn-sm btn-outline text-rose-700" onClick={() => handleDelete(r.id)}>Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="min-w-full border border-gray-300 rounded text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left border-b border-r border-gray-200">Label</th>
              <th className="p-2 text-left border-b border-r border-gray-200">Type</th>
              <th className="p-2 text-left border-b border-r border-gray-200">Period</th>
              <th className="p-2 text-left border-b border-r border-gray-200">Created</th>
              <th className="p-2 text-left border-b border-r border-gray-200">By</th>
              <th className="p-2 text-left border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="p-3">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="p-3 text-ink/60">No reports found.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b border-r border-gray-200">
                  <div className="font-medium">{r.label || "Untitled report"}</div>
                  {r.notes && <div className="text-xs text-ink/60 mt-0.5">Notes: {r.notes}</div>}
                </td>
                <td className="p-2 border-b border-r border-gray-200">
                  <span className={`px-2 py-1 rounded text-xs ${badgeColor(r.type)}`}>{r.type || "unknown"}</span>
                </td>
                <td className="p-2 border-b border-r border-gray-200">
                  {(r.periodStart || "—")} – {(r.periodEnd || "—")}
                </td>
                <td className="p-2 border-b border-r border-gray-200">{fmtDateTime(r.createdAt)}</td>
                <td className="p-2 border-b border-r border-gray-200">{r.createdByName || "—"}</td>
                <td className="p-2 border-b">
                  <div className="flex flex-wrap gap-2">
                    <Link className="px-2 py-1 border rounded text-xs" to={`/reports/${r.id}?src=financialReports`}>Open</Link>
                    <button className="px-2 py-1 border rounded text-xs" onClick={() => copyLink(r.id)}>Copy link</button>
                    {isAdmin && notSuspended && (
                      <button className="px-2 py-1 border rounded text-xs text-rose-700" onClick={() => handleDelete(r.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}