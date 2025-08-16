import React, { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Link } from "react-router-dom";
import { formatDT } from "@/utils/dates";

export default function AdminOrders() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let qBase = collection(db, "orders");
    if (status) qBase = query(qBase, where("status", "==", status));
    qBase = query(qBase, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qBase, (s) => {
      setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [status]);

  return (
    <div className="mx-auto max-w-6xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orders</h1>
        <label className="flex items-center gap-2">
          <span className="text-sm text-ink/60">Status</span>
          <select className="input" value={status} onChange={(e)=>setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="canceled">Canceled</option>
          </select>
        </label>
      </div>
      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {loading && <div className="card p-3">Loading…</div>}
        {!loading && rows.length === 0 && <div className="card p-3 text-ink/60">No orders.</div>}
        {!loading && rows.map((r) => (
          <div key={r.id} className="card p-3">
            <div className="flex items-center justify-between text-sm">
              <div className="text-ink/70">{formatDT(r.createdAt)}</div>
              <div className="font-medium">{r.status || "pending"}</div>
            </div>
            <div className="mt-1 text-sm">Buyer: {r.buyerName || r.userId || "—"}</div>
            <ul className="mt-2 list-disc ml-5 text-sm">
              {(r.items||[]).map((it,i)=>(<li key={i}>{it.qty} × {it.name}</li>))}
            </ul>
            <div className="mt-2 flex items-center justify-between">
              <div className="font-mono">₱{Number(r.subtotal||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
              <div className="flex gap-2">
                {r.paymentId && (
                  <>
                    <Link className="btn btn-sm btn-outline" to={`/admin/payments?open=${r.paymentId}`}>Open Payment</Link>
                    {r.status === "paid" && (
                      <Link className="btn btn-sm btn-primary" to={`/receipt/${r.paymentId}`}>Receipt</Link>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="overflow-x-auto hidden sm:block">
    <table className="min-w-[1000px] w-full border rounded">
          <thead className="bg-gray-50">
            <tr>
      <th className="text-left p-2 border-b">Date</th>
      <th className="text-left p-2 border-b">Buyer</th>
      <th className="text-left p-2 border-b">Items</th>
      <th className="text-right p-2 border-b">Total</th>
      <th className="text-left p-2 border-b">Status</th>
      <th className="text-left p-2 border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="p-3" colSpan={5}>Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td className="p-3 text-ink/60" colSpan={5}>No orders.</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b">{formatDT(r.createdAt)}</td>
                <td className="p-2 border-b">{r.buyerName || r.userId || "—"}</td>
                <td className="p-2 border-b text-sm">
                  <ul className="list-disc ml-4">
                    {(r.items||[]).map((it,i)=>(<li key={i}>{it.qty} × {it.name}</li>))}
                  </ul>
                </td>
                <td className="p-2 border-b text-right font-mono">₱{Number(r.subtotal||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                <td className="p-2 border-b">{r.status||"pending"}</td>
                <td className="p-2 border-b">
                  <div className="flex items-center gap-2">
                    {r.paymentId && (
                      <>
                        <Link className="btn btn-sm btn-outline" to={`/admin/payments?open=${r.paymentId}`}>Open Payment</Link>
                        {r.status === "paid" && (
                          <Link className="btn btn-sm btn-primary" to={`/receipt/${r.paymentId}`}>Receipt</Link>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// date formatting centralized in utils/dates
