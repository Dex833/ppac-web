import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "../AuthContext";

export default function useUserFinancial() {
  const { user } = useAuth();
  const [shareCapital, setShareCapital] = useState(null);
  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      if (!user?.uid) {
        setShareCapital(null);
        setLoan(null);
        setLoading(false);
        return;
      }
      try {
        // Fetch share capital from members/{uid}
        const memberRef = doc(db, "members", user.uid);
        const memberSnap = await getDoc(memberRef);
        let sc = null;
        let loanVal = null;
        if (memberSnap.exists()) {
          const data = memberSnap.data();
          sc = typeof data.shareCapital === "number" ? data.shareCapital : null;
          loanVal = typeof data.loan === "number" ? data.loan : null;
        }
        setShareCapital(sc);
        setLoan(loanVal);
      } catch (e) {
        setShareCapital(null);
        setLoan(null);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user?.uid]);

  return { shareCapital, loan, loading };
}
