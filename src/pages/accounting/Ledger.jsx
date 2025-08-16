// src/pages/accounting/Ledger.jsx
import React, { useEffect, useMemo, useState } from "react";
import { formatD } from "@/utils/dates";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, where } from "firebase/firestore";

/* ----------------- helpers ----------------- */
const fmtMoney = (n) =>
  Number.isFinite(+n)
    ? Number(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "";

const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function toISODate(v) {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  if (typeof v?.toDate === "function") return v.toDate().toISOString().slice(0, 10);
  return "";
}
function inRangeISO(dateStr, from, to) {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

function labelForAccount(a) {
  if (!a) return "";
  const name = `${a.main ?? ""}${a.individual ? " / " + a.individual : ""}`.trim();
  return `${a.code ?? ""} — ${name}`;
}

/* ------------- data hooks ------------- */
function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const qAcc = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(
      qAcc,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((d) => !d.archived);
        setAccounts(rows);
      },
      (err) => {
        console.error("accounts/onSnapshot error:", err);
        alert("Failed to load accounts: " + err.message);
      }
    );
    return () => unsub();
  }, []);
  return accounts;
}

export default function Ledger() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filter, setFilter] = useState({
    accountId: "",
    search: "",
    from: "",
    to: "",
  });

  const accounts = useAccounts();

  // Load journalEntries (headers) and flatten their lines for consistency
  useEffect(() => {
    setLoading(true);
    const qEnt = query(collection(db, "journalEntries"), orderBy("date", "asc"));
    const unsub = onSnapshot(
      qEnt,
      (snap) => {
        // Flatten headers → line items, with stable IDs per (journalId, index)
        const rows = [];
        snap.docs.forEach((d) => {
          const h = { id: d.id, ...d.data() };
          const hdrDate = toISODate(h.date) || ""; // journals use YYYY-MM-DD strings
          const ref = h.refNumber || (h.journalNo ? String(h.journalNo).padStart(5, "0") : "");
          const createdBy = h.createdByUid || h.createdBy || "";
          if (Array.isArray(h.lines)) {
            h.lines.forEach((l, idx) => {
              rows.push({
                id: `${h.id}_${String(idx).padStart(3, "0")}`,
                accountId: l.accountId,
                debit: +l.debit || 0,
                credit: +l.credit || 0,
                date: hdrDate, // keep as string for filtering/sorting
                refNumber: ref,
                description: l.memo || h.description || "",
                createdBy,
              });
            });
          }
        });
        setEntries(rows);
        setLoading(false);
      },
      (err) => {
        console.error("journalEntries/onSnapshot error:", err);
        alert("Failed to load journals: " + err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Build ledger map: accountId -> array of lines (sorted)
  const ledger = useMemo(() => {
    const map = {};
    entries.forEach((line) => {
      const id = line.accountId;
      if (!id) return;
      if (!map[id]) map[id] = [];
      map[id].push({
        // Normalize values for consistent UI/exports
        debit: +line.debit || 0,
        credit: +line.credit || 0,
        date: toISODate(line.date), // keep as YYYY-MM-DD string
  refNumber: line.refNumber || "",
        description: line.description || "",
        createdBy: line.createdBy || "",
      });
    });
    Object.keys(map).forEach((id) => {
      map[id].sort(
        (a, b) => {
          const ad = String(a.date || "");
          const bd = String(b.date || "");
          return ad.localeCompare(bd) || String(a.refNumber || "").localeCompare(String(b.refNumber || ""));
        }
      );
    });
    return map;
  }, [entries]);

  // Determine which accountIds to include based on dropdown + search
  const filteredAccountIds = useMemo(() => {
    const keys = Object.keys(ledger);
    if (filter.accountId) return keys.filter((k) => k === filter.accountId);

    const s = filter.search.trim().toLowerCase();
    if (!s) return keys;

    return keys.filter((accId) => {
      const acc = accounts.find((a) => a.id === accId);
      const label = `${acc?.code ?? ""} ${acc?.main ?? ""} ${acc?.individual ?? ""}`.toLowerCase();
      return label.includes(s);
    });
  }, [ledger, filter.accountId, filter.search, accounts]);

  // Compute period data for each accountId (opening, lines, totals, ending)
  const accountPeriodData = useMemo(() => {
    const obj = {};
    Object.keys(ledger).forEach((accId) => {
      const allLines = (ledger[accId] || []).slice(); // sorted
      const opening = filter.from
        ? allLines
            .filter((l) => (l.date ? l.date < filter.from : false))
            .reduce((bal, l) => bal + (+l.debit || 0) - (+l.credit || 0), 0)
        : 0;
      const lines = allLines.filter((l) => inRangeISO(l.date, filter.from, filter.to));
      const totals = lines.reduce(
        (t, l) => ({
          debit: t.debit + (+l.debit || 0),
          credit: t.credit + (+l.credit || 0),
        }),
        { debit: 0, credit: 0 }
      );
      const ending = opening + totals.debit - totals.credit;
      obj[accId] = { allLines, opening, lines, totals, ending };
    });
    return obj;
  }, [ledger, filter.from, filter.to]);

  // Group filtered accounts by "main" (collapsible)
  const groups = useMemo(() => {
    const map = {};
    filteredAccountIds.forEach((accId) => {
      const acc = accounts.find((a) => a.id === accId);
      const main = (acc?.main || "(No Main)").trim();
      if (!map[main]) map[main] = [];
      map[main].push(accId);
    });
    Object.keys(map).forEach((m) => {
      map[m].sort((aId, bId) => {
        const a = accounts.find((x) => x.id === aId);
        const b = accounts.find((x) => x.id === bId);
        return (Number(a?.code) || 0) - (Number(b?.code) || 0);
      });
    });
    const sortedEntries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
    return Object.fromEntries(sortedEntries);
  }, [filteredAccountIds, accounts]);

  // Collapsible state per main group
  const [expanded, setExpanded] = useState({});
  useEffect(() => {
    const initial = {};
    Object.keys(groups).forEach((g) => (initial[g] = true));
    setExpanded((prev) => ({ ...initial, ...prev }));
  }, [Object.keys(groups).join("|")]);

  const expandAll = () => {
    const next = {};
    Object.keys(groups).forEach((g) => (next[g] = true));
    setExpanded(next);
  };
  const collapseAll = () => {
    const next = {};
    Object.keys(groups).forEach((g) => (next[g] = false));
    setExpanded(next);
  };

  /* -------- CSV helpers / exports -------- */
  function csvRowsForAccount(acc, data) {
    let run = data.opening;
    const rows = [];
    if (filter.from) {
      rows.push([labelForAccount(acc), filter.from, "", "Opening balance", "", "", run.toFixed(2), ""]);
    }
    data.lines.forEach((line) => {
      const debit = +line.debit || 0;
      const credit = +line.credit || 0;
      run += debit - credit;
      rows.push([
        labelForAccount(acc),
        line.date || "",
        String(line.refNumber ?? ""),
        String(line.description ?? ""),
        debit ? debit.toFixed(2) : "",
        credit ? credit.toFixed(2) : "",
        run.toFixed(2),
        String(line.createdBy ?? ""),
      ]);
    });
    return rows;
  }

  function exportAccountCsv(accId) {
    const acc = accounts.find((a) => a.id === accId);
    const data = accountPeriodData[accId] || { opening: 0, lines: [] };
    const header = ["Account", "Date", "Ref#", "Description", "Debit", "Credit", "Balance", "Created By"];
    const rows = csvRowsForAccount(acc, data);
    const csv = [header.map(csvEscape).join(",")]
      .concat(rows.map((r) => r.map(csvEscape).join(",")))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (labelForAccount(acc) || "account").replace(/[^\w\-]+/g, "_");
    a.download = `${safeName}_ledger.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 300);
  }

  function exportGroupCsv(mainName) {
    const header = ["Account", "Date", "Ref#", "Description", "Debit", "Credit", "Balance", "Created By"];
    const out = [header.map(csvEscape).join(",")];
    (groups[mainName] || []).forEach((accId) => {
      const acc = accounts.find((a) => a.id === accId);
      const data = accountPeriodData[accId];
      if (!acc || !data) return;
      csvRowsForAccount(acc, data).forEach((r) => out.push(r.map(csvEscape).join(",")));
    });
    const csv = out.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = (mainName || "group").replace(/[^\w\-]+/g, "_");
    a.download = `ledger_${safe}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 300);
  }

  function exportAllFilteredCsv() {
    const header = ["Account", "Date", "Ref#", "Description", "Debit", "Credit", "Balance", "Created By"];
    const out = [header.map(csvEscape).join(",")];
    Object.keys(groups).forEach((mainName) => {
      (groups[mainName] || []).forEach((accId) => {
        const acc = accounts.find((a) => a.id === accId);
        const data = accountPeriodData[accId];
        if (!acc || !data) return;
        csvRowsForAccount(acc, data).forEach((r) => out.push(r.map(csvEscape).join(",")));
      });
    });
    const csv = out.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ledger_filtered.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 300);
  }

  /* -------- Print helpers -------- */
  function printHtmlDocument({ title = "Ledger", html = "" }) {
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return;
    w.document.open();
    w.document.write(`<!doctype html>
<html><head><meta charset="utf-8"/><title>${title}</title>
<style>
body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:24px}
h1,h2,h3{margin:0 0 12px 0}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
thead{background:#f7f7f7}
.right{text-align:right}.muted{color:#666}.mb-16{margin-bottom:16px}
</style>
</head><body>${html}
<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),200)}</script>
</body></html>`);
    w.document.close();
  }

  function printAccount(accId) {
    const acc = accounts.find((a) => a.id === accId);
    const data = accountPeriodData[accId];
    if (!acc || !data) return;

    let run = data.opening;
    const rowsHtml = [];
    if (filter.from) {
      rowsHtml.push(
        `<tr><td>${filter.from}</td><td></td><td>Opening balance</td><td class="right"></td><td class="right"></td><td class="right">${fmtMoney(
          run
        )}</td><td>—</td></tr>`
      );
    }
    data.lines.forEach((line) => {
      const d = +line.debit || 0;
      const c = +line.credit || 0;
      run += d - c;
      rowsHtml.push(
        `<tr>
          <td>${line.date || ""}</td>
          <td>${String(line.refNumber ?? "")}</td>
          <td>${String(line.description ?? "")}</td>
          <td class="right">${d ? fmtMoney(d) : ""}</td>
          <td class="right">${c ? fmtMoney(c) : ""}</td>
          <td class="right">${fmtMoney(run)}</td>
          <td>${String(line.createdBy ?? "")}</td>
        </tr>`
      );
    });

    const html = `
      <h2>${labelForAccount(acc)}</h2>
      <div class="muted mb-16">From: ${filter.from || "—"} &nbsp; To: ${filter.to || "—"}</div>
      <table>
        <thead><tr><th>Date</th><th>Ref#</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Created By</th></tr></thead>
        <tbody>${rowsHtml.join("")}</tbody>
      </table>`;
    printHtmlDocument({ title: `Ledger - ${labelForAccount(acc)}`, html });
  }

  function printWholePage() {
    window.print();
  }

  /* -------- Modal (per-account) -------- */
  const [modalAccId, setModalAccId] = useState(null);

  function AccountModal({ accId, onClose }) {
    const acc = accounts.find((a) => a.id === accId);
    const data = accountPeriodData[accId];
    if (!acc || !data) return null;
    let running = data.opening;

    return (
      <div
        className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center px-3"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-[1100px] max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div>
              <div className="font-semibold">{labelForAccount(acc)}</div>
              <div className="text-xs text-gray-500">
                Period: {filter.from || "—"} to {filter.to || "—"}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="px-2 py-1 border rounded text-xs" onClick={() => exportAccountCsv(accId)}>
                CSV
              </button>
              <button className="px-2 py-1 border rounded text-xs" onClick={() => printAccount(accId)}>
                Print / PDF
              </button>
              <button className="px-2 py-1 border rounded text-xs" onClick={onClose}>
                Close
              </button>
            </div>
          </div>

          <div className="p-4 overflow-auto">
            <table className="min-w-full border border-gray-300 rounded text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left p-2 border-b border-r border-gray-200">Date</th>
                  <th className="text-left p-2 border-b border-r border-gray-200">Ref#</th>
                  <th className="text-left p-2 border-b border-r border-gray-200">Description</th>
                  <th className="text-left p-2 border-b border-r border-gray-200">Debit</th>
                  <th className="text-left p-2 border-b border-r border-gray-200">Credit</th>
                  <th className="text-left p-2 border-b border-r border-gray-200">Balance</th>
                  <th className="text-left p-2 border-b">Created By</th>
                </tr>
              </thead>
              <tbody>
                {filter.from && (
                  <tr className="bg-yellow-50">
                    <td className="p-2 border-b border-r border-gray-200">{filter.from}</td>
                    <td className="p-2 border-b border-r border-gray-200"></td>
                    <td className="p-2 border-b border-r border-gray-200">Opening balance</td>
                    <td className="p-2 border-b border-r border-gray-200 text-right"></td>
                    <td className="p-2 border-b border-r border-gray-200 text-right"></td>
                    <td className="p-2 border-b border-r border-gray-200 text-right">
                      {fmtMoney(data.opening)}
                    </td>
                    <td className="p-2 border-b">—</td>
                  </tr>
                )}

                {data.lines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-gray-500 text-center">
                      No transactions.
                    </td>
                  </tr>
                ) : (
                  data.lines.map((line, idx) => {
                    const d = +line.debit || 0;
                    const c = +line.credit || 0;
                    running += d - c;
                    return (
                      <tr key={idx} className="odd:bg-white even:bg-gray-50">
                        <td className="p-2 border-b border-r border-gray-200">{formatD(line.date)}</td>
                        <td className="p-2 border-b border-r border-gray-200 font-mono">{line.refNumber}</td>
                        <td className="p-2 border-b border-r border-gray-200">{line.description}</td>
                        <td className="p-2 border-b border-r border-gray-200 text-right">
                          {d ? fmtMoney(d) : ""}
                        </td>
                        <td className="p-2 border-b border-r border-gray-200 text-right">
                          {c ? fmtMoney(c) : ""}
                        </td>
                        <td className="p-2 border-b border-r border-gray-200 text-right">
                          {fmtMoney(running)}
                        </td>
                        <td className="p-2 border-b">{line.createdBy || "-"}</td>
                      </tr>
                    );
                  })
                )}

                {data.lines.length > 0 && (
                  <tr className="bg-gray-100 font-semibold">
                    <td colSpan={3} className="p-2 border-b border-r border-gray-200">
                      Period totals
                    </td>
                    <td className="p-2 border-b border-r border-gray-200 text-right">
                      {fmtMoney(data.totals.debit)}
                    </td>
                    <td className="p-2 border-b border-r border-gray-200 text-right">
                      {fmtMoney(data.totals.credit)}
                    </td>
                    <td className="p-2 border-b border-r border-gray-200 text-right">
                      {fmtMoney(accountPeriodData[accId]?.ending || 0)}
                    </td>
                    <td className="p-2 border-b">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* -------- UI -------- */
  return (
    <div className="overflow-x-hidden print:p-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-2xl font-bold">Ledger</h2>
        <div className="ml-auto flex gap-2">
          <button type="button" className="px-3 py-1 border rounded text-sm" onClick={expandAll}>
            Expand all
          </button>
          <button type="button" className="px-3 py-1 border rounded text-sm" onClick={collapseAll}>
            Collapse all
          </button>
          <button
            type="button"
            className="px-3 py-1 border rounded text-sm"
            onClick={exportAllFilteredCsv}
            disabled={loading || Object.keys(groups).length === 0}
            title="Export all currently shown accounts to CSV"
          >
            Export CSV (filtered)
          </button>
          <button type="button" className="px-3 py-1 border rounded text-sm" onClick={printWholePage}>
            Print / PDF (page)
          </button>
        </div>
      </div>

      {/* Filters – responsive grid */}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
        <label className="block">
          <span className="block text-xs text-gray-600">Account</span>
          <select
            className="border rounded px-2 py-2 w-full"
            value={filter.accountId}
            onChange={(e) => setFilter((f) => ({ ...f, accountId: e.target.value }))}
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {labelForAccount(a)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs text-gray-600">Find</span>
          <input
            className="border rounded px-2 py-2 w-full"
            placeholder="Search account name/code"
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            disabled={!!filter.accountId}
            title={
              filter.accountId ? "Clear Account to use text search." : "Type to filter by account label."
            }
          />
        </label>

        <label className="block">
          <span className="block text-xs text-gray-600">From</span>
          <input
            className="border rounded px-2 py-2 w-full"
            type="date"
            value={filter.from}
            onChange={(e) => setFilter((f) => ({ ...f, from: e.target.value }))}
          />
        </label>

        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="block text-xs text-gray-600">To</span>
            <input
              className="border rounded px-2 py-2 w-full"
              type="date"
              value={filter.to}
              onChange={(e) => setFilter((f) => ({ ...f, to: e.target.value }))}
            />
          </label>
          {(filter.from || filter.to || filter.accountId || filter.search) && (
            <button
              type="button"
              className="self-end px-2 py-2 border rounded text-sm"
              onClick={() => setFilter({ accountId: "", search: "", from: "", to: "" })}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div>Loading…</div>
      ) : Object.keys(groups).length === 0 ? (
        <div className="text-gray-500">No accounts found.</div>
      ) : (
        Object.keys(groups).map((mainName) => {
          const accIds = groups[mainName] || [];
          const groupEnding = accIds.reduce(
            (sum, id) => sum + (accountPeriodData[id]?.ending || 0),
            0
          );

          return (
            <div key={mainName} className="mb-6 border rounded">
              <div
                className="flex items-center justify-between bg-blue-50 px-3 py-2 cursor-pointer"
                onClick={() => setExpanded((e) => ({ ...e, [mainName]: !e[mainName] }))}
              >
                <div className="font-semibold">
                  {expanded[mainName] ? "▾" : "▸"} {mainName}
                  <span className="ml-3 text-gray-600 font-normal">
                    Ending Balance — {fmtMoney(groupEnding)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-2 py-1 border rounded text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      exportGroupCsv(mainName);
                    }}
                  >
                    CSV
                  </button>
                </div>
              </div>

              {expanded[mainName] && (
                <div className="p-3">
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="min-w-full border border-gray-300 rounded text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-2 border-b border-r border-gray-200">Code</th>
                          <th className="text-left p-2 border-b border-r border-gray-200">Account</th>
                          <th className="text-left p-2 border-b border-r border-gray-200">Ending Balance</th>
                          <th className="text-left p-2 border-b">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accIds.map((accId) => {
                          const acc = accounts.find((a) => a.id === accId);
                          const data = accountPeriodData[accId];
                          return (
                            <tr key={accId} className="odd:bg-white even:bg-gray-50">
                              <td className="p-2 border-b border-r border-gray-200 font-mono">{acc?.code}</td>
                              <td className="p-2 border-b border-r border-gray-200">{labelForAccount(acc)}</td>
                              <td className="p-2 border-b border-r border-gray-200">
                                {fmtMoney(data?.ending || 0)}
                              </td>
                              <td className="p-2 border-b">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    className="px-2 py-1 border rounded text-xs"
                                    onClick={() => setModalAccId(accId)}
                                  >
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    className="px-2 py-1 border rounded text-xs"
                                    onClick={() => exportAccountCsv(accId)}
                                  >
                                    CSV
                                  </button>
                                  <button
                                    type="button"
                                    className="px-2 py-1 border rounded text-xs"
                                    onClick={() => printAccount(accId)}
                                  >
                                    Print / PDF
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-3">
                    {accIds.map((accId) => {
                      const acc = accounts.find((a) => a.id === accId);
                      const data = accountPeriodData[accId];
                      return (
                        <div key={accId} className="card p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs text-ink/50">Code</div>
                              <div className="font-mono">{acc?.code}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-ink/50">Ending</div>
                              <div className="font-mono font-semibold">{fmtMoney(data?.ending || 0)}</div>
                            </div>
                          </div>
                          <div className="mt-2 font-medium">{labelForAccount(acc)}</div>
                          <div className="mt-3 flex justify-end gap-2">
                            <button className="btn btn-sm btn-outline" onClick={() => setModalAccId(accId)}>
                              View
                            </button>
                            <button className="btn btn-sm btn-outline" onClick={() => exportAccountCsv(accId)}>
                              CSV
                            </button>
                            <button className="btn btn-sm btn-outline" onClick={() => printAccount(accId)}>
                              Print
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Modal */}
      {modalAccId && <AccountModal accId={modalAccId} onClose={() => setModalAccId(null)} />}
    </div>
  );
}