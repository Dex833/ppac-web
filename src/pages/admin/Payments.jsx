import React, { useEffect, useRef, useState } from "react";
import { db, functions } from "@/lib/firebase";
import {
  collection,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  addDoc,
  startAfter,
} from "firebase/firestore";
import { useAuth } from "../../AuthContext";
import { httpsCallable } from "firebase/functions";
import { buildMemberDisplayName } from "../../lib/names";
import PostingResultDialog from "../../components/modals/PostingResultDialog.jsx";
import { useNavigate, useSearchParams } from "react-router-dom";
import { yyyymmdd_hhmm, toISO } from "../../lib/format";
import { formatDT } from "@/utils/dates";

const STATUS_OPTIONS = ["pending", "paid", "rejected"]; // default filter 'pending'
const TYPE_OPTIONS = ["membership_fee", "share_capital", "purchase", "loan_repayment", "other"];
const METHOD_OPTIONS = ["cash_counter", "gcash_manual", "bank_transfer", "static_qr", "other"];

function StatusBadge({ s }) {
  const cls =
    s === "paid"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : s === "rejected"
      ? "bg-rose-50 text-rose-800 border-rose-200"
      : "bg-amber-50 text-amber-800 border-amber-200";
  const icon =
    s === "paid"
      ? (
          <svg className="inline mr-1" width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#34d399"/><path d="M6 10.5l3 3 5-6" stroke="#065f46" strokeWidth="2" fill="none"/></svg>
        )
      : s === "rejected"
      ? (
          <svg className="inline mr-1" width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#f87171"/><path d="M7 7l6 6M13 7l-6 6" stroke="#7f1d1d" strokeWidth="2" fill="none"/></svg>
        )
      : (
          <svg className="inline mr-1" width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#fbbf24"/><path d="M10 5v5m0 3h.01" stroke="#92400e" strokeWidth="2" fill="none"/></svg>
        );
  return <span className={`inline-block text-xs px-2 py-0.5 rounded border ${cls}`}>{icon}{s}</span>;
}

// centralized date formatting

export default function AdminPaymentsList() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  // Filters
  const [status, setStatus] = useState("pending");
  const [type, setType] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState(""); // YYYY-MM-DD
  const [to, setTo] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const unsubRef = useRef(() => {});

  // Pagination state
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [cursors, setCursors] = useState([]); // array of last doc per page

  async function fetchPage(pageNum, direction) {
    setLoading(true);
    let q = query(collection(db, "payments"));
    if (status) q = query(q, where("status", "==", status));
    if (type) q = query(q, where("type", "==", type));
    if (method) q = query(q, where("method", "==", method));
    if (from) q = query(q, where("createdAt", ">=", new Date(`${from}T00:00:00`)));
    if (to) q = query(q, where("createdAt", "<=", new Date(`${to}T23:59:59`)));
    q = query(q, orderBy("createdAt", "desc"), limit(101)); // fetch one extra to check next
    if (direction === "next" && cursors[pageNum - 1]) {
      q = query(q, startAfter(cursors[pageNum - 1]));
    } else if (direction === "prev" && cursors[pageNum - 2]) {
      q = query(q, startAfter(cursors[pageNum - 2]));
    }
    const snap = await getDocs(q);
    let docs = snap.docs;
    setHasNext(docs.length > 100);
    setHasPrev(pageNum > 0);
    if (docs.length > 100) docs = docs.slice(0, 100);
    setRows(docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoading(false);
    // Update cursors
    if (docs.length) {
      const newCursors = [...cursors];
      newCursors[pageNum] = docs[docs.length - 1];
      setCursors(newCursors);
    }
  }

  useEffect(() => {
    setPage(0);
    setCursors([]);
    fetchPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, type, method, from, to]);

  async function handleNextPage() {
    await fetchPage(page + 1, "next");
    setPage((p) => p + 1);
  }
  async function handlePrevPage() {
    await fetchPage(page - 1, "prev");
    setPage((p) => p - 1);
  }

  async function exportCsv() {
    // Recreate the same filtered query; for larger exports, page in chunks
    let qBase = query(collection(db, "payments"));
    if (status) qBase = query(qBase, where("status", "==", status));
    if (type) qBase = query(qBase, where("type", "==", type));
    if (method) qBase = query(qBase, where("method", "==", method));
    if (from) qBase = query(qBase, where("createdAt", ">=", new Date(`${from}T00:00:00`)));
    if (to) qBase = query(qBase, where("createdAt", "<=", new Date(`${to}T23:59:59`)));
    qBase = query(qBase, orderBy("createdAt", "desc"), limit(5000));

    const s = await getDocs(qBase);
    const items = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    const cols = [
      "createdAt","confirmedAt","status","receiptNo","memberName","userId","type","method","referenceNo","amount","principalPortion","interestPortion","linkedId","confirmedBy","notes"
    ];
    const rows = items.map((p) => ({
      createdAt: toISO(p.createdAt),
      confirmedAt: toISO(p.confirmedAt),
      status: p.status || "",
      receiptNo: p.receiptNo || "",
      memberName: p.memberName || p.userEmail || "",
      userId: p.userId || p.uid || "",
      type: p.type || "",
      method: p.method || "",
      referenceNo: p.referenceNo || p.refNo || "",
      amount: Number(p.amount || 0),
      principalPortion: p.type === "loan_repayment" ? Number(p.principalPortion || 0) : "",
      interestPortion: p.type === "loan_repayment" ? Number(p.interestPortion || 0) : "",
      linkedId: p.linkedId || "",
      confirmedBy: p.confirmedBy || "",
      notes: (p.notes || "").replace(/\r?\n/g, " ").trim(),
    }));
    const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = cols.map(csvEscape).join(",");
    const body = rows.map((r) => cols.map((k) => csvEscape(r[k])).join(",")).join("\n");
    const csv = header + "\n" + body;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments_${yyyymmdd_hhmm()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }



  // Open a payment drawer if ?open=<id> is present
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) setActiveId(openId);
  }, [searchParams]);

  const [activeId, setActiveId] = useState("");

  // removed backfill admin utility

  // Bulk actions
  function handleSelectAll(e) {
    setSelectAll(e.target.checked);
    setSelected(e.target.checked ? rows.map((r) => r.id) : []);
  }
  function handleSelectRow(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  async function bulkApprove() {
    if (!selected.length) return;
    if (!window.confirm(`Approve ${selected.length} payments?`)) return;
    for (const id of selected) {
      try {
        await updateDoc(doc(db, "payments", id), { status: "paid", confirmedBy: user?.uid || null, confirmedAt: serverTimestamp() });
      } catch {}
    }
    setSelected([]);
    setSelectAll(false);
  }
  async function bulkReject() {
    if (!selected.length) return;
    const reason = window.prompt("Reason for rejection (applies to all):");
    if (!reason || !reason.trim()) return;
    for (const id of selected) {
      try {
        await updateDoc(doc(db, "payments", id), { status: "rejected", confirmedBy: user?.uid || null, confirmedAt: serverTimestamp(), notes: `Rejected: ${reason.trim()}` });
      } catch {}
    }
    setSelected([]);
    setSelectAll(false);
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-2xl font-bold">Payments</h2>
        <div className="flex flex-col sm:flex-row gap-2 items-center">
          <input
            className="input"
            style={{ minWidth: 180 }}
            type="text"
            placeholder="Search user, email, ref..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search payments"
          />
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={exportCsv}
            title="Export filtered payments to CSV"
          >
            Export CSV
          </button>
          {selected.length > 0 && (
            <>
              <button className="btn btn-primary btn-sm" onClick={bulkApprove}>Approve Selected</button>
              <button className="btn btn-outline btn-sm" onClick={bulkReject}>Reject Selected</button>
              <span className="text-xs text-ink/60">{selected.length} selected</span>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 grid grid-cols-2 sm:grid-cols-6 gap-2">
        <label className="block">
          <div className="text-xs text-ink/60">Status</div>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">Type</div>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">Method</div>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">All</option>
            {METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">From</div>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <div className="text-xs text-ink/60">To</div>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {loading && <div className="card p-3">Loading…</div>}
        {!loading && rows.length === 0 && <div className="card p-3 text-ink/60">No payments found.</div>}
        {!loading && rows.map((p) => (
          <div key={p.id} className="card p-3" onClick={() => setActiveId(p.id)}>
            <div className="flex items-center justify-between text-sm">
              <div className="text-ink/70">{formatDT(p.createdAt)}</div>
              <StatusBadge s={p.status || "pending"} />
            </div>
            <div className="mt-1 text-sm">{p.memberName || p.userName || p.userEmail || p.userId || p.uid || "—"}</div>
            <div className="mt-1 text-xs text-ink/70">{p.type || "—"} • {p.method === "static_qr" ? "QR (manual)" : (p.method || "—")}</div>
            <div className="mt-2 flex items-center justify-between">
              <div className="font-mono">₱{Number(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="text-xs">Ref: {p.referenceNo || p.refNo || "—"}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="overflow-x-auto hidden sm:block">
        <table className="min-w-[900px] w-full border rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 border-b"><input type="checkbox" checked={selectAll} onChange={handleSelectAll} aria-label="Select all" /></th>
              <th className="text-left p-2 border-b">Created</th>
              <th className="text-left p-2 border-b">Member</th>
              <th className="text-left p-2 border-b">Type</th>
              <th className="text-left p-2 border-b">Method</th>
              <th className="text-right p-2 border-b">Amount</th>
              <th className="text-left p-2 border-b">Ref No</th>
              <th className="text-left p-2 border-b">Status</th>
              <th className="text-left p-2 border-b">Quick Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-3" colSpan={9}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td className="p-3 text-ink/60" colSpan={9}>
                  No payments found.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((p) => (
                (() => {
                  let rowStatus = p.status || "pending";
                  let rowClass =
                    rowStatus === "paid"
                      ? "bg-emerald-50/40 hover:bg-emerald-100/60"
                      : rowStatus === "rejected"
                      ? "bg-rose-50/40 hover:bg-rose-100/60"
                      : "bg-amber-50/40 hover:bg-amber-100/60";
                  if (selected.includes(p.id)) rowClass += " bg-blue-50";
                  // Odd/even fallback for zebra
                  rowClass += " odd:bg-white even:bg-gray-50";
                  return (
                    <tr
                      key={p.id}
                      className={rowClass + " cursor-pointer"}
                      onClick={(e) => {
                        if (e.target.type !== "checkbox" && e.target.nodeName !== "SELECT" && e.target.nodeName !== "BUTTON" && e.target.nodeName !== "TEXTAREA") setActiveId(p.id);
                      }}
                    >
                      <td className="p-2 border-b">
                        <input
                          type="checkbox"
                          checked={selected.includes(p.id)}
                          onChange={() => handleSelectRow(p.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select payment ${p.id}`}
                        />
                      </td>
                      <td className="p-2 border-b">{formatDT(p.createdAt)}</td>
                      <td className="p-2 border-b">{p.memberName || p.userName || p.userEmail || p.userId || p.uid || "—"}</td>
                      <td className="p-2 border-b">{p.type || "—"}</td>
                      <td className="p-2 border-b">{p.method === "static_qr" ? "QR (manual)" : (p.method || "—")}</td>
                      <td className="p-2 border-b text-right font-mono">{Number(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-2 border-b">{p.referenceNo || p.refNo || "—"}</td>
                      <td className="p-2 border-b"><StatusBadge s={p.status || "pending"} /></td>
                      <td className="p-2 border-b">
                        {p.status === "pending" ? (
                          <div className="flex flex-col gap-1">
                            <select
                              className="input input-xs"
                              value={p._inlineStatus || p.status}
                              onChange={async (e) => {
                                const newStatus = e.target.value;
                                if (newStatus === p.status) return;
                                let note = window.prompt("Optional note for this action:", p.notes || "");
                                await updateDoc(doc(db, "payments", p.id), {
                                  status: newStatus,
                                  confirmedBy: user?.uid || null,
                                  confirmedAt: serverTimestamp(),
                                  notes: (note || "").trim(),
                                });
                              }}
                              aria-label="Update status"
                            >
                              <option value="pending">Pending</option>
                              <option value="paid">Approve</option>
                              <option value="rejected">Reject</option>
                            </select>
                            <textarea
                              className="input input-xs mt-1"
                              rows={1}
                              placeholder="Add note..."
                              defaultValue={p.notes || ""}
                              onBlur={async (e) => {
                                const val = e.target.value;
                                if (val !== (p.notes || "")) {
                                  await updateDoc(doc(db, "payments", p.id), { notes: val });
                                }
                              }}
                              aria-label="Quick note"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-ink/60">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })()
              ))}
          </tbody>
        </table>
        {/* Pagination controls */}
        <div className="flex justify-end gap-2 mt-2">
          <button className="btn btn-sm btn-outline" onClick={handlePrevPage} disabled={!hasPrev}>Prev</button>
          <span className="text-xs text-ink/60">Page {page + 1}</span>
          <button className="btn btn-sm btn-outline" onClick={handleNextPage} disabled={!hasNext}>Next</button>
        </div>
      </div>

      {activeId && (
        <PaymentDetail id={activeId} onClose={() => setActiveId("")} adminUid={user?.uid || ""} />
      )}
    </div>
  );
}

function PaymentDetail({ id, onClose, adminUid }) {
  const [p, setP] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interest, setInterest] = useState("");
  const [notes, setNotes] = useState("");
  const [journal, setJournal] = useState(null); // find by linkedPaymentId
  const [retryBusy, setRetryBusy] = useState(false);
  // padding helper (same look as JournalEntries)
  const pad5 = (v) => (v != null ? String(v).padStart(5, "0") : "");
  // Refund/Void modal state
  const [showRefund, setShowRefund] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundInfo, setRefundInfo] = useState({ ok: false, journalId: "", already: false });
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [depositAccountId, setDepositAccountId] = useState("");

  // Audit log state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);

  // Posting UX state
  const [isApproving, setIsApproving] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultVariant, setResultVariant] = useState("success");
  const [resultInfo, setResultInfo] = useState({ receiptNo: null, journalNo: null, message: "" });
  const navigate = useNavigate();
  const postUnsubRef = useRef(null);
  const postTimerRef = useRef(null);

  function cleanupPostingWatch() {
    if (postUnsubRef.current) {
      try { postUnsubRef.current(); } catch {}
      postUnsubRef.current = null;
    }
    if (postTimerRef.current) {
      clearTimeout(postTimerRef.current);
      postTimerRef.current = null;
    }
  }

  // Ensure this hook is declared before any early return to keep hook order stable
  useEffect(() => () => cleanupPostingWatch(), []);

  useEffect(() => {
    const ref = doc(db, "payments", id);
    const unsub = onSnapshot(ref, (s) => {
      const d = s.exists() ? { id: s.id, ...s.data() } : null;
      setP(d);
      if (d) {
        setNotes(d.notes || "");
        if (d.type === "loan_repayment") {
          setPrincipal(String(d.principalPortion ?? d.amount ?? ""));
          setInterest(String(d.interestPortion ?? 0));
        }
  setDepositAccountId(d.depositAccountId || "");
      }
    });
    return () => unsub();
  }, [id]);

  // Watch journal by linkedPaymentId to surface journalNo if created
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, "journalEntries"), where("linkedPaymentId", "==", id), limit(1));
    const unsub = onSnapshot(q, (s) => {
      setJournal(s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() });
    });
    return () => unsub();
  }, [id]);

  // Fetch audit/admin logs for this payment
  useEffect(() => {
    if (!id) return;
    setAuditLoading(true);
    const q = query(
      collection(db, "adminLogs"),
      where("paymentId", "==", id),
      orderBy("ts", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => {
      setAuditLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAuditLoading(false);
    }, (err) => {
      setAuditLogs([]);
      setAuditLoading(false);
    });
    return () => unsub();
  }, [id]);

  // Load candidate cash accounts (Asset or name contains Cash/Bank/GCash)
  useEffect(() => {
    const fn = async () => {
      try {
        const snap = await getDocs(collection(db, "accounts"));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const candidates = rows.filter((a) => {
          const t = String(a.type || "").toLowerCase();
          const n = `${a.main} ${a.individual || ""}`.toLowerCase();
          return t === "asset" || n.includes("cash") || n.includes("bank") || n.includes("gcash");
        });
        setCashAccounts(candidates);
      } catch {}
    };
    fn();
  }, []);

  // Prefer journal's Ref# as the single source of truth
  const journalRefNumber =
    (journal && (journal.refNumber || (journal.journalNo != null ? pad5(journal.journalNo) : ""))) || "";

  // For display only; keep receipt as separate concept (not used as Ref#)
  const receiptNo = p?.receiptNo || "";

  if (!p) return null;
  const amount = Number(p.amount || 0);
  const isLoan = p.type === "loan_repayment";
  const canAct = p.status === "pending" && !busy;
  const canRefund = p.status === "paid" && !refundBusy;
  const canVoid = p.status === "pending" && !voidBusy;

  const pNum = Number(principal || 0);
  const iNum = Number(interest || 0);
  const sumOk = !isLoan || Math.abs(pNum + iNum - amount) < 0.005;

  function watchForPosting(paymentId) {
    cleanupPostingWatch();
    const pref = doc(db, "payments", paymentId);

    // safety timeout: optimistic success and redirect
    postTimerRef.current = setTimeout(() => {
      setIsApproving(false);
      setResultVariant("success");
      setResultInfo({ receiptNo: null, journalNo: null, message: "" });
      setResultOpen(true);
      setTimeout(() => navigate("/admin/payments"), 1200);
    }, 15000);

    postUnsubRef.current = onSnapshot(
      pref,
      (snap) => {
        const v = snap.data();
        if (!v) return;
        // Error from CF
        if (v.postingError) {
          cleanupPostingWatch();
          setIsApproving(false);
          setResultVariant("error");
          const msg = v.postingError?.message || String(v.postingError);
          setResultInfo({ receiptNo: null, journalNo: null, message: msg });
          setResultOpen(true);
          return;
        }
        // Success when receiptNo or journalNo present
        if (v.status === "paid" && (v.receiptNo || v.journalNo)) {
          cleanupPostingWatch();
          setIsApproving(false);
          setResultVariant("success");
          setResultInfo({ receiptNo: v.receiptNo || null, journalNo: v.journalNo || null, message: "" });
          setResultOpen(true);
          setTimeout(() => navigate("/admin/payments?status=Pending"), 1200);
        }
      },
      (e) => {
        cleanupPostingWatch();
        setIsApproving(false);
        setResultVariant("error");
        setResultInfo({ receiptNo: null, journalNo: null, message: e?.message || "Listener error" });
        setResultOpen(true);
      }
    );
  }

  async function approve() {
    setErr("");
    setSuccess("");
    if (!sumOk) {
      setErr("Principal + Interest must equal Amount.");
      return;
    }
    if (["gcash_manual", "bank_transfer", "static_qr"].includes(p.method || "") && !p.proofURL) {
      setErr("Proof file is required for manual methods.");
      return;
    }
    setBusy(true);
    setIsApproving(true);
    try {
      const ref = doc(db, "payments", id);
      // First write: details + splits + optional deposit override
      await updateDoc(ref, {
        confirmedBy: adminUid || null,
        confirmedAt: serverTimestamp(),
        notes: (notes || "").trim(),
        ...(depositAccountId ? { depositAccountId } : {}),
        ...(isLoan ? { principalPortion: Number(Number(pNum).toFixed(2)), interestPortion: Number(Number(iNum).toFixed(2)) } : {}),
      });
      // Second write: flip status (triggers CF)
      await updateDoc(ref, { status: "paid" });

      // Start watcher for posting results
      watchForPosting(id);

      // Audit log
      await addDoc(collection(db, "adminLogs"), {
        ts: serverTimestamp(),
        actorUid: adminUid || null,
        action: "PAYMENT_APPROVAL",
        paymentId: id,
        paymentType: p.type || null,
        amount: amount,
        memberUid: p.userId || p.uid || null,
        ...(isLoan ? { principalPortion: pNum, interestPortion: iNum } : {}),
      });
      setSuccess("Posting…");
    } catch (e) {
      console.error(e);
      setErr(e?.message || String(e));
      setIsApproving(false);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    const reason = window.prompt("Reason for rejection (required):");
    if (!reason || !reason.trim()) return;
    setBusy(true);
    setErr("");
    setSuccess("");
    try {
      const ref = doc(db, "payments", id);
      await updateDoc(ref, {
        status: "rejected",
        confirmedBy: adminUid || null,
        confirmedAt: serverTimestamp(),
        notes: `${(notes || "").trim()}${notes ? " | " : ""}Rejected: ${reason.trim()}`,
      });

      await addDoc(collection(db, "adminLogs"), {
        ts: serverTimestamp(),
        actorUid: adminUid || null,
        action: "PAYMENT_REJECTION",
        paymentId: id,
        paymentType: p.type || null,
        amount: amount,
        memberUid: p.userId || p.uid || null,
        reason: reason.trim(),
      });
      setSuccess("Payment rejected.");
    } catch (e) {
      console.error(e);
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[560px] bg-white shadow-2xl p-4 overflow-auto">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-lg font-semibold">{p.memberName || p.userEmail || p.userId || p.uid || "Member"}</div>
            <div className="text-sm text-ink/60">{p.type || "—"} • {p.method === "static_qr" ? "QR (manual)" : (p.method || "—")}</div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge s={p.status || "pending"} />
            <button className="rounded px-2 py-1 hover:bg-gray-100" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Amount & Receipt / Journal */}
        <div className="card p-3 mb-3">
          <div className="text-sm text-ink/60">Amount</div>
          <div className="text-2xl font-bold">₱{Number(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="mt-2 text-sm">
            {/* Show Journal Ref# (refNumber or padded journalNo) as the single source of truth */}
            <span className="mr-4">
              Ref#: <b>{journalRefNumber || "—"}</b>
            </span>
            {receiptNo && (
              <span className="mr-4">Receipt: <b>{receiptNo}</b></span>
            )}
            {journalRefNumber && (
              <>
                <span>Journal No: <b>{journalRefNumber}</b></span>
              </>
            )}
          </div>
          <div className="mt-2 text-xs text-ink/60">
            Posting: {(p.posting?.status || "—")} • Attempts: {p.posting?.attempts || 0}
          </div>
          {p.postingError && (
            <div className="mt-2 rounded border border-rose-200 bg-rose-50 text-rose-800 p-2 text-sm">
              Posting error: {p.postingError?.message || String(p.postingError)}
              <div className="mt-1 flex flex-wrap gap-2 items-center">
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => navigator.clipboard?.writeText(p.postingError?.message || String(p.postingError))}
                >
                  Copy error
                </button>
                <a className="btn btn-sm btn-outline" href="/admin/settings/accounting" target="_self">Open Accounting Settings</a>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={async () => {
                    setRetryBusy(true);
                    try {
                      const call = httpsCallable(functions, "repostPayment");
                      await call({ paymentId: p.id });
                    } catch (e) {
                      console.warn(e);
                    } finally {
                      setRetryBusy(false);
                    }
                  }}
                  disabled={retryBusy}
                >
                  {retryBusy ? "Retrying…" : "Retry Post"}
                </button>
              </div>
            </div>
          )}
          {p.posting?.status === "failed" && (
            <div className="mt-2 rounded border border-rose-200 bg-rose-50 text-rose-800 p-2 text-sm">
              Posting error: {p.posting?.error || "Unknown"}
              <div className="mt-1 flex flex-wrap gap-2 items-center">
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => navigator.clipboard?.writeText(p.posting?.error || "")}
                >
                  Copy error
                </button>
                <a className="btn btn-sm btn-outline" href="/admin/settings/accounting" target="_self">Open Accounting Settings</a>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={async () => {
                    setRetryBusy(true);
                    try {
                      const call = httpsCallable(functions, "repostPayment");
                      await call({ paymentId: p.id });
                    } catch (e) {
                      console.warn(e);
                    } finally {
                      setRetryBusy(false);
                    }
                  }}
                  disabled={retryBusy}
                >
                  {retryBusy ? "Retrying…" : "Retry Post"}
                </button>
              </div>
            </div>
          )}
          {p.status === "paid" && p.receiptNo && (
            <div className="mt-3 flex gap-2">
              <a className="btn btn-sm btn-outline" href={`/receipt/${p.id}`} target="_self">View Receipt</a>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => navigator.clipboard?.writeText(`${location.origin}/receipt/${p.id}`)}
              >
                Copy receipt link
              </button>
            </div>
          )}
        </div>

        {/* Audit Trail */}
        <div className="card p-3 mb-3">
          <div className="text-sm font-semibold mb-2">Audit Trail</div>
          {auditLoading ? (
            <div className="text-xs text-ink/60">Loading…</div>
          ) : auditLogs.length === 0 ? (
            <div className="text-xs text-ink/60">No admin actions found.</div>
          ) : (
            <ul className="space-y-1">
              {auditLogs.map((log) => (
                <li key={log.id} className="text-xs flex gap-2 items-center">
                  <span className="text-ink/60">{log.ts?.toDate ? formatDT(log.ts.toDate()) : "—"}</span>
                  <span className="font-mono bg-gray-100 rounded px-1">{log.action}</span>
                  <span className="text-ink/80">{log.actorUid || "?"}</span>
                  {log.reason && <span className="text-ink/60">{log.reason}</span>}
                  {log.amount != null && <span className="text-ink/60">₱{Number(log.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Info */}
        <div className="card p-3 mb-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-ink/60">Reference No</div>
              <div>{p.referenceNo || p.refNo || "—"}</div>
            </div>
            <div>
              <div className="text-ink/60">Created</div>
              <div>{formatDT(p.createdAt)}</div>
            </div>
            <div>
              <div className="text-ink/60">Linked</div>
              <div>
                {p.linkedId ? (
                  p.type === "purchase" ? (
                    <a className="underline" href={`/orders/${p.linkedId}`}>View Order</a>
                  ) : p.type === "loan_repayment" ? (
                    <a className="underline" href={`/loans/${p.linkedId}`}>View Loan</a>
                  ) : (
                    p.linkedId
                  )
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div>
              <div className="text-ink/60">Notes</div>
              <textarea className="w-full border rounded px-2 py-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="col-span-2">
              <div className="text-ink/60">Deposit to (optional)</div>
              <select className="input" value={depositAccountId} onChange={(e) => setDepositAccountId(e.target.value)}>
                <option value="">— Default via settings —</option>
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.code ? `${a.code} • ` : "") + a.main + (a.individual ? " / " + a.individual : "")}
                  </option>
                ))}
              </select>
              <div className="text-xs text-ink/60 mt-1">Overrides the cash account for this payment only.</div>
            </div>
          </div>
        </div>

        {/* Proof viewer */}
        <div className="card p-3 mb-3">
          <div className="text-sm font-semibold mb-2">Proof</div>
          {p.proofURL ? (
            <div className="space-y-2">
              {String(p.proofURL).match(/\.(png|jpe?g|webp|gif)$/i) ? (
                <img src={p.proofURL} alt="Proof" className="max-h-80 w-auto rounded border" />
              ) : String(p.proofURL).match(/\.(pdf)$/i) ? (
                <iframe title="Proof" src={p.proofURL} className="w-full h-80 border rounded" />
              ) : (
                <a className="underline" href={p.proofURL} target="_blank" rel="noreferrer">Open proof</a>
              )}
              <div>
                <a className="btn btn-sm btn-outline" href={p.proofURL} target="_blank" rel="noreferrer">Open in new tab</a>
              </div>
            </div>
          ) : (
            <div className="text-sm text-ink/60">No proof uploaded.</div>
          )}
        </div>

        {/* Loan split */}
        {isLoan && (
          <div className="card p-3 mb-3">
            <div className="text-sm font-semibold mb-2">Loan Split</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-ink/60">Principal Portion</span>
                <input className="input" type="number" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-xs text-ink/60">Interest Portion</span>
                <input className="input" type="number" step="0.01" value={interest} onChange={(e) => setInterest(e.target.value)} />
              </label>
            </div>
            <div className={`mt-2 text-sm ${sumOk ? "text-emerald-700" : "text-rose-700"}`}>
              {sumOk ? "OK" : `Must equal total amount ₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>
            <div className="text-xs text-ink/60 mt-1">Interest → credited to Interest Income.</div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <button className="btn btn-primary" disabled={!canAct || (isLoan && !sumOk) || isApproving} onClick={approve}>
            {isApproving ? "Posting…" : "Approve & Post"}
          </button>
          <button className="btn btn-outline" disabled={!canAct} onClick={reject}>Reject</button>
          {/* Refund / Void */}
          {p.status === "paid" && (
            <button className="btn btn-outline btn-amber" disabled={!canRefund} onClick={() => setShowRefund(true)}>
              Refund
            </button>
          )}
          {p.status === "pending" && (
            <button className="btn btn-outline" disabled={!canVoid} onClick={() => setShowVoid(true)}>
              Void
            </button>
          )}
          {success && <span className="text-sm text-emerald-700 sm:ml-2">{success}</span>}
          {err && <span className="text-sm text-rose-700 sm:ml-2">{err}</span>}
        </div>

        {/* Status banners */}
        {p.status === "refunded" && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 text-amber-800 p-2 text-sm">
            Refunded{p.refundJournalId ? (
              <> • Journal: <a className="underline" href={`/admin/journals/${p.refundJournalId}`}>{p.refundJournalId}</a></>
            ) : null}
            {p.refundReason ? <> • Reason: {p.refundReason}</> : null}
          </div>
        )}
        {p.status === "voided" && (
          <div className="mt-3 rounded border border-gray-200 bg-gray-50 text-gray-800 p-2 text-sm">
            Voided{p.voidReason ? <> • Reason: {p.voidReason}</> : null}
          </div>
        )}
      </div>

      <PostingResultDialog
        open={resultOpen}
        variant={resultVariant}
        receiptNo={resultInfo.receiptNo}
        journalNo={resultInfo.journalNo}
        message={resultInfo.message}
  paymentId={id}
        onClose={() => {
          setResultOpen(false);
          navigate("/admin/payments");
        }}
      />

      {/* Refund Modal */}
      {showRefund && (
        <div className="fixed inset-0 z-[1000]">
          <div className="absolute inset-0 bg-black/40" onClick={() => !refundBusy && setShowRefund(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl w-[480px] max-w-[95vw] p-4">
            <div className="text-lg font-semibold mb-2">Refund Payment</div>
            <div className="text-sm text-ink/60 mb-2">Provide a reason. This posts a reversing journal.</div>
            <label className="block mb-3">
              <div className="text-xs text-ink/60">Reason</div>
              <input className="input w-full" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} maxLength={200} />
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn btn-outline" disabled={refundBusy} onClick={() => setShowRefund(false)}>Cancel</button>
              <button
                className="btn btn-amber"
                disabled={!refundReason.trim() || refundBusy}
                onClick={async () => {
                  setRefundBusy(true);
                  try {
                    const call = httpsCallable(functions, "refundPayment");
                    const { data } = await call({ paymentId: id, reason: refundReason.trim() });
                    const r = data || {};
                    setRefundInfo({ ok: !!r.ok, journalId: r.refundJournalId || "", already: !!r.already });
                    setShowRefund(false);
                  } catch (e) {
                    alert(e?.message || String(e));
                  } finally {
                    setRefundBusy(false);
                  }
                }}
              >
                {refundBusy ? "Refunding…" : "Confirm Refund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Modal */}
      {showVoid && (
        <div className="fixed inset-0 z-[1000]">
          <div className="absolute inset-0 bg-black/40" onClick={() => !voidBusy && setShowVoid(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl w-[480px] max-w-[95vw] p-4">
            <div className="text-lg font-semibold mb-2">Void Payment</div>
            <div className="text-sm text-ink/60 mb-2">Provide a reason. No journals will be created.</div>
            <label className="block mb-3">
              <div className="text-xs text-ink/60">Reason</div>
              <input className="input w-full" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} maxLength={200} />
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn btn-outline" disabled={voidBusy} onClick={() => setShowVoid(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={!voidReason.trim() || voidBusy}
                onClick={async () => {
                  setVoidBusy(true);
                  try {
                    const call = httpsCallable(functions, "voidPayment");
                    await call({ paymentId: id, reason: voidReason.trim() });
                    setShowVoid(false);
                  } catch (e) {
                    alert(e?.message || String(e));
                  } finally {
                    setVoidBusy(false);
                  }
                }}
              >
                {voidBusy ? "Voiding…" : "Confirm Void"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
