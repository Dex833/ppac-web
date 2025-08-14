// src/pages/reports/Reports.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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
import PageBackground from "../../components/PageBackground";

/* ----------------------------- background ----------------------------- */
const reportsBg =
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80";

/* ----------------------------- helpers ----------------------------- */
const TYPES = [
  { val: "", label: "All types" },
  { val: "incomeStatement", label: "Income Statement" },
  { val: "balanceSheet", label: "Balance Sheet" },
  { val: "cashFlow", label: "Cash Flow" },
  { val: "trial_balance", label: "Trial Balance" }, // HTML snapshot
];

function tsToDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return null;
}

function fmtDT(v) {
  const d = tsToDate(v);
  return d ? d.toLocaleString() : "—";
}

function fmtPeriodDate(dateStr) {
  if (!dateStr || dateStr === "—") return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

function periodLabel(r) {
  if (!r) return "—";
  const L = r.from || "—";
  const R = r.to || "—";
  if (r.type === "balanceSheet") {
    const asof = r.to || r.from || "—";
    return `as of ${fmtPeriodDate(asof)}`;
  }
  if (L === R) return `as of ${fmtPeriodDate(R)}`;
  return `${fmtPeriodDate(L)} - ${fmtPeriodDate(R)}`;
}

function TypeBadge({ t }) {
  const map = {
    incomeStatement: "bg-blue-100 text-blue-800 border-blue-200",
    balanceSheet: "bg-emerald-100 text-emerald-800 border-emerald-200",
    cashFlow: "bg-amber-100 text-amber-800 border-amber-200",
    trial_balance: "bg-violet-100 text-violet-800 border-violet-200",
  };
  const label =
    TYPES.find((x) => x.val === t)?.label || (t ? String(t) : "Unknown");
  return (
    <span
      className={
        "inline-block text-xs px-2 py-0.5 rounded border " +
        (map[t] || "bg-gray-100 text-gray-800 border-gray-200")
      }
      title={t}
    >
      {label}
    </span>
  );
}

/* ----------------------------- component ----------------------------- */
export default function Reports() {
  const nav = useNavigate();
  const { profile } = useUserProfile();
  const isAdmin =
    profile?.roles?.includes("admin") || profile?.role === "admin";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    setLoading(true);
    const qRef = query(
      collection(db, "financialReports"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(arr);
        setLoading(false);
      },
      (e) => {
        console.error("financialReports/onSnapshot:", e);
        setRows([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .filter((r) => (typeFilter ? r.type === typeFilter : true))
      .filter((r) => {
        if (!s) return true;
        const hay = `${r.label || ""} ${r.type || ""} ${periodLabel(r)}`.toLowerCase();
        return hay.includes(s);
      });
  }, [rows, search, typeFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case "label":
          va = (a.label || "").toLowerCase();
          vb = (b.label || "").toLowerCase();
          break;
        case "type":
          va = a.type || "";
          vb = b.type || "";
          break;
        case "period":
          va = periodLabel(a);
          vb = periodLabel(b);
          break;
        default:
          va = tsToDate(a.createdAt)?.getTime() || 0;
          vb = tsToDate(b.createdAt)?.getTime() || 0;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  async function handleDelete(id) {
    if (!isAdmin) return;
    if (!window.confirm("Delete this report?")) return;
    await deleteDoc(doc(db, "financialReports", id));
  }

  return (
    <PageBackground
      image={reportsBg}
      boxed
      boxedWidth="max-w-6xl"
      overlayClass="bg-white/85 backdrop-blur"
      className="page-gutter"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Reports</h1>
        <div className="text-sm text-ink/60">
          {loading ? "Loading…" : `${sorted.length} report(s)`}
        </div>
      </div>

      <div className="card p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className="text-xs text-ink/60 flex flex-col">
            Search
            <input
              className="border rounded px-2 py-1 w-64"
              placeholder="Label, type, period…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <label className="text-xs text-ink/60 flex flex-col">
            Type
            <select
              className="border rounded px-2 py-1"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              {TYPES.map((t) => (
                <option key={t.val} value={t.val}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex gap-2">
            <label className="text-xs text-ink/60 flex flex-col">
              Sort by
              <select
                className="border rounded px-2 py-1"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
              >
                <option value="createdAt">Created</option>
                <option value="label">Label</option>
                <option value="type">Type</option>
                <option value="period">Period</option>
              </select>
            </label>
            <button
              className="px-2 py-1 border rounded text-sm"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title="Toggle sort direction"
            >
              {sortDir === "asc" ? "Asc ▲" : "Desc ▼"}
            </button>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block card p-0 overflow-x-auto">
        <table className="min-w-full border border-gray-300 rounded text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="text-left p-2 border-b border-r cursor-pointer select-none"
                onClick={() => toggleSort("label")}
              >
                Label {sortKey === "label" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
              <th
                className="text-left p-2 border-b border-r cursor-pointer select-none"
                onClick={() => toggleSort("type")}
              >
                Type {sortKey === "type" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
              <th
                className="text-left p-2 border-b border-r cursor-pointer select-none"
                onClick={() => toggleSort("period")}
              >
                Period {sortKey === "period" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
              <th
                className="text-left p-2 border-b cursor-pointer select-none"
                onClick={() => toggleSort("createdAt")}
              >
                Created {sortKey === "createdAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
              <th className="text-left p-2 border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b border-r">
                  <div className="font-medium">{r.label || "—"}</div>
                  {r.status && (
                    <div className="text-xs text-ink/50">Status: {r.status}</div>
                  )}
                </td>
                <td className="p-2 border-b border-r">
                  <TypeBadge t={r.type} />
                </td>
                <td className="p-2 border-b border-r font-mono">
                  {periodLabel(r)}
                </td>
                <td className="p-2 border-b font-mono">{fmtDT(r.createdAt)}</td>
                <td className="p-2 border-b">
                  <div className="flex gap-2">
                    <Link className="btn btn-outline btn-sm" to={`/reports/${r.id}`}>
                      Open
                    </Link>
                    {isAdmin && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(r.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-ink/60">
                  No reports found for the current filters.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} className="p-4 text-center">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {sorted.map((r) => (
          <div key={r.id} className="card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="font-semibold">{r.label || "—"}</div>
              <TypeBadge t={r.type} />
            </div>
            <div className="mt-1 text-xs text-ink/60">
              Period: <span className="font-mono">{periodLabel(r)}</span>
            </div>
            <div className="mt-1 text-xs text-ink/60">
              Created: <span className="font-mono">{fmtDT(r.createdAt)}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <Link className="btn btn-outline btn-sm" to={`/reports/${r.id}`}>
                Open
              </Link>
              {isAdmin && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(r.id)}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
        {!loading && sorted.length === 0 && (
          <div className="text-center text-ink/60">No reports found.</div>
        )}
        {loading && <div>Loading…</div>}
      </div>
    </PageBackground>
  );
}
