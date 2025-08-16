// src/pages/admin/AdminProducts.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  orderBy,
  query,
  increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/* helper: slug + searchable (optional, future-proof, but Store ignores these) */
const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

export default function AdminProducts() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const [form, setForm] = useState({
    name: "",
    sku: "",
    price: "",
    imageUrl: "",
    stock: "", // quantity available
    categories: "", // comma-separated, e.g. "rice, grocery"
    active: true, // publish status (Storefront queries active == true)
  });

  // Admin view: alphabetical is convenient for editing
  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("name"));
    const unsub = onSnapshot(
      q,
      (s) => {
        setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const filteredRows = useMemo(() => {
    const t = filter.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => {
      const hay = `${r.name || ""} ${r.sku || ""}`.toLowerCase();
      return hay.includes(t);
    });
  }, [rows, filter]);

  async function addProduct(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const name = form.name?.trim() || "";
      const sku = form.sku?.trim() || "";
      const price = Number(form.price || 0);
      const imageUrl = form.imageUrl?.trim() || "";
      const active = !!form.active;
      const stock = Math.max(0, parseInt(form.stock || 0, 10) || 0);
      const categories = (form.categories || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const cats = categories.length ? categories : ["general"]; // default bucket

      const payload = {
        // fields the storefront actually uses
        active, // Storefront queries active == true
        createdAt: serverTimestamp(), // enables orderBy('createdAt','desc')

        // display fields
        name,
        sku,
        price,
        imageUrl,
        stock,
        categories: cats,

        // nice-to-have (future-proof; Store ignores for now)
        thumbnail: imageUrl || null,
        slug: slugify(name),
        searchable: [name, sku].join(" ").toLowerCase(),
        deleted: false,

        // bookkeeping
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "products"), payload);
      setForm({ name: "", sku: "", price: "", imageUrl: "", stock: "", categories: "", active: true });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(id, activeNow) {
    await updateDoc(doc(db, "products", id), {
      active: !activeNow, // Store.jsx reads this
      updatedAt: serverTimestamp(),
    });
  }

  async function softRemove(id) {
    if (!window.confirm("Remove from storefront (soft delete)?")) return;
    await updateDoc(doc(db, "products", id), {
      active: false,  // hide from Store.jsx
      deleted: true,  // keep for your records
      updatedAt: serverTimestamp(),
    });
  }

  async function restock(id) {
    const input = window.prompt("Add quantity to stock", "1");
    if (input == null) return; // cancelled
    const n = parseInt(String(input).trim(), 10);
    if (!Number.isFinite(n) || n <= 0) return;
    await updateDoc(doc(db, "products", id), {
      stock: increment(n),
      updatedAt: serverTimestamp(),
    });
  }


  return (
    <div className="mx-auto max-w-6xl p-4 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Products</h1>
  <div className="flex gap-2 w-full sm:w-auto">
          <input
            className="input w-full sm:w-64"
            placeholder="Search name or SKU…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Add form */}
      <form
        className="card p-4 grid grid-cols-1 sm:grid-cols-6 gap-3 items-end"
        onSubmit={addProduct}
      >
        <label className="block">
          <div className="text-xs text-ink/60">Name</div>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">SKU</div>
          <input
            className="input"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
          />
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">Price (PHP)</div>
          <input
            className="input"
            type="number"
            step="0.01"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
          />
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">Stock</div>
          <input
            className="input"
            type="number"
            min="0"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            placeholder="0"
          />
        </label>
        <label className="block sm:col-span-2">
          <div className="text-xs text-ink/60">Categories (comma-separated)</div>
          <input
            className="input"
            value={form.categories}
            onChange={(e) => setForm({ ...form, categories: e.target.value })}
            placeholder="rice, grocery"
          />
        </label>
        <label className="block sm:col-span-2">
          <div className="text-xs text-ink/60">Image URL</div>
          <input
            className="input"
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="https://..."
          />
        </label>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <span>Publish</span>
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>

        {/* live preview */}
        {form.imageUrl ? (
          <div className="sm:col-span-6">
            <div className="text-xs text-ink/60 mb-1">Preview</div>
            <img
              src={form.imageUrl}
              alt="preview"
              className="h-32 w-full sm:w-72 object-cover rounded border"
            />
          </div>
        ) : null}
      </form>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {loading && <div className="card p-3">Loading…</div>}
        {!loading && filteredRows.length === 0 && (
          <div className="card p-3 text-ink/60">No products.</div>
        )}
        {!loading &&
          filteredRows.map((r) => (
            <div key={r.id} className="card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-ink/60">SKU: {r.sku || "—"}</div>
                  <div className="mt-1 font-mono">
                    ₱
                    {Number(r.price || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  <div className="text-xs mt-1">Stock: {r.stock ?? 0}</div>
                  <div className="text-xs text-ink/60 mt-0.5">
                    Categories: {Array.isArray(r.categories) && r.categories.length ? r.categories.join(", ") : "—"}
                  </div>
                  <div className="text-xs mt-1">
                    Published: {r.active ? "Yes" : "No"}
                    {r.deleted ? " • deleted" : ""}
                  </div>
                </div>
                {r.imageUrl && (
                  <img
                    src={r.imageUrl}
                    alt=""
                    className="h-14 w-20 object-cover rounded border"
                  />
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  className="btn btn-sm"
                  onClick={() => toggleActive(r.id, !!r.active)}
                >
                  {r.active ? "Unpublish" : "Publish"}
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => restock(r.id)}>
                  Restock
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => softRemove(r.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Desktop table */}
      <div className="overflow-x-auto hidden sm:block">
        <table className="min-w-[1080px] w-full border rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">Name</th>
              <th className="text-left p-2 border-b">SKU</th>
              <th className="text-right p-2 border-b">Price</th>
              <th className="text-right p-2 border-b">Stock</th>
              <th className="text-left p-2 border-b">Published</th>
              <th className="text-left p-2 border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-3" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td className="p-3 text-ink/60" colSpan={6}>
                  No products.
                </td>
              </tr>
            )}
            {!loading &&
              filteredRows.map((r) => (
                <tr key={r.id} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border-b">
                    <div className="font-medium">{r.name}</div>
                    {r.imageUrl && (
                      <img
                        src={r.imageUrl}
                        alt=""
                        className="h-12 w-20 object-cover rounded border mt-1"
                      />
                    )}
                  </td>
                  <td className="p-2 border-b">{r.sku || "—"}</td>
                  <td className="p-2 border-b text-right font-mono">
                    ₱
                    {Number(r.price || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="p-2 border-b text-right">{r.stock ?? 0}</td>
                  <td className="p-2 border-b">
                    {r.active ? "Yes" : "No"}
                    {r.deleted ? " • deleted" : ""}
                  </td>
                  <td className="p-2 border-b">
                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-sm"
                        onClick={() => toggleActive(r.id, !!r.active)}
                      >
                        {r.active ? "Unpublish" : "Publish"}
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => restock(r.id)}
                      >
                        Restock
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => softRemove(r.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Tip: Your Store page will prefer createdAt ordering.
          All adds here include createdAt so it sorts correctly. */}
    </div>
  );
}
