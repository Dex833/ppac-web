import React, { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot
} from "firebase/firestore";

// Helper to get accounts for dropdown
function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const qAcc = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(qAcc, (snap) => {
      setAccounts(snap.docs.filter(d => !d.data().archived).map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  return accounts;
}

export default function JournalEntries() {
  const accounts = useAccounts();
  const [form, setForm] = useState({
    refNumber: "",
    date: new Date().toISOString().slice(0, 10),
    description: "",
    comments: "",
    lines: [
      { accountId: "", debit: "", credit: "", memo: "" }
    ],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastRef, setLastRef] = useState(0);
  const [notif, setNotif] = useState({ show: false, type: "", message: "" });

  // Journal entry list state
  const [entries, setEntries] = useState([]);
  const [entryLoading, setEntryLoading] = useState(true);
  const [filter, setFilter] = useState({ ref: "", date: "", account: "" });
  const [editEntryId, setEditEntryId] = useState(null);
  const [editEntryForm, setEditEntryForm] = useState(null);

  // Fetch all journal entries (simple, no pagination yet)
  useEffect(() => {
    setEntryLoading(true);
    const qJE = query(collection(db, "journalEntries"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qJE, (snap) => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setEntryLoading(false);
    });
    return () => unsub();
  }, []);

  // Get last reference number for auto-increment
  useEffect(() => {
    async function fetchLastRef() {
      const qJE = query(collection(db, "journalEntries"), orderBy("refNumber", "desc"));
      const snap = await getDocs(qJE);
      if (!snap.empty) {
        setLastRef(Number(snap.docs[0].data().refNumber) || 0);
      }
    }
    fetchLastRef();
  }, []);

  // Set auto-incremented refNumber on mount or when lastRef changes
  useEffect(() => {
    setForm(f => ({ ...f, refNumber: (lastRef + 1).toString().padStart(5, "0") }));
  }, [lastRef]);

  function handleLineChange(idx, field, value) {
    setForm(f => ({
      ...f,
      lines: f.lines.map((line, i) => i === idx ? { ...line, [field]: value } : line)
    }));
  }

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, { accountId: "", debit: "", credit: "", memo: "" }] }));
  }

  function removeLine(idx) {
    setForm(f => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((_, i) => i !== idx) : f.lines }));
  }

  function total(field) {
    return form.lines.reduce((sum, l) => sum + (parseFloat(l[field]) || 0), 0);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    // Validation
    if (!form.date || !form.refNumber) return setError("Date and Reference Number are required.");
    if (form.lines.some(l => !l.accountId || (!l.debit && !l.credit))) return setError("All lines must have an account and either debit or credit.");
    if (total("debit") !== total("credit")) return setError("Debits and credits must balance.");
    setSaving(true);
    try {
      await addDoc(collection(db, "journalEntries"), {
        ...form,
        refNumber: form.refNumber,
        date: form.date,
        description: form.description,
        comments: form.comments,
        lines: form.lines.map(l => ({
          ...l,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
        })),
        createdAt: new Date(),
      });
      setForm({
        refNumber: (parseInt(form.refNumber) + 1).toString().padStart(5, "0"),
        date: new Date().toISOString().slice(0, 10),
        description: "",
        comments: "",
        lines: [{ accountId: "", debit: "", credit: "", memo: "" }],
      });
      setLastRef(r => r + 1);
      setNotif({ show: true, type: "success", message: "Journal entry saved successfully!" });
    } catch (e) {
      setError("Failed to save: " + e.message);
      setNotif({ show: true, type: "error", message: "Failed to save: " + e.message });
    } finally {
      setSaving(false);
      setTimeout(() => setNotif({ show: false, type: "", message: "" }), 2500);
    }
  }

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">New Journal Entry</h3>
      {notif.show && (
        <div className={`mb-4 px-4 py-2 rounded ${notif.type === "success" ? "bg-green-100 text-green-800 border border-green-300" : "bg-red-100 text-red-800 border border-red-300"}`}>
          {notif.message}
        </div>
      )}
      <form className="space-y-4 bg-white p-4 rounded shadow max-w-3xl mb-8" onSubmit={handleSubmit}>
        {error && <div className="text-red-600 font-medium">{error}</div>}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[120px]">
            <label className="block text-sm font-medium">Ref#</label>
            <input className="border rounded px-2 py-1 w-full font-mono bg-gray-100" value={form.refNumber} readOnly />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-sm font-medium">Date</label>
            <input className="border rounded px-2 py-1 w-full" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Description</label>
          <input className="border rounded px-2 py-1 w-full" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
        </div>
        <div>
          <label className="block text-sm font-medium">Comments</label>
          <input className="border rounded px-2 py-1 w-full" value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Lines</label>
          <table className="min-w-full border rounded">
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
              {form.lines.map((line, idx) => (
                <tr key={idx}>
                  <td className="p-2 border-b">
                    <select className="border rounded px-2 py-1 w-full" value={line.accountId} onChange={e => handleLineChange(idx, "accountId", e.target.value)} required>
                      <option value="">Select Account</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.code} - {acc.main} {acc.individual ? "/ " + acc.individual : ""}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 border-b">
                    <input className="border rounded px-2 py-1 w-full text-right" type="number" min="0" step="0.01" value={line.debit} onChange={e => handleLineChange(idx, "debit", e.target.value)} />
                  </td>
                  <td className="p-2 border-b">
                    <input className="border rounded px-2 py-1 w-full text-right" type="number" min="0" step="0.01" value={line.credit} onChange={e => handleLineChange(idx, "credit", e.target.value)} />
                  </td>
                  <td className="p-2 border-b">
                    <input className="border rounded px-2 py-1 w-full" value={line.memo} onChange={e => handleLineChange(idx, "memo", e.target.value)} />
                  </td>
                  <td className="p-2 border-b">
                    <button type="button" className="text-red-500 px-2" onClick={() => removeLine(idx)} disabled={form.lines.length === 1}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="mt-2 px-3 py-1 bg-gray-200 rounded" onClick={addLine}>+ Add Line</button>
        </div>
        <div className="flex gap-8 mt-2">
          <div>Total Debit: <span className="font-mono">{total("debit").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
          <div>Total Credit: <span className="font-mono">{total("credit").toFixed(2)}</span></div>
        </div>
        <div>
          <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded font-semibold" disabled={saving}>{saving ? "Saving..." : "Save Entry"}</button>
        </div>
      </form>

      <h3 className="text-xl font-semibold mt-10 mb-4">Journal Entry History</h3>
      <div className="mb-4 flex gap-2 flex-wrap">
        <input className="border rounded px-2 py-1" placeholder="Filter by Ref#" value={filter.ref} onChange={e => setFilter(f => ({ ...f, ref: e.target.value }))} />
        <input className="border rounded px-2 py-1" type="date" placeholder="Filter by Date" value={filter.date} onChange={e => setFilter(f => ({ ...f, date: e.target.value }))} />
        <input className="border rounded px-2 py-1" placeholder="Filter by Account" value={filter.account} onChange={e => setFilter(f => ({ ...f, account: e.target.value }))} />
      </div>
      {entryLoading ? (
        <div>Loading entries…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border rounded">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2 border-b">Ref#</th>
                <th className="text-left p-2 border-b">Date</th>
                <th className="text-left p-2 border-b">Description</th>
                <th className="text-left p-2 border-b">Total Debit</th>
                <th className="text-left p-2 border-b">Total Credit</th>
                <th className="text-left p-2 border-b">Created By</th>
                <th className="text-left p-2 border-b">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.filter(e => {
                if (filter.ref && !e.refNumber.includes(filter.ref)) return false;
                if (filter.date && e.date !== filter.date) return false;
                if (filter.account && !e.lines.some(l => {
                  const acc = accounts.find(a => a.id === l.accountId);
                  return acc && (acc.main + acc.individual).toLowerCase().includes(filter.account.toLowerCase());
                })) return false;
                return true;
              }).map(entry => (
                <tr key={entry.id} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border-b font-mono">{entry.refNumber}</td>
                  <td className="p-2 border-b">{entry.date}</td>
                  <td className="p-2 border-b">{entry.description}</td>
                  <td className="p-2 border-b">{entry.lines.reduce((sum, l) => sum + (l.debit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="p-2 border-b">{entry.lines.reduce((sum, l) => sum + (l.credit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="p-2 border-b">{entry.createdBy || "-"}</td>
                  <td className="p-2 border-b">
                    {/* Edit/Delete buttons (to be implemented) */}
                    <button className="btn btn-sm btn-outline mr-1" disabled>Edit</button>
                    <button className="btn btn-sm btn-outline" disabled>Delete</button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-gray-500 text-center">No journal entries found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
