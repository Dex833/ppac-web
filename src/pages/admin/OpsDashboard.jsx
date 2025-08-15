import React, { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { Link } from "react-router-dom";

function toISO(v) {
  try {
    if (!v) return "";
    if (typeof v.toDate === "function") return v.toDate().toISOString();
    return new Date(v).toISOString();
  } catch {
    return "";
  }
}

export default function OpsDashboard() {
  const [failed, setFailed] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [ops, setOps] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const qFailed = query(collection(db, "payments"), where("status", "==", "paid"), where("posting.status", "==", "failed"), orderBy("createdAt", "desc"), limit(50));
        const sF = await getDocs(qFailed).catch(async () => {
          // fallback when index missing
          const s = await getDocs(query(collection(db, "payments"), where("status", "==", "paid")));
          return { docs: s.docs.filter((d) => (d.data()?.posting?.status || "") === "failed") };
        });
        setFailed(sF.docs.map((d) => ({ id: d.id, ...d.data() })));

        const since = Date.now() - 24 * 60 * 60 * 1000;
        const sAny = await getDocs(query(collection(db, "payments"), where("status", "==", "paid")));
        const r = sAny.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => (p.posting?.status || "") === "posted")
          .filter((p) => {
            const t = (p.posting?.lastFinishedAt?.toDate?.() || new Date(0)).getTime();
            return t >= since;
          })
          .sort((a, b) => ((b.posting?.lastFinishedAt?.toDate?.() || 0) - (a.posting?.lastFinishedAt?.toDate?.() || 0)));
        setRecent(r.slice(0, 50));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function loadOps(id) {
    setOps([]);
    try {
      const s = await getDocs(query(collection(db, `payments/${id}/ops`), orderBy("startedAt", "desc")));
      setOps(s.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Ops Dashboard</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-3">
          <div className="font-semibold mb-2">Failed postings</div>
          {loading ? (
            <div className="text-sm text-ink/60">Loading…</div>
          ) : failed.length === 0 ? (
            <div className="text-sm text-ink/60">None</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[800px] w-full border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left border-b">Created</th>
                    <th className="p-2 text-left border-b">Member</th>
                    <th className="p-2 text-right border-b">Amount</th>
                    <th className="p-2 text-left border-b">Type</th>
                    <th className="p-2 text-left border-b">Method</th>
                    <th className="p-2 text-left border-b">Attempts</th>
                    <th className="p-2 text-left border-b">Error</th>
                    <th className="p-2 text-left border-b">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {failed.map((p) => (
                    <tr key={p.id} className="odd:bg-white even:bg-gray-50">
                      <td className="p-2 border-b">{toISO(p.createdAt)}</td>
                      <td className="p-2 border-b">{p.memberName || p.userEmail || p.userId || p.uid || "—"}</td>
                      <td className="p-2 border-b text-right font-mono">{Number(p.amount || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                      <td className="p-2 border-b">{p.type}</td>
                      <td className="p-2 border-b">{p.method}</td>
                      <td className="p-2 border-b">{p.posting?.attempts || 0}</td>
                      <td className="p-2 border-b max-w-[280px] truncate" title={p.posting?.error || ""}>{p.posting?.error || ""}</td>
                      <td className="p-2 border-b">
                        <div className="flex gap-2">
                          <Link className="btn btn-sm btn-outline" to={`/admin/payments`} state={{ openId: p.id }}>Open payment</Link>
                          <Link className="btn btn-sm btn-primary" to={`/receipt/${p.id}`} target="_self">Open receipt</Link>
                          <button className="btn btn-sm" onClick={() => { setSel(p); loadOps(p.id); }}>Attempts</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card p-3">
          <div className="font-semibold mb-2">Recently fixed (24h)</div>
          {loading ? (
            <div className="text-sm text-ink/60">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="text-sm text-ink/60">None</div>
          ) : (
            <ul className="divide-y">
              {recent.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{p.memberName || p.userEmail || p.userId || p.uid || "—"}</div>
                    <div className="text-xs text-ink/60">{p.type} • {p.method} • {toISO(p.posting?.lastFinishedAt)}</div>
                  </div>
                  <div className="font-mono">
                    ₱{Number(p.amount || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {sel && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSel(null)} />
          <div className="absolute right-0 top-0 h-full w-full sm:w-[520px] bg-white shadow-2xl p-4 overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Attempts for {sel.id}</div>
              <button className="rounded px-2 py-1 hover:bg-gray-100" onClick={() => setSel(null)}>✕</button>
            </div>
            <div className="space-y-2 text-sm">
              {ops.map((o) => (
                <div key={o.id} className="border rounded p-2">
                  <div>Started: {toISO(o.startedAt)}</div>
                  <div>Finished: {toISO(o.finishedAt)}</div>
                  <div>Success: {String(o.success)}</div>
                  {o.error ? <div className="text-rose-700">Error: {o.error}</div> : null}
                </div>
              ))}
              {ops.length === 0 && <div className="text-ink/60">No attempts logged.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
