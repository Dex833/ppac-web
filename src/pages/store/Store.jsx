import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageBackground from "@/components/PageBackground";
import { collection, onSnapshot, orderBy, query, where, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/AuthContext";

export default function Store() {
  const nav = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "products"), where("active", "==", true), orderBy("name"));
    const unsub = onSnapshot(q, (s) => {
      setProducts(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  return (
    <PageBackground
      image="https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80"
      boxed
      boxedWidth="max-w-7xl"
      overlayClass="bg-white/85 backdrop-blur"
    >
      <div className="p-2 sm:p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mb-4">
          <h1 className="text-2xl font-bold w-full sm:w-auto text-center sm:text-left">Store</h1>
          <button className="btn w-full sm:w-auto" onClick={() => nav("/cart")}>Cart</button>
        </div>
        {loading ? (
          <div>Loading…</div>
        ) : products.length === 0 ? (
          <div className="text-ink/60">No products available yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>
    </PageBackground>
  );
}

function ProductCard({ p }) {
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);

  async function addToCart() {
    setAdding(true);
    try {
      if (!user?.uid) return;
      const cartRef = doc(db, "carts", user.uid);
      const snap = await getDoc(cartRef);
      const prev = snap.exists() ? (snap.data() || {}) : {};
      const items = Array.isArray(prev.items) ? [...prev.items] : [];
      const idx = items.findIndex((it) => it.productId === p.id);
      if (idx >= 0) items[idx] = { ...items[idx], qty: (items[idx].qty || 0) + 1 };
      else items.push({ productId: p.id, name: p.name, price: Number(p.price || 0), qty: 1 });
      await setDoc(cartRef, { items, updatedAt: serverTimestamp() }, { merge: true });
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="card p-3 flex flex-col">
      {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-full h-40 object-cover rounded mb-2 border" />}
      <div className="font-semibold">{p.name}</div>
      <div className="text-sm text-ink/60 mb-2">₱{Number(p.price || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
      <button className="btn btn-primary mt-auto" onClick={addToCart} disabled={adding}>{adding ? "Adding…" : "Add to cart"}</button>
    </div>
  );
}
