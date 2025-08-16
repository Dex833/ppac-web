// src/pages/accounting/JournalEntries.jsx
import React, { useEffect, useState, useRef } from "react";
import SafeText from "@/components/SafeText";
import { formatD, formatDT } from "@/utils/dates";
import ErrorBoundary from "@/components/ErrorBoundary";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  limit,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { useAuth } from "../../AuthContext";
import useUserProfile from "../../hooks/useUserProfile";
// removed backfill callables

// ----- Accounts for dropdown -----
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

export default function JournalEntries() {
  const accounts = useAccounts();
  const { user } = useAuth();
  const { profile } = useUserProfile();

  const roles = Array.isArray(profile?.roles)
    ? profile.roles
    : profile?.role
    ? [profile.role]
    : [];
  const isAdmin = roles.includes("admin");

  const createdByName =
    profile?.displayName ||
    user?.displayName ||
    profile?.email ||
    user?.email ||
    "Unknown";

  // ----- New entry form -----
  const [form, setForm] = useState({
    refNumber: "",
    date: new Date().toISOString().slice(0, 10),
    description: "",
    comments: "",
    lines: [{ accountId: "", debit: "", credit: "", memo: "" }],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastRef, setLastRef] = useState(0);
  const [notif, setNotif] = useState({ show: false, type: "", message: "" });

  // list / filters
  const [entries, setEntries] = useState([]);
  const [entryLoading, setEntryLoading] = useState(true);
  const [filter, setFilter] = useState({ ref: "", date: "", account: "" });

  // edit modal
  const [editEntryId, setEditEntryId] = useState(null);
  const [editEntryForm, setEditEntryForm] = useState({
    date: "",
    description: "",
    comments: "",
  });

  // admin: assign creator modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEntry, setAssignEntry] = useState(null);
  const [assignName, setAssignName] = useState("");

  // backfill UI removed

  // dirty guard
  const [isDirty, setIsDirty] = useState(false);
  const initialForm = useRef(null);

  // ----- Load latest entries (live) -----
  useEffect(() => {
    setEntryLoading(true);
    const qJE = query(
      collection(db, "journalEntries"),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const unsub = onSnapshot(qJE, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setEntryLoading(false);
    });
    return () => unsub();
  }, []);

  // ----- Last ref number (top 1) -----
  useEffect(() => {
    async function fetchLastRef() {
      const qJE = query(
        collection(db, "journalEntries"),
        orderBy("refNumber", "desc"),
        limit(1)
      );
      const snap = await getDocs(qJE);
      if (!snap.empty) {
        setLastRef(Number(snap.docs[0].data().refNumber) || 0);
      }
    }
    fetchLastRef();
  }, []);

  // auto-increment ref
  useEffect(() => {
    setForm((f) => ({
      ...f,
      refNumber: (lastRef + 1).toString().padStart(5, "0"),
    }));
  }, [lastRef]);

  // dirty tracking
  useEffect(() => {
    initialForm.current = JSON.stringify(form);
  }, []); // init only
  useEffect(() => {
    if (initialForm.current && JSON.stringify(form) !== initialForm.current) {
      setIsDirty(true);
    }
  }, [form]);
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue =
          "Are you sure you want to leave this page? Unsaved changes will be lost.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // ----- Form helpers -----
  function handleLineChange(idx, field, value) {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((line, i) =>
        i === idx ? { ...line, [field]: value } : line
      ),
    }));
  }
  function addLine() {
    setForm((f) => ({
      ...f,
      lines: [...f.lines, { accountId: "", debit: "", credit: "", memo: "" }],
    }));
  }
  function removeLine(idx) {
    setForm((f) => ({
      ...f,
      lines:
        f.lines.length > 1 ? f.lines.filter((_, i) => i !== idx) : f.lines,
    }));
  }
  function total(field) {
    return form.lines.reduce(
      (sum, l) => sum + (parseFloat(l[field]) || 0),
      0
    );
  }

  // ----- Create entry -----
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.date || !form.refNumber)
      return setError("Date and Reference Number are required.");
    if (form.lines.some((l) => !l.accountId || (!l.debit && !l.credit)))
      return setError(
        "All lines must have an account and either debit or credit."
      );
    if (total("debit") !== total("credit"))
      return setError("Debits and credits must balance.");

    setSaving(true);
    try {
      await addDoc(collection(db, "journalEntries"), {
        refNumber: form.refNumber,
        date: form.date,
        description: form.description,
        comments: form.comments,
        lines: form.lines.map((l) => ({
          ...l,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
        })),
        createdAt: serverTimestamp(),
        createdById: user?.uid || "",
        createdBy: createdByName,
      });

      setForm({
        refNumber: (parseInt(form.refNumber, 10) + 1)
          .toString()
          .padStart(5, "0"),
        date: new Date().toISOString().slice(0, 10),
        description: "",
        comments: "",
        lines: [{ accountId: "", debit: "", credit: "", memo: "" }],
      });
      setLastRef((r) => r + 1);
      setIsDirty(false);
      setNotif({
        show: true,
        type: "success",
        message: "Journal entry saved successfully!",
      });
    } catch (e) {
      setError("Failed to save: " + e.message);
      setNotif({
        show: true,
        type: "error",
        message: "Failed to save: " + e.message,
      });
    } finally {
      setSaving(false);
      setTimeout(() => setNotif({ show: false, type: "", message: "" }), 2500);
    }
  }

  // ----- Edit / Delete -----
  function startEdit(entry) {
    setEditEntryId(entry.id);
    setEditEntryForm({
      date: entry.date || "",
      description: entry.description || "",
      comments: entry.comments || "",
    });
  }
  async function saveEdit() {
    if (!editEntryId) return;
    try {
      await updateDoc(doc(db, "journalEntries", editEntryId), {
        date: editEntryForm.date || "",
        description: editEntryForm.description || "",
        comments: editEntryForm.comments || "",
        updatedAt: serverTimestamp(),
        updatedById: user?.uid || "",
        updatedBy: createdByName,
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
  async function deleteEntry(id) {
    if (!id) return;
    if (!window.confirm("Delete this journal entry?")) return;
    try {
      await deleteDoc(doc(db, "journalEntries", id));
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

  // ----- Filters (client-side on last 10) -----
  const visibleEntries = entries.filter((e) => {
    const refStr = e.refNumber || (e.journalNo ? String(e.journalNo).padStart(5, "0") : "");
    if (filter.ref && !refStr.includes(filter.ref)) return false;
    if (filter.date && e.date !== filter.date) return false;
    if (
      filter.account &&
      !e.lines?.some((l) => {
        const acc = accounts.find((a) => a.id === l.accountId);
        const name =
          (acc?.main || "") + (acc?.individual ? ` ${acc.individual}` : "");
        return name.toLowerCase().includes(filter.account.toLowerCase());
      })
    )
      return false;
    return true;
  });

  // removed backfill handlers

  // ----- Admin: assign creator per row -----
  function openAssignCreator(entry) {
    setAssignEntry(entry);
    setAssignName(entry.createdBy || entry.updatedBy || "");
    setAssignOpen(true);
  }
  async function saveAssignedCreator() {
    if (!assignEntry?.id) return;
    try {
      await updateDoc(doc(db, "journalEntries", assignEntry.id), {
        createdBy: assignName.trim() || "Unknown",
        createdById: assignEntry.createdById || "",
        updatedAt: serverTimestamp(),
        updatedById: user?.uid || "",
        updatedBy: createdByName,
      });
      setAssignOpen(false);
      setNotif({ show: true, type: "success", message: "Creator updated." });
    } catch (e) {
      setNotif({
        show: true,
        type: "error",
        message: "Failed to update creator: " + e.message,
      });
    } finally {
      setTimeout(() => setNotif({ show: false, type: "", message: "" }), 2000);
    }
  }

  return (
    <ErrorBoundary>
    <div className="max-w-4xl">
      <h3 className="text-xl font-semibold mb-4">New Journal Entry</h3>

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

      <form
        id="journal-form"
        className="space-y-4 bg-white p-4 rounded shadow mb-8"
        onSubmit={handleSubmit}
      >
        {error && <div className="text-red-600 font-medium">{error}</div>}

        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-sm font-medium">Ref#</label>
            <input
              className="border rounded px-2 py-1 w-full font-mono bg-gray-100"
              value={form.refNumber}
              readOnly
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-sm font-medium">Date</label>
            <input
              className="border rounded px-2 py-1 w-full"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Description</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Comments</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={form.comments}
            onChange={(e) =>
              setForm((f) => ({ ...f, comments: e.target.value }))
            }
          />
        </div>

        {/* -------- Lines: no horizontal scroll -------- */}
        <div>
          <label className="block text-sm font-medium mb-2">Lines</label>

          {/* Mobile / small: stacked cards (no table, no scroll) */}
          <div className="md:hidden space-y-3">
            {form.lines.map((line, idx) => (
              <div
                key={idx}
                className="rounded border border-gray-200 bg-white p-3"
              >
                <div className="mb-2">
                  <label className="block text-xs text-gray-600">Account</label>
                  <select
                    className="w-full border rounded px-2 py-2 text-sm"
                    value={line.accountId}
                    onChange={(e) =>
                      handleLineChange(idx, "accountId", e.target.value)
                    }
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
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600">Debit</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      className="w-full border rounded px-2 py-2 text-right font-mono text-sm"
                      value={line.debit}
                      onChange={(e) =>
                        handleLineChange(idx, "debit", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Credit</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      className="w-full border rounded px-2 py-2 text-right font-mono text-sm"
                      value={line.credit}
                      onChange={(e) =>
                        handleLineChange(idx, "credit", e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="mt-2">
                  <label className="block text-xs text-gray-600">Memo</label>
                  <input
                    className="w-full border rounded px-2 py-2 text-sm"
                    value={line.memo}
                    onChange={(e) =>
                      handleLineChange(idx, "memo", e.target.value)
                    }
                  />
                </div>

                <div className="mt-2 text-right">
                  <button
                    type="button"
                    className="text-red-600 px-2"
                    onClick={() => removeLine(idx)}
                    disabled={form.lines.length === 1}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* md+ : compact table that fits container (no -mx, no min-w) */}
          <div className="hidden md:block">
            <table className="w-full table-fixed border rounded text-sm">
              <colgroup>
                <col className="w-[40%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[25%]" />
                <col className="w-[5%]" />
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 border-b text-left">Account</th>
                  <th className="p-2 border-b text-right">Debit</th>
                  <th className="p-2 border-b text-right">Credit</th>
                  <th className="p-2 border-b text-left">Memo</th>
                  <th className="p-2 border-b"></th>
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, idx) => (
                  <tr key={idx} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b">
                      <select
                        className="w-full border rounded px-2 py-2 text-sm"
                        value={line.accountId}
                        onChange={(e) =>
                          handleLineChange(idx, "accountId", e.target.value)
                        }
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
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        className="w-full border rounded px-2 py-2 text-right font-mono text-sm"
                        value={line.debit}
                        onChange={(e) =>
                          handleLineChange(idx, "debit", e.target.value)
                        }
                      />
                    </td>
                    <td className="p-2 border-b">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        className="w-full border rounded px-2 py-2 text-right font-mono text-sm"
                        value={line.credit}
                        onChange={(e) =>
                          handleLineChange(idx, "credit", e.target.value)
                        }
                      />
                    </td>
                    <td className="p-2 border-b">
                      <input
                        className="w-full border rounded px-2 py-2 text-sm"
                        value={line.memo}
                        onChange={(e) =>
                          handleLineChange(idx, "memo", e.target.value)
                        }
                      />
                    </td>
                    <td className="p-2 border-b text-center">
                      <button
                        type="button"
                        className="text-red-600 px-2"
                        onClick={() => removeLine(idx)}
                        disabled={form.lines.length === 1}
                        title="Remove line"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className="mt-2 px-3 py-2 bg-gray-200 rounded w-full md:w-auto"
            onClick={addLine}
          >
            + Add Line
          </button>
        </div>

        <div className="flex gap-8 mt-2">
          <div>
            Total Debit:{" "}
            <span className="font-mono">
              {total("debit").toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div>
            Total Credit:{" "}
            <span className="font-mono">
              {total("credit").toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* Mobile save directly under totals */}
        <div className="mt-3 sm:hidden">
          <button
            type="submit"
            className="w-full bg-green-600 text-white px-6 py-3 rounded font-semibold"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Entry"}
          </button>
        </div>

        {/* Desktop save */}
        <div className="hidden sm:inline-block">
          <button
            type="submit"
            className="bg-green-600 text-white px-6 py-2 rounded font-semibold"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Entry"}
          </button>
        </div>
      </form>

      <div className="flex items-center justify-between mt-10 mb-4">
        <h3 className="text-xl font-semibold">Journal Entry History (latest 10)</h3>
  {/* Backfill buttons removed */}
      </div>

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
          onChange={(e) => setFilter((f) => ({ ...f, account: e.target.value }))}
        />
      </div>

      {entryLoading ? (
        <div>Loading entries…</div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {visibleEntries.map((entry) => {
              const debit =
                entry.lines?.reduce((s, l) => s + (+l.debit || 0), 0) || 0;
              const credit =
                entry.lines?.reduce((s, l) => s + (+l.credit || 0), 0) || 0;
              return (
                <div
                  key={entry.id}
                  className="rounded border border-gray-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-sm">Ref {entry.refNumber || (entry.journalNo ? String(entry.journalNo).padStart(5, "0") : "")}</div>
                    <div className="text-xs text-ink/60">{formatD(entry.date)}</div>
                  </div>
                  <div className="mt-1 text-sm">{entry.description}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      Debit:{" "}
                      <span className="font-mono">
                        {debit.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div>
                      Credit:{" "}
                      <span className="font-mono">
                        {credit.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-ink/60">
                    Created by: {entry.createdBy || "—"}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => startEdit(entry)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => deleteEntry(entry.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table (no negative margins, no min-w) */}
          <div className="hidden sm:block">
            <table className="w-full table-fixed border rounded text-sm">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[24%]" />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2 border-b">Ref#</th>
                  <th className="text-left p-2 border-b">Date</th>
                  <th className="text-left p-2 border-b">Description</th>
                  <th className="text-left p-2 border-b">Type</th>
                  <th className="text-left p-2 border-b">Total Debit</th>
                  <th className="text-left p-2 border-b">Total Credit</th>
                  <th className="text-left p-2 border-b">Created By</th>
                  <th className="text-left p-2 border-b">Posted</th>
                  <th className="text-left p-2 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((entry) => {
                  const friendlyCreator =
                    entry.createdBy ??
                    entry.createdByName ??
                    entry.updatedBy ??
                    "Unknown";
                  const totalD = (entry.lines || []).reduce(
                    (s, l) => s + (parseFloat(l.debit) || 0),
                    0
                  );
                  const totalC = (entry.lines || []).reduce(
                    (s, l) => s + (parseFloat(l.credit) || 0),
                    0
                  );

                return (
                  <tr key={entry.id} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b font-mono">{entry.refNumber || (entry.journalNo ? String(entry.journalNo).padStart(5, "0") : "")}</td>
                    <td className="p-2 border-b whitespace-nowrap">{formatD(entry.date)}</td>
                    <td className="p-2 border-b">{entry.description}</td>
                    <td className="p-2 border-b">{entry.type || "general"}</td>
                    <td className="p-2 border-b">
                      {totalD.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="p-2 border-b">
                      {totalC.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="p-2 border-b">{friendlyCreator}</td>
                    <td className="p-2 border-b whitespace-nowrap">{formatDT(entry.postedAt)}</td>
                    <td className="p-2 border-b">
                      <button
                        className="btn btn-sm btn-outline mr-1"
                        onClick={() => startEdit(entry)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => deleteEntry(entry.id)}
                      >
                        Delete
                      </button>
                      {isAdmin && (
                        <button
                          className="btn btn-sm btn-outline ml-1"
                          onClick={() => openAssignCreator(entry)}
                          title="Admin: set/override creator"
                        >
                          Set Creator
                        </button>
                      )}
                    </td>
                  </tr>
                );
                })}
                {visibleEntries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-gray-500 text-center">
                      No journal entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editEntryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3">
          <div className="bg-white rounded-xl shadow-lg w-[min(480px,94vw)] p-4">
            <div className="text-lg font-semibold mb-3">Edit Journal Entry</div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium">Date</label>
                <input
                  type="date"
                  className="border rounded px-2 py-1 w-full"
                  value={editEntryForm.date}
                  onChange={(e) =>
                    setEditEntryForm((f) => ({ ...f, date: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Description</label>
                <input
                  type="text"
                  className="border rounded px-2 py-1 w-full"
                  value={editEntryForm.description}
                  onChange={(e) =>
                    setEditEntryForm((f) => ({ ...f, description: e.target.value }))
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
                  value={editEntryForm.comments}
                  onChange={(e) =>
                    setEditEntryForm((f) => ({ ...f, comments: e.target.value }))
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

      {/* Assign Creator Modal (admin) */}
      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3">
          <div className="bg-white rounded-xl shadow-lg w-[min(480px,94vw)] p-4">
            <div className="text-lg font-semibold mb-3">Set Creator</div>
            <label className="block text-sm mb-2">Name or email</label>
            <input
              className="border rounded px-2 py-1 w-full"
              value={assignName}
              onChange={(e) => setAssignName(e.target.value)}
              placeholder="e.g. Dexter Acantilado"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-1 rounded bg-gray-200"
                onClick={() => setAssignOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded bg-green-600 text-white"
                onClick={saveAssignedCreator}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
  </div>
  </ErrorBoundary>
  );
}
