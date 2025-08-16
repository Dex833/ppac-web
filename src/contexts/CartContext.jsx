import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const CartCtx = createContext(null);
const LS_KEY = "cart_v1";

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  function addItem(newItem) {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === newItem.id);
      if (idx >= 0) {
        const next = [...prev];
        const qty = Math.min((next[idx].qty || 0) + (newItem.qty || 1), 999);
        next[idx] = { ...next[idx], qty };
        return next;
      }
      return [...prev, { ...newItem, qty: Math.min(newItem.qty || 1, 999) }];
    });
  }

  function setQty(id, qty) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, qty: Math.max(1, Math.min(999, Number(qty) || 1)) } : it)));
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function clear() {
    setItems([]);
  }

  const totalQty = useMemo(() => items.reduce((s, it) => s + (it.qty || 0), 0), [items]);
  const subtotal = useMemo(() => items.reduce((s, it) => s + (Number(it.price || 0) * (it.qty || 0)), 0), [items]);

  const value = { items, addItem, setQty, removeItem, clear, totalQty, subtotal };
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
