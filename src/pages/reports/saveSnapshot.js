// src/pages/reports/saveSnapshot.js
import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

/**
 * Save a read-only snapshot to /financialReports
 * type: "balanceSheet" | "cashFlow" | "trial_balance" | "ledger" | "incomeStatement"
 */
export async function saveFinancialSnapshot({
  type,
  label,
  from = "",
  to = "",
  report = {},
  notes = "",
  createdBy = "",
  createdById = "",
}) {
  if (!type) throw new Error("saveFinancialSnapshot: type is required");
  await addDoc(collection(db, "financialReports"), {
    type,
    label: label || type,
    from,
    to,
    report,                 // immutable payload used by ReportView
    notes,
    createdAt: serverTimestamp(),
    createdBy,
    createdById,
    source: "financialReports",
  });
}