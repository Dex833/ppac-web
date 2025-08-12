import React, { useEffect, useMemo, useState } from "react";
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
    accountId: "", // dropdown selection
    search: "",    // text search across account labels
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

  // Build ledger map: accountId -> array of lines
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
    // Ensure deterministic ordering inside each account bucket
    Object.keys(map).forEach((id) => {
      map[id].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          String(a.refNumber).localeCompare(String(b.refNumber))
      );
    });
    return map;
  }, [entries]);

  // Determine which accountIds to render based on dropdown + search
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

  /* ------------- CSV Export ------------- */

  function exportAccountCsv(acc, allLines, opening, linesForPeriod) {
    // Build a running balance for CSV (starts at opening)
    let run = opening;

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

    const rows = [];

    // Opening row (if date filter used)
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

    linesForPeriod.forEach((line) => {
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

    filteredAccountIds.forEach((accId) => {
      const acc = accounts.find((a) => a.id === accId);
      const allLines = (ledger[accId] || []).slice().sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          String(a.refNumber).localeCompare(String(b.refNumber))
      );
      const opening = filter.from
        ? allLines
            .filter((l) => l.date < filter.from)
            .reduce((bal, l) => bal + (+l.debit || 0) - (+l.credit || 0), 0)
        : 0;
      const lines = allLines.filter((l) => inRange(l.date, filter.from, filter.to));

      let run = opening;
      if (filter.from) {
        linesOut.push(
          [
            csvEscape(labelForAccount(acc)),
            csvEscape(filter.from),
            "",
            csvEscape("Opening balance"),
            "",
            "",
            csvEscape(run.toFixed(2)),
            "",
          ].join(",")
        );
      }
      lines.forEach((line) => {
        const debit = +line.debit || 0;
        const credit = +line.credit || 0;
        run += debit - credit;
        linesOut.push(
          [
            csvEscape(labelForAccount(acc)),
            csvEscape(line.date || ""),
            csvEscape(String(line.refNumber ?? "")),
            csvEscape(String(line.description ?? "")),
            csvEscape(debit ? debit.toFixed(2) : ""),
            csvEscape(credit ? credit.toFixed(2) : ""),
            csvEscape(run.toFixed(2)),
            csvEscape(String(line.createdBy ?? "")),
          ].join(",")
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

  /* ------------- UI ------------- */

  return (
    <div className="overflow-x-auto">
      <h2 className="text-2xl font-bold mb-6">Ledger</h2>

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

        <div className="ml-auto">
          <button
            type="button"
            className="px-3 py-1 border rounded text-sm"
            onClick={exportAllFilteredCsv}
            disabled={loading || filteredAccountIds.length === 0}
            title="Export all accounts currently shown to CSV"
          >
            Export CSV (filtered)
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div>Loading…</div>
      ) : filteredAccountIds.length === 0 ? (
        <div className="text-gray-500">No accounts found.</div>
      ) : (
        filteredAccountIds.map((accId) => {
          const acc = accounts.find((a) => a.id === accId);
          const allLines = (ledger[accId] || []).slice().sort(
            (a, b) =>
              a.date.localeCompare(b.date) ||
              String(a.refNumber).localeCompare(String(b.refNumber))
          );

          // Opening balance: all lines strictly before "from"
          const opening = filter.from
            ? allLines
                .filter((l) => l.date < filter.from)
                .reduce(
                  (bal, l) => bal + (+l.debit || 0) - (+l.credit || 0),
                  0
                )
            : 0;

          const lines = allLines.filter((l) =>
            inRange(l.date, filter.from, filter.to)
          );

          // Period totals (debit/credit) and ending balance
          const totals = lines.reduce(
            (t, l) => ({
              debit: t.debit + (+l.debit || 0),
              credit: t.credit + (+l.credit || 0),
            }),
            { debit: 0, credit: 0 }
          );

          let runningBalance = opening;
          const ending = opening + totals.debit - totals.credit;

          return (
            <div key={accId} className="mb-10">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-semibold">
                  {labelForAccount(acc)}{" "}
                  <span className="text-gray-600 font-normal text-base">
                    Ending Balance — {fmtMoney(ending)}
                  </span>
                </h3>
                <button
                  type="button"
                  className="px-2 py-1 border rounded text-xs"
                  onClick={() => exportAccountCsv(acc, allLines, opening, lines)}
                  title="Export this account to CSV"
                >
                  Export
                </button>
              </div>

              <div className="max-h-[70vh] overflow-auto border border-gray-300 rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-2 border-b border-r border-gray-200">
                        Date
                      </th>
                      <th className="text-left p-2 border-b border-r border-gray-200">
                        Ref#
                      </th>
                      <th className="text-left p-2 border-b border-r border-gray-200">
                        Description
                      </th>
                      <th className="text-left p-2 border-b border-r border-gray-200">
                        Debit
                      </th>
                      <th className="text-left p-2 border-b border-r border-gray-200">
                        Credit
                      </th>
                      <th className="text-left p-2 border-b border-r border-gray-200">
                        Balance
                      </th>
                      <th className="text-left p-2 border-b">Created By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening balance row */}
                    {filter.from && (
                      <tr className="bg-yellow-50">
                        <td className="p-2 border-b border-r border-gray-200">
                          {filter.from}
                        </td>
                        <td className="p-2 border-b border-r border-gray-200"></td>
                        <td className="p-2 border-b border-r border-gray-200">
                          Opening balance
                        </td>
                        <td className="p-2 border-b border-r border-gray-200 text-right"></td>
                        <td className="p-2 border-b border-r border-gray-200 text-right"></td>
                        <td className="p-2 border-b border-r border-gray-200 text-right">
                          {fmtMoney(opening)}
                        </td>
                        <td className="p-2 border-b">—</td>
                      </tr>
                    )}

                    {/* No transactions */}
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-4 text-gray-500 text-center">
                          No transactions.
                        </td>
                      </tr>
                    ) : (
                      lines.map((line, idx) => {
                        const debit = +line.debit || 0;
                        const credit = +line.credit || 0;
                        runningBalance += debit - credit;
                        const entryUrl = `/accounting/journal/${line.entryId || ""}`;
                        return (
                          <tr key={idx} className="odd:bg-white even:bg-gray-50">
                            <td className="p-2 border-b border-r border-gray-200">
                              {line.date}
                            </td>
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
                              {debit ? fmtMoney(debit) : ""}
                            </td>
                            <td className="p-2 border-b border-r border-gray-200 text-right">
                              {credit ? fmtMoney(credit) : ""}
                            </td>
                            <td className="p-2 border-b border-r border-gray-200 text-right">
                              {fmtMoney(runningBalance)}
                            </td>
                            <td className="p-2 border-b">{line.createdBy || "-"}</td>
                          </tr>
                        );
                      })
                    )}

                    {/* Period totals */}
                    {lines.length > 0 && (
                      <tr className="bg-gray-100 font-semibold">
                        <td colSpan={3} className="p-2 border-b border-r border-gray-200">
                          Period totals
                        </td>
                        <td className="p-2 border-b border-r border-gray-200 text-right">
                          {fmtMoney(totals.debit)}
                        </td>
                        <td className="p-2 border-b border-r border-gray-200 text-right">
                          {fmtMoney(totals.credit)}
                        </td>
                        <td className="p-2 border-b border-r border-gray-200 text-right">
                          {fmtMoney(ending)}
                        </td>
                        <td className="p-2 border-b">—</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}