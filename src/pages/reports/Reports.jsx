// src/pages/reports/Reports.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../../lib/firebase";
import { collection, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import useUserProfile from "../../hooks/useUserProfile";

/* ---------------- helpers ---------------- */
const SOURCE_ORDER = [
  "financialReports",
  "incomeStatementReports",
  "balanceSheetReports",
  "balanceSheets",                 // <-- NEW: also include this legacy name
  "cashFlowStatementReports",
];

function tsToDate(ts) {
  if (!ts) return null;
  if (typeof ts?.toDate === "function") return ts.toDate();
  try { return new Date(ts); } catch { return null; }
}
const fmtDateTime = (ts) => {
  const d = tsToDate(ts);
  return d ? d.toLocaleString() : "—";
};

function roles(profile) {
  const r = Array.isArray(profile?.roles) ? profile.roles : (profile?.role ? [profile.role] : []);
  return {
    isAdmin: r.includes("admin"),
    isTreasurer: r.includes("treasurer"),
    isManager: r.includes("manager"),
    suspended: profile?.suspended === true,
  };
}

function normalizeRow(source, id, data) {
  // Common fields (best-effort across all sources)
  const createdAt = data.createdAt || data.generatedAt || data.created || data.savedAt || null;
  const createdBy = data.createdByName || data.generatedBy || data.createdBy || data.user || "";
  const periodStart = data.periodStart || data.from || data.startDate || data.period?.from || "";
  const periodEnd   = data.periodEnd   || data.to   || data.endDate   || data.period?.to   || "";
  const label =
    data.label ||
    data.title ||
    (source === "incomeStatementReports"
      ? `Income Statement — ${periodStart || "—"} to ${periodEnd || "—"}`
      : source === "balanceSheetReports" || source === "balanceSheets"
      ? `Balance Sheet — ${periodStart || "—"} to ${periodEnd || "—"}`
      : source === "cashFlowStatementReports"
      ? `Cash Flow — ${periodStart || "—"} to ${periodEnd || "—"}`
      : data?.type === "trial_balance"
      ? "Trial Balance"
      : data?.type === "ledger"
      ? "Ledger"
      : "Report");

  // Human type
  let type =
    data.type ||
    (source === "incomeStatementReports"
      ? "incomeStatement"
      : source === "balanceSheetReports" || source === "balanceSheets"
      ? "balanceSheet"
      : source === "cashFlowStatementReports"
      ? "cashFlow"
      : "report");

  return {
    id,
    source,          // which collection it came from
    label,
    type,
    periodStart,
    periodEnd,
    createdAt,
    createdBy,
    raw: data,
  };
}

/* ---------------- component ---------------- */
export default function Reports() {
  const nav = useNavigate();
  const { profile } = useUserProfile();
  const { isAdmin, isTreasurer, suspended } = roles(profile);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    let unsubs = [];
    setLoading(true);

    SOURCE_ORDER.forEach((src) => {
      const col = collection(db, src);
      const unsub = onSnapshot(
        col,
        (snap) => {
          setItems((prev) => {
            // remove previous rows from this source then add new ones
            const others = prev.filter((r) => r.source !== src);
            const rows = snap.docs.map((d) => normalizeRow(src, d.id, d.data()));
            return [...others, ...rows];
          });
          setLoading(false);
        },
        (err) => {
          // If a collection doesn’t exist, ignore the error (safe no-op)
          console.warn(`reports list listener for ${src} failed:`, err?.message || err);
        }
      );
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u && u());
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items
      .filter((r) => (typeFilter === "all" ? true : (r.type || "").toLowerCase() === typeFilter))
      .filter((r) => {
        if (!s) return true;
        const hay = `${r.label} ${r.type} ${r.periodStart} ${r.periodEnd} ${r.createdBy} ${r.source}`.toLowerCase();
        return hay.includes(s);
      })
      .sort((a, b) => {
        const ta = tsToDate(a.createdAt)?.getTime() || 0;
        const tb = tsToDate(b.createdAt)?.getTime() || 0;
        return tb - ta; // newest first
      });
  }, [items, q, typeFilter]);

  function canDeleteRow(row) {
    if (suspended) return false;
    if (row.source === "financialReports") return isAdmin; // unified snapshots: admin only
    // legacy: IS / BS / CF -> admin or treasurer
    if (["incomeStatementReports", "balanceSheetReports", "balanceSheets", "cashFlowStatementReports"].includes(row.source)) {
      return isAdmin || isTreasurer;
    }
    return false;
  }

  async function handleDelete(row) {
    if (!canDeleteRow(row)) return;
    if (!window.confirm(`Delete "${row.label}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, row.source, row.id));
    } catch (e) {
      console.error("delete report error:", e);
      alert("Delete failed: " + (e?.message || e));
    }
  }

  function openRow(row) {
    // pass the source in the URL so ReportView knows where to read
    nav(`/reports/${row.id}?src=${encodeURIComponent(row.source)}`);
  }

  function copyLink(row) {
    const url = `${location.origin}/reports/${row.id}?src=${encodeURIComponent(row.source)}`;
    navigator.clipboard.writeText(url).then(
      () => alert("Link copied."),
      () => alert("Copy failed. Please copy from the address bar.")
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Reports</h2>
          <p className="text-sm text-ink/60">
            Saved snapshots from Ledger, Trial Balance, and legacy Income Statement / Balance Sheet / Cash Flow.
          </p>
        </div>
        <div className="hidden sm:block">
          <Link className="px-3 py-2 border rounded text-sm" to="/accounting">
            Back to Accounting
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="border rounded px-2 py-2 w-64"
          placeholder="Search label, user, notes, period..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="border rounded px-2 py-2"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by type"
        >
          <option value="all">All</option>
          <option value="trial_balance">Trial Balance</option>
          <option value="ledger">Ledger</option>
          <option value="incomeStatement">Income Statement</option>
          <option value="balanceSheet">Balance Sheet</option>
          <option value="cashFlow">Cash Flow</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-300 rounded text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left border-b border-r">Label</th>
              <th className="p-2 text-left border-b border-r">Type</th>
              <th className="p-2 text-left border-b border-r">Period</th>
              <th className="p-2 text-left border-b border-r">Created</th>
              <th className="p-2 text-left border-b border-r">By</th>
              <th className="p-2 text-left border-b">Source</th>
              <th className="p-2 text-left border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-ink/60">Loading…</td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-ink/60">No reports found.</td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={`${r.source}:${r.id}`} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b border-r">{r.label}</td>
                <td className="p-2 border-b border-r">
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 border">
                    {(r.type || "report").replace("_", " ")}
                  </span>
                </td>
                <td className="p-2 border-b border-r">
                  {(r.periodStart || "—")} — {(r.periodEnd || "—")}
                </td>
                <td className="p-2 border-b border-r">{fmtDateTime(r.createdAt)}</td>
                <td className="p-2 border-b border-r">{r.createdBy || "—"}</td>
                <td className="p-2 border-b border-r font-mono text-xs">{r.source}</td>
                <td className="p-2 border-b">
                  <div className="flex flex-wrap gap-2">
                    <button className="px-2 py-1 border rounded text-xs" onClick={() => openRow(r)}>
                      Open
                    </button>
                    <button className="px-2 py-1 border rounded text-xs" onClick={() => copyLink(r)}>
                      Copy link
                    </button>
                    {canDeleteRow(r) && (
                      <button className="px-2 py-1 border rounded text-xs text-rose-700" onClick={() => handleDelete(r)}>
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