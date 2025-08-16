import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageBackground from "@/components/PageBackground";
import { getProductBySlug } from "@/lib/products";
import { useCart } from "@/contexts/CartContext.jsx";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

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
  const [imgOk, setImgOk] = useState(true);

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

  const img = getFirstImage(p);
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
    addItem({
      id: p.id,
      slug: p.slug,
      name: p.name,
      price: price,
      image: img,
      qty: want,
    });
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
      <div className="p-2 sm:p-4">
        <button className="text-sm text-ink/60 mb-3 underline" onClick={() => nav(-1)}>
          ← Back
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <div className="rounded-xl border overflow-hidden bg-gray-50">
            {img && imgOk ? (
              <img
                src={img}
                alt={p.name}
                className="w-full h-full object-contain max-h-[520px]"
                onError={() => setImgOk(false)}
              />
            ) : (
              <div className="w-full h-[320px] grid place-items-center text-ink/40">
                No Image
              </div>
            )}
          </div>

          <div className="card p-4">
            <h1 className="text-2xl font-bold">{p.name}</h1>
            <div className="mt-2 text-xl font-mono">₱{fmt(price)}</div>
            <div className="mt-1 text-sm text-ink/60">
              {stock != null ? <>Stock: {stock}</> : <>Stock: —</>}
              {p.sku ? <span className="ml-3">SKU: {p.sku}</span> : null}
            </div>

            {p.description && (
              <div className="mt-4 whitespace-pre-line">{p.description}</div>
            )}

            <div className="mt-6 flex items-center gap-3">
              <label className="text-sm text-ink/60">Qty</label>
              <input
                className="input w-24"
                type="number"
                min="1"
                max={stock == null ? undefined : Math.max(1, stock)}
                value={qty}
                onChange={onQtyChange}
                onKeyDown={onQtyKeyDown}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="btn btn-primary"
                onClick={addToCart}
                disabled={!canBuy}
                title={canBuy ? "Add to cart" : "Out of stock"}
              >
                Add to Cart
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
          </div>
        </div>
      </div>
    </PageBackground>
  );
}
