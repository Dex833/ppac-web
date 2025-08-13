// src/pages/reports/Reports.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { Link } from "react-router-dom";

const TYPE_LABELS = {
  trial_balance: "Trial Balance",
  income_statement: "Income Statement",
  balance_sheet: "Balance Sheet",
  cash_flow: "Cash Flow",
};

function toDate(value) {
  if (!value) return null;
  // Firestore Timestamp
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  // ISO string or Date
  return new Date(value);
}

export default function Reports() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | trial_balance | income_statement | balance_sheet | cash_flow

  useEffect(() => {
    // latest generated reports (up to 40) for a simple initial list
    const q = query(
      collection(db, "financialReports"),
      where("status", "==", "generated"),
      orderBy("createdAt", "desc"),
      limit(40)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRows(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.type === filter);
  }, [rows, filter]);

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

      {loading ? (
        <div className="p-6">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-ink/60 border rounded-lg bg-white">
          No reports found.
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.slice(0, 10).map((r) => {
            const start = toDate(r.periodStart);
            const end = toDate(r.periodEnd);
            const created = toDate(r.createdAt);
            return (
              <li key={r.id} className="border rounded-xl p-4 hover:shadow-sm transition bg-white">
                <div className="text-xs uppercase tracking-wide text-ink/60">
                  {TYPE_LABELS[r.type] || r.type}
                </div>
                <div className="text-lg font-semibold mt-1">
                  {r.label || "(No label)"}
                </div>
                <div className="text-sm text-ink/60 mt-1">
                  Period: {start ? start.toLocaleDateString() : "—"} – {end ? end.toLocaleDateString() : "—"}
                </div>
                <div className="text-xs text-ink/60 mt-1">
                  Saved: {created ? created.toLocaleString() : "—"}
                </div>

                <div className="mt-3">
                  <Link
                    to={`/reports/${r.id}`}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-brand-600 text-white hover:bg-brand-700"
                  >
                    Open
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M7 17l9-9M8 8h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}