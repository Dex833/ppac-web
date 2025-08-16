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
  writeBatch,
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";

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
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | inactive
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editRowId, setEditRowId] = useState("");
  const [editDraft, setEditDraft] = useState({ price: "", stock: "" });
  const [selected, setSelected] = useState(() => new Set());
  const [importBusy, setImportBusy] = useState(false);
  const [uploadRowId, setUploadRowId] = useState("");
  const [toast, setToast] = useState({ text: "", actionText: "", action: null, visible: false, timer: null });

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
    let list = rows;
    if (statusFilter === "active") list = list.filter((r) => r.active === true && r.deleted !== true);
    if (statusFilter === "inactive") list = list.filter((r) => r.active !== true && r.deleted !== true);
    if (categoryFilter) list = list.filter((r) => Array.isArray(r.categories) && r.categories.map(String).map((s)=>s.toLowerCase()).includes(categoryFilter));
    if (!t) return list;
    return list.filter((r) => {
      const hay = `${r.name || ""} ${r.sku || ""}`.toLowerCase();
      return hay.includes(t);
    });
  }, [rows, filter, statusFilter, categoryFilter]);

  const allCategories = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      (Array.isArray(r.categories) ? r.categories : []).forEach((c) => {
        if (c) set.add(String(c).toLowerCase());
      });
    });
    return Array.from(set).sort();
  }, [rows]);

  // Selection helpers
  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllFiltered = () => {
    setSelected(new Set(filteredRows.map((r) => r.id)));
  };
  const clearSelection = () => setSelected(new Set());

  // Toast helpers
  function hideToast() {
    setToast((t) => {
      if (t.timer) clearTimeout(t.timer);
      return { text: "", actionText: "", action: null, visible: false, timer: null };
    });
  }
  function showToast(text, actionText, action, ms = 6000) {
    setToast((prev) => {
      if (prev.timer) clearTimeout(prev.timer);
      const timer = setTimeout(() => hideToast(), ms);
      return { text, actionText: actionText || "", action: action || null, visible: true, timer };
    });
  }

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

  function beginEdit(r) {
    setEditRowId(r.id);
    setEditDraft({ price: String(r.price ?? ""), stock: String(r.stock ?? "") });
  }

  async function saveEdit(id) {
    const priceNum = Number(editDraft.price);
    const stockNum = parseInt(editDraft.stock, 10);
    if (!Number.isFinite(priceNum) || priceNum < 0) return alert("Enter a valid price.");
    if (!Number.isFinite(stockNum) || stockNum < 0) return alert("Enter a valid stock.");
    await updateDoc(doc(db, "products", id), {
      price: Number(priceNum.toFixed(2)),
      stock: stockNum,
      updatedAt: serverTimestamp(),
    });
    setEditRowId("");
    showToast("Saved changes.");
  }

  function cancelEdit() {
    setEditRowId("");
  }

  async function quickEditMobile(r) {
    const np = window.prompt("New price (PHP)", String(r.price ?? ""));
    if (np == null) return;
    const ns = window.prompt("New stock", String(r.stock ?? ""));
    if (ns == null) return;
    const priceNum = Number(np);
    const stockNum = parseInt(ns, 10);
    if (!Number.isFinite(priceNum) || priceNum < 0) return alert("Invalid price.");
    if (!Number.isFinite(stockNum) || stockNum < 0) return alert("Invalid stock.");
    await updateDoc(doc(db, "products", r.id), {
      price: Number(priceNum.toFixed(2)),
      stock: stockNum,
      updatedAt: serverTimestamp(),
    });
  }

  async function duplicateProduct(r) {
    const copy = { ...r };
    delete copy.id;
    // reset flags/metadata
    copy.active = false;
    copy.deleted = false;
    copy.createdAt = serverTimestamp();
    copy.updatedAt = serverTimestamp();
    copy.name = `${r.name || "Unnamed"} (copy)`;
    await addDoc(collection(db, "products"), copy);
    alert("Duplicated as draft (unpublished).");
  }

  // Bulk operations
  async function runBatch(ids, updater, chunkSize = 450) {
    // Firestore batch limit is 500; keep margin
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const id of chunk) {
        const ref = doc(db, "products", id);
        updater(batch, ref);
      }
      await batch.commit();
    }
  }

  async function bulkPublish() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`Publish ${ids.length} product(s)?`)) return;
    const prev = new Map(ids.map((id) => {
      const r = rows.find((x) => x.id === id) || {};
      return [id, { active: !!r.active, deleted: !!r.deleted }];
    }));
    await runBatch(ids, (batch, ref) => {
      batch.update(ref, { active: true, deleted: false, updatedAt: serverTimestamp() });
    });
    clearSelection();
    showToast(
      `Published ${ids.length} product(s).`,
      "Undo",
      async () => {
        await runBatch(ids, (batch, ref) => {
          const p = prev.get(ref.id) || { active: false, deleted: false };
          batch.update(ref, { active: p.active, deleted: p.deleted, updatedAt: serverTimestamp() });
        });
      }
    );
  }

  async function bulkUnpublish() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`Unpublish ${ids.length} product(s)?`)) return;
    const prev = new Map(ids.map((id) => {
      const r = rows.find((x) => x.id === id) || {};
      return [id, { active: !!r.active, deleted: !!r.deleted }];
    }));
    await runBatch(ids, (batch, ref) => {
      batch.update(ref, { active: false, updatedAt: serverTimestamp() });
    });
    clearSelection();
    showToast(
      `Unpublished ${ids.length} product(s).`,
      "Undo",
      async () => {
        await runBatch(ids, (batch, ref) => {
          const p = prev.get(ref.id) || { active: true, deleted: false };
          batch.update(ref, { active: p.active, deleted: p.deleted, updatedAt: serverTimestamp() });
        });
      }
    );
  }

  async function bulkRemove() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`Soft-remove ${ids.length} product(s)?`)) return;
    const prev = new Map(ids.map((id) => {
      const r = rows.find((x) => x.id === id) || {};
      return [id, { active: !!r.active, deleted: !!r.deleted }];
    }));
    await runBatch(ids, (batch, ref) => {
      batch.update(ref, { active: false, deleted: true, updatedAt: serverTimestamp() });
    });
    clearSelection();
    showToast(
      `Removed ${ids.length} product(s).`,
      "Undo",
      async () => {
        await runBatch(ids, (batch, ref) => {
          const p = prev.get(ref.id) || { active: false, deleted: true };
          batch.update(ref, { active: p.active, deleted: p.deleted, updatedAt: serverTimestamp() });
        });
      }
    );
  }

  // CSV export (simple, quoted values, categories pipe-joined)
  function exportCSV() {
    const rowsToExport = filteredRows;
    const headers = ["id","name","sku","price","stock","categories","imageUrl","active"];
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const lines = [headers.join(",")];
    for (const r of rowsToExport) {
      const cats = Array.isArray(r.categories) ? r.categories.join("|") : "";
      const line = [r.id, r.name, r.sku, r.price, r.stock, cats, r.imageUrl || "", r.active ? "true" : "false"].map(esc).join(",");
      lines.push(line);
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // CSV import (expects headers: name,sku,price,stock,categories,imageUrl,active)
  async function importCSVFile(file) {
    if (!file) return;
    setImportBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) return;
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const idx = (k) => header.indexOf(k);
      const iName = idx("name"), iSku = idx("sku"), iPrice = idx("price"), iStock = idx("stock"), iCats = idx("categories"), iImg = idx("imageurl"), iActive = idx("active");
      let count = 0;
      for (let i = 1; i < lines.length; i++) {
        const raw = lines[i];
        if (!raw) continue;
        // naive CSV split supporting quotes
        const cols = [];
        let cur = ""; let inQ = false;
        for (let j = 0; j < raw.length; j++) {
          const ch = raw[j];
          if (ch === '"') {
            if (inQ && raw[j+1] === '"') { cur += '"'; j++; }
            else inQ = !inQ;
          } else if (ch === ',' && !inQ) {
            cols.push(cur); cur = "";
          } else { cur += ch; }
        }
        cols.push(cur);
        const name = (cols[iName] || "").trim();
        if (!name) continue;
        const sku = (cols[iSku] || "").trim();
        const price = Number(cols[iPrice] || 0);
        const stock = parseInt(cols[iStock] || "0", 10) || 0;
        const catRaw = (cols[iCats] || "").trim();
        const categories = catRaw ? catRaw.split(/[|,;]/).map((s)=>s.trim().toLowerCase()).filter(Boolean) : ["general"];
        const imageUrl = (cols[iImg] || "").trim();
        const active = String(cols[iActive] || "false").toLowerCase() === "true";
        const payload = {
          active,
          createdAt: serverTimestamp(),
          name,
          sku,
          price: Number(price.toFixed(2)),
          imageUrl,
          stock: Math.max(0, stock),
          categories,
          thumbnail: imageUrl || null,
          slug: slugify(name),
          searchable: [name, sku].join(" ").toLowerCase(),
          deleted: false,
          updatedAt: serverTimestamp(),
        };
        await addDoc(collection(db, "products"), payload);
        count++;
      }
      alert(`Imported ${count} product(s).`);
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setImportBusy(false);
    }
  }

  // Image upload for row
  async function uploadImageForRow(id, file) {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeExt = ["jpg","jpeg","png","webp"].includes(ext) ? ext : "jpg";
    const path = `products/${id}/image.${safeExt}`;
    const sref = storageRef(storage, path);
    const task = uploadBytesResumable(sref, file, { contentType: file.type });
    await new Promise((res, rej) => task.on("state_changed", () => {}, rej, res));
    const url = await getDownloadURL(sref);
    await updateDoc(doc(db, "products", id), { imageUrl: url, thumbnail: url, updatedAt: serverTimestamp() });
    alert("Image uploaded and linked.");
  }


  return (
    <div className="mx-auto max-w-6xl p-4 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Products</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <input
            className="input w-full sm:w-48"
            placeholder="Search name or SKU…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="input w-full sm:w-36"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title="Filter by status"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            className="input w-full sm:w-40"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            title="Filter by category"
          >
            <option value="">All categories</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {toast.visible && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 px-3 py-2 flex items-center gap-3">
          <span className="text-sm">{toast.text}</span>
          {toast.action && toast.actionText ? (
            <button className="btn btn-sm btn-outline" onClick={() => { toast.action(); hideToast(); }}>{toast.actionText}</button>
          ) : null}
          <button className="ml-auto text-sm text-ink/60 hover:underline" onClick={hideToast}>Dismiss</button>
        </div>
      )}

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
                  <label className="inline-flex items-center gap-2 mb-1">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                    <span className="text-xs text-ink/60">Select</span>
                  </label>
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
                  <div className="mt-2">
                    <label className="text-xs text-ink/60 block">Upload Image</label>
                    <input type="file" accept="image/*" onChange={(e) => uploadImageForRow(r.id, e.target.files?.[0])} />
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
                <button className="btn btn-sm btn-outline" onClick={() => quickEditMobile(r)}>
                  Edit
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => duplicateProduct(r)}>
                  Duplicate
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
        {/* Bulk toolbar */}
        <div className="mb-2 flex items-center gap-2">
          <button className="btn btn-outline" onClick={selectAllFiltered}>Select All</button>
          <button className="btn btn-outline" onClick={clearSelection}>Clear</button>
          <div className="text-sm text-ink/60 mr-2">Selected: {selected.size}</div>
          <button className="btn btn-outline" onClick={bulkPublish} disabled={selected.size === 0}>Publish</button>
          <button className="btn btn-outline" onClick={bulkUnpublish} disabled={selected.size === 0}>Unpublish</button>
          <button className="btn btn-outline" onClick={bulkRemove} disabled={selected.size === 0}>Remove</button>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn btn-outline" onClick={exportCSV}>Export CSV</button>
            <label className="btn btn-outline">
              Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = ""; // reset
                if (f) importCSVFile(f);
              }} />
            </label>
            {importBusy && <span className="text-sm text-ink/60">Importing…</span>}
          </div>
        </div>
        <table className="min-w-[1080px] w-full border rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">Sel</th>
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
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                  </td>
                  <td className="p-2 border-b">
                    <div className="font-medium">{r.name}</div>
                    {r.imageUrl && (
                      <img
                        src={r.imageUrl}
                        alt=""
                        className="h-12 w-20 object-cover rounded border mt-1"
                      />
                    )}
                    <div className="mt-1">
                      <label className="text-xs text-ink/60 block">Upload Image</label>
                      <input type="file" accept="image/*" onChange={(e) => uploadImageForRow(r.id, e.target.files?.[0])} />
                    </div>
                  </td>
                  <td className="p-2 border-b">{r.sku || "—"}</td>
                  <td className="p-2 border-b text-right font-mono">
                    {editRowId === r.id ? (
                      <input
                        className={`input w-28 text-right font-mono ${(() => { const v=Number(editDraft.price); return (!Number.isFinite(v) || v<0) ? 'border-red-300 focus:ring-red-300' : '' })()}`}
                        type="number"
                        step="0.01"
                        value={editDraft.price}
                        onChange={(e) => setEditDraft((d) => ({ ...d, price: e.target.value }))}
                      />
                    ) : (
                      <>₱{Number(r.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                    )}
                  </td>
                  <td className="p-2 border-b text-right">
                    {editRowId === r.id ? (
                      <input
                        className={`input w-24 text-right ${(() => { const v=parseInt(editDraft.stock,10); return (!Number.isFinite(v) || v<0) ? 'border-red-300 focus:ring-red-300' : '' })()}`}
                        type="number"
                        min="0"
                        value={editDraft.stock}
                        onChange={(e) => setEditDraft((d) => ({ ...d, stock: e.target.value }))}
                      />
                    ) : (
                      <>{r.stock ?? 0}</>
                    )}
                  </td>
                  <td className="p-2 border-b">
                    {r.active ? "Yes" : "No"}
                    {r.deleted ? " • deleted" : ""}
                  </td>
                  <td className="p-2 border-b">
                    <div className="flex items-center gap-2">
                      {editRowId === r.id ? (
                        <>
                          <button
                            className="btn btn-sm"
                            onClick={() => saveEdit(r.id)}
                            disabled={(() => { const p=Number(editDraft.price); const s=parseInt(editDraft.stock,10); return !Number.isFinite(p) || p<0 || !Number.isFinite(s) || s<0; })()}
                          >
                            Save
                          </button>
                          <button className="btn btn-sm btn-outline" onClick={cancelEdit}>Cancel</button>
                        </>
                      ) : (
                        <>
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
                            onClick={() => beginEdit(r)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => duplicateProduct(r)}
                          >
                            Duplicate
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => softRemove(r.id)}
                          >
                            Remove
                          </button>
                        </>
                      )}
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
