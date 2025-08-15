import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Create-only seeder for settings/qr
 * Add real image URLs later from Admin.
 */
export async function ensureQrSettings() {
  const ref = doc(db, "settings", "qr");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        enabled: true,
        static: {
          // STATIC QR (manual verification). Replace imageUrl with your uploaded QR image(s).
          bank: { label: "PPAC Bank QR PH", imageUrl: "", depositAccountId: "" },
          gcash: { label: "PPAC GCash QR", imageUrl: "", depositAccountId: "" },
        },
        updatedAt: serverTimestamp(),
      },
      { merge: false }
    );
  }
}
