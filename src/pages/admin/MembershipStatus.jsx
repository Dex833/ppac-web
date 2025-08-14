// src/pages/admin/MembershipStatus.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useNavigate } from "react-router-dom";

export default function MembershipStatusAdmin() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState(""); // '', 'pending', 'validating', 'full'
  const nav = useNavigate();

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("email"));
    const unsub = onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const f = filter.trim();
    return f ? rows.filter((r) => (r.membershipStatus || "").toLowerCase() === f) : rows;
  }, [rows, filter]);

  // navigation to review page
  function review(uid) {
    if (!uid) return;
    nav(`/admin/membership-status/${uid}`);
  }

  async function revertToValidating(uid) {
    if (!uid) return;
    if (!window.confirm("Revert this member back to validating?")) return;
    await updateDoc(doc(db, "users", uid), { membershipStatus: "validating" });
    try {
      await updateDoc(doc(db, "members", uid), { membershipStatus: "validating" });
    } catch {}
  }

  return (
  <div className="space-y-3">
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <label className="text-sm">Filter:</label>
        <select
      className="border rounded px-2 py-1 w-full sm:w-auto"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="validating">Validating</option>
          <option value="full">Full</option>
        </select>
      </div>

    <div className="overflow-x-auto">
        <table className="min-w-[800px] w-full border border-gray-200 rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">Email</th>
              <th className="text-left p-2 border-b">Name</th>
              <th className="text-left p-2 border-b">Class</th>
              <th className="text-left p-2 border-b">Status</th>
              <th className="text-left p-2 border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b">{u.email || "—"}</td>
                <td className="p-2 border-b">{u.displayName || "—"}</td>
                <td className="p-2 border-b">{u.memberType || "—"}</td>
                <td className="p-2 border-b">
                  <span
                    className={`px-2 py-0.5 rounded text-xs border ${
                      u.membershipStatus === "full"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : u.membershipStatus === "validating"
                        ? "bg-blue-50 border-blue-200 text-blue-800"
                        : "bg-amber-50 border-amber-200 text-amber-800"
                    }`}
                  >
                    {u.membershipStatus || "pending"}
                  </span>
                </td>
                <td className="p-2 border-b">
                  {u.membershipStatus === "validating" && (
                    <button
                      className="px-3 py-1 border rounded"
                      onClick={() => review(u.id)}
                    >
                      Review
                    </button>
                  )}
                  {u.membershipStatus === "full" && (
                    <button
                      className="px-3 py-1 border rounded text-amber-800 hover:bg-amber-50"
                      onClick={() => revertToValidating(u.id)}
                    >
                      Revert to Validating
                    </button>
                  )}
                  {(!u.membershipStatus || u.membershipStatus === "pending") && (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
      {filtered.length === 0 && (
              <tr>
        <td className="p-4 text-gray-500" colSpan={5}>No results.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
