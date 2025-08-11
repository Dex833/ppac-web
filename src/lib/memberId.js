// src/lib/memberId.js
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";

/**
 * Generates a new memberId in the format YYYY##### using a Firestore transaction.
 * - Uses sequences/members with fields: { lastNumber: number, year: number }
 * - Resets the counter when the year changes.
 * Returns the string memberId, e.g. "202500001".
 */
export async function generateMemberId(db) {
  const yearNow = new Date().getFullYear();
  const seqRef = doc(db, "sequences", "members");

  const nextNumber = await runTransaction(db, async (tx) => {
    const snap = await tx.get(seqRef);

    // CASE 1: First time (doc doesn't exist) -> create with lastNumber = 1
    if (!snap.exists()) {
      tx.set(seqRef, {
        lastNumber: 1,
        year: yearNow,
        updatedAt: serverTimestamp(),
      });
      return 1;
    }

    // CASE 2: Doc exists
    const data = snap.data() || {};
    const lastYear = data.year || yearNow;
    const lastNum = data.lastNumber || 0;

    // If year changed, reset to 1; else increment by 1
    const inc = (lastYear !== yearNow) ? 1 : lastNum + 1;

    tx.update(seqRef, {
      lastNumber: inc,
      year: yearNow,
      updatedAt: serverTimestamp(),
    });

    return inc;
  });

  // Build YYYY##### (year + zero-padded 5-digit counter)
  const suffix = String(nextNumber).padStart(5, "0");
  return `${yearNow}${suffix}`;
}
