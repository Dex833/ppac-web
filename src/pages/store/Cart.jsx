import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, onSnapshot, setDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/AuthContext";

export default function Cart() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [cart, setCart] = useState({ items: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    const cartRef = doc(db, "carts", user.uid);
    const unsub = onSnapshot(cartRef, (s) => {
      setCart(s.exists() ? (s.data() || { items: [] }) : { items: [] });
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [user?.uid]);

  const subtotal = useMemo(() => (cart.items || []).reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0), 0), [cart.items]);

  async function setQty(idx, qty) {
    const items = [...(cart.items || [])];
    if (qty <= 0) items.splice(idx, 1); else items[idx] = { ...items[idx], qty };
  if (!user?.uid) return;
  const cartRef = doc(db, "carts", user.uid);
    await setDoc(cartRef, { items, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function clearCart() {
    if (!window.confirm("Clear cart?")) return;
  if (!user?.uid) return;
  const cartRef = doc(db, "carts", user.uid);
    await deleteDoc(cartRef);
  }

  if (loading) return <div className="p-4">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-2xl font-bold mb-4">Your Cart</h1>
      {(cart.items || []).length === 0 ? (
        <div className="text-ink/60">Your cart is empty.</div>
      ) : (
        <div className="space-y-3">
          {(cart.items || []).map((it, i) => (
            <div key={i} className="flex items-center justify-between border rounded p-2">
              <div>
                <div className="font-medium">{it.name}</div>
                <div className="text-xs text-ink/60">₱{Number(it.price).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" className="input w-20" value={it.qty} min={0} onChange={(e) => setQty(i, parseInt(e.target.value || 0, 10))} />
                <div className="w-28 text-right font-mono">₱{Number(it.price * it.qty).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-3">
            <div className="text-lg font-semibold">Subtotal</div>
            <div className="text-lg font-bold">₱{Number(subtotal).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => nav("/store")}>Continue shopping</button>
            <button className="btn btn-primary" onClick={() => nav("/checkout")}>Checkout</button>
            <button className="btn btn-outline" onClick={clearCart}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
