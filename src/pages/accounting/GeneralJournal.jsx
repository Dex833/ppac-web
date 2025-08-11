import React, { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
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

// Helper to get accounts for mapping accountId to code/name
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
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ ref: "", date: "", account: "" });
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const accounts = useAccounts();

  // Edit modal state
  const [editEntryId, setEditEntryId] = useState(null);
  const [editForm, setEditForm] = useState({
    date: "",
    description: "",
    comments: "",
  });
  const [notif, setNotif] = useState({ show: false, type: "", message: "" });

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "journalEntries"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  function getAccount(accountId) {
    return accounts.find((a) => a.id === accountId);
  }
  function getAccountName(accountId) {
    const acc = getAccount(accountId);
    if (!acc) return accountId;
    return `${acc.code} - ${acc.main}${
      acc.individual ? " / " + acc.individual : ""
    }`;
  }
  function getAccountType(accountId) {
    const acc = getAccount(accountId);
    return acc ? acc.type : "";
  }

  // Sorting
  function handleSort(field) {
    if (sortBy === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  }

  // Flatten and filter lines
  let lines = entries
    .filter((e) => {
      if (filter.ref && !(e.refNumber || "").includes(filter.ref)) return false;
      if (filter.date && e.date !== filter.date) return false;
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
    })
    .flatMap((entry) =>
      (entry.lines || []).map((line, idx) => ({
        ...line,
        entryId: entry.id,
        refNumber: entry.refNumber,
        date: entry.date,
        description: entry.description,
        comments: entry.comments,
        createdBy: entry.createdBy,
        updatedBy: entry.updatedBy,
        updatedAt: entry.updatedAt,
        approvalStatus: entry.approvalStatus,
        attachments: entry.attachments,
      }))
    );

  // Sorting logic for rows
  lines = lines.sort((a, b) => {
    let v1 = a[sortBy],
      v2 = b[sortBy];
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

  // Running totals
  const totalDebit = lines.reduce(
    (sum, l) => sum + (parseFloat(l.debit) || 0),
    0
  );
  const totalCredit = lines.reduce(
    (sum, l) => sum + (parseFloat(l.credit) || 0),
    0
  );

  // ---- Edit/Delete actions ----
  function openEdit(entryId) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    setEditEntryId(entryId);
    setEditForm({
      date: entry.date || "",
      description: entry.description || "",
      comments: entry.comments || "",
    });
  }

  async function saveEdit() {
    if (!editEntryId) return;
    try {
      await updateDoc(doc(db, "journalEntries", editEntryId), {
        date: editForm.date || "",
        description: editForm.description || "",
        comments: editForm.comments || "",
        updatedAt: serverTimestamp(),
        updatedBy: window.firebaseAuth?.currentUser?.email || null,
      });
      setEditEntryId(null);
      setNotif({ show: true, type: "success", message: "Entry updated." });
    } catch (e) {
      setNotif({
        show: true,
        type: "error",
        message: "Failed to update: " + e.message,
      });
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
      setNotif({
        show: true,
        type: "error",
        message: "Failed to delete: " + e.message,
      });
    } finally {
      setTimeout(() => setNotif({ show: false, type: "", message: "" }), 2000);
    }
  }

  // Only show the action buttons once per entry (on its first visible row)
  const seen = new Set();

  return (
    <div className="overflow-x-auto">
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

      <div className="mb-4 flex gap-2 flex-wrap">
        <input
          className="border rounded px-2 py-1"
          placeholder="Filter by Ref#"
          value={filter.ref}
          onChange={(e) => setFilter((f) => ({ ...f, ref: e.target.value }))}
        />
        <input
          className="border rounded px-2 py-1"
          type="date"
          placeholder="Filter by Date"
          value={filter.date}
          onChange={(e) => setFilter((f) => ({ ...f, date: e.target.value }))}
        />
        <input
          className="border rounded px-2 py-1"
          placeholder="Filter by Account"
          value={filter.account}
          onChange={(e) =>
            setFilter((f) => ({ ...f, account: e.target.value }))
          }
        />
      </div>

      {loading ? (
        <div>Loading entries…</div>
      ) : (
        <div className="overflow-x-auto">
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
                  className="text-left p-2 border-b cursor-pointer"
                  onClick={() => handleSort("date")}
                >
                  Date {sortBy === "date" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th
                  className="text-left p-2 border-b cursor-pointer"
                  onClick={() => handleSort("description")}
                >
                  Description{" "}
                  {sortBy === "description" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th
                  className="text-left p-2 border-b cursor-pointer"
                  onClick={() => handleSort("account")}
                >
                  Account {sortBy === "account" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="text-left p-2 border-b">Type</th>
                <th
                  className="text-left p-2 border-b cursor-pointer"
                  onClick={() => handleSort("debit")}
                >
                  Debit {sortBy === "debit" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th
                  className="text-left p-2 border-b cursor-pointer"
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
                    <td className="p-2 border-b">{line.date}</td>
                    <td className="p-2 border-b">{line.description}</td>
                    <td className="p-2 border-b">{getAccountName(line.accountId)}</td>
                    <td className="p-2 border-b">{getAccountType(line.accountId)}</td>
                    <td className="p-2 border-b text-right">
                      {line.debit
                        ? Number(line.debit).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : ""}
                    </td>
                    <td className="p-2 border-b text-right">
                      {line.credit
                        ? Number(line.credit).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : ""}
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
                <td className="p-2 border-t text-right">
                  {totalDebit.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="p-2 border-t text-right">
                  {totalCredit.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td colSpan={3} className="p-2 border-t"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editEntryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg w-[420px] p-4">
            <div className="text-lg font-semibold mb-3">Edit Journal Entry</div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium">Date</label>
                <input
                  type="date"
                  className="border rounded px-2 py-1 w-full"
                  value={editForm.date}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, date: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Description</label>
                <input
                  type="text"
                  className="border rounded px-2 py-1 w-full"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Short description"
                  maxLength={120}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Comments</label>
                <input
                  type="text"
                  className="border rounded px-2 py-1 w-full"
                  value={editForm.comments}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, comments: e.target.value }))
                  }
                  maxLength={200}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
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
      )}
    </div>
  );
}