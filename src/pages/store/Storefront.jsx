import React, { useEffect, useMemo, useRef, useState } from "react";
import PageBackground from "@/components/PageBackground";
import { fetchProductsPage } from "@/lib/products";
import ProductCard from "@/components/store/ProductCard";
import { useCart } from "@/contexts/CartContext";
import aiFeatures from "@/lib/settings/ai";

export default function Storefront() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [category, setCategory] = useState("");
  const [queryText, setQueryText] = useState("");
  const [sort, setSort] = useState("new"); // new | price-asc | price-desc
  const [busyMore, setBusyMore] = useState(false);
  const { addItem, totalQty } = useCart();
  const [stockOnly, setStockOnly] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [pageSize, setPageSize] = useState(24);
  // Quick View state
  const [quick, setQuick] = useState(null);
  const [quickParam, setQuickParam] = useState("");
  const quickModalRef = useRef(null);

  // Cart popover disabled: no outside/Esc listeners needed

  // Read initial filters from URL
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const cat = p.get("cat"); if (cat) setCategory(cat);
    const q = p.get("q"); if (q) setQueryText(q);
    const s = p.get("sort"); if (s && ["new","price-asc","price-desc"].includes(s)) setSort(s);
    const so = p.get("stock"); if (so === "1" || so === "true") setStockOnly(true);
    const min = p.get("min"); if (min) setMinPrice(min);
    const max = p.get("max"); if (max) setMaxPrice(max);
    const ps = p.get("ps"); if (ps && !Number.isNaN(Number(ps))) setPageSize(Math.max(8, Math.min(100, Number(ps))));
    const quickP = p.get("quick"); if (quickP) setQuickParam(quickP);
  }, []);

  // Write filters to URL (including quick view if any)
  useEffect(() => {
    const p = new URLSearchParams();
    if (category) p.set("cat", category);
    if (queryText) p.set("q", queryText);
    if (sort !== "new") p.set("sort", sort);
    if (stockOnly) p.set("stock", "1");
    if (minPrice) p.set("min", minPrice);
    if (maxPrice) p.set("max", maxPrice);
    if (pageSize !== 24) p.set("ps", String(pageSize));
    if (quickParam) p.set("quick", quickParam);
    const u = p.toString();
    const url = u ? `${window.location.pathname}?${u}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [category, queryText, sort, stockOnly, minPrice, maxPrice, pageSize, quickParam]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const { items, nextCursor } = await fetchProductsPage({ category, pageSize });
        if (!mounted) return;
        setItems(items);
        setCursor(nextCursor);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [category, pageSize]);

  const filteredSorted = useMemo(() => {
    const min = Number(minPrice || 0);
    const max = Number(maxPrice || 0);
    const list = items
      .filter((p) => {
        if (stockOnly && Number(p.stock ?? 0) <= 0) return false;
        const price = Number(p.price || 0);
        if (minPrice && !Number.isNaN(min) && price < min) return false;
        if (maxPrice && !Number.isNaN(max) && price > max) return false;
        const q = queryText.trim().toLowerCase();
        if (!q) return true;
        const hay = `${p.name || ""} ${p.sku || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (sort === "price-asc") return Number(a.price || 0) - Number(b.price || 0);
        if (sort === "price-desc") return Number(b.price || 0) - Number(a.price || 0);
        const ca = a.createdAt?.seconds ?? a.createdAt?._seconds ?? null;
        const cb = b.createdAt?.seconds ?? b.createdAt?._seconds ?? null;
        if (ca && cb) return cb - ca;
        const na = (a.name || "").toLowerCase();
        const nb = (b.name || "").toLowerCase();
        return na.localeCompare(nb);
      });
    return list;
  }, [items, queryText, sort, stockOnly, minPrice, maxPrice]);

  // Infinite scroll: auto load more when near bottom
  useEffect(() => {
    function onScroll() {
      if (!cursor || busyMore) return;
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
      if (nearBottom) {
        loadMore();
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [cursor, busyMore]);

  // If URL contains ?quick= and items are loaded, open quick view
  useEffect(() => {
    if (!quickParam || quick) return;
    const found = items.find((p) => p.id === quickParam || p.slug === quickParam);
    if (found) setQuick(found);
  }, [items, quickParam, quick]);

  // Focus trap & Esc for Quick View
  useEffect(() => {
    if (!quick) return;
    const modal = quickModalRef.current;
    if (!modal) return;
    // Try to focus the first focusable element
    const focusables = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length) {
      /** @type {HTMLElement} */
      const el = focusables[0];
      el.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        setQuick(null);
        setQuickParam("");
      } else if (e.key === "Tab") {
        // simple cycle
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [quick]);

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
          <div className="relative flex items-center gap-2">
            <h1 className="text-2xl font-bold">Store</h1>
            <a
              href="/cart"
              className="relative inline-flex items-center justify-center h-9 w-9 rounded-full border hover:bg-gray-50"
              title="Cart"
              aria-label="Cart"
            >
              {/* Cart icon (simple SVG) */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-ink">
                <path d="M2.25 3a.75.75 0 000 1.5h1.386c.34 0 .64.23.72.558l2.2 8.8A1.875 1.875 0 008.37 15h8.505a1.875 1.875 0 001.814-1.35l1.64-5.415a.75.75 0 00-.72-.985H6.855l-.37-1.48A2.25 2.25 0 003.636 3H2.25z" />
                <path d="M8.25 20.25a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.25 20.25a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
              </svg>
              {totalQty > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {totalQty > 99 ? "99+" : totalQty}
                </span>
              )}
            </a>
          </div>
          <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2 sm:gap-3">
            <input
              className="input w-full sm:w-60"
              placeholder="Search products…"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
            />
            <select
              className="input w-full sm:w-40"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              title="Filter by category"
            >
              <option value="">All</option>
              {/* Note: options will be derived from items below as a best-effort */}
              {Array.from(new Set(items.flatMap((p) => Array.isArray(p.categories) ? p.categories : []))).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="input w-full sm:w-40"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              title="Sort"
            >
              <option value="new">Newest</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={stockOnly} onChange={(e) => setStockOnly(e.target.checked)} />
              <span>In stock only</span>
            </label>
            <input
              className="input w-full sm:w-28"
              type="number"
              min="0"
              step="0.01"
              placeholder="Min ₱"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              title="Min price"
            />
            <input
              className="input w-full sm:w-28"
              type="number"
              min="0"
              step="0.01"
              placeholder="Max ₱"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              title="Max price"
            />
            <select className="input w-full sm:w-28" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} title="Page size">
              {[12,24,36,48].map((n) => <option key={n} value={n}>{n}/page</option>)}
            </select>
            {(category || queryText || sort !== "new" || stockOnly || minPrice || maxPrice || pageSize !== 24) && (
              <button className="btn btn-outline" onClick={() => { setCategory(""); setQueryText(""); setSort("new"); setStockOnly(false); setMinPrice(""); setMaxPrice(""); setPageSize(24); }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-white animate-pulse">
                <div className="aspect-square w-full rounded-t-xl bg-gray-100" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-ink/60">No products found.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {filteredSorted.map((p) => (
                <ProductCard
                  key={p.id}
                  p={p}
                  onClick={() => (window.location.href = `/store/${p.slug || p.id}`)}
                  showAdd
                  onAdd={(it) => addItem({ id: it.id, name: it.name, price: it.price, qty: 1 })}
                  showQuick
                  onQuick={(it) => { setQuick(it); setQuickParam(it.slug || it.id); }}
                />
              ))}
            </div>

            {quick && (
              <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/30 transition-opacity" onClick={() => { setQuick(null); setQuickParam(""); }} />
                <div ref={quickModalRef} className="relative bg-white rounded-xl border shadow-xl w-full max-w-md overflow-hidden transform transition-all duration-150 ease-out scale-95 opacity-0 animate-[fadeIn_.15s_ease-out_forwards,scaleIn_.15s_ease-out_forwards]">
                  <button className="absolute top-2 right-2 h-8 w-8 inline-flex items-center justify-center rounded hover:bg-gray-100" onClick={() => { setQuick(null); setQuickParam(""); }} aria-label="Close">×</button>
                  <div className="aspect-square w-full bg-gray-50">
                    {/* Image best-effort */}
                    {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                    <img src={quick.imageUrl || quick.thumbnail || ""} alt={quick.name + " image"} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="text-lg font-medium">{quick.name}</div>
                    <div className="font-mono">₱{Number(quick.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-sm text-ink/60">Stock: {quick.stock ?? 0}</div>
                    <div className="pt-2">
                      <button className="btn btn-primary w-full" disabled={Number(quick.stock ?? 0) <= 0} onClick={() => { addItem({ id: quick.id, name: quick.name, price: quick.price, qty: 1 }); setQuick(null); setQuickParam(""); }}>Add to cart</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {/* Floating Chat / Help */}
      {aiFeatures.chatHelp && (
        <a
          href="/support"
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full px-4 h-11 shadow-md bg-brand-600 text-white hover:bg-brand-700"
          title="Chat / Help"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3h6m-9 6.75v-15A2.25 2.25 0 016.75 1.5h10.5A2.25 2.25 0 0119.5 3.75v9.75A2.25 2.25 0 0117.25 15.75H8.25L5.25 18.75z" />
          </svg>
          <span className="hidden sm:inline">Chat / Help</span>
        </a>
      )}
    </PageBackground>
  );
}

// Floating Chat/Help (conditionally rendered via aiFeatures)
export function StorefrontChatHelp() {
  if (!aiFeatures.chatHelp) return null;
  return (
    <a
      href="/support"
      className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full px-4 h-11 shadow-md bg-brand-600 text-white hover:bg-brand-700"
      title="Chat / Help"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3h6m-9 6.75v-15A2.25 2.25 0 016.75 1.5h10.5A2.25 2.25 0 0119.5 3.75v9.75A2.25 2.25 0 0117.25 15.75H8.25L5.25 18.75z" />
      </svg>
      <span className="hidden sm:inline">Chat / Help</span>
    </a>
  );
}
