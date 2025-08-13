// src/pages/reports/Reports.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../../lib/firebase";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  query,
} from "firebase/firestore";
import useUserProfile from "../../hooks/useUserProfile";

/* ----------------------------- utils ----------------------------- */
const S = (v) => String(v ?? "");

function toMillis(v) {
  if (!v) return 0;
  if (typeof v === "string" || typeof v === "number") return new Date(v).getTime() || 0;
  if (v?.toDate) return v.toDate().getTime();
  return 0;
}
function fmtDateTime(v) {
  if (!v) return "";
  if (typeof v === "string" || typeof v === "number") {
    const t = new Date(v);
    return isNaN(t.getTime()) ? S(v) : t.toLocaleString();
  }
  if (v?.toDate) return v.toDate().toLocaleString();
  return S(v);
}
function periodLabel(r) {
  const L = r?.from || "—";
  const R = r?.to || "—";
  return L === R ? `as of ${R}` : `${L} → ${R}`;
}
function typeLabel(t) {
  switch (t) {
    case "incomeStatement": return "Income Statement";
    case "balanceSheet": return "Balance Sheet";
    case "cashFlow": return "Cash Flow";
    default: return S(t || "Unknown");
  }
}
function typeBadgeColor(t) {
  switch (t) {
    case "incomeStatement": return "bg-emerald-100 text-emerald-800";
    case "balanceSheet": return "bg-sky-100 text-sky-800";
    case "cashFlow": return "bg-violet-100 text-violet-800";
    default: return "bg-gray-100 text-gray-700";
  }
}

/* ---------------------------- component -------------------------- */
export default function Reports() {
  const nav = useNavigate();
  const { profile } = useUserProfile();
  const roles = Array.isArray(profile?.roles) ? profile.roles : profile?.role ? [profile.role] : [];
  const canDelete = roles.includes("admin") || roles.includes("treasurer");

  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState([]);

  const [qType, setQType] = React.useState("all");
  const [qText, setQText] = React.useState("");

  React.useEffect(() => {
    setLoading(true);
    const ref = collection(db, "financialReports");
    // Keep query flexible in case some docs lack createdAt; we'll sort client-side
    const unsub = onSnapshot(query(ref), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        // sort by (to || from || createdAt) desc, then label
        const ta = toMillis(a.to) || toMillis(a.from) || toMillis(a.createdAt);
        const tb = toMillis(b.to) || toMillis(b.from) || toMillis(b.createdAt);
        if (tb !== ta) return tb - ta;
        return S(b.label).localeCompare(S(a.label));
      });
      setItems(rows);
      setLoading(false);
    }, (err) => {
      console.error("financialReports/onSnapshot error:", err);
      setItems([]);
      setLoading(false);
      alert("Failed to load reports: " + err.message);
    });
    return () => unsub();
  }, []);

  const filtered = React.useMemo(() => {
    const term = qText.trim().toLowerCase();
    return items.filter((r) => {
      if (qType !== "all" && r.type !== qType) return false;
      if (!term) return true;
      const hay = [
        r.type, typeLabel(r.type), r.label,
        r.createdBy, r.createdById, r.from, r.to,
      ].map(S).join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [items, qType, qText]);

  async function handleDelete(id) {
    if (!canDelete || !id) return;
    if (!window.confirm("Delete this saved report?")) return;
    await deleteDoc(doc(db, "financialReports", id));
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <h2 className="text-2xl font-bold">Reports</h2>
        <div className="sm:ml-auto grid grid-cols-1 sm:grid-cols-[160px,1fr] gap-2">
          <select
            className="border rounded px-2 py-2"
            value={qType}
            onChange={(e) => setQType(e.target.value)}
            title="Filter by type"
          >
            <option value="all">All types</option>
            <option value="incomeStatement">Income Statement</option>
            <option value="balanceSheet">Balance Sheet</option>
            <option value="cashFlow">Cash Flow</option>
          </select>
          <input
            className="border rounded px-3 py-2"
            placeholder="Search label, period, creator…"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500">No reports found.</div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li key={r.id} className="border border-gray-200 rounded px-3 py-2">
              <div className="flex items-start gap-3">
                <span
                  className={[
                    "inline-block px-2 py-1 rounded text-xs font-semibold shrink-0",
                    typeBadgeColor(r.type),
                  ].join(" ")}
                  title={r.type}
                >
                  {typeLabel(r.type)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {r.label || typeLabel(r.type)}
                  </div>
                  <div className="text-xs text-ink/70">
                    Period: <strong>{periodLabel(r)}</strong>
                    {r.createdBy && (
                      <>
                        {" · "}Saved by <span className="font-medium">{S(r.createdBy)}</span>
                      </>
                    )}
                    {r.createdAt && (
                      <>
                        {" · "}
                        <span title={S(r.createdAt)}>
                          {fmtDateTime(r.createdAt)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <Link to={`/reports/${r.id}`} className="btn btn-outline">
                    View
                  </Link>
                  {canDelete && (
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDelete(r.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 text-sm text-ink/60">
        Tip: Use the <strong>type filter</strong> and <strong>search</strong> to quickly find snapshots.
      </div>
    </div>
  );
}