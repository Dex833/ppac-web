import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export type PaymongoSettings = {
  enabled: boolean;
  mode: "test" | "live";
  successUrl: string;
  cancelUrl: string;
  allowedMethods: string[];
  updatedAt?: any;
};

export const DEFAULT_PAYMONGO_SETTINGS: PaymongoSettings = {
  enabled: true,
  mode: "test",
  successUrl: "https://ppac-web.web.app/paymongo/success",
  cancelUrl: "https://ppac-web.web.app/paymongo/cancel",
  allowedMethods: ["gcash"],
  updatedAt: serverTimestamp(),
};

// Create-only seeder (does not overwrite existing values)
export async function ensurePaymongoSettings(): Promise<void> {
  const ref = doc(db, "settings", "paymongo");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, DEFAULT_PAYMONGO_SETTINGS as any);
  }
}
