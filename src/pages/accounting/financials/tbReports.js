// src/pages/accounting/financials/tbReports.js
import { db } from "../../../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

/**
 * Save a Trial Balance report into /financialReports
 * - payload.html is rendered in /reports/:id
 */
export async function saveTrialBalanceReport({
  html,
  periodStart = null,   // Date | string | Timestamp ok
  periodEnd = null,     // Date | string | Timestamp ok
  label,
  createdByName = "",
  createdById = "",
}) {
  const docData = {
    type: "trial_balance",
    status: "generated",
    label: label || "Trial Balance",
    periodStart,
    periodEnd,
    createdAt: serverTimestamp(),
    createdByName,
    createdById,
    payload: { html },
  };
  const ref = await addDoc(collection(db, "financialReports"), docData);
  return ref.id;
}