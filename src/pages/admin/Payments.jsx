import React, { useEffect, useRef, useState } from "react";
import { db } from "../../lib/firebase";
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
} from "firebase/firestore";
import { useAuth } from "../../AuthContext";
import { httpsCallable, getFunctions } from "firebase/functions";
import { buildMemberDisplayName } from "../../lib/names";

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
  return <span className={`inline-block text-xs px-2 py-0.5 rounded border ${cls}`}>{s}</span>;
}

function fmtDT(v) {
  try {
    if (!v) return "—";
    if (typeof v.toDate === "function") return v.toDate().toLocaleString();
    return new Date(v).toLocaleString();
  } catch {
    return String(v || "—");
  }
}

export default function AdminPaymentsList() {
  const { user } = useAuth();

  // Filters
  const [status, setStatus] = useState("pending");
  const [type, setType] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState(""); // YYYY-MM-DD
  const [to, setTo] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const unsubRef = useRef(() => {});

  function listen() {
    unsubRef.current?.();
    setLoading(true);
    let q = query(collection(db, "payments"));

    // Status
    if (status) {
      q = query(q, where("status", "==", status));
    }
    // Type
    if (type) q = query(q, where("type", "==", type));
    // Method
    if (method) q = query(q, where("method", "==", method));
    // Date range on createdAt
    if (from) q = query(q, where("createdAt", ">=", new Date(`${from}T00:00:00`)));
    if (to) q = query(q, where("createdAt", "<=", new Date(`${to}T23:59:59`)));

    // Order newest first
    q = query(q, orderBy("createdAt", "desc"), limit(100));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("payments/onSnapshot:", err);
        setLoading(false);
      }
    );
    unsubRef.current = unsub;
  }

  useEffect(() => {
    listen();
    return () => unsubRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, type, method, from, to]);

  const [activeId, setActiveId] = useState("");

  // Backfill names (admin utility)
  const [bfBusy, setBfBusy] = useState(false);
  const [bfMsg, setBfMsg] = useState("");
  async function backfillNames() {
    setBfBusy(true);
    setBfMsg("");
    try {
      // 1) Try memberName == null
      const qNull = query(collection(db, "payments"), where("memberName", "==", null), limit(100));
      const sNull = await getDocs(qNull);
      // 2) Try memberName == ""
      const qEmpty = query(collection(db, "payments"), where("memberName", "==", ""), limit(100));
      const sEmpty = await getDocs(qEmpty);
      const seen = new Set();
      let candidates = [...sNull.docs, ...sEmpty.docs].filter((d) => {
        const ok = !seen.has(d.id);
        seen.add(d.id);
        return ok;
      });
      // 3) Fallback: take latest 200 and filter missing memberName field
      if (candidates.length === 0) {
        const qAny = query(collection(db, "payments"), orderBy("createdAt", "desc"), limit(200));
        const sAny = await getDocs(qAny);
        candidates = sAny.docs.filter((d) => {
          const data = d.data() || {};
          return !("memberName" in data) || data.memberName == null || String(data.memberName).trim() === "";
        });
      }

      let done = 0;
      for (const d of candidates) {
        try {
          const p = d.data() || {};
          const uid = p.userId || p.uid;
          if (!uid) continue;
          // prefer users/{uid}; fallback to profiles/{uid}
          let nameData = {};
          try {
            const uref = doc(db, "users", uid);
            const us = await getDoc(uref);
            if (us.exists()) nameData = us.data() || {};
          } catch {}
          if (!nameData || Object.keys(nameData).length === 0) {
            try {
              const pref = doc(db, "profiles", uid);
              const ps = await getDoc(pref);
              if (ps.exists()) nameData = ps.data() || {};
            } catch {}
          }
          const memberName = buildMemberDisplayName(nameData);
          if (memberName && memberName.trim()) {
            await updateDoc(doc(db, "payments", d.id), { memberName });
            done += 1;
          }
        } catch (e) {
          console.warn("backfill one:", e);
        }
      }
      setBfMsg(`Updated ${done} payment${done === 1 ? "" : "s"}.`);
    } catch (e) {
      setBfMsg(e?.message || String(e));
    } finally {
      setBfBusy(false);
      setTimeout(() => setBfMsg(""), 4000);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Payments</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={backfillNames}
            disabled={bfBusy}
            title="Fill memberName on recent payments"
          >
            {bfBusy ? "Backfilling…" : "Backfill Names"}
          </button>
          {bfMsg && <span className="text-xs text-ink/60">{bfMsg}</span>}
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full border rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">Created</th>
              <th className="text-left p-2 border-b">Member</th>
              <th className="text-left p-2 border-b">Type</th>
              <th className="text-left p-2 border-b">Method</th>
              <th className="text-right p-2 border-b">Amount</th>
              <th className="text-left p-2 border-b">Ref No</th>
              <th className="text-left p-2 border-b">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-3" colSpan={7}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td className="p-3 text-ink/60" colSpan={7}>
                  No payments found.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((p) => (
                <tr
                  key={p.id}
                  className="odd:bg-white even:bg-gray-50 cursor-pointer hover:bg-brand-50"
                  onClick={() => setActiveId(p.id)}
                >
                  <td className="p-2 border-b">{fmtDT(p.createdAt)}</td>
                  <td className="p-2 border-b">{p.memberName || p.userName || p.userEmail || p.userId || p.uid || "—"}</td>
                  <td className="p-2 border-b">{p.type || "—"}</td>
                  <td className="p-2 border-b">{p.method || "—"}</td>
                  <td className="p-2 border-b text-right font-mono">{Number(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="p-2 border-b">{p.referenceNo || p.refNo || "—"}</td>
                  <td className="p-2 border-b"><StatusBadge s={p.status || "pending"} /></td>
                </tr>
              ))}
          </tbody>
        </table>
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
  const [cashAccounts, setCashAccounts] = useState([]);
  const [depositAccountId, setDepositAccountId] = useState("");

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

  if (!p) return null;
  const amount = Number(p.amount || 0);
  const isLoan = p.type === "loan_repayment";
  const canAct = p.status === "pending" && !busy;

  const pNum = Number(principal || 0);
  const iNum = Number(interest || 0);
  const sumOk = !isLoan || Math.abs(pNum + iNum - amount) < 0.005;

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
      setSuccess("Posted. Waiting for receipt…");
    } catch (e) {
      console.error(e);
      setErr(e?.message || String(e));
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
            <div className="text-sm text-ink/60">{p.type || "—"} • {p.method || "—"}</div>
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
            {p.receiptNo && (
              <span className="mr-4">Receipt No: <b>{p.receiptNo}</b></span>
            )}
            {journal?.journalNo && (
              <>
                <span>Journal No: <b>{journal.journalNo}</b></span>
                {/* Placeholder link to journals viewer if available */}
              </>
            )}
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
                      const call = httpsCallable(getFunctions(undefined, "asia-east1"), "repostPayment");
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
              <div>{fmtDT(p.createdAt)}</div>
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
          <button className="btn btn-primary" disabled={!canAct || (isLoan && !sumOk)} onClick={approve}>
            {busy ? "Posting…" : "Approve & Post"}
          </button>
          <button className="btn btn-outline" disabled={!canAct} onClick={reject}>Reject</button>
          {success && <span className="text-sm text-emerald-700 sm:ml-2">{success}</span>}
          {err && <span className="text-sm text-rose-700 sm:ml-2">{err}</span>}
        </div>
      </div>
    </div>
  );
}
