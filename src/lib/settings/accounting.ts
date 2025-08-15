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
  gateway?: {
    clearingAccountId?: string; // Asset: PayMongo Clearing
    feesExpenseId?: string;     // Expense: Payment Gateway Fees
    taxesExpenseId?: string;    // Expense (optional): Taxes on fees
    defaultSettlementBankId?: string; // Asset: default bank to receive settlements
  };
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
  cashAccountMap: { bank_transfer: "", gcash_manual: "", static_qr: "", paymongo_gcash: "" },
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
    patch.cashAccountMap = { bank_transfer: "", gcash_manual: "", static_qr: "", paymongo_gcash: "" };
  } else {
    // ensure new keys exist without overwriting existing
    patch.cashAccountMap = {
      bank_transfer: data.cashAccountMap.bank_transfer ?? "",
      gcash_manual: data.cashAccountMap.gcash_manual ?? "",
      static_qr: data.cashAccountMap.static_qr ?? "",
      paymongo_gcash: (data.cashAccountMap as any).paymongo_gcash ?? "",
    } as any;
  }

  if (data.gateway === undefined) {
    (patch as any).gateway = {
      clearingAccountId: "",
      feesExpenseId: "",
      taxesExpenseId: "",
      defaultSettlementBankId: "",
    };
  } else {
    // ensure subkeys exist without overwriting
    (patch as any).gateway = {
      clearingAccountId: (data.gateway as any).clearingAccountId ?? "",
      feesExpenseId: (data.gateway as any).feesExpenseId ?? "",
      taxesExpenseId: (data.gateway as any).taxesExpenseId ?? "",
      defaultSettlementBankId: (data.gateway as any).defaultSettlementBankId ?? "",
    };
  }

  if (Object.keys(patch).length > 0) {
    await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
  }
}
