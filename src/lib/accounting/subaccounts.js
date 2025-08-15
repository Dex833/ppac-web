// Utilities to resolve or create member sub-accounts under main accounts
// Schema awareness: this code adapts to the repo's existing accounts shape.
// Observed fields in ChartOfAccounts and usages: code, main, individual, type, description, archived.
// Parent linkage is not explicit in code; sub-accounts are represented by the pair (main, individual).
// We'll treat `main` as the parent key and `individual` as the sub-account name. We also add optional ownerUid.

import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Build member account display name.
 * Accepts shapes with firstName, middleName, lastName or displayName.
 */
export function formatMemberAccountName(profileOrUser = {}) {
  const first = (profileOrUser.firstName || "").trim();
  const mid = (profileOrUser.middleName || "").trim();
  const last = (profileOrUser.lastName || "").trim();
  const dn = (profileOrUser.displayName || "").trim();

  if (first && last) {
    const mi = mid ? `${mid[0].toUpperCase()}.` : "";
    return [first, mi, last].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  if (dn) return dn;
  // Best-effort fallback from any fields present
  return [first, last].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Resolve the main account doc by its `main` name.
 * Our schema uses one document per account line; mains are rows with a unique (main, individual="").
 * But we also allow a simpler config: a single row where main == name of main and individual may be empty.
 * We'll find any account where main == mainName and individual == "" OR there is at least one account with that main.
 * For posting, we primarily need the `type` and to know the `main` name exists.
 */
export async function resolveMainAccountByName(mainName /*: "Share Capital" | "Loan Receivable" */) {
  const col = collection(db, "accounts");

  // Try to find a canonical "main row" where individual is blank for that main
  const q1 = query(col, where("main", "==", mainName), where("individual", "==", ""), limit(1));
  const s1 = await getDocs(q1);
  if (!s1.empty) {
    const d = s1.docs[0];
    return { id: d.id, ...d.data() };
  }

  // Otherwise, find any account under that main and infer main from it (type will be consistent)
  const q2 = query(col, where("main", "==", mainName), limit(1));
  const s2 = await getDocs(q2);
  if (!s2.empty) {
    const d = s2.docs[0];
    return { id: d.id, ...d.data() };
  }

  throw new Error(`Main account not found: ${mainName}`);
}

/**
 * Find or create a member sub-account under the given main.
 * Our schema uses fields: main (parent name), individual (subaccount), type, code.
 * We also set ownerUid for easier lookups going forward.
 */
export async function getOrCreateMemberSubaccount({ mainName, memberUid, memberName }) {
  const main = await resolveMainAccountByName(mainName);
  const col = collection(db, "accounts");

  // Prefer lookup by ownerUid if present, else by (main, individual==memberName)
  // Query by ownerUid + main (requires that some subs may already have this field)
  const qByOwner = query(col, where("main", "==", mainName), where("ownerUid", "==", memberUid), limit(1));
  const sOwner = await getDocs(qByOwner);
  if (!sOwner.empty) {
    const d = sOwner.docs[0];
    return { id: d.id, ...d.data() };
  }

  // Fallback: by name
  const qByName = query(col, where("main", "==", mainName), where("individual", "==", memberName), limit(1));
  const sName = await getDocs(qByName);
  if (!sName.empty) {
    const d = sName.docs[0];
    // Backfill ownerUid if missing
    const data = d.data();
    if (!data.ownerUid && memberUid) {
      try {
        // Optional, best-effort backfill (no await add write here to keep function pure/non-mutating beyond creation path)
      } catch {}
    }
    return { id: d.id, ...data };
  }

  // Need to create. Determine next code based on siblings under this main.
  // We'll fetch a handful of siblings ordered by code desc to find the max integer code.
  let nextCode = undefined;
  try {
    const qCodes = query(col, where("main", "==", mainName), orderBy("code", "desc"), limit(25));
    const sCodes = await getDocs(qCodes);
    let maxInt = 0;
    let sawAny = false;
    sCodes.forEach((docSnap) => {
      const v = docSnap.data();
      const c = v.code;
      if (c != null) {
        sawAny = true;
        const n = typeof c === "number" ? c : parseInt(String(c).replace(/\D+/g, ""), 10);
        if (!Number.isNaN(n)) maxInt = Math.max(maxInt, n);
      }
    });
    if (sawAny) nextCode = maxInt + 1;
  } catch {
    // ignore; we'll just not set code
  }

  const payload = {
    code: nextCode,
    main: mainName, // parent key in this schema
    individual: memberName,
    type: main.type || (mainName === "Share Capital" ? "Equity" : "Asset"),
    description: "",
    archived: false,
    ownerUid: memberUid || null,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(col, payload);
  return { id: docRef.id, ...payload };
}
