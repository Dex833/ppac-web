import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Income", "Expense"];

/* ---------- CSV helper ---------- */
const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/* ---------- Lightweight custom combobox for "Main Account" ---------- */
function MainCombo({
  value,
  onChange,
  options,
  placeholder = "Main Account",
  inputClass = "",
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || "");

  useEffect(() => setQ(value || ""), [value]);

  const filtered = useMemo(() => {
    const s = (q || "").toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(s)).slice(0, 12);
  }, [options, q]);

  return (
    <div className="relative">
      <input
        className={`border rounded px-2 py-1 ${inputClass}`}
        placeholder={placeholder}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        })}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)} // allow click
      />
      <button
        type="button"
        className="absolute right-1 top-1/2 -translate-y-1/2 px-1 text-gray-500"
        onMouseDown={(e) => {
          e.preventDefault(); // don't blur input
          setOpen((v) => !v);
        }}
        aria-label="Toggle options"
        title="Show options"
      >
        ▾
      </button>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded border bg-white shadow">
          {filtered.map((opt) => (
            <div
              key={opt}
              className="px-2 py-1 cursor-pointer hover:bg-gray-100"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt);
                setQ(opt);
                setOpen(false);
              }}
              title={opt}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({
    main: "",
    individual: "",
    type: "Asset",
    description: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({
    main: "",
    individual: "",
    type: "Asset",
    description: "",
  });
  const [sortBy, setSortBy] = useState("code");
  const [sortDir, setSortDir] = useState("asc");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(q, (snap) => {
      setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Unique main names for the combo suggestions
  const mainOptions = useMemo(() => {
    const set = new Set(
      accounts
        .filter((a) => !a.archived)
        .map((a) => (a.main || "").trim())
        .filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accounts]);

  function getTypePrefix(type) {
    switch (type) {
      case "Asset":
        return 1000;
      case "Liability":
        return 2000;
      case "Equity":
        return 3000;
      case "Income":
        return 4000; // keeping your existing data
      case "Expense":
        return 5000;
      default:
        return 9000;
    }
  }

  function getNextCode(type) {
    const prefix = getTypePrefix(type);
    const codes = accounts
      .filter((a) => a.type === type)
      .map((a) => Number(a.code))
      .filter((c) => !Number.isNaN(c) && c >= prefix && c < prefix + 1000);
    if (codes.length === 0) return prefix + 1;
    return Math.max(...codes) + 1;
  }

  function isDuplicate(main, individual, type) {
    return accounts.some(
      (a) =>
        (a.main || "").trim().toLowerCase() === main.trim().toLowerCase() &&
        (a.individual || "").trim().toLowerCase() ===
          individual.trim().toLowerCase() &&
        a.type === type &&
        a.archived !== true
    );
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.main.trim() || !form.individual.trim()) return;
    if (isDuplicate(form.main, form.individual, form.type)) {
      alert("Duplicate account for this main/individual/type.");
      return;
    }
    setSaving(true);
    try {
      const code = getNextCode(form.type);
      await addDoc(collection(db, "accounts"), {
        code,
        main: form.main.trim(),
        individual: form.individual.trim(),
        type: form.type,
        description: (form.description || "").trim(),
        archived: false,
        createdAt: new Date(),
        createdBy: window.firebaseAuth?.currentUser?.email || null,
      });
      setForm({ main: "", individual: "", type: "Asset", description: "" });
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(id) {
    if (!window.confirm("Archive (deactivate) this account?")) return;
    await updateDoc(doc(db, "accounts", id), {
      archived: true,
      archivedAt: new Date(),
      archivedBy: window.firebaseAuth?.currentUser?.email || null,
    });
  }

  function handleEdit(acc) {
    setEditId(acc.id);
    setEditForm({
      main: acc.main || "",
      individual: acc.individual || "",
      type: acc.type || "Asset",
      description: acc.description || "",
    });
  }

  async function handleEditSave(id) {
    if (!editForm.main.trim() || !editForm.individual.trim()) return;
    const orig = accounts.find((a) => a.id === id);
    const changingIdentity =
      editForm.main !== (orig?.main || "") ||
      editForm.individual !== (orig?.individual || "") ||
      editForm.type !== (orig?.type || "");
    if (
      changingIdentity &&
      isDuplicate(editForm.main, editForm.individual, editForm.type)
    ) {
      alert("Duplicate account for this main/individual/type.");
      return;
    }
    await updateDoc(doc(db, "accounts", id), {
      main: editForm.main.trim(),
      individual: editForm.individual.trim(),
      type: editForm.type,
      description: (editForm.description || "").trim(),
      updatedAt: new Date(),
      updatedBy: window.firebaseAuth?.currentUser?.email || null,
    });
    setEditId(null);
  }

  function handleEditCancel() {
    setEditId(null);
  }

  function handleSort(field) {
    if (sortBy === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  }

  function getSorted(filtered) {
    return [...filtered].sort((a, b) => {
      let v1 = a[sortBy],
        v2 = b[sortBy];
      if (typeof v1 === "string") v1 = v1.toLowerCase();
      if (typeof v2 === "string") v2 = v2.toLowerCase();
      if (v1 < v2) return sortDir === "asc" ? -1 : 1;
      if (v1 > v2) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  function handleExport() {
    setExporting(true);

    const rows = accounts
      .filter((a) => !a.archived)
      .map((a) => [a.code, a.main, a.individual, a.type, a.description || ""]);

    const header = [
      "Code",
      "Main Account",
      "Individual Account",
      "Type",
      "Description",
    ];

    const csv = [header.map(csvEscape).join(",")]
      .concat(rows.map((r) => r.map(csvEscape).join(",")))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chart-of-accounts.csv";
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
      setExporting(false);
    }, 500);
  }

  // Search and filter
  const filtered = accounts.filter((a) => {
    if (a.archived) return false;
    const s = search.trim().toLowerCase();
    return (
      (a.main || "").toLowerCase().includes(s) ||
      (a.individual || "").toLowerCase().includes(s) ||
      (a.type || "").toLowerCase().includes(s) ||
      (a.description || "").toLowerCase().includes(s)
    );
  });
  const sorted = getSorted(filtered);

  // Group by main account
  const grouped = {};
  for (const acc of sorted) {
    const m = (acc.main || "").trim();
    if (!grouped[m]) grouped[m] = [];
    grouped[m].push(acc);
  }

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Chart of Accounts</h3>

      {/* Add form */}
      <form className="flex flex-wrap gap-2 mb-6" onSubmit={handleAdd}>
        {/* Main Account as custom combo */}
        <MainCombo
          value={form.main}
          onChange={(val) => setForm((f) => ({ ...f, main: val }))}
          options={mainOptions}
          inputClass="w-40"
        />

        <input
          className="border rounded px-2 py-1 w-48"
          placeholder="Individual Account"
          value={form.individual}
          onChange={(e) =>
            setForm((f) => ({ ...f, individual: e.target.value }))
          }
          onBlur={(e) =>
            setForm((f) => ({ ...f, individual: e.target.value.trim() }))
          }
          required
        />

        <select
          className="border rounded px-2 py-1"
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <input
          className="border rounded px-2 py-1 w-56"
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          onBlur={(e) =>
            setForm((f) => ({ ...f, description: e.target.value.trim() }))
          }
        />

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Adding…" : "Add Account"}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={handleExport}
          disabled={exporting}
        >
          Export CSV
        </button>
      </form>

      {/* Search */}
      <input
        className="border rounded px-2 py-1 mb-4 w-80"
        placeholder="Search accounts…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border rounded">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="text-left p-2 border-b cursor-pointer"
                  onClick={() => handleSort("code")}
                >
                  Code {sortBy === "code" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th
                  className="text-left p-2 border-b cursor-pointer"
                  onClick={() => handleSort("main")}
                >
                  Main Account{" "}
                  {sortBy === "main" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th
                  className="text-left p-2 border-b cursor-pointer"
                  onClick={() => handleSort("individual")}
                >
                  Individual Account{" "}
                  {sortBy === "individual" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th
                  className="text-left p-2 border-b cursor-pointer"
                  onClick={() => handleSort("type")}
                >
                  Type {sortBy === "type" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="text-left p-2 border-b">Description</th>
                <th className="text-left p-2 border-b">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(grouped).map((main) => (
                <React.Fragment key={main || "(blank)"}>
                  <tr className="bg-blue-50">
                    <td colSpan={6} className="font-bold p-2 border-b">
                      {main || "(blank main)"}
                    </td>
                  </tr>
                  {grouped[main].map((acc) => (
                    <tr key={acc.id} className="odd:bg-white even:bg-gray-50">
                      <td className="p-2 border-b font-mono">{acc.code}</td>

                      {/* EDITABLE Main uses the same combo */}
                      <td className="p-2 border-b">
                        {editId === acc.id ? (
                          <MainCombo
                            value={editForm.main}
                            onChange={(val) =>
                              setEditForm((f) => ({ ...f, main: val }))
                            }
                            options={mainOptions}
                            inputClass="w-32"
                          />
                        ) : (
                          acc.main
                        )}
                      </td>

                      <td className="p-2 border-b">
                        {editId === acc.id ? (
                          <input
                            className="border rounded px-2 py-1 w-40"
                            value={editForm.individual}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                individual: e.target.value,
                              }))
                            }
                            onBlur={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                individual: e.target.value.trim(),
                              }))
                            }
                          />
                        ) : (
                          acc.individual
                        )}
                      </td>

                      <td className="p-2 border-b">
                        {editId === acc.id ? (
                          <select
                            className="border rounded px-2 py-1"
                            value={editForm.type}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, type: e.target.value }))
                            }
                          >
                            {ACCOUNT_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        ) : (
                          acc.type
                        )}
                      </td>

                      <td className="p-2 border-b">
                        {editId === acc.id ? (
                          <input
                            className="border rounded px-2 py-1 w-40"
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                description: e.target.value,
                              }))
                            }
                            onBlur={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                description: e.target.value.trim(),
                              }))
                            }
                          />
                        ) : (
                          acc.description
                        )}
                      </td>

                      <td className="p-2 border-b">
                        {editId === acc.id ? (
                          <>
                            <button
                              className="btn btn-sm btn-primary mr-1"
                              onClick={() => handleEditSave(acc.id)}
                            >
                              Save
                            </button>
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={handleEditCancel}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-sm btn-outline mr-1"
                              onClick={() => handleEdit(acc)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => handleArchive(acc.id)}
                            >
                              Archive
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-gray-500 text-center">
                    No accounts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}