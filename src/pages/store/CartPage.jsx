import React, { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageBackground from "@/components/PageBackground";
import { useCart } from "@/contexts/CartContext.jsx";
import { useAuth } from "@/AuthContext";
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

function peso(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

export default function Cart() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { items, setQty, removeItem, clear, subtotal } = useCart();

  // Optional: persist cart to Firestore when signed in
  useEffect(() => {
    if (!user?.uid) return;
    const cartRef = doc(db, "carts", user.uid);
    setDoc(cartRef, { items, updatedAt: serverTimestamp() }, { merge: true }).catch(()=>{});
  }, [items, user]);

  const totals = useMemo(() => {
    const itemsTotal = items.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0), 0);
    return { itemsTotal, grandTotal: itemsTotal };
  }, [items]);

  const empty = items.length === 0;

  return (
    <PageBackground
      image="https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80"
      boxed
      boxedWidth="max-w-7xl"
      overlayClass="bg-white/85 backdrop-blur"
    >
      <div className="p-2 sm:p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Your Cart</h1>
          <Link className="btn btn-outline" to="/store">Continue Shopping</Link>
        </div>

        {empty ? (
          <div className="card p-4 text-ink/60">Your cart is empty.</div>
        ) : (
          <>
            <div className="card p-2 overflow-x-auto">
              <table className="min-w-[720px] w-full">
              <thead className="text-left text-ink/60">
                <tr>
                  <th className="p-2">Item</th>
                  <th className="p-2">Price</th>
                  <th className="p-2">Qty</th>
                  <th className="p-2 text-right">Subtotal</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="p-2">
                      <div className="flex items-center gap-3">
                        {it.image ? (
                          <img src={it.image} alt="" className="h-12 w-16 object-cover rounded border" />
                        ) : (
                          <div className="h-12 w-16 rounded border bg-gray-100 grid place-items-center text-gray-400 text-xs">No Image</div>
                        )}
                        <div>
                          <div className="font-medium">{it.name}</div>
                          {it.slug && <div className="text-xs text-ink/60">/{it.slug}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-2 font-mono">₱{peso(it.price)}</td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="1"
                        className="input w-20"
                        value={it.qty}
                        onChange={(e) => {
                          const q = Math.max(1, Number(e.target.value || 1));
                          setQty(it.id, q);
                        }}
                      />
                    </td>
                    <td className="p-2 text-right font-mono">
                      ₱{peso(Number(it.price || 0) * Number(it.qty || 0))}
                    </td>
                    <td className="p-2 text-right">
                      <button className="btn btn-sm btn-outline" onClick={() => removeItem(it.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t">
                <tr>
                  <td className="p-2" colSpan={3}></td>
                  <td className="p-2 text-right font-semibold">Total: ₱{peso(totals.itemsTotal)}</td>
                  <td className="p-2"></td>
                </tr>
              </tfoot>
              </table>
            </div>

            <div className="mt-4 flex gap-2 justify-end">
              <button className="btn btn-outline" onClick={clear}>Clear Cart</button>
              <button className="btn btn-primary" onClick={() => nav("/checkout")}>
                Proceed to Checkout
              </button>
            </div>
          </>
        )}
      </div>
    </PageBackground>
  );
}
