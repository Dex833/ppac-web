import React, { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const q = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(q, (snap) => {
      setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  return accounts;
}

function useMembers() {
  const [members, setMembers] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "members"), (snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  return members;
}

export default function SalesInvoice() {
  const accounts = useAccounts();
  const members = useMembers();

  const [form, setForm] = useState({
    memberId: "",
    product: "",
    quantity: 1,
    price: "",
    paymentType: "cash", // cash or credit
    date: new Date().toISOString().slice(0, 10),
    refNumber: "",
  });
  const [lastRef, setLastRef] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchLastRef() {
      const qJE = query(
        collection(db, "journalEntries"),
        orderBy("refNumber", "desc"),
        limit(1)
      );
      const snap = await getDocs(qJE);
      if (!snap.empty) {
        setLastRef(Number(snap.docs[0].data().refNumber) || 0);
      }
    }
    fetchLastRef();
  }, []);

  useEffect(() => {
    setForm((f) => ({
      ...f,
      refNumber: (lastRef + 1).toString().padStart(5, "0"),
    }));
  }, [lastRef]);

  const total = (parseFloat(form.price) || 0) * (parseFloat(form.quantity) || 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.memberId || !form.product || !form.price) {
      return setError("Member, product and price are required.");
    }
    const member = members.find((m) => m.id === form.memberId);
    if (!member) return setError("Member not found");

    const cashAcc = accounts.find((a) => a.individual === "Cash");
    const arAcc = accounts.find((a) => a.individual === "Accounts Receivable");
    const revenueAcc = accounts.find((a) => a.individual === "Sales" || a.individual === "Sales Revenue");
    if (!revenueAcc) return setError("Revenue account not found");

    let debitAcc = cashAcc;
    if (form.paymentType === "credit") debitAcc = arAcc;
    if (!debitAcc) return setError("Required debit account not found");

    setSaving(true);
    try {
      await addDoc(collection(db, "salesInvoices"), {
        memberId: form.memberId,
        memberName: `${member.firstName || ""} ${member.lastName || ""}`.trim(),
        product: form.product,
        quantity: parseFloat(form.quantity) || 0,
        price: parseFloat(form.price) || 0,
        total,
        paymentType: form.paymentType,
        date: form.date,
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "journalEntries"), {
        refNumber: form.refNumber,
        date: form.date,
        description: `Sale of ${form.product}`,
        lines: [
          {
            accountId: debitAcc.id,
            debit: total,
            credit: 0,
            memo: `Sale to ${member.firstName || member.email}`,
          },
          {
            accountId: revenueAcc.id,
            debit: 0,
            credit: total,
            memo: form.product,
          },
        ],
        createdAt: serverTimestamp(),
        createdBy: window.firebaseAuth?.currentUser?.email || null,
      });

      setForm({
        memberId: "",
        product: "",
        quantity: 1,
        price: "",
        paymentType: "cash",
        date: new Date().toISOString().slice(0, 10),
        refNumber: (parseInt(form.refNumber, 10) + 1).toString().padStart(5, "0"),
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Sales / Invoice Receipt</h3>
      {error && <div className="text-rose-600 mb-2">{error}</div>}
      <form onSubmit={handleSubmit} className="grid gap-4 max-w-xl">
        <label className="block">
          <span className="text-sm">Member</span>
          <select
            className="input"
            value={form.memberId}
            onChange={(e) => setForm({ ...form, memberId: e.target.value })}
          >
            <option value="">Select member</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {(m.firstName || "") + " " + (m.lastName || "") || m.email}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm">Product</span>
          <input
            className="input"
            value={form.product}
            onChange={(e) => setForm({ ...form, product: e.target.value })}
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm">Quantity</span>
            <input
              type="number"
              className="input"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-sm">Price</span>
            <input
              type="number"
              className="input"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm">Payment Type</span>
          <select
            className="input"
            value={form.paymentType}
            onChange={(e) => setForm({ ...form, paymentType: e.target.value })}
          >
            <option value="cash">Cash</option>
            <option value="credit">Credit</option>
          </select>
        </label>
        <div>Total: {total.toFixed(2)}</div>
        <button disabled={saving} className="btn btn-primary">
          {saving ? "Saving..." : "Save Receipt"}
        </button>
      </form>
    </div>
  );
}

