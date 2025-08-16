import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageBackground from "@/components/PageBackground";
import { getProductBySlug } from "@/lib/products";
import { useCart } from "@/contexts/CartContext.jsx";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { fetchProductsPage } from "@/lib/products";
import aiFeatures from "@/lib/settings/ai";
// import aiFeatures from "@/lib/settings/ai"; // reserved for future AI-driven UI toggles
import ProductCard from "@/components/store/ProductCard";

/* pick the best available image field */
function getFirstImage(p) {
  if (typeof p?.imageUrl === "string" && p.imageUrl.trim()) return p.imageUrl.trim();
  if (typeof p?.thumbnail === "string" && p.thumbnail.trim()) return p.thumbnail.trim();
  if (Array.isArray(p?.images) && p.images.length && typeof p.images[0] === "string")
    return p.images[0].trim();
  return "";
}

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ProductDetail() {
  const { slug } = useParams();                 // may be slug (e.g. "talong") OR a doc id
  const nav = useNavigate();
  const { addItem } = useCart();

  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedImg, setSelectedImg] = useState("");
  const [imgOk, setImgOk] = useState(true);
  const [related, setRelated] = useState([]);
  const [relLoading, setRelLoading] = useState(false);
  const [recent, setRecent] = useState([]);
  const [siblings, setSiblings] = useState({ prev: null, next: null });
  const [zoomOpen, setZoomOpen] = useState(false);

  // load by slug; if not found, try as Firestore doc id
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // 1) try slug loader
        let prod = await getProductBySlug(slug);

        // 2) if not found, try treat param as a Firestore doc id
        if (!prod) {
          try {
            const snap = await getDoc(doc(db, "products", slug));
            if (snap.exists()) prod = { id: snap.id, ...snap.data() };
          } catch { /* ignore */ }
        }

        if (!alive) return;

        if (!prod || prod.active !== true) {
          // not found or not active → bounce to /store
          nav("/store", { replace: true });
          return;
        }

  setP(prod);
        document.title = `${prod.name} • Store`;
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, nav]);

  // Build image list and set default selected image when product loads
  const images = useMemo(() => {
    if (!p) return [];
    const arr = [];
    const add = (s) => {
      if (typeof s === "string") {
        const t = s.trim();
        if (t && !arr.includes(t)) arr.push(t);
      }
    };
    add(p.imageUrl);
    add(p.thumbnail);
    if (Array.isArray(p.images)) p.images.forEach(add);
    return arr;
  }, [p]);

  useEffect(() => {
    if (!p) return;
    const first = images[0] || "";
    setSelectedImg(first);
    setImgOk(true);
    // update recently viewed
    try {
      const key = "recentProducts:v1";
      const raw = localStorage.getItem(key);
      const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      const entry = { id: p.id, slug: p.slug || p.id, name: p.name, price: p.price, imageUrl: first || getFirstImage(p) };
      const filtered = arr.filter((x) => (x.id || x.slug) !== (entry.id || entry.slug));
      const next = [entry, ...filtered].slice(0, 12);
      localStorage.setItem(key, JSON.stringify(next));
      setRecent(next.filter((x) => (x.id || x.slug) !== (p.id || p.slug))); // exclude current
    } catch { /* ignore */ }
  }, [p, images]);

  // Keyboard navigation for gallery
  useEffect(() => {
    if (!images || images.length < 2) return;
    function onKey(e) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const idx = images.indexOf(selectedImg);
        if (idx === -1) return;
        if (e.key === "ArrowLeft") {
          const next = idx > 0 ? images[idx - 1] : images[images.length - 1];
          setSelectedImg(next);
          setImgOk(true);
        } else {
          const next = idx < images.length - 1 ? images[idx + 1] : images[0];
          setSelectedImg(next);
          setImgOk(true);
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [images, selectedImg]);

  // For prev/next: load a small page in the same category and find neighbors around current product
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!p) { setSiblings({ prev: null, next: null }); return; }
      const cat = Array.isArray(p.categories) && p.categories.length ? p.categories[0] : "";
      try {
        // Load 36 items and sort by createdAt desc-ish (same logic as storefront fallback)
        const { items } = await fetchProductsPage({ category: cat, pageSize: 36 });
        if (!alive) return;
        const list = items;
        const idx = list.findIndex((x) => x.id === p.id);
        const prev = idx > 0 ? list[idx - 1] : null;
        const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
        setSiblings({ prev, next });
      } catch {
        if (alive) setSiblings({ prev: null, next: null });
      }
    })();
    return () => { alive = false; };
  }, [p]);

  // Fetch related products (same first category)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!p) return;
      const cat = Array.isArray(p.categories) && p.categories.length ? p.categories[0] : "";
      if (!cat) { setRelated([]); return; }
      setRelLoading(true);
      try {
        const { items } = await fetchProductsPage({ category: cat, pageSize: 8 });
        if (!alive) return;
        setRelated(items.filter((x) => x.id !== p.id));
      } finally {
        if (alive) setRelLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [p]);

  if (loading)
    return (
      <PageBackground
        image="https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80"
        boxed
        boxedWidth="max-w-7xl"
        overlayClass="bg-white/85 backdrop-blur"
      >
        <div className="p-2 sm:p-4">Loading…</div>
      </PageBackground>
    );
  if (!p) return null;

  const price = Number(p.price || 0);
  const stock = Number.isFinite(Number(p.stock)) ? Number(p.stock) : null;
  const canBuy = stock == null ? true : stock > 0;

  function onQtyChange(e) {
    const raw = Math.floor(Number(e.target.value || 1));
    const min1 = Math.max(1, raw);
    const capped = stock == null ? min1 : Math.min(min1, Math.max(1, stock));
    setQty(capped);
  }

  function addToCart() {
    const want = Math.max(1, Number(qty || 1));
    if (stock != null && want > stock) {
      alert(`Only ${stock} in stock.`);
      return;
    }
  addItem({ id: p.id, slug: p.slug, name: p.name, price, image: selectedImg || getFirstImage(p), qty: want });
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  }

  function onQtyKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addToCart();
    }
  }

  return (
    <PageBackground
      image="https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=1500&q=80"
      boxed
      boxedWidth="max-w-7xl"
      overlayClass="bg-white/85 backdrop-blur"
    >
  <div className="p-2 sm:p-4 pb-28 sm:pb-4">
        <div className="flex items-center justify-between mb-3">
          <nav className="text-sm text-ink/60 space-x-1">
            <a href="/store" className="underline">Store</a>
            <span>/</span>
            <span className="text-ink">{p.name}</span>
          </nav>
          <button
            className="btn btn-ghost text-sm"
            onClick={async () => {
              const link = window.location.href;
              try {
                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
                else throw new Error("no clipboard");
                alert("Link copied");
              } catch {
                window.prompt("Copy link:", link);
              }
            }}
            title="Copy link"
          >
            Share
          </button>
        </div>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <div>
            <div className="relative rounded-xl border overflow-hidden bg-gray-50">
              {selectedImg && imgOk ? (
                <img
                  key={selectedImg}
                  src={selectedImg}
                  alt={p.name}
                  className="w-full h-full object-contain max-h-[520px]"
                  onError={() => setImgOk(false)}
                  onClick={() => setZoomOpen(true)}
                  title="Click to zoom"
                />
              ) : (
                <div className="w-full h-[320px] grid place-items-center text-ink/40">No Image</div>
              )}
              {Number(p.stock ?? 0) <= 0 && (
                <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded">Out of stock</div>
              )}
            </div>
            {images.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {images.map((s) => (
                  <button
                    key={s}
                    className={`h-16 w-16 rounded border overflow-hidden ${selectedImg === s ? "ring-2 ring-brand-500" : ""}`}
                    onClick={() => { setSelectedImg(s); setImgOk(true); }}
                    title="View image"
                  >
                    {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                    <img src={s} alt={p.name + " thumbnail"} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4">
            <h1 className="text-2xl font-bold">{p.name}</h1>
            <div className="mt-2 text-xl font-mono">₱{fmt(price)}</div>
            <div className="mt-1 text-sm text-ink/60">
              {stock != null ? <>Stock: {stock}</> : <>Stock: —</>}
              {p.sku ? (
                <span className="ml-3 inline-flex items-center gap-2">
                  <span>SKU: {p.sku}</span>
                  <button
                    className="text-xs underline"
                    onClick={async () => { try { await navigator.clipboard.writeText(p.sku); alert("SKU copied"); } catch { /* ignore */ } }}
                    title="Copy SKU"
                  >Copy</button>
                </span>
              ) : null}
            </div>
            {stock != null && stock > 0 && stock <= 5 && (
              <div className="mt-1 text-xs text-orange-700">Only {stock} left—order soon!</div>
            )}

            {Array.isArray(p.categories) && p.categories.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {p.categories.map((c) => (
                  <a key={c} href={`/store?cat=${encodeURIComponent(c)}`} className="badge">
                    {c}
                  </a>
                ))}
              </div>
            )}

            {p.description && (
              <div className="mt-4 whitespace-pre-line">{p.description}</div>
            )}

            <div className="mt-6 hidden sm:flex items-center gap-3">
              <label className="text-sm text-ink/60">Qty</label>
              <div className="inline-flex items-center gap-2">
                <button type="button" className="h-9 w-9 rounded border inline-flex items-center justify-center" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">−</button>
                <input
                  className="input w-24"
                  type="number"
                  min="1"
                  max={stock == null ? undefined : Math.max(1, stock)}
                  value={qty}
                  onChange={onQtyChange}
                  onKeyDown={onQtyKeyDown}
                />
                <button type="button" className="h-9 w-9 rounded border inline-flex items-center justify-center" onClick={() => setQty((q) => (stock == null ? q + 1 : Math.min(q + 1, Math.max(1, stock))))} aria-label="Increase">+</button>
              </div>
            </div>

            <div className="mt-4 hidden sm:flex gap-2">
              <button
                className="btn btn-primary"
                onClick={addToCart}
                disabled={!canBuy}
                title={canBuy ? "Add to cart" : "Out of stock"}
              >
                Add to Cart
              </button>
              <button
                className="btn btn-accent"
                onClick={() => { const want = Math.max(1, Number(qty || 1)); addItem({ id: p.id, slug: p.slug, name: p.name, price, image: selectedImg || getFirstImage(p), qty: want }); nav('/checkout'); }}
                disabled={!canBuy}
                title={canBuy ? "Buy now" : "Out of stock"}
              >
                Buy Now
              </button>
              <button
                className="btn btn-outline"
                onClick={() => nav("/cart")}
                title="Go to cart"
              >
                Go to Cart
              </button>
            </div>

            {added && (
              <div className="mt-3 text-emerald-700 text-sm">Added to cart ✓</div>
            )}
            {(siblings.prev || siblings.next) && (
              <div className="mt-6 flex items-center justify-between">
                <div>
                  {siblings.prev && (
                    <a href={`/store/${siblings.prev.slug || siblings.prev.id}`} className="btn btn-outline">← Prev</a>
                  )}
                </div>
                <div>
                  {siblings.next && (
                    <a href={`/store/${siblings.next.slug || siblings.next.id}`} className="btn btn-outline">Next →</a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Related products */}
        {(relLoading || related.length > 0) && (
          <div className="mt-8">
            <div className="text-lg font-semibold mb-3">Related products</div>
            {relLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
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
            ) : related.length === 0 ? (
              <div className="text-ink/60 text-sm">No related products.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {related.map((rp) => (
                  <ProductCard
                    key={rp.id}
                    p={rp}
                    onClick={() => (window.location.href = `/store/${rp.slug || rp.id}`)}
                    showAdd
                    onAdd={(it) => addItem({ id: it.id, name: it.name, price: it.price, qty: 1 })}
                    showQuick
                    onQuick={(it) => (window.location.href = `/store/${it.slug || it.id}?quick=${encodeURIComponent(it.slug || it.id)}`)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sticky mobile action bar */}
        <div className="fixed inset-x-0 bottom-0 z-30 sm:hidden border-t bg-white/95 backdrop-blur">
          <div className="max-w-7xl mx-auto px-3 py-2 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-ink/60 truncate">{p.name}</div>
              <div className="font-mono">₱{fmt(price)}</div>
              {aiFeatures.deliveryEta && (
                <div className="text-[11px] text-ink/60">Est. delivery: 2–4 days</div>
              )}
            </div>
            <div className="inline-flex items-center gap-2">
              <button type="button" className="h-9 w-9 rounded border inline-flex items-center justify-center" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">−</button>
              <input
                className="input w-16 text-center"
                type="number"
                min="1"
                max={stock == null ? undefined : Math.max(1, stock)}
                value={qty}
                onChange={onQtyChange}
              />
              <button type="button" className="h-9 w-9 rounded border inline-flex items-center justify-center" onClick={() => setQty((q) => (stock == null ? q + 1 : Math.min(q + 1, Math.max(1, stock))))} aria-label="Increase">+</button>
            </div>
            <button
              className="btn btn-outline"
              onClick={addToCart}
              disabled={!canBuy}
              title={canBuy ? "Add to cart" : "Out of stock"}
            >
              Add
            </button>
            <button
              className="btn btn-primary"
              onClick={() => { const want = Math.max(1, Number(qty || 1)); addItem({ id: p.id, slug: p.slug, name: p.name, price, image: selectedImg || getFirstImage(p), qty: want }); nav('/checkout'); }}
              disabled={!canBuy}
              title={canBuy ? "Buy now" : "Out of stock"}
            >
              Buy Now
            </button>
          </div>
        </div>

        {/* Recently viewed */}
        {recent.length > 0 && (
          <div className="mt-10">
            <div className="text-lg font-semibold mb-3">Recently viewed</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {recent.map((rp) => (
                <ProductCard
                  key={rp.id || rp.slug}
                  p={rp}
                  onClick={() => (window.location.href = `/store/${rp.slug || rp.id}`)}
                  showAdd
                  onAdd={(it) => addItem({ id: it.id, name: it.name, price: it.price, qty: 1 })}
                  showQuick
                  onQuick={(it) => (window.location.href = `/store/${it.slug || it.id}?quick=${encodeURIComponent(it.slug || it.id)}`)}
                  showStock={false}
                />
              ))}
            </div>
          </div>
        )}

        {/* Image lightbox */}
        {zoomOpen && selectedImg && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4" onClick={() => setZoomOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative max-w-5xl w-full max-h-[90vh] bg-white rounded-xl overflow-hidden transform transition-all duration-150 ease-out scale-95 opacity-0 animate-[fadeIn_.15s_ease-out_forwards,scaleIn_.15s_ease-out_forwards]" onClick={(e) => e.stopPropagation()}>
              <button className="absolute top-2 right-2 h-9 w-9 inline-flex items-center justify-center rounded hover:bg-gray-100" onClick={() => setZoomOpen(false)} aria-label="Close">×</button>
              <div className="w-full h-full grid place-items-center bg-black">
                {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                <img src={selectedImg} alt={p.name + ' zoomed image'} className="max-h-[90vh] object-contain" />
              </div>
            </div>
          </div>
        )}

        {/* JSON-LD for SEO */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org/',
          '@type': 'Product',
          name: p.name,
          image: images.length ? images : (getFirstImage(p) ? [getFirstImage(p)] : []),
          sku: p.sku || undefined,
          offers: {
            '@type': 'Offer',
            priceCurrency: 'PHP',
            price: price,
            availability: (Number(p.stock ?? 0) > 0) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            url: typeof window !== 'undefined' ? window.location.href : undefined,
          },
        }) }} />
      </div>
    </PageBackground>
  );
}
