import React, { useState } from "react";

export default function ProductCard({ p, onClick, showAdd = false, onAdd, showQuick = false, onQuick, showStock = true }) {
  const getFirstImage = (prod) => {
    if (typeof prod?.imageUrl === "string" && prod.imageUrl.trim()) return prod.imageUrl.trim();
    if (typeof prod?.thumbnail === "string" && prod.thumbnail.trim()) return prod.thumbnail.trim();
    if (Array.isArray(prod?.images) && prod.images.length && typeof prod.images[0] === "string") {
      return prod.images[0].trim();
    }
    return "";
  };
  const [imgOk, setImgOk] = useState(true);
  const img = getFirstImage(p);
  return (
    <div className="group rounded-xl border bg-white hover:shadow transition cursor-pointer relative"
         onClick={onClick}>
      <div className="relative aspect-square w-full overflow-hidden rounded-t-xl bg-gray-50">
        {img && imgOk ? (
          <img
            src={img}
            alt={p.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-ink/40">No Image</div>
        )}
  {showStock && Number(p.stock ?? 0) <= 0 && (
          <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded">
            Out of stock
          </div>
        )}
        {showQuick && (
          <div className="absolute top-2 right-2">
            <button
              type="button"
              className="btn btn-sm btn-outline opacity-0 group-hover:opacity-100 transition"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQuick && onQuick(p); }}
            >
              Quick view
            </button>
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="font-medium line-clamp-2">{p.name}</div>
        <div className="mt-1 font-mono">
          ₱{Number(p.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        {showStock && (
          <div className="mt-1 text-xs text-ink/60">Stock: {p.stock ?? 0}</div>
        )}
        {showAdd && (
          <div className="mt-2">
            <button
              className="btn btn-sm btn-primary"
              onClick={(e) => { e.stopPropagation(); onAdd && onAdd(p); }}
              disabled={Number(p.stock ?? 0) <= 0}
              title={Number(p.stock ?? 0) <= 0 ? "Out of stock" : "Add to cart"}
            >
              Add to Cart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
