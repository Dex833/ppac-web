import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { useAuth } from "../AuthContext";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";

// Helper: sum (debit - credit) for any set of accountIds across all journal entries
async function sumBalanceForAccountIds(accountIds) {
  if (!accountIds.length) return 0;
  const q = query(collection(db, "journalEntries"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  let total = 0;
  snap.forEach((doc) => {
    const entry = doc.data();
    if (Array.isArray(entry.lines)) {
      entry.lines.forEach((line) => {
        if (accountIds.includes(line.accountId)) {
          total += (parseFloat(line.debit) || 0) - (parseFloat(line.credit) || 0);
        }
      });
    }
  });
  return total;
}

export default function useUserShareCapitalAndLoan() {
  const { user } = useAuth();
  const [shareCapital, setShareCapital] = useState(null);
  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBalances() {
      setLoading(true);
      setShareCapital(null);
      setLoan(null);
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      // Fetch member info for name
      const memberSnap = await getDocs(query(collection(db, "members"), where("uid", "==", user.uid)));
      let member = null;
      memberSnap.forEach((doc) => { member = doc.data(); });
      if (!member) {
        setLoading(false);
        return;
      }
      // Construct standardized display name: "First M. Last"
      const firstName = member.firstName?.trim() || "";
      const middleName = member.middleName?.trim() || "";
      const lastName = member.lastName?.trim() || "";
      const middleInitial = middleName ? middleName[0].toUpperCase() + "." : "";
      const constructedName = [firstName, middleInitial, lastName].filter(Boolean).join(" ").replace(/ +/g, " ").trim();
      // Share Capital
      const scSnap = await getDocs(query(collection(db, "accounts"), where("main", "==", "Share Capital")));
      const scAccounts = [];
      scSnap.forEach((doc) => {
        const a = doc.data();
        if ((a.individual || "").trim().toLowerCase() === constructedName.toLowerCase()) {
          scAccounts.push(doc.id);
        }
      });
      const scBal = await sumBalanceForAccountIds(scAccounts);
      setShareCapital(scBal);
      // Loan Receivable
      const loanSnap = await getDocs(query(collection(db, "accounts"), where("main", "==", "Loan Receivable")));
      const loanAccounts = [];
      loanSnap.forEach((doc) => {
        const a = doc.data();
        if ((a.individual || "").trim().toLowerCase() === constructedName.toLowerCase()) {
          loanAccounts.push(doc.id);
        }
      });
      const loanBal = await sumBalanceForAccountIds(loanAccounts);
      setLoan(loanBal);
      setLoading(false);
    }
    fetchBalances();
  }, [user?.uid]);

  return { shareCapital, loan, loading };
}
