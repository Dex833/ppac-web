import { db } from "@/lib/firebase";
import { collection, query, orderBy, addDoc, getDocs, serverTimestamp, deleteDoc, doc } from "firebase/firestore";

export async function saveCashFlowStatementReport({ fromId, fromLabel, toId, toLabel, report }) {
  await addDoc(collection(db, "cashFlowStatementReports"), {
    fromId,
    fromLabel,
    toId,
    toLabel,
    report,
    createdAt: serverTimestamp(),
  });
}

export async function getRecentCashFlowStatementReports(limit = 10) {
  const q = query(collection(db, "cashFlowStatementReports"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteCashFlowStatementReport(id) {
  await deleteDoc(doc(db, "cashFlowStatementReports", id));
}
