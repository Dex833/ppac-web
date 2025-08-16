import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/AuthContext";

export default function Product() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [p, setP] = useState(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const s = await getDoc(doc(db, "products", id));
        setP(s.exists() ? { id: s.id, ...s.data() } : null);
      } catch (e) {
        setErr(e?.message || String(e));
      }
    })();
  }, [id]);

  async function addToCart() {
    if (!user?.uid) return nav("/login");
    if (!p) return;
    setBusy(true);
    try {
      const cartRef = doc(db, "carts", user.uid);
      const snap = await getDoc(cartRef);
      const prev = snap.exists() ? (snap.data() || {}) : {};
      const items = Array.isArray(prev.items) ? [...prev.items] : [];
      const idx = items.findIndex((it) => it.productId === p.id);
      if (idx >= 0) items[idx] = { ...items[idx], qty: Number(items[idx].qty || 0) + Number(qty || 1) };
      else items.push({ productId: p.id, name: p.name, price: Number(p.price || 0), qty: Number(qty || 1) });
      await setDoc(cartRef, { items, updatedAt: serverTimestamp() }, { merge: true });
      nav("/cart");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (p === null && !err) return <div className="p-4">Loading…</div>;
  if (!p) return <div className="p-4">Product not found.</div>;

  return (
    <div className="mx-auto max-w-4xl p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        {p.imageUrl ? (
          <img src={p.imageUrl} alt={p.name} className="w-full max-h-[400px] object-cover rounded border" />
        ) : (
          <div className="w-full h-64 border rounded bg-gray-100" />
        )}
      </div>
      <div>
        <h1 className="text-2xl font-bold">{p.name}</h1>
        <div className="text-sm text-ink/60 mt-1">{p.sku || ""}{p.category ? ` • ${p.category}` : ""}</div>
        <div className="text-2xl font-bold mt-3">₱{Number(p.price || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        <div className="mt-4 flex items-center gap-2">
          <label className="text-sm text-ink/60">Qty</label>
          <input className="input w-24" type="number" min={1} value={qty} onChange={(e)=>setQty(parseInt(e.target.value||1,10))} />
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-primary" onClick={addToCart} disabled={busy}>{busy?"Adding…":"Add to Cart"}</button>
          <button className="btn" onClick={()=>nav("/store")}>Back to Store</button>
        </div>
        {err && <div className="mt-3 text-sm text-rose-700">{err}</div>}
      </div>
    </div>
  );
}
