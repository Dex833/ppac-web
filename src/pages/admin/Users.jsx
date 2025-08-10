// src/pages/admin/Users.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { db } from "../../lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  endBefore,
  limit,
  limitToLast,
  serverTimestamp,
  updateDoc,
  addDoc,
} from "firebase/firestore";

const PAGE_SIZE = 10;

// seed list; you can grow this over time via the "+ Add role" UI on page
const DEFAULT_ROLE_OPTIONS = [
  "admin",
  "member",
  "chairman",
  "bod",
  "secretary",
  "treasurer",
  "auditor",
  "committee chairman",
];

export default function Users() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState({}); // { [uid]: true }
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  // local role catalog shown as checkboxes (starts with defaults; can add more)
  const [roleOptions, setRoleOptions] = useState(DEFAULT_ROLE_OPTIONS);
  const [newRole, setNewRole] = useState("");

  // pagination state
  const [pageDocs, setPageDocs] = useState({ first: null, last: null });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const unsubRef = useRef(() => {});
  const cursorStack = useRef([]);

  function listenPage(opts = {}) {
    unsubRef.current?.();

    const base = collection(db, "users");
    let q = query(base, orderBy("email"), limit(PAGE_SIZE));
    if (opts.after) q = query(base, orderBy("email"), startAfter(opts.after), limit(PAGE_SIZE));
    if (opts.before) q = query(base, orderBy("email"), endBefore(opts.before), limitToLast(PAGE_SIZE));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => {
          const v = d.data() || {};
          const roles = Array.isArray(v.roles)
            ? v.roles
            : v.role
            ? [v.role] // migrate old single role on the fly
            : [];
        return {
            id: d.id,
            ...v,
            roles,
            _doc: d,
          };
        });
        setRows(data);
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
        console.error("[users] listener error:", err);
        setLoading(false);
      }
    );
    unsubRef.current = unsub;
  }

  useEffect(() => {
    listenPage();
    return () => unsubRef.current?.();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((u) => {
      const email = (u.email || "").toLowerCase();
      const name = (u.displayName || "").toLowerCase();
      const mid = (u.memberId || "").toString().toLowerCase();
      return email.includes(s) || name.includes(s) || mid.includes(s);
    });
  }, [rows, search]);

  const nextPage = () => {
    if (!pageDocs.last) return;
    if (pageDocs.first) cursorStack.current.push(pageDocs.first);
    listenPage({ after: pageDocs.last });
  };
  const prevPage = () => {
    const prev = cursorStack.current.pop();
    if (!prev) return;
    listenPage({ before: prev });
  };

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 1800);
  }

  async function writeAudit(action, targetUid, extra) {
    try {
      const actor = getAuth().currentUser;
      await addDoc(collection(db, "adminLogs"), {
        action,              // 'setRoles' | 'toggleSuspend'
        targetUid,
        actorUid: actor?.uid ?? null,
        actorEmail: actor?.email ?? null,
        extra: extra || {},
        at: serverTimestamp(),
      });
    } catch (e) {
      console.warn("audit log failed:", e);
    }
  }

  // Toggle one role inside the roles[]
  async function toggleRole(uid, role, currentRoles) {
    const next = currentRoles.includes(role)
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];

    setSaving((s) => ({ ...s, [uid]: true }));
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === uid ? { ...r, roles: next } : r)));

    try {
      await updateDoc(doc(db, "users", uid), {
        roles: next,               // plain strings, e.g., ["admin","member"]
        updatedAt: serverTimestamp(),
      });
      await writeAudit("setRoles", uid, { roles: next });
      showToast("Roles updated");
    } catch (e) {
      console.error(e);
      setRows(prev); // rollback
      showToast("Failed to update roles", "error");
    } finally {
      setSaving((s) => {
        const { [uid]: _, ...rest } = s;
        return rest;
      });
    }
  }

  async function toggleSuspend(uid, current) {
    setSaving((s) => ({ ...s, [uid]: true }));
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === uid ? { ...r, suspended: !current } : r)));

    try {
      await updateDoc(doc(db, "users", uid), {
        suspended: !current,
        updatedAt: serverTimestamp(),
      });
      await writeAudit("toggleSuspend", uid, { to: !current });
      showToast(!current ? "User suspended" : "User unsuspended");
    } catch (e) {
      console.error(e);
      setRows(prev);
      showToast("Failed to update", "error");
    } finally {
      setSaving((s) => {
        const { [uid]: _, ...rest } = s;
        return rest;
      });
    }
  }

  function addRoleToCatalog() {
    const r = newRole.trim().toLowerCase();
    if (!r) return;
    if (roleOptions.includes(r)) {
      setNewRole("");
      return;
    }
    setRoleOptions((opts) => [...opts, r]);
    setNewRole("");
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div
          className={`rounded border px-3 py-2 text-sm ${
            toast.type === "error"
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* catalog controls */}
      <div className="flex items-center gap-2">
        <input
          className="border rounded px-3 py-2 w-64"
          placeholder='Add new role (e.g., "inventory")'
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addRoleToCatalog()}
        />
        <button className="px-3 py-2 border rounded" onClick={addRoleToCatalog}>
          + Add role
        </button>
        <div className="ml-auto flex gap-2">
          <button
            onClick={prevPage}
            disabled={!canPrev}
            className="px-3 py-1 border rounded disabled:opacity-40"
          >
            ← Prev
          </button>
          <button
            onClick={nextPage}
            disabled={!canNext}
            className="px-3 py-1 border rounded disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email, name, or member ID…"
          className="border rounded px-3 py-2 w-80"
        />
        <span className="text-sm text-gray-600">
          Showing {filtered.length} of {rows.length} (page size {PAGE_SIZE})
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full border border-gray-200 rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">Email</th>
              <th className="text-left p-2 border-b">Name</th>
              <th className="text-left p-2 border-b">Member ID</th>
              <th className="text-left p-2 border-b">Roles</th>
              <th className="text-left p-2 border-b">Suspended</th>
              <th className="text-left p-2 border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-4 text-gray-500" colSpan={6}>
                  Loading users…
                </td>
              </tr>
            )}
            {!loading && filtered.map((u) => {
              const busy = !!saving[u.id];
              return (
                <tr key={u.id} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border-b">{u.email || "—"}</td>
                  <td className="p-2 border-b">{u.displayName || "—"}</td>
                  <td className="p-2 border-b">{u.memberId || "—"}</td>
                  <td className="p-2 border-b">
                    <div className="flex flex-wrap gap-2">
                      {roleOptions.map((r) => {
                        const checked = u.roles?.includes(r);
                        return (
                          <label key={r} className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={!!checked}
                              disabled={busy}
                              onChange={() => toggleRole(u.id, r, u.roles || [])}
                            />
                            <span className="text-sm">{r}</span>
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td className="p-2 border-b">{u.suspended ? "Yes" : "No"}</td>
                  <td className="p-2 border-b">
                    <button
                      onClick={() => toggleSuspend(u.id, u.suspended)}
                      disabled={busy}
                      className="px-3 py-1 border rounded disabled:opacity-50"
                    >
                      {busy ? "Saving…" : u.suspended ? "Unsuspend" : "Suspend"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td className="p-4 text-gray-500" colSpan={6}>
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
