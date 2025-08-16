// src/pages/admin/MembershipStatus.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  startAfter,
  endBefore,
  limit,
  limitToLast,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useNavigate } from "react-router-dom";

export default function MembershipStatusAdmin() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState(""); // '', 'pending', 'validating', 'full'
  const [loading, setLoading] = useState(true);
  const [pageDocs, setPageDocs] = useState({ first: null, last: null });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const cursorStack = useRef([]);
  const unsubRef = useRef(() => {});
  const nav = useNavigate();

  const PAGE_SIZE = 10;

  function listenPage(opts = {}) {
    unsubRef.current?.();

    const base = collection(db, "users");
    const hasFilter = !!filter;
    let qy = hasFilter
      ? query(base, where("membershipStatus", "==", filter), orderBy("email"), limit(PAGE_SIZE))
      : query(base, orderBy("email"), limit(PAGE_SIZE));
    if (opts.after) {
      qy = hasFilter
        ? query(base, where("membershipStatus", "==", filter), orderBy("email"), startAfter(opts.after), limit(PAGE_SIZE))
        : query(base, orderBy("email"), startAfter(opts.after), limit(PAGE_SIZE));
    }
    if (opts.before) {
      qy = hasFilter
        ? query(base, where("membershipStatus", "==", filter), orderBy("email"), endBefore(opts.before), limitToLast(PAGE_SIZE))
        : query(base, orderBy("email"), endBefore(opts.before), limitToLast(PAGE_SIZE));
    }

    setLoading(true);
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data(), _doc: d })));
        if (snap.docs.length) {
          setPageDocs({ first: snap.docs[0], last: snap.docs[snap.docs.length - 1] });
        } else {
          setPageDocs({ first: null, last: null });
        }
        setCanPrev(cursorStack.current.length > 0 || !!opts.before);
        setCanNext(snap.size === PAGE_SIZE);
        setLoading(false);
      },
      (err) => {
        console.error("[membership-status] listener error:", err);
        setLoading(false);
      }
    );
    unsubRef.current = unsub;
  }

  useEffect(() => {
    // reset cursors when filter changes
    cursorStack.current = [];
    listenPage();
    return () => unsubRef.current?.();
  }, [filter]);

  const filtered = useMemo(() => {
    // rows are already filtered server-side if filter is set
    return rows;
  }, [rows]);

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
      {/* Controls */}
      <div className="card p-3 flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-2">
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
        <div className="sm:ml-auto flex gap-2">
          <button
            className="px-3 py-1 border rounded disabled:opacity-40"
            onClick={() => {
              const prev = cursorStack.current.pop();
              if (!prev) return;
              listenPage({ before: prev });
            }}
            disabled={!canPrev}
          >
            ← Prev
          </button>
          <button
            className="px-3 py-1 border rounded disabled:opacity-40"
            onClick={() => {
              if (!pageDocs.last) return;
              if (pageDocs.first) cursorStack.current.push(pageDocs.first);
              listenPage({ after: pageDocs.last });
            }}
            disabled={!canNext}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {loading && <div className="card p-3 text-gray-600">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="card p-3 text-gray-500">No results.</div>
        )}
        {!loading && filtered.map((u) => (
          <div key={u.id} className="card p-3 space-y-2">
            <div className="text-sm font-medium">{u.displayName || "—"}</div>
            <div className="text-xs text-ink/70 break-all">{u.email || "—"}</div>
            <div className="text-xs">Class: {u.memberType || "—"}</div>
            <div>
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
            </div>
            <div className="flex gap-2">
              {u.membershipStatus === "validating" && (
                <button className="px-3 py-1 border rounded" onClick={() => review(u.id)}>
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
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="overflow-x-auto hidden sm:block">
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
            {loading && (
              <tr>
                <td className="p-4 text-gray-500" colSpan={5}>Loading…</td>
              </tr>
            )}

            {!loading && filtered.map((u) => (
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
      {!loading && filtered.length === 0 && (
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
