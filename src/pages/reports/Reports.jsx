// src/pages/reports/Reports.jsx
import React from "react";
import { db } from "../../lib/firebase";
import { collection, onSnapshot, orderBy, query, deleteDoc, doc } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import useUserProfile from "../../hooks/useUserProfile";

const typeBadges = {
  trial_balance: "Trial Balance",
  ledger: "Ledger",
  incomeStatement: "Income Statement",
  balanceSheet: "Balance Sheet",
  cashFlow: "Cash Flow",
};

function fmtPeriod(from, to) {
  const a = from || "—";
  const b = to || "—";
  if (a === b) return a;
  return `${a} — ${b}`;
}

export default function Reports() {
  const [rows, setRows] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [filterType, setFilterType] = React.useState("all");
  const nav = useNavigate();
  const { profile } = useUserProfile();
  const isAdmin = profile?.role === "admin" || (Array.isArray(profile?.roles) && profile.roles.includes("admin"));

  React.useEffect(() => {
    const q = query(collection(db, "financialReports"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setRows(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
          };
        })
      );
    });
    return () => unsub();
  }, []);

  const filtered = rows.filter((r) => {
    if (filterType !== "all" && r.type !== filterType) return false;
    if (!search) return true;
    const hay = `${r.label || ""} ${r.type || ""} ${r.createdBy || ""} ${r.from || ""} ${r.to || ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  async function handleDelete(id) {
    if (!isAdmin) return;
    if (!window.confirm("Delete this saved report?")) return;
    await deleteDoc(doc(db, "financialReports", id));
  }

  function copyLink(id) {
    const url = `${window.location.origin}/reports/${id}`;
    navigator.clipboard.writeText(url);
    alert("Link copied!");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl font-bold">Reports</h2>
        <button
          className="px-3 py-1 border rounded text-sm"
          onClick={() => nav("/accounting")}
        >
          Back to Accounting
        </button>
      </div>

      <p className="text-ink/70 mb-3">
        Saved snapshots from Ledger, Trial Balance, Income Statement, Balance Sheet, and Cash Flow.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <input
          className="border rounded px-2 py-2 w-full"
          placeholder="Search label, user, notes, period…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border rounded px-2 py-2 w-full"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">All</option>
          <option value="trial_balance">Trial Balance</option>
          <option value="ledger">Ledger</option>
          <option value="incomeStatement">Income Statement</option>
          <option value="balanceSheet">Balance Sheet</option>
          <option value="cashFlow">Cash Flow</option>
        </select>
      </div>

      <div className="-mx-4 sm:mx-0 overflow-x-auto">
        <table className="min-w-full border border-gray-200 rounded text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left border-b">Label</th>
              <th className="p-2 text-left border-b">Type</th>
              <th className="p-2 text-left border-b">Period</th>
              <th className="p-2 text-left border-b">Created</th>
              <th className="p-2 text-left border-b">By</th>
              <th className="p-2 text-left border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b">{r.label || "—"}</td>
                <td className="p-2 border-b">
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                    {typeBadges[r.type] || r.type}
                  </span>
                </td>
                <td className="p-2 border-b">{fmtPeriod(r.from, r.to)}</td>
                <td className="p-2 border-b">{r.createdAt ? r.createdAt.toLocaleString() : "—"}</td>
                <td className="p-2 border-b">{r.createdBy || "—"}</td>
                <td className="p-2 border-b">
                  <div className="flex gap-2">
                    <Link to={`/reports/${r.id}`} className="px-2 py-1 border rounded text-xs">
                      Open
                    </Link>
                    <button className="px-2 py-1 border rounded text-xs" onClick={() => copyLink(r.id)}>
                      Copy link
                    </button>
                    {isAdmin && (
                      <button className="px-2 py-1 border rounded text-xs text-rose-700" onClick={() => handleDelete(r.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-ink/60">No reports yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}