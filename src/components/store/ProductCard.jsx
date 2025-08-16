import React, { useState } from "react";

export default function ProductCard({ p, onClick }) {
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
    <div className="rounded-xl border bg-white hover:shadow transition cursor-pointer"
         onClick={onClick}>
      <div className="aspect-square w-full overflow-hidden rounded-t-xl bg-gray-50">
        {img && imgOk ? (
          <img
            src={img}
            alt={p.name}
            className="w-full h-full object-cover"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-ink/40">No Image</div>
        )}
      </div>
      <div className="p-3">
        <div className="font-medium line-clamp-2">{p.name}</div>
        <div className="mt-1 font-mono">
          ₱{Number(p.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="mt-1 text-xs text-ink/60">Stock: {p.stock ?? 0}</div>
      </div>
    </div>
  );
}
