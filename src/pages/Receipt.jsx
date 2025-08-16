import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "@/lib/firebase";
import { doc, getDoc, query, where, collection, limit, getDocs } from "firebase/firestore";
import { formatPeso, toISO } from "../lib/format";

function Header({ org }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {org?.logoUrl ? <img src={org.logoUrl} alt={org?.name || "Org"} className="h-12 w-12 rounded" /> : null}
      <div>
        <div className="text-lg font-semibold">{org?.name || ""}</div>
        <div className="text-sm text-ink/60">
          {[org?.addressLine1, org?.addressLine2].filter(Boolean).join(" · ")}
          {org?.phone ? (org?.addressLine1 || org?.addressLine2 ? " · " : "") + org.phone : ""}
        </div>
      </div>
    </div>
  );
}

export default function ReceiptPage() {
  const { paymentId } = useParams();
  const nav = useNavigate();
  const [org, setOrg] = useState(null);
  const [p, setP] = useState(null);
  const [journal, setJournal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const orgSnap = await getDoc(doc(db, "settings", "org"));
        setOrg(orgSnap.exists() ? orgSnap.data() : null);

        const paySnap = await getDoc(doc(db, "payments", paymentId));
        if (!paySnap.exists()) throw new Error("Receipt not found");
        const data = { id: paySnap.id, ...paySnap.data() };
        setP(data);

        // Optional: fetch related journal
        const q = query(collection(db, "journalEntries"), where("linkedPaymentId", "==", paymentId), limit(1));
        const s = await getDocs(q);
        setJournal(s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() });
      } catch (e) {
        setErr(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [paymentId]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (err) return <div className="p-6 text-rose-700">{err}</div>;
  if (!p) return <div className="p-6">Not found</div>;

  const isLoan = p.type === "loan_repayment";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Header org={org} />

      <div className="text-center mb-4">
        <div className="text-2xl font-bold">Official Receipt</div>
        {p.receiptNo ? (
            <div className="text-sm text-ink/60 mt-1">Ref#: <b>{p.receiptNo}</b></div>
        ) : (
          <div className="text-sm text-ink/60 mt-1">—</div>
        )}
      </div>

      <div className="border rounded p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <div className="text-ink/60 text-sm">Date</div>
          <div>{toISO(p.confirmedAt) || toISO(p.createdAt) || ""}</div>
        </div>
        <div>
          <div className="text-ink/60 text-sm">Member</div>
          <div>{p.memberName || p.userEmail || p.userId || p.uid || "Member"}</div>
        </div>
        <div>
          <div className="text-ink/60 text-sm">Type</div>
          <div>{p.type || "—"}</div>
        </div>
        <div>
          <div className="text-ink/60 text-sm">Method</div>
          <div>{p.method || "—"}</div>
        </div>
        <div>
          <div className="text-ink/60 text-sm">Reference No</div>
          <div>{p.referenceNo || p.refNo || "—"}</div>
        </div>
        <div>
          <div className="text-ink/60 text-sm">Amount</div>
          <div className="font-semibold">{formatPeso(p.amount)}</div>
        </div>
        {isLoan ? (
          <>
            <div>
              <div className="text-ink/60 text-sm">Principal</div>
              <div>{formatPeso(p.principalPortion)}</div>
            </div>
            <div>
              <div className="text-ink/60 text-sm">Interest</div>
              <div>{formatPeso(p.interestPortion)}</div>
            </div>
          </>
        ) : null}
      </div>

      {journal ? (
        <div className="mb-4">
          <div className="font-semibold mb-1">Posted as</div>
          <table className="w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2 border-b">Account</th>
                <th className="text-right p-2 border-b">Debit</th>
                <th className="text-right p-2 border-b">Credit</th>
              </tr>
            </thead>
            <tbody>
              {(journal.lines || []).map((l, i) => (
                <tr key={i} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border-b">{l.accountName || l.accountCode || l.accountId}</td>
                  <td className="p-2 border-b text-right">{l.debit ? formatPeso(l.debit) : ""}</td>
                  <td className="p-2 border-b text-right">{l.credit ? formatPeso(l.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {journal.journalNo ? (
            <div className="text-xs text-ink/60 mt-1">Journal #: {journal.journalNo}</div>
          ) : null}
        </div>
      ) : null}

      <div className="text-xs text-ink/60 mt-6">Generated by PPAC system — not valid without number</div>

      <div className="mt-4 flex gap-2 print:hidden">
        <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
        <button className="btn btn-outline" onClick={() => nav(-1)}>Back</button>
      </div>
    </div>
  );
}
