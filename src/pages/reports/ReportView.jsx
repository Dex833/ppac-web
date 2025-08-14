// src/pages/reports/ReportView.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { db } from "../../lib/firebase";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import useUserProfile from "../../hooks/useUserProfile";

/* ----------------------------- utils ----------------------------- */
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
function fmtNum(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtYMD(s) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${month}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

/* ----------------------------- view ----------------------------- */
export default function ReportView() {
  const { id } = useParams(); // "auto_TB" | "auto_IS" | "auto_BS" | "auto_CF" | <periodic-id>
  const nav = useNavigate();
  const { profile } = useUserProfile();
  const isAdmin = profile?.role === "admin" || profile?.roles?.includes("admin");

  const [docData, setDocData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const ref = doc(db, "financialReports", id);
    const snap = await getDoc(ref);
    setDocData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleDelete() {
    if (!isAdmin) return;
    if (!window.confirm("Delete this report?")) return;
    await deleteDoc(doc(db, "financialReports", id));
    nav("/reports");
  }

  if (loading) return <div className="p-4">Loading…</div>;
  if (!docData) return <div className="p-4">Report not found.</div>;

  const { type, label, createdAt, periodStart, periodEnd, payload } = docData;
  const title = label || "Daily auto report";
  const period =
    periodStart && periodEnd && periodStart === periodEnd
      ? `as of ${fmtYMD(periodEnd)}`
      : `${fmtYMD(periodStart)} → ${fmtYMD(periodEnd)}`;

  const Header = (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Link className="btn" to="/reports">← Back</Link>
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
      <div className="text-sm text-ink/60">
        <span className="mr-2">Period: {period}</span>
        <span className="mr-2">Created: {fmtDT(createdAt)}</span>
        {isAdmin && (
          <button className="text-rose-700 underline" onClick={handleDelete}>Delete</button>
        )}
      </div>
    </div>
  );

  /* ========== 1) Periodical reports (HTML snapshot) — unchanged  ========== */
  const hasHtml =
    payload?.html && typeof payload.html === "string" && payload.html.trim().length > 0;

  if (hasHtml) {
    return (
      <div className="page-gutter">
        {Header}
        {/* eslint-disable-next-line react/no-danger */}
        <div dangerouslySetInnerHTML={{ __html: payload.html }} />
        <div className="mt-3">
          <button className="btn" onClick={() => window.print()}>Print</button>
        </div>
      </div>
    );
  }

  /* ========== 2) Daily auto reports: structured payload renderers ========== */

  // ---- Trial Balance ----
  if (type === "trial_balance" && Array.isArray(payload?.rows)) {
    const rows = payload.rows || [];
    const totals = payload.totals || { debit: 0, credit: 0 };

    return (
      <div className="page-gutter">
        {Header}
        <div className="card p-3">
          <div className="mb-2 text-sm text-ink/70">
            <span className="font-semibold">Trial Balance</span> — read-only snapshot
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2 border-b border-r">Code</th>
                  <th className="text-left p-2 border-b border-r">Account</th>
                  <th className="text-right p-2 border-b border-r">Debit</th>
                  <th className="text-right p-2 border-b">Credit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b border-r">{r.code || ""}</td>
                    <td className="p-2 border-b border-r">{r.name || ""}</td>
                    <td className="p-2 border-b border-r text-right">
                      {r.debit ? fmtNum(r.debit) : ""}
                    </td>
                    <td className="p-2 border-b text-right">
                      {r.credit ? fmtNum(r.credit) : ""}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100">
                  <td colSpan={2} className="p-2 border-t text-right">Totals:</td>
                  <td className="p-2 border-t border-r text-right">{fmtNum(totals.debit)}</td>
                  <td className="p-2 border-t text-right">{fmtNum(totals.credit)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-3">
            <button className="btn" onClick={() => window.print()}>Print</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Income Statement ----
  if (type === "income_statement" && Array.isArray(payload?.sections)) {
    const sections = payload.sections || [];
    const totals = payload.totals || {};

    return (
      <div className="page-gutter">
        {Header}
        <div className="card p-3">
          <div className="mb-2 text-sm text-ink/70">
            <span className="font-semibold">Income Statement</span> — read-only snapshot
          </div>

          {sections.map((sec) => (
            <div key={sec.key} className="mb-4">
              <div className="font-semibold mb-1">{sec.title}</div>
              {Array.isArray(sec.rows) && sec.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-300 rounded text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2 border-b border-r">Code</th>
                        <th className="text-left p-2 border-b border-r">Account</th>
                        <th className="text-right p-2 border-b">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((r, i) => (
                        <tr key={i} className="odd:bg-white even:bg-gray-50">
                          <td className="p-2 border-b border-r">{r.code || ""}</td>
                          <td className="p-2 border-b border-r">{r.name || ""}</td>
                          <td className="p-2 border-b text-right">{fmtNum(r.amount)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold bg-gray-100">
                        <td colSpan={2} className="p-2 border-t text-right">Subtotal:</td>
                        <td className="p-2 border-t text-right">{fmtNum(sec.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : typeof sec.amount === "number" ? (
                <div className="flex items-center justify-between bg-gray-50 border rounded p-2 text-sm">
                  <span>{sec.title}</span>
                  <span className="font-mono">{fmtNum(sec.amount)}</span>
                </div>
              ) : (
                <div className="text-sm text-ink/60">No items</div>
              )}
            </div>
          ))}

          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <div className="border rounded p-2 flex items-center justify-between">
              <span>Total Revenue</span>
              <span className="font-mono">{fmtNum(totals.revenue)}</span>
            </div>
            <div className="border rounded p-2 flex items-center justify-between">
              <span>COGS</span>
              <span className="font-mono">{fmtNum(totals.cogs)}</span>
            </div>
            <div className="border rounded p-2 flex items-center justify-between">
              <span>Operating Expenses</span>
              <span className="font-mono">{fmtNum(totals.operatingExpenses)}</span>
            </div>
            <div className="border rounded p-2 flex items-center justify-between">
              <span>Other Net</span>
              <span className="font-mono">{fmtNum(totals.otherNet)}</span>
            </div>
            <div className="border rounded p-2 flex items-center justify-between font-semibold">
              <span>Net Income</span>
              <span className="font-mono">{fmtNum(totals.netIncome)}</span>
            </div>
          </div>

          <div className="mt-3">
            <button className="btn" onClick={() => window.print()}>Print</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Balance Sheet ----
  if (type === "balance_sheet" && Array.isArray(payload?.sections)) {
    const sections = payload.sections || [];
    const totals = payload.totals || {};

    return (
      <div className="page-gutter">
        {Header}
        <div className="card p-3">
          <div className="mb-2 text-sm text-ink/70">
            <span className="font-semibold">Balance Sheet</span> — read-only snapshot
          </div>

          {sections.map((sec) => (
            <div key={sec.key} className="mb-4">
              <div className="font-semibold mb-1">{sec.title}</div>
              {Array.isArray(sec.rows) && sec.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-300 rounded text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2 border-b border-r">Code</th>
                        <th className="text-left p-2 border-b border-r">Account</th>
                        <th className="text-right p-2 border-b">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((r, i) => (
                        <tr key={i} className="odd:bg-white even:bg-gray-50">
                          <td className="p-2 border-b border-r">{r.code || ""}</td>
                          <td className="p-2 border-b border-r">{r.name || ""}</td>
                          <td className="p-2 border-b text-right">{fmtNum(r.amount)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold bg-gray-100">
                        <td colSpan={2} className="p-2 border-t text-right">Subtotal:</td>
                        <td className="p-2 border-t text-right">{fmtNum(sec.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-ink/60">No items</div>
              )}
            </div>
          ))}

          <div className="grid sm:grid-cols-3 gap-2 text-sm">
            {"assets" in totals && (
              <div className="border rounded p-2 flex items-center justify-between">
                <span>Total Assets</span>
                <span className="font-mono">{fmtNum(totals.assets)}</span>
              </div>
            )}
            {"liabilities" in totals && (
              <div className="border rounded p-2 flex items-center justify-between">
                <span>Total Liabilities</span>
                <span className="font-mono">{fmtNum(totals.liabilities)}</span>
              </div>
            )}
            {"equity" in totals && (
              <div className="border rounded p-2 flex items-center justify-between">
                <span>Total Equity</span>
                <span className="font-mono">{fmtNum(totals.equity)}</span>
              </div>
            )}
          </div>

          <div className="mt-3">
            <button className="btn" onClick={() => window.print()}>Print</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Cash Flow ----
  if (type === "cash_flow" && (Array.isArray(payload?.sections) || payload?.summary)) {
    const sections = payload.sections || [];
    const summary = payload.summary || { startCash: 0, netChangeCash: 0, endCash: 0 };

    return (
      <div className="page-gutter">
        {Header}
        <div className="card p-3">
          <div className="mb-2 text-sm text-ink/70">
            <span className="font-semibold">Cash Flow</span> — read-only snapshot
          </div>

          {sections.map((sec) => (
            <div key={sec.key} className="mb-4">
              <div className="font-semibold mb-1">{sec.title}</div>
              {Array.isArray(sec.rows) && sec.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-300 rounded text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2 border-b border-r">Code</th>
                        <th className="text-left p-2 border-b border-r">Account</th>
                        <th className="text-right p-2 border-b">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((r, i) => (
                        <tr key={i} className="odd:bg-white even:bg-gray-50">
                          <td className="p-2 border-b border-r">{r.code || ""}</td>
                          <td className="p-2 border-b border-r">{r.name || ""}</td>
                          <td className="p-2 border-b text-right">{fmtNum(r.amount)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold bg-gray-100">
                        <td colSpan={2} className="p-2 border-t text-right">Subtotal:</td>
                        <td className="p-2 border-t text-right">{fmtNum(sec.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-ink/60">No items</div>
              )}
            </div>
          ))}

          <div className="grid sm:grid-cols-3 gap-2 text-sm">
            <div className="border rounded p-2 flex items-center justify-between">
              <span>Start Cash</span>
              <span className="font-mono">{fmtNum(summary.startCash)}</span>
            </div>
            <div className="border rounded p-2 flex items-center justify-between">
              <span>Net Change</span>
              <span className="font-mono">{fmtNum(summary.netChangeCash)}</span>
            </div>
            <div className="border rounded p-2 flex items-center justify-between font-semibold">
              <span>End Cash</span>
              <span className="font-mono">{fmtNum(summary.endCash)}</span>
            </div>
          </div>

          <div className="mt-3">
            <button className="btn" onClick={() => window.print()}>Print</button>
          </div>
        </div>
      </div>
    );
  }

  /* ========== 3) Fallback (unknown structured type) ========== */
  return (
    <div className="page-gutter">
      {Header}
      <div className="card p-4">
        <div className="text-ink/70">
          No snapshot found for {type || "report"}. If this is a daily auto report, ensure its
          <code className="mx-1">payload</code> includes structured data:
          <ul className="list-disc pl-6 mt-2">
            <li><code>trial_balance</code>: <code>payload.rows</code>, <code>payload.totals</code></li>
            <li><code>income_statement</code>: <code>payload.sections</code>, <code>payload.totals</code></li>
            <li><code>balance_sheet</code>: <code>payload.sections</code>, <code>payload.totals</code></li>
            <li><code>cash_flow</code>: <code>payload.sections</code>, <code>payload.summary</code></li>
          </ul>
        </div>
      </div>
    </div>
  );
}