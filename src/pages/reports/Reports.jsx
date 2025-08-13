// src/pages/reports/Reports.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import useUserProfile from "../../hooks/useUserProfile";

/* ------------ helpers ------------ */
function tsToDate(ts) {
  if (!ts) return null;
  if (typeof ts?.toDate === "function") return ts.toDate();
  try {
    return new Date(ts);
  } catch {
    return null;
  }
}
const fmtDateTime = (ts) => {
  const d = tsToDate(ts);
  return d ? d.toLocaleString() : "—";
};
const safeText = (v) => String(v ?? "");

const badgeColor = (t) => {
  switch ((t || "").toLowerCase()) {
    case "trialbalance":
      return "bg-indigo-50 text-indigo-700 border border-indigo-200";
    case "ledger":
      return "bg-amber-50 text-amber-800 border border-amber-200";
    case "incomestatement":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "balancesheet":
      return "bg-blue-50 text-blue-700 border border-blue-200";
    case "cashflow":
      return "bg-teal-50 text-teal-700 border border-teal-200";
    default:
      return "bg-gray-50 text-gray-700 border border-gray-200";
  }
};

// normalize rows from any collection into a common shape
function normalizeRow(raw, collectionName) {
  const typeFromCollection = {
    financialReports: (raw.type || "").toLowerCase(), // unified payload already sets type
    incomeStatementReports: "incomeStatement",
    balanceSheetReports: "balanceSheet",
    cashFlowStatementReports: "cashFlow",
  }[collectionName];

  // period fields (support multiple shapes)
  const pStart =
    raw.periodStart || raw.from || raw.startDate || raw.period?.from || "";
  const pEnd = raw.periodEnd || raw.to || raw.endDate || raw.period?.to || "";

  return {
    id: raw.id,
    label:
      raw.label ||
      raw.title ||
      `${(typeFromCollection || "Report")
        .replace(/^[a-z]/, (c) => c.toUpperCase())
        .replace(/([A-Z])/g, " $1")
        .trim()} — ${pStart || "—"} to ${pEnd || "—"}`,
    type: typeFromCollection || raw.type || "report",
    periodStart: pStart,
    periodEnd: pEnd,
    createdAt: raw.createdAt || raw.generatedAt || raw.created || null,
    createdByName:
      raw.createdByName || raw.generatedBy || raw.createdBy || raw.user || "",
    notes: raw.notes || "",
    source: collectionName,
  };
}

export default function Reports() {
  const { profile } = useUserProfile();
  const isAdmin =
    profile?.roles?.includes("admin") || profile?.role === "admin";
  const isTreasurer =
    profile?.roles?.includes("treasurer") || profile?.role === "treasurer";
  const notSuspended = profile?.suspended !== true;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  // simple client-side filters
  const [qtext, setQtext] = useState("");
  const [type, setType] = useState(""); // "", "trialBalance", "ledger", "incomeStatement", "balanceSheet", "cashFlow"

  useEffect(() => {
    setLoading(true);

    // listeners for each collection; unsubscribe on unmount
    const unsubs = [];

    const attach = (collectionName, orderField = "createdAt") => {
      const q = query(collection(db, collectionName), orderBy(orderField, "desc"));
      const u = onSnapshot(
        q,
        (snap) => {
          setRows((prev) => {
            // remove old items from this collection
            const others = prev.filter((r) => r.source !== collectionName);
            // add fresh normalized ones
            const fresh = snap.docs.map((d) =>
              normalizeRow({ id: d.id, ...d.data() }, collectionName)
            );
            // merge & sort by createdAt desc then label
            const merged = [...others, ...fresh].sort((a, b) => {
              const da = tsToDate(b.createdAt)?.getTime() || 0;
              const db_ = tsToDate(a.createdAt)?.getTime() || 0;
              if (da !== db_) return da - db_;
              return String(a.label).localeCompare(String(b.label));
            });
            return merged;
          });
          setLoading(false);
        },
        (err) => {
          console.error(collectionName + "/onSnapshot:", err);
          // keep page usable if one collection fails
          setLoading(false);
        }
      );
      unsubs.push(u);
    };

    // 1) unified collection (new snapshots from Ledger / Trial Balance, etc.)
    attach("financialReports", "createdAt");
    // 2) legacy per-statement collections (show your existing IS/BS/CF)
    attach("incomeStatementReports", "createdAt");
    attach("balanceSheetReports", "createdAt");
    attach("cashFlowStatementReports", "createdAt");

    return () => unsubs.forEach((u) => u && u());
  }, []);

  const filtered = useMemo(() => {
    const t = (type || "").toLowerCase();
    const s = qtext.trim().toLowerCase();
    return rows.filter((r) => {
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
      ]
        .map(safeText)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [rows, qtext, type]);

  // who can delete which doc (match your Firestore rules)
  function canDelete(row) {
    // financialReports: admin only
    if (row.source === "financialReports") return isAdmin && notSuspended;
    // legacy IS/BS/CF: admin or treasurer
    if (
      row.source === "incomeStatementReports" ||
      row.source === "balanceSheetReports" ||
      row.source === "cashFlowStatementReports"
    ) {
      return (isAdmin || isTreasurer) && notSuspended;
    }
    return false;
  }

  async function handleDelete(row) {
    if (!canDelete(row)) return;
    if (
      !window.confirm(
        `Delete this saved ${row.type}? This cannot be undone.`
      )
    )
      return;
    try {
      await deleteDoc(doc(db, row.source, row.id));
    } catch (e) {
      console.error("delete report error:", e);
      alert("Delete failed: " + (e?.message || e));
    }
  }

  function linkFor(row) {
    // point viewer to the correct collection via ?src=
    return `/reports/${row.id}?src=${encodeURIComponent(row.source)}`;
  }

  function copyLink(row) {
    const url = `${location.origin}${linkFor(row)}`;
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
          <div className="text-sm text-ink/60">
            Saved snapshots from Ledger, Trial Balance, and legacy Income Statement / Balance Sheet / Cash Flow.
          </div>
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
          <div key={`${r.source}:${r.id}`} className="border rounded p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{r.label || "Untitled report"}</div>
                <div className="text-xs text-ink/60 mt-0.5">
                  Period: {r.periodStart || "—"} – {r.periodEnd || "—"}
                </div>
                <div className="text-xs text-ink/60">
                  Created: {fmtDateTime(r.createdAt)} by {r.createdByName || "—"}
                </div>
                <div className="text-[11px] text-ink/50 mt-0.5">Source: {r.source}</div>
                {r.notes && (
                  <div className="text-xs text-ink/70 mt-1">Notes: {r.notes}</div>
                )}
              </div>
              <span
                className={`px-2 py-1 rounded text-xs whitespace-nowrap ${badgeColor(
                  r.type
                )}`}
              >
                {r.type || "unknown"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 justify-end">
              <Link className="btn btn-sm btn-outline" to={linkFor(r)}>
                Open
              </Link>
              <button className="btn btn-sm btn-outline" onClick={() => copyLink(r)}>
                Copy link
              </button>
              {canDelete(r) && (
                <button
                  className="btn btn-sm btn-outline text-rose-700"
                  onClick={() => handleDelete(r)}
                >
                  Delete
                </button>
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
              <th className="p-2 text-left border-b border-gray-200">By</th>
              <th className="p-2 text-left border-b border-gray-200">Source</th>
              <th className="p-2 text-left border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="p-3">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-3 text-ink/60">
                  No reports found.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={`${r.source}:${r.id}`} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b border-r border-gray-200">
                  <div className="font-medium">{r.label || "Untitled report"}</div>
                  {r.notes && (
                    <div className="text-xs text-ink/60 mt-0.5">Notes: {r.notes}</div>
                  )}
                </td>
                <td className="p-2 border-b border-r border-gray-200">
                  <span className={`px-2 py-1 rounded text-xs ${badgeColor(r.type)}`}>
                    {r.type || "unknown"}
                  </span>
                </td>
                <td className="p-2 border-b border-r border-gray-200">
                  {r.periodStart || "—"} – {r.periodEnd || "—"}
                </td>
                <td className="p-2 border-b border-r border-gray-200">
                  {fmtDateTime(r.createdAt)}
                </td>
                <td className="p-2 border-b border-r border-gray-200">
                  {r.createdByName || "—"}
                </td>
                <td className="p-2 border-b border-r border-gray-200">
                  {r.source}
                </td>
                <td className="p-2 border-b">
                  <div className="flex flex-wrap gap-2">
                    <Link className="px-2 py-1 border rounded text-xs" to={linkFor(r)}>
                      Open
                    </Link>
                    <button
                      className="px-2 py-1 border rounded text-xs"
                      onClick={() => copyLink(r)}
                    >
                      Copy link
                    </button>
                    {canDelete(r) && (
                      <button
                        className="px-2 py-1 border rounded text-xs text-rose-700"
                        onClick={() => handleDelete(r)}
                      >
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