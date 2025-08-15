import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export const DEFAULT_PAYMENTS_SETTINGS = {
  membershipFee: 500,
  initialShareCapitalMin: 1000,
  allowedManualMethods: ["bank_transfer", "gcash_manual", "static_qr"],
  instructionsBank: "Bank: BPI 1234-5678 | Name: PPAC",
  instructionsGCash: "GCash: 09xx xxx xxxx | Name: PPAC",
  staticQrUrl: "",
  oneTimeMembership: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
};

export async function ensurePaymentsSettings(): Promise<void> {
  const ref = doc(db, "settings", "payments");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, DEFAULT_PAYMENTS_SETTINGS);
  }
}
