import React, { useEffect, useState } from "react";
import SafeText from "@/components/SafeText";
import { formatD, formatDT } from "@/utils/dates";
import { db, functions } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

// Live accounts list for mapping and edit dropdowns

// Normalize Firestore Timestamp | string -> "YYYY-MM-DD"
function toYMD(v) {
  try {
    if (!v) return "";
    if (typeof v === "string") return v.slice(0, 10);
    // Firestore Timestamp
    if (typeof v?.toDate === "function") {
      const d = v.toDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    // Plain object with seconds/nanoseconds (defensive)
    if (v?.seconds != null) {
      const d = new Date(v.seconds * 1000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  } catch {}
  return "";
}

function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const qAcc = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(qAcc, (snap) => {
      setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  return accounts;
}

export default function GeneralJournal() {
  const accounts = useAccounts();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState({ ref: "", date: "", account: "" });
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [grouped, setGrouped] = useState(false); // headers-only view

  const [notif, setNotif] = useState({ show: false, type: "", message: "" });

  // Full-edit modal state
  const [editEntryId, setEditEntryId] = useState(null);
  const [editForm, setEditForm] = useState({
    date: "",
    description: "",
    comments: "",
    lines: [], // [{ accountId, debit, credit, memo }]
  });
  const [editError, setEditError] = useState("");

  // Load journal entries (newest first)
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "journalEntries"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const toYMD = (v) => {
        try {
          if (v && typeof v.toDate === "function") return v.toDate().toISOString().slice(0,10);
          const s = String(v ?? "").trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
          const dt = new Date(s);
          if (!isNaN(dt.getTime())) return dt.toISOString().slice(0,10);
        } catch {}
        return "";
      };
      const rows = snap.docs.map((d) => {
        const raw = { id: d.id, ...d.data() };
        return { ...raw, date: toYMD(raw.date || raw.createdAt) };
      });
      setEntries(rows);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Helpers
  function getAccount(accountId) {
    return accounts.find((a) => a.id === accountId);
  }
  function getAccountName(accountId) {
    const acc = getAccount(accountId);
    if (!acc) return accountId;
    return `${acc.code} - ${acc.main}${acc.individual ? " / " + acc.individual : ""}`;
  }
  function getAccountType(accountId) {
    const acc = getAccount(accountId);
    return acc ? acc.type : "";
  }
  const fmt = (n) =>
    Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Sorting control
  function handleSort(field) {
    if (sortBy === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  }

  // --------- Filtering ----------
  function entryMatchesFilters(e) {
  const refStr = e.refNumber || (e.journalNo ? String(e.journalNo).padStart(5, "0") : "");
  if (filter.ref && !refStr.includes(filter.ref)) return false;
  // normalize date for comparisons
  const eDate = toYMD(e.date);
  if (filter.date && eDate !== filter.date) return false;
    if (
      filter.account &&
      !e.lines?.some((l) => {
        const acc = accounts.find((a) => a.id === l.accountId);
        return (
          acc &&
          `${acc.code} ${acc.main} ${acc.individual || ""}`
            .toLowerCase()
            .includes(filter.account.toLowerCase())
        );
      })
    )
      return false;
    return true;
  }

  // Flatten + filter lines for DESKTOP table
  let lines = entries
    .filter(entryMatchesFilters)
    .flatMap((entry) =>
      (entry.lines || []).map((line) => {
        const normalizedDate = toYMD(entry.date);
        return {
          ...line,
          entryId: entry.id,
          refNumber: entry.refNumber || (entry.journalNo ? String(entry.journalNo).padStart(5, "0") : ""),
          date: normalizedDate,
          description: entry.description,
          comments: entry.comments,
          createdBy: entry.createdBy,
          updatedBy: entry.updatedBy,
          updatedAt: entry.updatedAt,
        };
      })
    );

  // Sort rows (desktop table)
  lines = lines.sort((a, b) => {
    let v1 = a[sortBy];
    let v2 = b[sortBy];
    if (sortBy === "debit" || sortBy === "credit") {
      v1 = parseFloat(v1) || 0;
      v2 = parseFloat(v2) || 0;
    } else if (sortBy === "date") {
      v1 = a.date;
      v2 = b.date;
    } else if (sortBy === "account") {
      v1 = getAccountName(a.accountId);
      v2 = getAccountName(b.accountId);
    }
    if (v1 < v2) return sortDir === "asc" ? -1 : 1;
    if (v1 > v2) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  // Table totals (desktop)
  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);

  // --------- Mobile cards: group per entry ----------
  const mobileEntries = entries.filter(entryMatchesFilters);

  // --------- Grouped (headers-only) rows ----------
  const groupedRows = mobileEntries.map((e) => {
    const refNumber = e.refNumber || (e.journalNo ? String(e.journalNo).padStart(5, "0") : "");
    const date = toYMD(e.date);
    const debitTotal = (e.lines || []).reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const creditTotal = (e.lines || []).reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
    return {
      id: e.id,
      refNumber,
      date,
      description: e.description,
      comments: e.comments,
      createdBy: e.createdBy,
      debitTotal,
      creditTotal,
      linesCount: (e.lines || []).length,
    };
  });
  const groupedSorted = [...groupedRows].sort((a, b) => {
    // Reuse sortBy/sortDir; map unsupported fields to reasonable defaults
    const key = ["refNumber", "date", "description", "debit", "credit"].includes(sortBy)
      ? sortBy
      : sortBy === "debit"
      ? "debit"
      : sortBy === "credit"
      ? "credit"
      : "date";
    let v1;
    let v2;
    if (key === "refNumber") {
      v1 = a.refNumber;
      v2 = b.refNumber;
    } else if (key === "date") {
      v1 = a.date;
      v2 = b.date;
    } else if (key === "description") {
      v1 = a.description || "";
      v2 = b.description || "";
    } else if (key === "debit") {
      v1 = a.debitTotal;
      v2 = b.debitTotal;
    } else if (key === "credit") {
      v1 = a.creditTotal;
      v2 = b.creditTotal;
    }
    if (v1 < v2) return sortDir === "asc" ? -1 : 1;
    if (v1 > v2) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  const groupedTotals = groupedRows.reduce(
    (t, r) => ({ debit: t.debit + r.debitTotal, credit: t.credit + r.creditTotal }),
    { debit: 0, credit: 0 }
  );

  // ---- Full Edit (entry + lines) ----
  function openEdit(entryId) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    setEditEntryId(entryId);
    setEditForm({
      date: entry.date || "",
      description: entry.description || "",
      comments: entry.comments || "",
      lines: (entry.lines || []).map((l) => ({
        accountId: l.accountId || "",
        debit: l.debit != null ? String(l.debit) : "",
        credit: l.credit != null ? String(l.credit) : "",
        memo: l.memo || "",
      })),
    });
    setEditError("");
  }

  function setLine(idx, patch) {
    setEditForm((f) => ({
      ...f,
      lines: f.lines.map((ln, i) => (i === idx ? { ...ln, ...patch } : ln)),
    }));
  }
  function addLine() {
    setEditForm((f) => ({
      ...f,
      lines: [...f.lines, { accountId: "", debit: "", credit: "", memo: "" }],
    }));
  }
  function removeLine(idx) {
    setEditForm((f) => {
      if (f.lines.length <= 1) return f;
      return { ...f, lines: f.lines.filter((_, i) => i !== idx) };
    });
  }

  // Edit totals + validations
  const editDebit = editForm.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const editCredit = editForm.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(editDebit - editCredit) < 0.005;

  function validateEdit() {
    if (!editForm.date) return "Date is required.";
    if (!editForm.description.trim()) return "Description is required.";
    if (!editForm.lines.length) return "At least one line is required.";
    for (let i = 0; i < editForm.lines.length; i++) {
      const l = editForm.lines[i];
      if (!l.accountId) return `Line ${i + 1}: Account is required.`;
      const d = parseFloat(l.debit) || 0;
      const c = parseFloat(l.credit) || 0;
      if (d <= 0 && c <= 0) return `Line ${i + 1}: Enter a debit OR a credit.`;
      if (d > 0 && c > 0) return `Line ${i + 1}: Only one side allowed (debit OR credit).`;
    }
    if (!isBalanced) return "Debits and credits must balance.";
    return "";
  }

  async function saveEdit() {
    if (!editEntryId) return;
    const err = validateEdit();
    if (err) {
      setEditError(err);
      return;
    }
    try {
      await updateDoc(doc(db, "journalEntries", editEntryId), {
        date: editForm.date,
        description: editForm.description.trim(),
        comments: (editForm.comments || "").trim(),
        lines: editForm.lines.map((l) => ({
          accountId: l.accountId,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          memo: (l.memo || "").trim(),
        })),
        updatedAt: serverTimestamp(),
        updatedBy: window.firebaseAuth?.currentUser?.email || null,
      });
      setEditEntryId(null);
      setNotif({ show: true, type: "success", message: "Entry updated." });
    } catch (e) {
      setEditError(e.message || "Failed to update.");
    } finally {
      setTimeout(() => setNotif({ show: false, type: "", message: "" }), 2000);
    }
  }

  async function deleteEntry(entryId) {
    if (!entryId) return;
    if (!window.confirm("Delete this entire journal entry?")) return;
    try {
      await deleteDoc(doc(db, "journalEntries", entryId));
      setNotif({ show: true, type: "success", message: "Entry deleted." });
    } catch (e) {
      setNotif({ show: true, type: "error", message: "Failed to delete: " + e.message });
    } finally {
      setTimeout(() => setNotif({ show: false, type: "", message: "" }), 2000);
    }
  }

  // Only show action buttons once per entry (first visible row in desktop table)
  const seen = new Set();


  return (
    <div className="overflow-x-hidden">
      <h2 className="text-2xl font-bold mb-6">General Journal</h2>

      {notif.show && (
        <div
          className={`mb-4 px-4 py-2 rounded ${
            notif.type === "success"
              ? "bg-green-100 text-green-800 border border-green-300"
              : "bg-red-100 text-red-800 border border-red-300"
          }`}
        >
          {notif.message}
        </div>
      )}

      {/* Filters */}
      <div className="mb-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          className="border rounded px-2 py-2"
          placeholder="Filter by Ref#"
          value={filter.ref}
          onChange={(e) => setFilter((f) => ({ ...f, ref: e.target.value }))}
        />
        <input
          className="border rounded px-2 py-2"
          type="date"
          placeholder="Filter by Date"
          value={filter.date}
          onChange={(e) => setFilter((f) => ({ ...f, date: e.target.value }))}
        />
        <input
          className="border rounded px-2 py-2"
          placeholder="Filter by Account"
          value={filter.account}
          onChange={(e) => setFilter((f) => ({ ...f, account: e.target.value }))}
        />
      </div>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-ink/60">
          View: {grouped ? "Grouped (one row per entry)" : "Lines (two+ rows per entry)"}
        </div>
        <button
          className="btn btn-sm btn-outline"
          onClick={() => setGrouped((v) => !v)}
          title={grouped ? "Show line-level rows" : "Show one row per journal entry"}
        >
          {grouped ? "Switch to Lines View" : "Group by Entry"}
        </button>
      </div>

      {loading ? (
        <div>Loading entries…</div>
      ) : (
        <>
          {/* Desktop table */}
          {!grouped && (
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full border rounded text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="text-left p-2 border-b cursor-pointer"
                    onClick={() => handleSort("refNumber")}
                  >
                    Ref# {sortBy === "refNumber" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th
                    className="text-left p-2 border-b cursor-pointer whitespace-nowrap"
                    onClick={() => handleSort("date")}
                  >
                    Date {sortBy === "date" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th
                    className="text-left p-2 border-b cursor-pointer"
                    onClick={() => handleSort("description")}
                  >
                    Description {sortBy === "description" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th
                    className="text-left p-2 border-b cursor-pointer"
                    onClick={() => handleSort("account")}
                  >
                    Account {sortBy === "account" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-left p-2 border-b">Type</th>
                  <th
                    className="text-right p-2 border-b cursor-pointer"
                    onClick={() => handleSort("debit")}
                  >
                    Debit {sortBy === "debit" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th
                    className="text-right p-2 border-b cursor-pointer"
                    onClick={() => handleSort("credit")}
                  >
                    Credit {sortBy === "credit" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-left p-2 border-b">Memo</th>
                  <th className="text-left p-2 border-b">Created By</th>
                  <th className="text-left p-2 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const firstForEntry = !seen.has(line.entryId);
                  if (firstForEntry) seen.add(line.entryId);

                  return (
                    <tr key={line.entryId + "-" + idx} className="odd:bg-white even:bg-gray-50">
                      <td className="p-2 border-b font-mono">{line.refNumber}</td>
                      <td className="p-2 border-b whitespace-nowrap">{formatD(line.date)}</td>
                      <td className="p-2 border-b whitespace-nowrap">{formatD(line.date)}</td>
                      <td className="p-2 border-b">{line.description}</td>
                      <td className="p-2 border-b">{getAccountName(line.accountId)}</td>
                      <td className="p-2 border-b">{getAccountType(line.accountId)}</td>
                      <td className="p-2 border-b text-right">
                        {line.debit ? fmt(line.debit) : ""}
                      </td>
                      <td className="p-2 border-b text-right">
                        {line.credit ? fmt(line.credit) : ""}
                      </td>
                      <td className="p-2 border-b">{line.memo || ""}</td>
                      <td className="p-2 border-b">{line.createdBy || "-"}</td>
                      <td className="p-2 border-b">
                        {firstForEntry ? (
                          <>
                            <button
                              className="btn btn-sm btn-outline mr-1"
                              onClick={() => openEdit(line.entryId)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => deleteEntry(line.entryId)}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-4 text-gray-500 text-center">
                      No journal entries found.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-gray-100">
                  <td colSpan={5} className="p-2 border-t text-right">
                    Totals:
                  </td>
                  <td className="p-2 border-t text-right">{fmt(totalDebit)}</td>
                  <td className="p-2 border-t text-right">{fmt(totalCredit)}</td>
                  <td colSpan={3} className="p-2 border-t"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          )}

          {/* Grouped (headers-only) desktop table */}
          {grouped && (
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full border rounded text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2 border-b cursor-pointer" onClick={() => handleSort("refNumber")}>
                    Ref# {sortBy === "refNumber" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-left p-2 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort("date")}>
                    Date {sortBy === "date" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-left p-2 border-b cursor-pointer" onClick={() => handleSort("description")}>
                    Description {sortBy === "description" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-left p-2 border-b">Lines</th>
                  <th className="text-right p-2 border-b cursor-pointer" onClick={() => handleSort("debit")}>Debit {sortBy === "debit" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                  <th className="text-right p-2 border-b cursor-pointer" onClick={() => handleSort("credit")}>Credit {sortBy === "credit" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
                  <th className="text-left p-2 border-b">Created By</th>
                  <th className="text-left p-2 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupedSorted.map((row) => (
                  <tr key={row.id} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b font-mono">{row.refNumber}</td>
                    <td className="p-2 border-b whitespace-nowrap">{formatD(row.date)}</td>
                    <td className="p-2 border-b">{row.description}</td>
                    <td className="p-2 border-b">{row.linesCount}</td>
                    <td className="p-2 border-b text-right">{row.debitTotal ? fmt(row.debitTotal) : ""}</td>
                    <td className="p-2 border-b text-right">{row.creditTotal ? fmt(row.creditTotal) : ""}</td>
                    <td className="p-2 border-b">{row.createdBy || "-"}</td>
                    <td className="p-2 border-b">
                      <button className="btn btn-sm btn-outline mr-1" onClick={() => openEdit(row.id)}>Edit</button>
                      <button className="btn btn-sm btn-outline" onClick={() => deleteEntry(row.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {groupedSorted.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-4 text-gray-500 text-center">No journal entries found.</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-gray-100">
                  <td colSpan={4} className="p-2 border-t text-right">Totals:</td>
                  <td className="p-2 border-t text-right">{fmt(groupedTotals.debit)}</td>
                  <td className="p-2 border-t text-right">{fmt(groupedTotals.credit)}</td>
                  <td colSpan={2} className="p-2 border-t"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          )}

          {/* Mobile cards (per entry) */}
          <div className="sm:hidden space-y-4">
            {mobileEntries.length === 0 && (
              <div className="card p-4 text-center text-ink/60">No journal entries found.</div>
            )}
            {mobileEntries.map((entry) => {
              const entryTotalDebit = (entry.lines || []).reduce(
                (s, l) => s + (parseFloat(l.debit) || 0),
                0
              );
              const entryTotalCredit = (entry.lines || []).reduce(
                (s, l) => s + (parseFloat(l.credit) || 0),
                0
              );
              return (
                <div key={entry.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase text-ink/50">Ref#</div>
                      <div className="font-mono">{entry.refNumber || (entry.journalNo ? String(entry.journalNo).padStart(5, "0") : "")}</div>
                      <div className="text-xs uppercase text-ink/50 mt-2">Date</div>
                      <div className="whitespace-nowrap">
                        {formatD(toYMD(entry.date))}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase text-ink/50">Created By</div>
                      <div>{entry.createdBy || "—"}</div>
                    </div>
                  </div>

                  {entry.description && (
                    <div className="mt-3">
                      <div className="text-xs uppercase text-ink/50">Description</div>
                      <div>{entry.description}</div>
                    </div>
                  )}
                  {entry.comments && (
                    <div className="mt-2">
                      <div className="text-xs uppercase text-ink/50">Comments</div>
                      <div>{entry.comments}</div>
                    </div>
                  )}

                  <div className="mt-4 border rounded overflow-hidden">
                    {(entry.lines || []).map((ln, i) => (
                      <div
                        key={i}
                        className={`grid grid-cols-2 gap-2 p-2 text-sm ${
                          i % 2 ? "bg-gray-50" : "bg-white"
                        }`}
                      >
                        <div className="col-span-2 font-medium">{getAccountName(ln.accountId)}</div>
                        <div>
                          <div className="text-xs uppercase text-ink/50">Debit</div>
                          <div className="font-mono">{ln.debit ? fmt(ln.debit) : "—"}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs uppercase text-ink/50">Credit</div>
                          <div className="font-mono">{ln.credit ? fmt(ln.credit) : "—"}</div>
                        </div>
                        {ln.memo && (
                          <div className="col-span-2">
                            <div className="text-xs uppercase text-ink/50">Memo</div>
                            <div>{ln.memo}</div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-2 p-2 bg-gray-100 text-sm font-semibold">
                      <div className="text-right">Totals:</div>
                      <div className="text-right font-mono">
                        {fmt(entryTotalDebit)} / {fmt(entryTotalCredit)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end gap-2">
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(entry.id)}>
                      Edit
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => deleteEntry(entry.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Full Edit Modal */}
      {editEntryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-[880px] max-h-[90vh] overflow-y-auto p-5">
            <div className="text-lg font-semibold mb-3">Edit Journal Entry</div>

            {editError && (
              <div className="mb-3 px-3 py-2 rounded bg-red-100 text-red-800 border border-red-300">
                {editError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium">Date</label>
                <input
                  type="date"
                  className="border rounded px-2 py-1 w-full"
                  value={editForm.date}
                  onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium">Description</label>
                <input
                  type="text"
                  className="border rounded px-2 py-1 w-full"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, description: e.target.value }))
                  }
                  maxLength={160}
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-medium">Comments</label>
                <input
                  type="text"
                  className="border rounded px-2 py-1 w-full"
                  value={editForm.comments}
                  onChange={(e) => setEditForm((f) => ({ ...f, comments: e.target.value }))}
                  maxLength={200}
                />
              </div>
            </div>

            <table className="min-w-full border rounded text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 border-b">Account</th>
                  <th className="p-2 border-b">Debit</th>
                  <th className="p-2 border-b">Credit</th>
                  <th className="p-2 border-b">Memo</th>
                  <th className="p-2 border-b"></th>
                </tr>
              </thead>
              <tbody>
                {editForm.lines.map((ln, idx) => (
                  <tr key={idx} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b">
                      <select
                        className="border rounded px-2 py-1 w-full"
                        value={ln.accountId}
                        onChange={(e) => setLine(idx, { accountId: e.target.value })}
                        required
                      >
                        <option value="">Select Account</option>
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} - {acc.main}
                            {acc.individual ? " / " + acc.individual : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 border-b">
                      <input
                        className="border rounded px-2 py-1 w-full text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={ln.debit}
                        onChange={(e) => setLine(idx, { debit: e.target.value })}
                        onFocus={() => {
                          if (parseFloat(ln.credit) > 0) setLine(idx, { credit: "" });
                        }}
                      />
                    </td>
                    <td className="p-2 border-b">
                      <input
                        className="border rounded px-2 py-1 w-full text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={ln.credit}
                        onChange={(e) => setLine(idx, { credit: e.target.value })}
                        onFocus={() => {
                          if (parseFloat(ln.debit) > 0) setLine(idx, { debit: "" });
                        }}
                      />
                    </td>
                    <td className="p-2 border-b">
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={ln.memo}
                        onChange={(e) => setLine(idx, { memo: e.target.value })}
                      />
                    </td>
                    <td className="p-2 border-b text-center">
                      <button
                        type="button"
                        className="text-red-600 px-2"
                        onClick={() => removeLine(idx)}
                        disabled={editForm.lines.length <= 1}
                        title="Remove line"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}

                {editForm.lines.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-3 text-center text-gray-500">
                      No lines. Add one below.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="p-2 border-t text-right">Totals:</td>
                  <td className="p-2 border-t text-right">{fmt(editDebit)}</td>
                  <td className="p-2 border-t text-right">{fmt(editCredit)}</td>
                  <td className="p-2 border-t" colSpan={2}>
                    {isBalanced ? (
                      <span className="text-green-700">Balanced</span>
                    ) : (
                      <span className="text-red-700">Not balanced</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                className="px-3 py-1 rounded bg-gray-200"
                onClick={addLine}
              >
                + Add Line
              </button>

              <div className="flex gap-2">
                <button
                  className="px-3 py-1 rounded bg-gray-200"
                  onClick={() => setEditEntryId(null)}
                >
                  Cancel
                </button>
                <button
                  className="px-3 py-1 rounded bg-green-600 text-white"
                  onClick={saveEdit}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
