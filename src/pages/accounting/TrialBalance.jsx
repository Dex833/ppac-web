// src/pages/accounting/TrialBalance.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import useUserProfile from "../../hooks/useUserProfile";
import jsPDF from "jspdf";

/* ---------- Save TB snapshot to /financialReports ---------- */
async function saveTrialBalanceReport({
  html,
  periodStart = null,
  periodEnd = null,
  label = "Trial Balance",
  createdByName = "",
  createdById = "",
}) {
  const ref = await addDoc(collection(db, "financialReports"), {
    type: "trial_balance",
    status: "generated",
    label,
    periodStart,
    periodEnd,
    createdAt: serverTimestamp(),
    createdByName,
    createdById,
    payload: { html }, // rendered on /reports/:id
  });
  return ref.id;
}

/* ---------- Accounts hook ---------- */
function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const qAcc = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(qAcc, (snap) => {
      setAccounts(
        snap.docs
          .filter((d) => !d.data().archived)
          .map((d) => ({ id: d.id, ...d.data() }))
      );
    });
    return () => unsub();
  }, []);
  return accounts;
}

/* ---------- Utilities ---------- */
const fmt = (n) =>
  (Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const safeNum = (v) => (v == null || v === "" ? 0 : parseFloat(v) || 0);

export default function TrialBalance() {
  const accounts = useAccounts();
  const { profile } = useUserProfile();
  const nav = useNavigate();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState(""); // YYYY-MM-DD
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [includeZero, setIncludeZero] = useState(false);

  const [sortKey, setSortKey] = useState("code"); // 'code' | 'name' | 'debit' | 'credit'
  const [sortDir, setSortDir] = useState("asc"); // 'asc' | 'desc'

  const [saving, setSaving] = useState(false);
  const viewRef = useRef(null); // we snapshot this HTML

  // journalEntries in time order
  useEffect(() => {
    setLoading(true);
    const qJ = query(collection(db, "journalEntries"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(qJ, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  /* ---------- Filtering by date ---------- */
  const filteredEntries = useMemo(() => {
    if (!from && !to) return entries;
    return entries.filter((e) => {
      const d = e.date || ""; // 'YYYY-MM-DD'
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [entries, from, to]);

  /* ---------- One-pass totals by accountId ---------- */
  const totalsByAccountId = useMemo(() => {
    const map = new Map(); // accountId -> { debit, credit }
    for (const entry of filteredEntries) {
      const lines = entry?.lines || [];
      for (const line of lines) {
        const accId = line.accountId;
        if (!accId) continue;
        if (!map.has(accId)) map.set(accId, { debit: 0, credit: 0 });
        const agg = map.get(accId);
        agg.debit += safeNum(line.debit);
        agg.credit += safeNum(line.credit);
      }
    }
    return map;
  }, [filteredEntries]);

  /* ---------- Build rows from accounts + totals ---------- */
  const rows = useMemo(() => {
    const list = accounts.map((acc) => {
      const agg = totalsByAccountId.get(acc.id) || { debit: 0, credit: 0 };
      const name = acc.main + (acc.individual ? " / " + acc.individual : "");
      return {
        id: acc.id,
        code: acc.code,
        name,
        debit: agg.debit,
        credit: agg.credit,
      };
    });

    const searched = list.filter((r) => {
      if (!search) return true;
      const hay = `${r.code} ${r.name}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    });

    const filtered = includeZero ? searched : searched.filter((r) => r.debit || r.credit);

    const sorted = [...filtered].sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case "name":
          va = a.name?.toLowerCase() || "";
          vb = b.name?.toLowerCase() || "";
          break;
        case "debit":
          va = a.debit;
          vb = b.debit;
          break;
        case "credit":
          va = a.credit;
          vb = b.credit;
          break;
        default:
          va = a.code || ""; // code
          vb = b.code || "";
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [accounts, totalsByAccountId, search, includeZero, sortKey, sortDir]);

  const totals = useMemo(
    () => ({
      debit: rows.reduce((s, r) => s + r.debit, 0),
      credit: rows.reduce((s, r) => s + r.credit, 0),
    }),
    [rows]
  );
  const diff = totals.debit - totals.credit;
  const isBalanced = Math.abs(diff) < 0.005;

  /* ---------- Export / Print ---------- */
  function exportCSV() {
    const hdr = "Code,Account,Debit,Credit\n";
    const lines = rows
      .map(
        (r) =>
          `"${(r.code || "").replace(/"/g, '""')}","${(r.name || "").replace(
            /"/g,
            '""'
          )}",${r.debit.toFixed(2)},${r.credit.toFixed(2)}`
      )
      .join("\n");
    const foot = `\nTotals,,${totals.debit.toFixed(2)},${totals.credit.toFixed(
      2
    )}\n${isBalanced ? "" : `Difference,,${diff.toFixed(2)},`}\n`;

    const csv = hdr + lines + foot;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TrialBalance_${from || "start"}_${to || "end"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    let y = 40;

    doc.setFontSize(14);
    doc.text("Trial Balance", 40, y);
    y += 18;
    doc.setFontSize(10);
    doc.text(`Period: ${from || "—"} to ${to || "—"}`, 40, y);
    y += 20;

    // headers
    doc.setFont(undefined, "bold");
    doc.text("Code", 40, y);
    doc.text("Account", 100, y);
    doc.text("Debit", 430, y, { align: "right" });
    doc.text("Credit", 530, y, { align: "right" });
    doc.setFont(undefined, "normal");
    y += 12;

    rows.forEach((r) => {
      if (y > 760) {
        doc.addPage();
        y = 40;
      }
      doc.text(String(r.code || ""), 40, y);
      doc.text(String(r.name || ""), 100, y, { maxWidth: 300 });
      doc.text(fmt(r.debit), 430, y, { align: "right" });
      doc.text(fmt(r.credit), 530, y, { align: "right" });
      y += 12;
    });

    y += 8;
    doc.setFont(undefined, "bold");
    doc.text("Totals:", 340, y);
    doc.text(fmt(totals.debit), 430, y, { align: "right" });
    doc.text(fmt(totals.credit), 530, y, { align: "right" });
    y += 14;

    if (!isBalanced) {
      doc.setTextColor(180, 0, 0);
      doc.text("Difference:", 340, y);
      doc.text(fmt(diff), 530, y, { align: "right" });
      doc.setTextColor(0, 0, 0);
    }

    doc.save(`TrialBalance_${from || "start"}_${to || "end"}.pdf`);
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  /* ---------- Save to Reports (single action) ---------- */
  function suggestedLabel() {
    return from || to
      ? `Trial Balance (${from || "—"} – ${to || "—"})`
      : "Trial Balance";
  }

  async function handleSaveToReports() {
    if (!viewRef.current) return;
    setSaving(true);
    try {
      const html = `<!doctype html><meta charset="utf-8" />
        <style>
          body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}
          table{border-collapse:collapse;width:100%}
          th,td{border:1px solid #e5e7eb;padding:6px 8px;font-size:12px}
          th{background:#f9fafb;text-align:left}
          .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
        </style>
        <h1>Trial Balance</h1>
        <div>Period: ${from || "—"} – ${to || "—"}</div>
        <div style="margin-top:10px">${viewRef.current.innerHTML}</div>`;

      const id = await saveTrialBalanceReport({
        html,
        periodStart: from || null,
        periodEnd: to || null,
        label: suggestedLabel(),
        createdByName: profile?.displayName || profile?.email || "Unknown",
        createdById: profile?.uid || "",
      });

      alert("Saved to Reports ✅");
      nav(`/reports/${id}`);
    } catch (e) {
      console.error(e);
      alert("Failed to save: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end justify-between gap-4 mb-4">
        <h2 className="text-2xl font-bold">Trial Balance</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex gap-2 items-end">
            <label className="text-xs text-ink/60 flex flex-col">
              From
              <input
                type="date"
                className="border rounded px-2 py-1"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-xs text-ink/60 flex flex-col">
              To
              <input
                type="date"
                className="border rounded px-2 py-1"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <input
            className="border rounded px-2 py-1 w-56"
            placeholder="Search account..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeZero}
              onChange={(e) => setIncludeZero(e.target.checked)}
            />
            Include zero rows
          </label>

          {/* Exports */}
          <button
            className="bg-blue-600 text-white px-3 py-2 rounded font-semibold"
            onClick={exportCSV}
            disabled={loading}
          >
            Export CSV
          </button>
          <button
            className="bg-blue-600 text-white px-3 py-2 rounded font-semibold"
            onClick={exportPDF}
            disabled={loading}
          >
            Export PDF
          </button>
          <button
            className="bg-gray-600 text-white px-3 py-2 rounded font-semibold"
            onClick={() => window.print()}
          >
            Print
          </button>

          {/* Save (single action) */}
          <button
            className="bg-emerald-600 text-white px-3 py-2 rounded font-semibold disabled:opacity-60"
            onClick={handleSaveToReports}
            disabled={loading || saving}
            title="Save a read-only snapshot to Reports"
          >
            {saving ? "Saving…" : "Save to Reports"}
          </button>
        </div>
      </div>

      {/* === CONTENT TO SNAPSHOT === */}
      <div ref={viewRef}>
        {/* Mobile cards */}
        <div className="sm:hidden space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm">{r.code}</div>
                <div className="text-xs text-ink/60">{r.name}</div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  Debit: <span className="font-mono">{r.debit ? fmt(r.debit) : "0.00"}</span>
                </div>
                <div>
                  Credit: <span className="font-mono">{r.credit ? fmt(r.credit) : "0.00"}</span>
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 && !loading && (
            <div className="text-sm text-ink/60">No matching accounts for the selected filters.</div>
          )}
          {loading && <div>Loading…</div>}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block">
          <div className="-mx-4 sm:mx-0 table-scroll">
            <table className="min-w-full border border-gray-300 rounded text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th
                    className="text-left p-2 border-b border-r border-gray-200 cursor-pointer select-none"
                    onClick={() => handleSort("code")}
                    title="Sort by code"
                  >
                    Code {sortKey === "code" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th
                    className="text-left p-2 border-b border-r border-gray-200 cursor-pointer select-none"
                    onClick={() => handleSort("name")}
                    title="Sort by account"
                  >
                    Account {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th
                    className="text-right p-2 border-b border-r border-gray-200 cursor-pointer select-none"
                    onClick={() => handleSort("debit")}
                    title="Sort by debit"
                  >
                    Debit {sortKey === "debit" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th
                    className="text-right p-2 border-b cursor-pointer select-none"
                    onClick={() => handleSort("credit")}
                    title="Sort by credit"
                  >
                    Credit {sortKey === "credit" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b border-r border-gray-200">{r.code}</td>
                    <td className="p-2 border-b border-r border-gray-200">{r.name}</td>
                    <td className="p-2 border-b border-r border-gray-200 text-right">
                      {r.debit ? fmt(r.debit) : ""}
                    </td>
                    <td className="p-2 border-b text-right">{r.credit ? fmt(r.credit) : ""}</td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100">
                  <td colSpan={2} className="p-2 border-t text-right">
                    Totals:
                  </td>
                  <td className="p-2 border-t border-r border-gray-200 text-right">
                    {fmt(totals.debit)}
                  </td>
                  <td className="p-2 border-t text-right">{fmt(totals.credit)}</td>
                </tr>
                {!isBalanced && (
                  <tr className="bg-red-100 text-red-700 font-semibold">
                    <td colSpan={2} className="p-2 border-t text-right">
                      Difference:
                    </td>
                    <td colSpan={2} className="p-2 border-t text-right">
                      {fmt(diff)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 text-sm">
          {isBalanced ? (
            <span className="text-green-700 font-semibold">✅ Balanced</span>
          ) : (
            <span className="text-rose-700 font-semibold">⚠️ Out of balance</span>
          )}
        </div>
      </div>
      {/* === /CONTENT TO SNAPSHOT === */}
    </div>
  );
}