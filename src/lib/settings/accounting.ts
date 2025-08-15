import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export type AccountingSettings = {
  cashAccountId?: string; // legacy fallback
  cashAccounts?: { onHandId?: string; bankDefaultId?: string; gcashId?: string };
  cashAccountMap?: { [method: string]: string };
  membershipFeeIncomeId?: string;
  salesRevenueId?: string;
  interestIncomeId?: string;
  shareCapitalMainId?: string;
  loanReceivableMainId?: string;
  updatedAt?: any;
};

export async function ensureAccountingSettings(): Promise<void> {
  const ref = doc(db, "settings", "accounting");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // CREATE ONLY (no merge) — first time
    await setDoc(ref, {
      cashAccountId: "", // legacy
      cashAccounts: { onHandId: "", bankDefaultId: "", gcashId: "" },
      cashAccountMap: { bank_transfer: "", gcash_manual: "", static_qr: "" },
      membershipFeeIncomeId: "",
      salesRevenueId: "",
      interestIncomeId: "",
      shareCapitalMainId: "",
      loanReceivableMainId: "",
      updatedAt: serverTimestamp(),
    } as AccountingSettings);
    return;
  }

  // BACKFILL ONLY MISSING KEYS — never write blanks over existing values
  const data = (snap.data() || {}) as AccountingSettings;
  const patch: AccountingSettings = {};

  if (data.cashAccounts === undefined) {
    patch.cashAccounts = { onHandId: "", bankDefaultId: "", gcashId: "" };
  }
  if (data.cashAccountMap === undefined) {
    patch.cashAccountMap = { bank_transfer: "", gcash_manual: "", static_qr: "" };
  }

  if (Object.keys(patch).length > 0) {
    await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
  }
}
