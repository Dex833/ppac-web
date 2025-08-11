
import React, { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy
} from "firebase/firestore";


const ACCOUNT_TYPES = [
  "Asset",
  "Liability",
  "Equity",
  "Income",
  "Expense",
];



export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ main: "", individual: "", type: "Asset" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(q, (snap) => {
      setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Helper to get prefix for type
  function getTypePrefix(type) {
    switch (type) {
      case "Asset": return 1000;
      case "Liability": return 2000;
      case "Equity": return 3000;
      case "Income": return 4000;
      case "Expense": return 5000;
      default: return 9000;
    }
  }

  function getNextCode(type) {
    const prefix = getTypePrefix(type);
    // Filter accounts of this type, get max code
    const codes = accounts
      .filter(a => a.type === type && typeof a.code === "number")
      .map(a => a.code)
      .filter(c => c >= prefix && c < prefix + 1000);
    if (codes.length === 0) return prefix + 1;
    return Math.max(...codes) + 1;
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.main.trim() || !form.individual.trim()) return;
    setSaving(true);
    try {
      const code = getNextCode(form.type);
      await addDoc(collection(db, "accounts"), {
        code,
        main: form.main.trim(),
        individual: form.individual.trim(),
        type: form.type,
      });
      setForm({ main: "", individual: "", type: "Asset" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this account?")) return;
    await deleteDoc(doc(db, "accounts", id));
  }

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Chart of Accounts</h3>
      <form className="flex flex-wrap gap-2 mb-6" onSubmit={handleAdd}>
        <input
          className="border rounded px-2 py-1 w-40"
          placeholder="Main Account"
          value={form.main}
          onChange={e => setForm(f => ({ ...f, main: e.target.value }))}
          required
        />
        <input
          className="border rounded px-2 py-1 w-48"
          placeholder="Individual Account"
          value={form.individual}
          onChange={e => setForm(f => ({ ...f, individual: e.target.value }))}
          required
        />
        <select
          className="border rounded px-2 py-1"
          value={form.type}
          onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
        >
          {ACCOUNT_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving}
        >
          {saving ? "Adding…" : "Add Account"}
        </button>
      </form>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <table className="min-w-full border rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">Code</th>
              <th className="text-left p-2 border-b">Main Account</th>
              <th className="text-left p-2 border-b">Individual Account</th>
              <th className="text-left p-2 border-b">Type</th>
              <th className="text-left p-2 border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(acc => (
              <tr key={acc.id} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b font-mono">{acc.code}</td>
                <td className="p-2 border-b">{acc.main}</td>
                <td className="p-2 border-b">{acc.individual}</td>
                <td className="p-2 border-b">{acc.type}</td>
                <td className="p-2 border-b">
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => handleDelete(acc.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-gray-500 text-center">No accounts yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
