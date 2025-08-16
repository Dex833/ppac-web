import React, { useEffect, useState } from "react";
import PageBackground from "@/components/PageBackground";
import { fetchProductsPage } from "@/lib/products";
import ProductCard from "@/components/store/ProductCard";

export default function Storefront() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [category, setCategory] = useState(""); // later: filter UI
  const [busyMore, setBusyMore] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const { items, nextCursor } = await fetchProductsPage({ category });
        if (!mounted) return;
        setItems(items);
        setCursor(nextCursor);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [category]);

  async function loadMore() {
    if (!cursor) return;
    setBusyMore(true);
    try {
      const { items: more, nextCursor } = await fetchProductsPage({ category, after: cursor });
      setItems((x) => [...x, ...more]);
      setCursor(nextCursor);
    } finally {
      setBusyMore(false);
    }
  }

  return (
    <PageBackground
      image="https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80"
      boxed
      boxedWidth="max-w-7xl"
      overlayClass="bg-white/85 backdrop-blur"
    >
      <div className="p-2 sm:p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 mb-3">
          <h1 className="text-2xl font-bold">Store</h1>
          <div className="w-full sm:w-auto">
            <select
              className="input w-full sm:w-48"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              title="Filter by category"
            >
              <option value="">All</option>
              <option value="rice">Rice</option>
              <option value="grocery">Grocery</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="card p-4">Loading products…</div>
        ) : items.length === 0 ? (
          <div className="text-ink/60">No products found.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {items.map((p) => (
                <ProductCard
                  key={p.id}
                  p={p}
                  onClick={() => (window.location.href = `/store/${p.slug || p.id}`)}
                />
              ))}
            </div>
            <div className="mt-4 flex justify-center">
              {cursor ? (
                <button className="btn btn-outline" onClick={loadMore} disabled={busyMore}>
                  {busyMore ? "Loading…" : "Load more"}
                </button>
              ) : (
                <div className="text-xs text-ink/60">End of list</div>
              )}
            </div>
          </>
        )}
      </div>
    </PageBackground>
  );
}
