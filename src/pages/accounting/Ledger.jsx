import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../../lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";

/* ----------------- helpers ----------------- */
const fmtMoney = (n) =>
  Number.isFinite(+n)
    ? Number(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "";

const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function inRange(ymd, from, to) {
  if (!ymd) return false;
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

function labelForAccount(a) {
  if (!a) return "";
  const name = `${a.main ?? ""}${a.individual ? " / " + a.individual : ""}`.trim();
  return `${a.code ?? ""} — ${name}`;
}

function printHtmlDocument({ title = "Ledger", html = "" }) {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.open();
  w.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px; }
  h1,h2,h3 { margin: 0 0 12px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  thead { background: #f7f7f7; }
  .right { text-align: right; }
  .muted { color: #666; }
  .mb-16 { margin-bottom: 16px; }
</style>
</head>
<body>
${html}
<script>window.onload = () => { window.print(); setTimeout(()=>window.close(), 200); }</script>
</body></html>`);
  w.document.close();
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
    accountId: "", // dropdown selection (optional)
    search: "", // text search across account labels
    from: "",
    to: "",
  });

  const accounts = useAccounts();

  // Load journal entries ordered by accounting date then refNumber
  useEffect(() => {
    setLoading(true);
    const qEnt = query(
      collection(db, "journalEntries"),
      orderBy("date", "asc"),
      orderBy("refNumber", "asc")
    );
    const unsub = onSnapshot(
      qEnt,
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("journalEntries/onSnapshot error:", err);
        alert("Failed to load journal entries: " + err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Build ledger map: accountId -> array of lines (sorted)
  const ledger = useMemo(() => {
    const map = {};
    entries.forEach((entry) => {
      const lines = entry.lines || [];
      lines.forEach((line) => {
        const id = line.accountId;
        if (!id) return;
        if (!map[id]) map[id] = [];
        map[id].push({
          ...line,
          entryId: entry.id,
          refNumber: entry.refNumber,
          date: entry.date, // "YYYY-MM-DD"
          description: entry.description,
          createdBy: entry.createdBy,
        });
      });
    });
    Object.keys(map).forEach((id) => {
      map[id].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          String(a.refNumber).localeCompare(String(b.refNumber))
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
      const label = `${acc?.code ?? ""} ${acc?.main ?? ""} ${
        acc?.individual ?? ""
      }`.toLowerCase();
      return label.includes(s);
    });
  }, [ledger, filter.accountId, filter.search, accounts]);

  // Compute period data for each accountId (opening, lines, totals, ending)
  const accountPeriodData = useMemo(() => {
    const obj = {};
    Object.keys(ledger).forEach((accId) => {
      const allLines = (ledger[accId] || []).slice(); // already sorted
      const opening = filter.from
        ? allLines
            .filter((l) => l.date < filter.from)
            .reduce(
              (bal, l) => bal + (+l.debit || 0) - (+l.credit || 0),
              0
            )
        : 0;
      const lines = allLines.filter((l) => inRange(l.date, filter.from, filter.to));
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
    // Sort accounts within each group by code
    Object.keys(map).forEach((m) => {
      map[m].sort((aId, bId) => {
        const a = accounts.find((x) => x.id === aId);
        const b = accounts.find((x) => x.id === bId);
        return (Number(a?.code) || 0) - (Number(b?.code) || 0);
      });
    });
    // Sort groups alphabetically
    const sortedEntries = Object.entries(map).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    return Object.fromEntries(sortedEntries);
  }, [filteredAccountIds, accounts]);

  // Collapsible state per main group
  const [expanded, setExpanded] = useState({});
  useEffect(() => {
    // expand groups once on first load
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

  /* -------- CSV Export (account/group/all) -------- */
  function csvRowsForAccount(acc, data) {
    let run = data.opening;
    const rows = [];
    if (filter.from) {
      rows.push([
        labelForAccount(acc),
        filter.from,
        "",
        "Opening balance",
        "",
        "",
        run.toFixed(2),
        "",
      ]);
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
    const data = accountPeriodData[accId] || {
      opening: 0,
      lines: [],
    };
    const header = [
      "Account",
      "Date",
      "Ref#",
      "Description",
      "Debit",
      "Credit",
      "Balance",
      "Created By",
    ];
    const rows = csvRowsForAccount(acc, data);
    const csv =
      [header.map(csvEscape).join(",")]
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
    const header = [
      "Account",
      "Date",
      "Ref#",
      "Description",
      "Debit",
      "Credit",
      "Balance",
      "Created By",
    ];
    const linesOut = [header.map(csvEscape).join(",")];
    (groups[mainName] || []).forEach((accId) => {
      const acc = accounts.find((a) => a.id === accId);
      const data = accountPeriodData[accId];
      if (!acc || !data) return;
      csvRowsForAccount(acc, data).forEach((r) =>
        linesOut.push(r.map(csvEscape).join(","))
      );
    });
    const csv = linesOut.join("\n");
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
    const header = [
      "Account",
      "Date",
      "Ref#",
      "Description",
      "Debit",
      "Credit",
      "Balance",
      "Created By",
    ];
    const linesOut = [header.map(csvEscape).join(",")];
    Object.keys(groups).forEach((mainName) => {
      (groups[mainName] || []).forEach((accId) => {
        const acc = accounts.find((a) => a.id === accId);
        const data = accountPeriodData[accId];
        if (!acc || !data) return;
        csvRowsForAccount(acc, data).forEach((r) =>
          linesOut.push(r.map(csvEscape).join(","))
        );
      });
    });
    const csv = linesOut.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ledger_filtered.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 300);
  }

  /* -------- Print/PDF (account or whole page) -------- */
  function printAccount(accId) {
    const acc = accounts.find((a) => a.id === accId);
    const data = accountPeriodData[accId];
    if (!acc || !data) return;

    let run = data.opening;
    const rowsHtml = [];
    if (filter.from) {
      rowsHtml.push(
        `<tr>
          <td>${filter.from}</td><td></td><td>Opening balance</td>
          <td class="right"></td><td class="right"></td>
          <td class="right">${fmtMoney(run)}</td><td>—</td>
        </tr>`
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
      <div class="muted mb-16">From: ${filter.from || "—"} &nbsp; To: ${
      filter.to || "—"
    }</div>
      <table>
        <thead><tr>
          <th>Date</th><th>Ref#</th><th>Description</th>
          <th>Debit</th><th>Credit</th><th>Balance</th><th>Created By</th>
        </tr></thead>
        <tbody>${rowsHtml.join("")}</tbody>
      </table>
    `;
    printHtmlDocument({ title: `Ledger - ${labelForAccount(acc)}`, html });
  }

  function printWholePage() {
    // Simple: print current page (use browser "Save as PDF" to export PDF)
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
        className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-xl shadow-2xl w-[min(1100px,94vw)] max-h-[90vh] overflow-hidden"
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
              <button
                className="px-2 py-1 border rounded text-xs"
                onClick={() => exportAccountCsv(accId)}
                title="Export this account to CSV"
              >
                CSV
              </button>
              <button
                className="px-2 py-1 border rounded text-xs"
                onClick={() => printAccount(accId)}
                title="Print or Save as PDF"
              >
                Print / PDF
              </button>
              <button
                className="px-2 py-1 border rounded text-xs"
                onClick={onClose}
              >
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
                    const entryUrl = `/accounting/journal/${line.entryId || ""}`;
                    return (
                      <tr key={idx} className="odd:bg-white even:bg-gray-50">
                        <td className="p-2 border-b border-r border-gray-200">{line.date}</td>
                        <td className="p-2 border-b border-r border-gray-200 font-mono">
                          {line.refNumber}
                        </td>
                        <td className="p-2 border-b border-r border-gray-200">
                          <a
                            className="text-blue-600 underline"
                            href={entryUrl}
                            title="Open journal entry"
                          >
                            {line.description}
                          </a>
                        </td>
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
                      {fmtMoney(data.ending)}
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
    <div className="overflow-x-auto print:p-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-2xl font-bold">Ledger</h2>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="px-3 py-1 border rounded text-sm"
            onClick={expandAll}
          >
            Expand all
          </button>
          <button
            type="button"
            className="px-3 py-1 border rounded text-sm"
            onClick={collapseAll}
          >
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
          <button
            type="button"
            className="px-3 py-1 border rounded text-sm"
            onClick={printWholePage}
            title="Print or Save as PDF"
          >
            Print / PDF (page)
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-600">Account</label>
          <select
            className="border rounded px-2 py-1 min-w-[280px]"
            value={filter.accountId}
            onChange={(e) =>
              setFilter((f) => ({ ...f, accountId: e.target.value }))
            }
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {labelForAccount(a)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-600">Find</label>
          <input
            className="border rounded px-2 py-1"
            placeholder="Search account name/code"
            value={filter.search}
            onChange={(e) =>
              setFilter((f) => ({ ...f, search: e.target.value }))
            }
            disabled={!!filter.accountId}
            title={
              filter.accountId
                ? "Clear Account to use text search."
                : "Type to filter by account label."
            }
          />
        </div>

        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-gray-600">From</label>
            <input
              className="border rounded px-2 py-1"
              type="date"
              value={filter.from}
              onChange={(e) => setFilter((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600">To</label>
            <input
              className="border rounded px-2 py-1"
              type="date"
              value={filter.to}
              onChange={(e) => setFilter((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
          {(filter.from || filter.to || filter.accountId || filter.search) && (
            <button
              type="button"
              className="px-2 py-1 border rounded text-sm"
              onClick={() =>
                setFilter({ accountId: "", search: "", from: "", to: "" })
              }
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
            (sum, accId) => sum + (accountPeriodData[accId]?.ending || 0),
            0
          );

          return (
            <div key={mainName} className="mb-6 border rounded">
              <div
                className="flex items-center justify-between bg-blue-50 px-3 py-2 cursor-pointer"
                onClick={() =>
                  setExpanded((e) => ({ ...e, [mainName]: !e[mainName] }))
                }
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
                  <table className="min-w-full border border-gray-300 rounded text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2 border-b border-r border-gray-200">Code</th>
                        <th className="text-left p-2 border-b border-r border-gray-200">Account</th>
                        <th className="text-left p-2 border-b border-r border-gray-200">
                          Ending Balance
                        </th>
                        <th className="text-left p-2 border-b">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accIds.map((accId) => {
                        const acc = accounts.find((a) => a.id === accId);
                        const data = accountPeriodData[accId];
                        return (
                          <tr key={accId} className="odd:bg-white even:bg-gray-50">
                            <td className="p-2 border-b border-r border-gray-200 font-mono">
                              {acc?.code}
                            </td>
                            <td className="p-2 border-b border-r border-gray-200">
                              {labelForAccount(acc)}
                            </td>
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
                                  title="Print or Save as PDF"
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
              )}
            </div>
          );
        })
      )}

      {/* Modal */}
      {modalAccId && (
        <AccountModal accId={modalAccId} onClose={() => setModalAccId(null)} />
      )}
    </div>
  );
}