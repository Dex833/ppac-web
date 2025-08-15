import React, { useEffect, useState } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AdminProducts() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", sku: "", price: "", imageUrl: "", active: true });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("name"));
    const unsub = onSnapshot(q, (s) => {
      setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  async function addProduct(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await addDoc(collection(db, "products"), {
        name: form.name.trim(),
        sku: form.sku.trim(),
        price: Number(form.price || 0),
        imageUrl: form.imageUrl.trim() || "",
        active: !!form.active,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm({ name: "", sku: "", price: "", imageUrl: "", active: true });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(id, active) {
    await updateDoc(doc(db, "products", id), { active: !active, updatedAt: serverTimestamp() });
  }

  async function remove(id) {
    if (!window.confirm("Delete product?")) return;
    await deleteDoc(doc(db, "products", id));
  }

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <h1 className="text-2xl font-bold">Products</h1>

      <form className="card p-4 grid grid-cols-1 sm:grid-cols-5 gap-2 items-end" onSubmit={addProduct}>
        <label className="block">
          <div className="text-xs text-ink/60">Name</div>
          <input className="input" value={form.name} onChange={(e)=>setForm({ ...form, name: e.target.value })} required />
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">SKU</div>
          <input className="input" value={form.sku} onChange={(e)=>setForm({ ...form, sku: e.target.value })} />
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">Price (PHP)</div>
          <input className="input" type="number" step="0.01" value={form.price} onChange={(e)=>setForm({ ...form, price: e.target.value })} required />
        </label>
        <label className="block sm:col-span-2">
          <div className="text-xs text-ink/60">Image URL</div>
          <input className="input" value={form.imageUrl} onChange={(e)=>setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." />
        </label>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={(e)=>setForm({ ...form, active: e.target.checked })} /> Active
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy?"Adding…":"Add"}</button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full border rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">Name</th>
              <th className="text-left p-2 border-b">SKU</th>
              <th className="text-right p-2 border-b">Price</th>
              <th className="text-left p-2 border-b">Active</th>
              <th className="text-left p-2 border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="p-3" colSpan={5}>Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td className="p-3 text-ink/60" colSpan={5}>No products.</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b">
                  <div className="font-medium">{r.name}</div>
                  {r.imageUrl && <img src={r.imageUrl} alt="" className="h-12 w-20 object-cover rounded border mt-1" />}
                </td>
                <td className="p-2 border-b">{r.sku || "—"}</td>
                <td className="p-2 border-b text-right font-mono">₱{Number(r.price||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                <td className="p-2 border-b">{r.active?"Yes":"No"}</td>
                <td className="p-2 border-b">
                  <div className="flex items-center gap-2">
                    <button className="btn btn-sm" onClick={()=>toggleActive(r.id, !!r.active)}>{r.active?"Deactivate":"Activate"}</button>
                    <button className="btn btn-sm btn-outline" onClick={()=>remove(r.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
