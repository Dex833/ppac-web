import { db } from '../../../lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';

export async function saveIncomeStatementReport({ from, to, report }) {
  await addDoc(collection(db, 'incomeStatementReports'), {
    from,
    to,
    report,
    createdAt: new Date(),
  });
}

export async function getRecentIncomeStatementReports() {
  const q = query(collection(db, 'incomeStatementReports'), orderBy('createdAt', 'desc'), limit(10));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
