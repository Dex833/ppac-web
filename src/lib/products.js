import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, limit, getDocs, startAfter, doc, getDoc } from "firebase/firestore";

const PAGE_SIZE = 24;

export async function fetchProductsPage({ category = "", after = null } = {}) {
  // Prefer: active == true; optional: categories array-contains; order by createdAt desc.
  // Fall back to name ordering or no ordering if composite index is missing.
  const base = [collection(db, "products"), where("active", "==", true)];
  if (category) {
    // Our documents store categories as an array; use array-contains
    base.push(where("categories", "array-contains", category));
  }

  let q = query(
    ...base,
    orderBy("createdAt", "desc"),
    limit(PAGE_SIZE)
  );
  if (after) q = query(q, startAfter(after));

  async function run(qry) {
    const snap = await getDocs(qry);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data(), _doc: d }))
      // Soft delete safeguard: hide deleted items client-side without adding extra indexes
      .filter((x) => x.deleted !== true);
    const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    return { items, nextCursor };
  }

  try {
    return await run(q);
  } catch (e) {
    // Likely missing composite index (failed-precondition)
    if (e && e.code === "failed-precondition") {
      try {
        let q2 = query(...base, orderBy("name"), limit(PAGE_SIZE));
        if (after) q2 = query(q2, startAfter(after));
        return await run(q2);
      } catch (e2) {
        // As a last resort, drop ordering and client-sort by createdAt desc then name
        let q3 = query(...base, limit(PAGE_SIZE));
        if (after) q3 = query(q3, startAfter(after));
        const res = await run(q3);
        const items = [...res.items].sort((a, b) => {
          const ca = a.createdAt?.seconds ?? a.createdAt?._seconds ?? null;
          const cb = b.createdAt?.seconds ?? b.createdAt?._seconds ?? null;
          if (ca && cb) return cb - ca;
          if (ca && !cb) return -1;
          if (!ca && cb) return 1;
          const na = (a.name || "").toLowerCase();
          const nb = (b.name || "").toLowerCase();
          return na.localeCompare(nb);
        });
        return { items, nextCursor: res.nextCursor };
      }
    }
    throw e;
  }
}

export async function getProductBySlug(slug) {
  // Query by slug only to avoid composite index requirements; validate flags client-side
  const q = query(collection(db, "products"), where("slug", "==", slug));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = { id: d.id, ...d.data() };
  if (data.deleted === true) return null;
  if (data.active === false) return null;
  return data;
}

export async function getProductById(id) {
  const ref = doc(db, "products", id);
  const s = await getDoc(ref);
  if (!s.exists()) return null;
  const data = { id: s.id, ...s.data() };
  if (data.deleted === true) return null;
  return data;
}
